import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, FindOptionsWhere, DataSource } from 'typeorm';
import { SettlementStatus, ReconcileType } from '@i9/types';
import { Settlement } from './settlement.entity';
import { SettlementCost } from './settlement-cost.entity';
import { SettlementReceipt } from './settlement-receipt.entity';
import { OrderMain } from '../order/order-main.entity';
import { OrderShipment } from '../order/order-shipment.entity';
import { Contract } from '../contract/contract.entity';
import { Factory } from '../factory/factory.entity';
import { Reconciliation, ReconciliationStatus } from '../reconciliation/reconciliation.entity';
import { ReconciliationExpenseItem } from '../reconciliation/reconciliation-expense-item.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { SysConfigService } from '../../common/config/sys-config.service';
import { ChangeLogService } from '../../common/changelog/change-log.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { AddCostDto } from './dto/add-cost.dto';
import { AddReceiptDto } from './dto/add-receipt.dto';
import { UpdateSettlementDto } from './dto/update-settlement.dto';
import { QuerySettlementDto } from './dto/query-settlement.dto';

const r4 = (n: number) => +Number(n).toFixed(4);
const r2 = (n: number) => +Number(n).toFixed(2);

interface CostLike {
  amount: number;
  has_invoice?: number;
  tax_rate?: number; // 各行税率%，缺省取 vat_rate 配置（禁一刀切 1.13）
  included?: number; // 0=未付不计入
}

const extaxOf = (amount: number, hasInvoice: number | undefined, rate: number) =>
  hasInvoice === 0 ? amount : amount / (1 + rate / 100);

// 总货款含税/不含税（无票计税：有票按各自税率换不含税，无票按含税全额计入，防毛利虚高）
// 只统计 included≠0 的行（已确认未付行不计入·结算Q8）；另给可退税不含税采购额（仅有票行）
function sumCostRows(rows: CostLike[], defaultRate: number) {
  const inc = rows.filter((c) => c.included !== 0);
  const tax = inc.reduce((s, c) => s + +c.amount, 0);
  const extax = inc.reduce((s, c) => s + extaxOf(+c.amount, c.has_invoice, c.tax_rate != null ? +c.tax_rate : defaultRate), 0);
  const refundableExtax = inc.reduce(
    (s, c) => s + (c.has_invoice === 0 ? 0 : +c.amount / (1 + (c.tax_rate != null ? +c.tax_rate : defaultRate) / 100)), 0);
  return { rows: inc.length, tax: r4(tax), extax: r4(extax), refundableExtax: r4(refundableExtax) };
}

interface GoodsAgg {
  paidTax: number;
  paidExtax: number;
  refundableExtax: number;
  unpaidTax: number; // 已确认未付——不计入总货款，灰显（结算Q8：仅汇总已付款）
  unpaidCount: number;
  autoRows: Partial<SettlementCost>[]; // 对账快照行（含未付行 included=0）
}

const EMPTY_AGG: GoodsAgg = { paidTax: 0, paidExtax: 0, refundableExtax: 0, unpaidTax: 0, unpaidCount: 0, autoRows: [] };

interface DerivedInput {
  goodsAmountTax: number; // 总货款含税
  goodsAmountExtax: number; // 总货款不含税
  shippedQty: number; // 出货件数（来自船务）
  invoiceAmountUsd: number; // 发票金额 USD
  settleAmount: number; // 结算金额 RMB（逐笔收汇×各自汇率求和，或收汇×结算汇率）
  periodFeeTotal: number; // 期间费用合计（运杂+快邮+打样+其它）
  taxRefund: number; // 出口退税
  financeFeeRate: number; // 财务及管理费率%（系统参数，缺省7）
}

