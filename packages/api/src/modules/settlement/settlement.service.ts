import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere, DataSource } from 'typeorm';
import { SettlementStatus } from '@i9/types';
import { Settlement } from './settlement.entity';
import { SettlementCost } from './settlement-cost.entity';
import { SettlementReceipt } from './settlement-receipt.entity';
import { OrderMain } from '../order/order-main.entity';
import { OrderShipment } from '../order/order-shipment.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { AddCostDto } from './dto/add-cost.dto';
import { AddReceiptDto } from './dto/add-receipt.dto';
import { QuerySettlementDto } from './dto/query-settlement.dto';

// ── 结算清单财务口径（07-结算清单设计稿 §毛利对比）──
const VAT_DIVISOR = 1.13; // 增值税 13% → 不含税 = 含税 ÷ 1.13
const FINANCE_FEE_RATE = 0.07; // 财务及管理费 = 结算金额 × 7%（比例可配置）
const r4 = (n: number) => +Number(n).toFixed(4);
const r2 = (n: number) => +Number(n).toFixed(2);

interface CostLike {
  amount: number;
  has_invoice?: number;
}

// 总货款含税/不含税（无票计税：有票按不含税=含税÷1.13计入，无票按含税全额计入，防毛利虚高）
function goodsSplit(costs: CostLike[], fallbackTax = 0) {
  if (costs.length) {
    const tax = costs.reduce((s, c) => s + +c.amount, 0);
    const extax = costs.reduce((s, c) => s + (c.has_invoice === 0 ? +c.amount : +c.amount / VAT_DIVISOR), 0);
    return { goodsAmountTax: r4(tax), goodsAmountExtax: r4(extax) };
  }
  return { goodsAmountTax: r4(fallbackTax), goodsAmountExtax: r4(fallbackTax / VAT_DIVISOR) };
}

interface DerivedInput {
  goodsAmountTax: number; // 总货款含税
  goodsAmountExtax: number; // 总货款不含税
  shippedQty: number; // 出货件数（来自船务）
  receiptUsd: number; // 实际收汇金额 USD
  invoiceAmountUsd: number; // 发票金额 USD
  exchangeRate: number; // 结算汇率
  periodFeeTotal: number; // 期间费用合计（运杂+快邮+打样+其它）
  taxRefund: number; // 出口退税
}

// 结算派生量：结算金额→毛利→财务费→净利→成本单价→保本汇率（设计稿逐式）
function calcDerived(i: DerivedInput) {
  const costPerUnitTax = i.shippedQty > 0 ? r4(i.goodsAmountTax / i.shippedQty) : undefined; // 成本单价含税
  const costPerUnitExtax = i.shippedQty > 0 ? r4(i.goodsAmountExtax / i.shippedQty) : undefined; // 成本单价不含税
  const usdUnitPrice = i.shippedQty > 0 ? r4(i.invoiceAmountUsd / i.shippedQty) : undefined; // 美金单价 = 发票金额÷出货件数
  const settleAmount = r4(i.receiptUsd * i.exchangeRate); // 结算金额(RMB) = 实际收汇×结算汇率
  const grossProfit = r4(settleAmount - i.goodsAmountExtax); // 毛利 = 结算金额 − 总货款不含税
  const grossMargin = settleAmount > 0 ? r2((grossProfit / settleAmount) * 100) : undefined;
  const financeFee = r4(settleAmount * FINANCE_FEE_RATE); // 财务及管理费 = 结算金额×7%
  const netProfitExRefund = r4(grossProfit - i.periodFeeTotal - financeFee); // 净利(不含退税) = 毛利 − 期间费用 − 财务费
  const netProfit = r4(netProfitExRefund + i.taxRefund); // 净利(含退税) = 净利 + 出口退税
  const breakevenRateTax =
    usdUnitPrice && usdUnitPrice > 0 && costPerUnitTax != null ? r4(costPerUnitTax / usdUnitPrice) : undefined; // 保本汇率(含税)
  const breakevenRateExtax =
    usdUnitPrice && usdUnitPrice > 0 && costPerUnitExtax != null ? r4(costPerUnitExtax / usdUnitPrice) : undefined; // 保本汇率(不含税)
  return {
    costPerUnitTax,
    costPerUnitExtax,
    usdUnitPrice,
    settleAmount,
    grossProfit,
    grossMargin,
    financeFee,
    netProfitExRefund,
    netProfit,
    breakevenRateTax,
    breakevenRateExtax,
  };
}

