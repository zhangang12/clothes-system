import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere, DataSource } from 'typeorm';
import { SettlementStatus, ReconcileType } from '@i9/types';
import { Settlement } from './settlement.entity';
import { SettlementCost } from './settlement-cost.entity';
import { SettlementReceipt } from './settlement-receipt.entity';
import { OrderMain } from '../order/order-main.entity';
import { OrderShipment } from '../order/order-shipment.entity';
import { Reconciliation, ReconciliationStatus } from '../reconciliation/reconciliation.entity';
import { ReconciliationExpenseItem } from '../reconciliation/reconciliation-expense-item.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { SysConfigService } from '../../common/config/sys-config.service';
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
  tax_rate?: number; // 各行税率%，缺省 13（禁一刀切 1.13）
}

const extaxOf = (amount: number, hasInvoice: number | undefined, rate: number) =>
  hasInvoice === 0 ? amount : amount / (1 + rate / 100);

// 总货款含税/不含税（无票计税：有票按各自税率换不含税，无票按含税全额计入，防毛利虚高）
// 同时返回可退税不含税采购额（仅有票行，供退税测算）
function goodsSplit(costs: CostLike[], fallbackTax = 0, defaultRate = 13) {
  if (costs.length) {
    const tax = costs.reduce((s, c) => s + +c.amount, 0);
    const extax = costs.reduce((s, c) => s + extaxOf(+c.amount, c.has_invoice, c.tax_rate != null ? +c.tax_rate : defaultRate), 0);
    const refundableExtax = costs.reduce(
      (s, c) => s + (c.has_invoice === 0 ? 0 : +c.amount / (1 + (c.tax_rate != null ? +c.tax_rate : defaultRate) / 100)), 0);
    return { goodsAmountTax: r4(tax), goodsAmountExtax: r4(extax), refundableExtax: r4(refundableExtax) };
  }
  const extax = fallbackTax / (1 + defaultRate / 100);
  return { goodsAmountTax: r4(fallbackTax), goodsAmountExtax: r4(extax), refundableExtax: r4(extax) };
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
    @InjectRepository(Reconciliation) private readonly reconcileRepo: Repository<Reconciliation>,
    @InjectRepository(ReconciliationExpenseItem) private readonly expenseItemRepo: Repository<ReconciliationExpenseItem>,
    private readonly numbering: NumberingService,
    private readonly config: SysConfigService,
    private readonly dataSource: DataSource,
  ) {}

  // 按款号从已确认/已付对账付款汇总总货款(含税)——成本明细只读、源自对账付款（设计稿 D4/D6）
  private async aggregateGoodsTax(styleNo?: string): Promise<number> {
    if (!styleNo) return 0;
    // 总货款仅统计【合同】对账(材料/加工/补料)。无合同费用(快邮/运杂/打样/货代等)计入【期间费用】
    // (aggregatePeriodExpense),此处不再重复计入,避免同一笔被「货款+期间费用」双重扣减致净利系统性偏低;
    // 样衣工时对账(LABOR)也排除。成本单价=总货款/件数 亦应只含料+工,不含期间费用。
    const goodsType = ReconcileType.CONTRACT;
    const recons = await this.reconcileRepo.find({
      where: [
        { style_no: styleNo, type: goodsType, status: ReconciliationStatus.CONFIRMED, deleted: 0 },
        { style_no: styleNo, type: goodsType, status: ReconciliationStatus.PAID, deleted: 0 },
      ],
    });
    return r4(recons.reduce((s, r) => s + +r.total_amount, 0));
  }

  // 期间费用按款号从无合同费用对账归集（结算串流程 rec：账实一致，从对账付款带入）
  private async aggregatePeriodExpense(styleNo?: string): Promise<number> {
    if (!styleNo) return 0;
    // 无合同费用对账单（CONFIRMED/PAID）下、费用明细款号命中该款的金额之和
    const recons = await this.reconcileRepo.find({
      where: [
        { style_no: styleNo, type: ReconcileType.NO_CONTRACT, status: ReconciliationStatus.CONFIRMED, deleted: 0 },
        { style_no: styleNo, type: ReconcileType.NO_CONTRACT, status: ReconciliationStatus.PAID, deleted: 0 },
      ],
    });
    const headerSum = r4(recons.reduce((s, r) => s + +r.total_amount, 0));
    // 另计费用明细中单独标注该款号的行（跨款空白对账单场景）
    const items = await this.expenseItemRepo.find({ where: { style_no: styleNo } });
    const itemSum = r4(items.reduce((s, it) => s + +it.amount, 0));
    return r4(Math.max(headerSum, itemSum));
  }

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
    const order = await this.orderRepo.findOne({ where: { id: dto.order_id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${dto.order_id} 不存在`);

    // 结算单编号 JS-款号-序号（结算串流程 rec：按款号，便于按款检索）
    const settlement_no = await this.numbering.nextWithSegment(NUM_PREFIX.SETTLEMENT, order.style_no || 'NA');

    const shipments = await this.shipmentRepo.find({ where: { order_id: dto.order_id } });
    const shippedQty = shipments.reduce((sum, s) => sum + s.qty, 0);

    // 无手工成本明细/总货款时，自动从对账付款按款号汇总（设计稿 D4/D6：成本明细源自对账付款、只读）
    const fallbackTax = (!dto.costs?.length && dto.goods_amount_tax == null)
      ? await this.aggregateGoodsTax(order.style_no)
      : (dto.goods_amount_tax ?? 0);
    // 缺省税率/退税率取自配置（禁一刀切 1.13）
    const vatRate = await this.config.getNumber('vat_rate', 13);
    const refundRate = await this.config.getNumber('export_refund_rate', 13);
    // 期间费用未填时，从无合同费用对账按款号归集（账实一致）
    const noPeriodInput = dto.freight_fee == null && dto.express_fee == null && dto.sample_fee == null && dto.other_fee == null;
    const aggPeriod = noPeriodInput ? await this.aggregatePeriodExpense(order.style_no) : 0;

    return this.dataSource.transaction(async (manager) => {
      const costs = dto.costs ?? [];
      const { goodsAmountTax, goodsAmountExtax, refundableExtax } = goodsSplit(costs, fallbackTax, vatRate);
      // 退税额自动测算：可退税不含税采购额 × 退税率（未手填时用测算值）
      const taxRefund = dto.tax_refund != null ? +dto.tax_refund : r4(refundableExtax * refundRate / 100);

      const draft = manager.create(Settlement, {
        settlement_no,
        order_id: dto.order_id,
        style_no: order.style_no ?? null,
        customer_name: order.middleman_name ?? null,
        shipped_qty: shippedQty,
        currency: order.currency ?? 'CNY',
        exchange_rate: dto.exchange_rate ?? null,
        status: SettlementStatus.DRAFT,
        invoice_amount_usd: r4(dto.invoice_amount_usd ?? 0),
        receipt_usd: r4(dto.receipt_usd ?? 0),
        freight_fee: r4(dto.freight_fee ?? 0),
        express_fee: r4(dto.express_fee ?? 0),
        sample_fee: r4(dto.sample_fee ?? 0),
        other_fee: r4(dto.other_fee ?? aggPeriod), // 期间费用归集值落 other_fee
        tax_refund: r4(taxRefund),
        refund_status: 'ESTIMATED',
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
            tax_rate: c.tax_rate ?? vatRate,
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

  // 刷新付款汇总：按款号重新从对账付款汇总总货款并重算（设计稿：刷新付款汇总后联动重算）
  async refreshCost(id: number): Promise<Settlement> {
    return this.dataSource.transaction(async (manager) => {
      const settlement = await manager.findOne(Settlement, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
      if (settlement.status !== SettlementStatus.DRAFT) {
        throw new BadRequestException('只有草稿状态才可刷新付款汇总');
      }
      const goodsAmountTax = await this.aggregateGoodsTax(settlement.style_no);
      this.applyDerived(settlement, goodsAmountTax, r4(goodsAmountTax / VAT_DIVISOR));
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