// 结算派生量：结算金额→毛利→财务费→净利→成本单价→保本汇率（设计稿逐式）
function calcDerived(i: DerivedInput) {
  const costPerUnitTax = i.shippedQty > 0 ? r4(i.goodsAmountTax / i.shippedQty) : undefined; // 成本单价含税
  const costPerUnitExtax = i.shippedQty > 0 ? r4(i.goodsAmountExtax / i.shippedQty) : undefined; // 成本单价不含税
  const usdUnitPrice = i.shippedQty > 0 ? r4(i.invoiceAmountUsd / i.shippedQty) : undefined; // 美金单价 = 发票金额÷出货件数
  const grossProfit = r4(i.settleAmount - i.goodsAmountExtax); // 毛利 = 结算金额 − 总货款不含税
  const grossMargin = i.settleAmount > 0 ? r2((grossProfit / i.settleAmount) * 100) : undefined;
  const financeFee = r4(i.settleAmount * i.financeFeeRate / 100); // 财务及管理费 = 结算金额×费率
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
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    @InjectRepository(Factory) private readonly factoryRepo: Repository<Factory>,
    @InjectRepository(Reconciliation) private readonly reconcileRepo: Repository<Reconciliation>,
    @InjectRepository(ReconciliationExpenseItem) private readonly expenseItemRepo: Repository<ReconciliationExpenseItem>,
    private readonly numbering: NumberingService,
    private readonly config: SysConfigService,
    private readonly changeLog: ChangeLogService,
    private readonly dataSource: DataSource,
  ) {}

  // 按【订单】从对账付款聚合总货款——合同(材料/加工/补料)挂订单，收入成本同口径，
  // 杜绝同款多订单每张结算单重复背整款成本（结算Q1）；无合同挂接的历史数据按款号兜底。
  // 仅已付款(PAID)计入总货款；已确认未付单独返回，前端灰显「未付·不计入」（结算Q8）。
  private async aggregateGoods(order: OrderMain, vatRate: number): Promise<GoodsAgg> {
    const goodsType = ReconcileType.CONTRACT; // 无合同费用走期间费用，样衣工时(LABOR)排除
    const statuses = In([ReconciliationStatus.CONFIRMED, ReconciliationStatus.PAID]);
    const contracts = await this.contractRepo.find({ where: { order_id: order.id, deleted: 0 } });
    let recons: Reconciliation[] = [];
    if (contracts.length) {
      recons = await this.reconcileRepo.find({
        where: { contract_id: In(contracts.map((c) => c.id)), type: goodsType, status: statuses as any, deleted: 0 },
      });
    } else if (order.style_no) {
      recons = await this.reconcileRepo.find({
        where: { style_no: order.style_no, type: goodsType, status: statuses as any, deleted: 0 },
      });
    }
    if (!recons.length) return { ...EMPTY_AGG, autoRows: [] };

    const factoryIds = [...new Set(recons.map((rc) => +rc.factory_id).filter(Boolean))];
    const factories = factoryIds.length ? await this.factoryRepo.find({ where: { id: In(factoryIds) } }) : [];
    const factoryName = new Map(factories.map((f) => [+f.id, f.short_name || f.name]));

    const agg: GoodsAgg = { ...EMPTY_AGG, autoRows: [] };
    for (const rc of recons) {
      const paid = rc.status === ReconciliationStatus.PAID;
      const rate = rc.tax_rate != null ? +rc.tax_rate : vatRate;
      const amount = +rc.total_amount;
      if (paid) {
        agg.paidTax += amount;
        agg.paidExtax += extaxOf(amount, rc.has_invoice, rate);
        agg.refundableExtax += rc.has_invoice === 0 ? 0 : amount / (1 + rate / 100);
      } else {
        agg.unpaidTax += amount;
        agg.unpaidCount += 1;
      }
      agg.autoRows.push({
        cost_name: `对账 ${rc.reconcile_no}`,
        amount: r4(amount),
        has_invoice: rc.has_invoice ?? 1,
        tax_rate: rate,
        reconcile_no: rc.reconcile_no,
        supplier_name: rc.factory_id ? factoryName.get(+rc.factory_id) ?? null : null,
        pay_status: rc.status,
        source: 'AUTO',
        included: paid ? 1 : 0,
      } as Partial<SettlementCost>);
    }
    agg.paidTax = r4(agg.paidTax);
    agg.paidExtax = r4(agg.paidExtax);
    agg.refundableExtax = r4(agg.refundableExtax);
    agg.unpaidTax = r4(agg.unpaidTax);
    return agg;
  }

  // 期间费用按款号从无合同费用对账归集（结算串流程 rec：账实一致，从对账付款带入）；
  // 同款多订单按出货份额分摊（无出货则均分），防期间费用重复背（结算Q1 同源）。
  private async aggregatePeriodExpense(order: OrderMain): Promise<number> {
    const styleNo = order.style_no;
    if (!styleNo) return 0;
    const recons = await this.reconcileRepo.find({
      where: [
        { style_no: styleNo, type: ReconcileType.NO_CONTRACT, status: ReconciliationStatus.CONFIRMED, deleted: 0 },
        { style_no: styleNo, type: ReconcileType.NO_CONTRACT, status: ReconciliationStatus.PAID, deleted: 0 },
      ],
    });
    const headerSum = r4(recons.reduce((s, rc) => s + +rc.total_amount, 0));
    // 另计费用明细中单独标注该款号的行（跨款空白对账单场景）
    const items = await this.expenseItemRepo.find({ where: { style_no: styleNo } });
    const itemSum = r4(items.reduce((s, it) => s + +it.amount, 0));
    const total = r4(Math.max(headerSum, itemSum));
    if (!total) return 0;

    const siblings = await this.orderRepo.find({ where: { style_no: styleNo, deleted: 0 } });
    if (siblings.length <= 1) return total;
    const ships = await this.shipmentRepo.find({ where: { order_id: In(siblings.map((o) => o.id)) } });
    const totalQty = ships.reduce((s, x) => s + x.qty, 0);
    const myQty = ships.filter((x) => +x.order_id === +order.id).reduce((s, x) => s + x.qty, 0);
    const share = totalQty > 0 ? myQty / totalQty : 1 / siblings.length;
    return r4(total * share);
  }

  // 用 settlement 现存财务录入 + 货款重算所有派生量并写回实体（不落库）。
  // receipts 给定且非空时：收汇总额=逐笔累计；各笔均带汇率则结算金额=Σ(金额×汇率)、
  // 头上汇率写回加权平均（结算Q2/Q13 多汇率链）；否则结算金额=收汇×结算汇率。
  // 必填闸门（结算稿C/E）：收汇与汇率齐备(结算金额>0)才出毛利/净利，防缺值按0出误导性负毛利。
  private applyDerived(
    settlement: Settlement,
    goodsAmountTax: number,
    goodsAmountExtax: number,
    receipts: SettlementReceipt[] | undefined,
    financeFeeRate: number,
  ) {
    let settleAmount: number | null = null;
    if (receipts && receipts.length) {
      settlement.receipt_usd = r4(receipts.reduce((s, rc) => s + +rc.amount, 0));
      if (receipts.every((rc) => rc.exchange_rate != null && +rc.exchange_rate > 0)) {
        settleAmount = r4(receipts.reduce((s, rc) => s + +rc.amount * +(rc.exchange_rate as any), 0));
        if (+settlement.receipt_usd > 0) settlement.exchange_rate = r4(settleAmount / +settlement.receipt_usd);
      }
    }
    const receiptUsd = +(settlement.receipt_usd ?? 0);
    if (settleAmount == null) settleAmount = r4(receiptUsd * +(settlement.exchange_rate ?? 0));

    const periodFeeTotal =
      +(settlement.freight_fee ?? 0) + +(settlement.express_fee ?? 0) + +(settlement.sample_fee ?? 0) + +(settlement.other_fee ?? 0);
    const d = calcDerived({
      goodsAmountTax,
      goodsAmountExtax,
      shippedQty: settlement.shipped_qty ?? 0,
      invoiceAmountUsd: +(settlement.invoice_amount_usd ?? 0),
      settleAmount,
      periodFeeTotal,
      taxRefund: +(settlement.tax_refund ?? 0),
      financeFeeRate,
    });
    const ready = receiptUsd > 0 && settleAmount > 0;
    settlement.profit_ready = ready ? 1 : 0;
    settlement.goods_amount_tax = goodsAmountTax;
    settlement.goods_amount_extax = goodsAmountExtax;
    settlement.cost_per_unit_tax = d.costPerUnitTax;
    settlement.cost_per_unit_extax = d.costPerUnitExtax;
    settlement.usd_unit_price = d.usdUnitPrice;
    settlement.settle_amount = settleAmount;
    settlement.finance_fee = ready ? d.financeFee : 0;
    settlement.gross_profit = ready ? d.grossProfit : 0;
    settlement.gross_margin = ready ? d.grossMargin : undefined;
    settlement.breakeven_rate_tax = d.breakevenRateTax;
    settlement.breakeven_rate_extax = d.breakevenRateExtax;
    settlement.net_profit = ready ? d.netProfit : 0;
    settlement.net_profit_ex_refund = ready ? d.netProfitExRefund : 0;
    // 兼容旧列语义：revenue=结算金额, total_cost=总货款含税, cost_per_unit=不含税成本单价
    settlement.revenue = settleAmount;
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

    // 缺省税率/退税率/财务费率取自配置（禁一刀切 1.13 / 7%）
    const vatRate = await this.config.getNumber('vat_rate', 13);
    const refundRate = await this.config.getNumber('export_refund_rate', 13);
    const financeFeeRate = await this.config.getNumber('finance_fee_rate', 7);

    // 无手工成本明细/总货款时，自动按订单从对账付款聚合（设计稿 D4/D6：成本明细源自对账付款、只读）
    const auto = !dto.costs?.length && dto.goods_amount_tax == null;
    const agg = auto ? await this.aggregateGoods(order, vatRate) : null;
    // 期间费用未填时，从无合同费用对账按款号归集（账实一致）
    const noPeriodInput = dto.freight_fee == null && dto.express_fee == null && dto.sample_fee == null && dto.other_fee == null;
    const aggPeriod = noPeriodInput ? await this.aggregatePeriodExpense(order) : 0;

    return this.dataSource.transaction(async (manager) => {
      const manualCosts = dto.costs ?? [];
      let goodsAmountTax: number;
      let goodsAmountExtax: number;
      let refundableExtax: number;
      if (agg) {
        goodsAmountTax = agg.paidTax;
        goodsAmountExtax = agg.paidExtax;
        refundableExtax = agg.refundableExtax;
      } else if (manualCosts.length) {
        const s = sumCostRows(manualCosts as CostLike[], vatRate);
        goodsAmountTax = s.tax;
        goodsAmountExtax = s.extax;
        refundableExtax = s.refundableExtax;
      } else {
        goodsAmountTax = r4(dto.goods_amount_tax ?? 0);
        goodsAmountExtax = r4(goodsAmountTax / (1 + vatRate / 100));
        refundableExtax = goodsAmountExtax;
      }
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
        unpaid_goods_tax: agg?.unpaidTax ?? 0,
        unpaid_count: agg?.unpaidCount ?? 0,
        description: dto.description ?? null,
        created_by: createdBy,
        deleted: 0,
      }) as Settlement;
      this.applyDerived(draft, goodsAmountTax, goodsAmountExtax, undefined, financeFeeRate);

      const settlement = await manager.save(Settlement, draft);

      const costLines = [
        ...manualCosts.map((c) =>
          manager.create(SettlementCost, {
            settlement_id: settlement.id,
            cost_name: c.cost_name,
            amount: r4(c.amount),
            has_invoice: c.has_invoice ?? 1,
            tax_rate: c.tax_rate ?? vatRate,
            source: 'MANUAL',
            included: 1,
          }),
        ),
        ...(agg?.autoRows ?? []).map((rw) => manager.create(SettlementCost, { ...rw, settlement_id: settlement.id })),
      ];
      if (costLines.length) await manager.save(SettlementCost, costLines);

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
    const costs = await this.costRepo.find({ where: { settlement_id: id }, order: { included: 'DESC', id: 'ASC' } });
    const receipts = await this.receiptRepo.find({ where: { settlement_id: id }, order: { receipt_date: 'ASC' } });
    return { ...settlement, costs, receipts };
  }

  // 结算单编辑（草稿限定）：财务两步走——建单后回头补收汇/汇率/发票金额/费用（结算稿B/D 断链修复）
  async update(id: number, dto: UpdateSettlementDto, userId?: number): Promise<Settlement> {
    const vatRate = await this.config.getNumber('vat_rate', 13);
    const financeFeeRate = await this.config.getNumber('finance_fee_rate', 7);
    return this.dataSource.transaction(async (manager) => {
      const settlement = await manager.findOne(Settlement, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
      if (settlement.status !== SettlementStatus.DRAFT) {
        throw new BadRequestException('只有草稿状态才可编辑结算单');
      }

      const before = {
        exchange_rate: settlement.exchange_rate, invoice_amount_usd: settlement.invoice_amount_usd,
        receipt_usd: settlement.receipt_usd, freight_fee: settlement.freight_fee, express_fee: settlement.express_fee,
        sample_fee: settlement.sample_fee, other_fee: settlement.other_fee, tax_refund: settlement.tax_refund,
      };
      const receipts = await manager.find(SettlementReceipt, { where: { settlement_id: id } });
      if (dto.receipt_usd != null) {
        if (receipts.length) throw new BadRequestException('已有逐笔收汇记录，收汇总额由记录累计，不可手工覆盖');
        settlement.receipt_usd = r4(dto.receipt_usd);
      }
      if (dto.exchange_rate != null) settlement.exchange_rate = r4(dto.exchange_rate);
      if (dto.invoice_amount_usd != null) settlement.invoice_amount_usd = r4(dto.invoice_amount_usd);
      if (dto.freight_fee != null) settlement.freight_fee = r4(dto.freight_fee);
      if (dto.express_fee != null) settlement.express_fee = r4(dto.express_fee);
      if (dto.sample_fee != null) settlement.sample_fee = r4(dto.sample_fee);
      if (dto.other_fee != null) settlement.other_fee = r4(dto.other_fee);
      if (dto.tax_refund != null) settlement.tax_refund = r4(dto.tax_refund);
      if (dto.description !== undefined) settlement.description = dto.description;

      const rows = await manager.find(SettlementCost, { where: { settlement_id: id } });
      let goodsTax = +(settlement.goods_amount_tax ?? 0);
      let goodsExtax = +(settlement.goods_amount_extax ?? 0);
      if (rows.length) {
        const s = sumCostRows(rows, vatRate);
        if (s.rows) {
          goodsTax = s.tax;
          goodsExtax = s.extax;
        }
      }
      this.applyDerived(settlement, goodsTax, goodsExtax, receipts, financeFeeRate);
      const saved = await manager.save(Settlement, settlement);
      // 改值留痕(P2#21):汇率/发票/收汇/费用/退税 原值→新值
      await this.changeLog.record('SETTLEMENT', id, (Object.keys(before) as Array<keyof typeof before>)
        .map((k) => ({ field: k, old: before[k], new: (saved as any)[k] })), userId);
      return saved;
    });
  }

  async addCost(id: number, dto: AddCostDto): Promise<Settlement> {
    const vatRate = await this.config.getNumber('vat_rate', 13);
    const financeFeeRate = await this.config.getNumber('finance_fee_rate', 7);
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
          tax_rate: dto.tax_rate ?? vatRate,
          source: 'MANUAL',
          included: 1,
        }),
      );

      const costs = await manager.find(SettlementCost, { where: { settlement_id: id } });
      const s = sumCostRows(costs, vatRate);
      const receipts = await manager.find(SettlementReceipt, { where: { settlement_id: id } });
      this.applyDerived(settlement, s.tax, s.extax, receipts, financeFeeRate);
      return manager.save(Settlement, settlement);
    });
  }

  // 删除成本行（草稿限定；AUTO 行可删，「刷新付款汇总」会按对账现状重建）
  async removeCost(id: number, costId: number): Promise<Settlement> {
    const vatRate = await this.config.getNumber('vat_rate', 13);
    const financeFeeRate = await this.config.getNumber('finance_fee_rate', 7);
    return this.dataSource.transaction(async (manager) => {
      const settlement = await manager.findOne(Settlement, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
      if (settlement.status !== SettlementStatus.DRAFT) {
        throw new BadRequestException('只有草稿状态才可删除成本明细');
      }
      const row = await manager.findOne(SettlementCost, { where: { id: costId, settlement_id: id } });
      if (!row) throw new NotFoundException(`成本行 #${costId} 不存在`);
      await manager.delete(SettlementCost, { id: costId });

      const costs = await manager.find(SettlementCost, { where: { settlement_id: id } });
      const s = sumCostRows(costs, vatRate);
      const receipts = await manager.find(SettlementReceipt, { where: { settlement_id: id } });
      this.applyDerived(settlement, s.tax, s.extax, receipts, financeFeeRate);
      return manager.save(Settlement, settlement);
    });
  }

  async addReceipt(id: number, dto: AddReceiptDto): Promise<Settlement> {
    const vatRate = await this.config.getNumber('vat_rate', 13);
    const financeFeeRate = await this.config.getNumber('finance_fee_rate', 7);
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
          exchange_rate: dto.exchange_rate ?? null,
          slip_url: dto.slip_url ?? null,
          remark: dto.remark ?? null,
        }),
      );

      // 实际收汇金额(USD) = 逐笔收汇累计；各笔带汇率时结算金额=Σ(金额×汇率)（结算Q2/Q13）
      const receipts = await manager.find(SettlementReceipt, { where: { settlement_id: id } });
      const costs = await manager.find(SettlementCost, { where: { settlement_id: id } });
      const s = sumCostRows(costs, vatRate);
      const goodsTax = s.rows ? s.tax : +(settlement.goods_amount_tax ?? 0);
      const goodsExtax = s.rows ? s.extax : +(settlement.goods_amount_extax ?? 0);
      this.applyDerived(settlement, goodsTax, goodsExtax, receipts, financeFeeRate);
      return manager.save(Settlement, settlement);
    });
  }

  // 删除收汇行（草稿限定，登记错了可改）
  async removeReceipt(id: number, receiptId: number): Promise<Settlement> {
    const vatRate = await this.config.getNumber('vat_rate', 13);
    const financeFeeRate = await this.config.getNumber('finance_fee_rate', 7);
    return this.dataSource.transaction(async (manager) => {
      const settlement = await manager.findOne(Settlement, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
      if (settlement.status !== SettlementStatus.DRAFT) {
        throw new BadRequestException('只有草稿状态才可删除收汇记录');
      }
      const row = await manager.findOne(SettlementReceipt, { where: { id: receiptId, settlement_id: id } });
      if (!row) throw new NotFoundException(`收汇记录 #${receiptId} 不存在`);
      await manager.delete(SettlementReceipt, { id: receiptId });

      const receipts = await manager.find(SettlementReceipt, { where: { settlement_id: id } });
      if (!receipts.length) settlement.receipt_usd = 0;
      const costs = await manager.find(SettlementCost, { where: { settlement_id: id } });
      const s = sumCostRows(costs, vatRate);
      const goodsTax = s.rows ? s.tax : +(settlement.goods_amount_tax ?? 0);
      const goodsExtax = s.rows ? s.extax : +(settlement.goods_amount_extax ?? 0);
      this.applyDerived(settlement, goodsTax, goodsExtax, receipts, financeFeeRate);
      return manager.save(Settlement, settlement);
    });
  }

  // 刷新付款汇总：重取出货件数（随船务更新）+ 按订单重聚合对账付款，AUTO 快照行整组重建（结算稿D）
  async refreshCost(id: number): Promise<Settlement> {
    const vatRate = await this.config.getNumber('vat_rate', 13);
    const refundRate = await this.config.getNumber('export_refund_rate', 13);
    const financeFeeRate = await this.config.getNumber('finance_fee_rate', 7);
    return this.dataSource.transaction(async (manager) => {
      const settlement = await manager.findOne(Settlement, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
      if (settlement.status !== SettlementStatus.DRAFT) {
        throw new BadRequestException('只有草稿状态才可刷新付款汇总');
      }

      const shipments = await manager.find(OrderShipment, { where: { order_id: settlement.order_id } });
      settlement.shipped_qty = shipments.reduce((sum, s) => sum + s.qty, 0);

      const order = await manager.findOne(OrderMain, { where: { id: settlement.order_id, deleted: 0 } });
      const agg = order ? await this.aggregateGoods(order, vatRate) : { ...EMPTY_AGG, autoRows: [] };

      await manager.delete(SettlementCost, { settlement_id: id, source: 'AUTO' });
      if (agg.autoRows.length) {
        await manager.save(SettlementCost, agg.autoRows.map((rw) => manager.create(SettlementCost, { ...rw, settlement_id: id })));
      }
      const manualRows = await manager.find(SettlementCost, { where: { settlement_id: id, source: 'MANUAL' } });
      const manual = sumCostRows(manualRows, vatRate);
      const goodsTax = r4(agg.paidTax + manual.tax);
      const goodsExtax = r4(agg.paidExtax + manual.extax);
      settlement.unpaid_goods_tax = agg.unpaidTax;
      settlement.unpaid_count = agg.unpaidCount;
      // 退税额仍处预估态时随汇总重测（可退税不含税采购额×退税率）
      if (settlement.refund_status === 'ESTIMATED') {
        settlement.tax_refund = r4((agg.refundableExtax + manual.refundableExtax) * refundRate / 100);
      }

      const receipts = await manager.find(SettlementReceipt, { where: { settlement_id: id } });
      this.applyDerived(settlement, goodsTax, goodsExtax, receipts, financeFeeRate);
      settlement.needs_recalc = 0; // 重算完成,清「待重算」软锁(P2#22)
      const saved = await manager.save(Settlement, settlement);
      await this.changeLog.record('SETTLEMENT', id, [{
        field: 'RECALC',
        new: `货款${saved.goods_amount_tax}/未付${saved.unpaid_goods_tax}(${saved.unpaid_count}笔)/结算${saved.settle_amount}/净利${saved.net_profit}`,
      }]);
      return saved;
    });
  }

  // 红冲重开(P2#22):已确认结算单退回草稿重算;关键数字快照留版本(change_log REOPEN)
  async reopen(id: number, userId?: number): Promise<Settlement> {
    return this.dataSource.transaction(async (manager) => {
      const settlement = await manager.findOne(Settlement, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
      if (settlement.status !== SettlementStatus.CONFIRMED) {
        throw new BadRequestException('只有已确认结算单才可红冲重开');
      }
      await this.changeLog.record('SETTLEMENT', id, [{
        field: 'REOPEN',
        old: `确认于${settlement.confirmed_at?.toISOString?.().slice(0, 19) ?? settlement.confirmed_at}`,
        new: `版本快照:货款${settlement.goods_amount_tax}/结算${settlement.settle_amount}/毛利${settlement.gross_profit}/净利${settlement.net_profit}/退税${settlement.tax_refund}`,
      }], userId);
      settlement.status = SettlementStatus.DRAFT;
      settlement.confirmed_at = null as any;
      settlement.needs_recalc = 0;
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
      // 必填闸门（结算稿C/E）：收汇与汇率齐备、毛利/净利已生成才可确认
      if (!settlement.profit_ready) {
        throw new BadRequestException('收汇金额与结算汇率齐备后才可确认（毛利/净利尚未生成，请先编辑补齐）');
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