@Injectable()
export class SettlementService {
  constructor(
    @InjectRepository(Settlement) private readonly repo: Repository<Settlement>,
    @InjectRepository(SettlementCost) private readonly costRepo: Repository<SettlementCost>,
    @InjectRepository(SettlementReceipt) private readonly receiptRepo: Repository<SettlementReceipt>,
    @InjectRepository(OrderMain) private readonly orderRepo: Repository<OrderMain>,
    @InjectRepository(OrderShipment) private readonly shipmentRepo: Repository<OrderShipment>,
    private readonly numbering: NumberingService,
    private readonly dataSource: DataSource,
  ) {}

  // 把 settlement 上现存的财务录入 + 货款/期间费用重算所有派生量，写回实体（不落库）
  private applyDerived(settlement: Settlement, goodsAmountTax: number, goodsAmountExtax: number) {
    const periodFeeTotal =
      +(settlement.freight_fee ?? 0) + +(settlement.express_fee ?? 0) + +(settlement.sample_fee ?? 0) + +(settlement.other_fee ?? 0);
    const d = calcDerived({
      goodsAmountTax,
      goodsAmountExtax,
      shippedQty: settlement.shipped_qty ?? 0,
      receiptUsd: +(settlement.receipt_usd ?? 0),
      invoiceAmountUsd: +(settlement.invoice_amount_usd ?? 0),
      exchangeRate: +(settlement.exchange_rate ?? 0),
      periodFeeTotal,
      taxRefund: +(settlement.tax_refund ?? 0),
    });
    settlement.goods_amount_tax = goodsAmountTax;
    settlement.goods_amount_extax = goodsAmountExtax;
    settlement.cost_per_unit_tax = d.costPerUnitTax;
    settlement.cost_per_unit_extax = d.costPerUnitExtax;
    settlement.usd_unit_price = d.usdUnitPrice;
    settlement.settle_amount = d.settleAmount;
    settlement.finance_fee = d.financeFee;
    settlement.gross_profit = d.grossProfit;
    settlement.gross_margin = d.grossMargin;
    settlement.breakeven_rate_tax = d.breakevenRateTax;
    settlement.breakeven_rate_extax = d.breakevenRateExtax;
    settlement.net_profit = d.netProfit;
    settlement.net_profit_ex_refund = d.netProfitExRefund;
    // 兼容旧列语义：revenue=结算金额, total_cost=总货款含税, cost_per_unit=不含税成本单价
    settlement.revenue = d.settleAmount;
    settlement.total_cost = goodsAmountTax;
    settlement.cost_per_unit = d.costPerUnitExtax;
  }

  async create(dto: CreateSettlementDto, createdBy: number): Promise<Settlement> {
    const settlement_no = await this.numbering.next(NUM_PREFIX.SETTLEMENT);

    const order = await this.orderRepo.findOne({ where: { id: dto.order_id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${dto.order_id} 不存在`);

    const shipments = await this.shipmentRepo.find({ where: { order_id: dto.order_id } });
    const shippedQty = shipments.reduce((sum, s) => sum + s.qty, 0);

    return this.dataSource.transaction(async (manager) => {
      const costs = dto.costs ?? [];
      const { goodsAmountTax, goodsAmountExtax } = goodsSplit(costs, dto.goods_amount_tax ?? 0);

      const draft = manager.create(Settlement, {
        settlement_no,
        order_id: dto.order_id,
        style_no: order.style_no ?? null,
        shipped_qty: shippedQty,
        currency: order.currency ?? 'CNY',
        exchange_rate: dto.exchange_rate ?? null,
        status: SettlementStatus.DRAFT,
        invoice_amount_usd: r4(dto.invoice_amount_usd ?? 0),
        receipt_usd: r4(dto.receipt_usd ?? 0),
        freight_fee: r4(dto.freight_fee ?? 0),
        express_fee: r4(dto.express_fee ?? 0),
        sample_fee: r4(dto.sample_fee ?? 0),
        other_fee: r4(dto.other_fee ?? 0),
        tax_refund: r4(dto.tax_refund ?? 0),
        description: dto.description ?? null,
        created_by: createdBy,
        deleted: 0,
      }) as Settlement;
      this.applyDerived(draft, goodsAmountTax, goodsAmountExtax);

      const settlement = await manager.save(Settlement, draft);

      if (costs.length) {
        const costLines = costs.map((c) =>
          manager.create(SettlementCost, {
            settlement_id: settlement.id,
            cost_name: c.cost_name,
            amount: r4(c.amount),
            has_invoice: c.has_invoice ?? 1,
          }),
        );
        await manager.save(SettlementCost, costLines);
      }

      return settlement;
    });
  }

  async findAll(query: QuerySettlementDto) {
    const { page = 1, size = 20, keyword, status, order_id } = query;
    const base: FindOptionsWhere<Settlement> = {
      deleted: 0,
      ...(status !== undefined && { status: status as SettlementStatus }),
      ...(order_id !== undefined && { order_id }),
    };
    // 支持按结算单号或款号检索（设计稿：列表·搜款号带入）
    const where = keyword
      ? [
          { ...base, settlement_no: Like(`%${keyword}%`) },
          { ...base, style_no: Like(`%${keyword}%`) },
        ]
      : base;

    const [items, total] = await this.repo.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });
    return { items, total, page, size };
  }

  async findOne(id: number) {
    const settlement = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
    const costs = await this.costRepo.find({ where: { settlement_id: id } });
    const receipts = await this.receiptRepo.find({ where: { settlement_id: id }, order: { receipt_date: 'ASC' } });
    return { ...settlement, costs, receipts };
  }

  async addCost(id: number, dto: AddCostDto): Promise<Settlement> {
    return this.dataSource.transaction(async (manager) => {
      const settlement = await manager.findOne(Settlement, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
      if (settlement.status !== SettlementStatus.DRAFT) {
        throw new BadRequestException('只有草稿状态才可添加成本明细');
      }

      await manager.save(
        SettlementCost,
        manager.create(SettlementCost, {
          settlement_id: id,
          cost_name: dto.cost_name,
          amount: r4(dto.amount),
          has_invoice: dto.has_invoice ?? 1,
        }),
      );

      const costs = await manager.find(SettlementCost, { where: { settlement_id: id } });
      const { goodsAmountTax, goodsAmountExtax } = goodsSplit(costs);
      this.applyDerived(settlement, goodsAmountTax, goodsAmountExtax);
      return manager.save(Settlement, settlement);
    });
  }

  async addReceipt(id: number, dto: AddReceiptDto): Promise<Settlement> {
    return this.dataSource.transaction(async (manager) => {
      const settlement = await manager.findOne(Settlement, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
      if (settlement.status !== SettlementStatus.DRAFT) {
        throw new BadRequestException('只有草稿状态才可添加收汇');
      }

      await manager.save(
        SettlementReceipt,
        manager.create(SettlementReceipt, {
          settlement_id: id,
          amount: r4(dto.amount),
          receipt_date: dto.receipt_date as any,
          remark: dto.remark ?? null,
        }),
      );

      // 实际收汇金额(USD) = 逐笔收汇累计，驱动结算金额→毛利→净利重算
      const receipts = await manager.find(SettlementReceipt, { where: { settlement_id: id } });
      settlement.receipt_usd = r4(receipts.reduce((s, r) => s + +r.amount, 0));
      const costs = await manager.find(SettlementCost, { where: { settlement_id: id } });
      const { goodsAmountTax, goodsAmountExtax } = goodsSplit(costs, +(settlement.goods_amount_tax ?? 0));
      this.applyDerived(settlement, goodsAmountTax, goodsAmountExtax);
      return manager.save(Settlement, settlement);
    });
  }

  async confirm(id: number): Promise<Settlement> {
    return this.dataSource.transaction(async (manager) => {
      const settlement = await manager.findOne(Settlement, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
      if (settlement.status !== SettlementStatus.DRAFT) {
        throw new BadRequestException('只有草稿状态才可确认');
      }
      settlement.status = SettlementStatus.CONFIRMED;
      settlement.confirmed_at = new Date();
      return manager.save(Settlement, settlement);
    });
  }

  async remove(id: number): Promise<void> {
    const settlement = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
    if (settlement.status !== SettlementStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态的结算单可以删除');
    }
    settlement.deleted = 1;
    await this.repo.save(settlement);
  }
}
