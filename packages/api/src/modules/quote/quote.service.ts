import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, In, Raw, Between, MoreThanOrEqual, LessThanOrEqual, DataSource, EntityManager } from 'typeorm';
import { Quotation } from './quotation.entity';
import { QuotationItem } from './quotation-item.entity';
import { QuotationFee } from './quotation-fee.entity';
import { Customer } from '../customer/customer.entity';
import { SampleGarment } from '../sample/sample-garment.entity';
import { SampleMaterial } from '../sample/sample-material.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { CustomerService } from '../customer/customer.service';
import { ChangeLogService } from '../../common/changelog/change-log.service';
import { OrderService } from '../order/order.service';
import { CreateOrderDto } from '../order/dto/create-order.dto';
import { SysConfigService } from '../../common/config/sys-config.service';
import { QuoteStatus, SampleStatus, DEFAULT_QUOTE_FEES, ApprovalStatus, APPROVAL_THRESHOLD_KEYS } from '@i9/types';
import { CreateQuoteDto, CreateQuoteItemDto, CreateQuoteFeeDto } from './dto/create-quote.dto';
import { QueryQuoteDto } from './dto/query-quote.dto';

const today = () => new Date().toISOString().slice(0, 10);
const r4 = (n: number) => +n.toFixed(4);
const r2 = (n: number) => +n.toFixed(2);

// 含损金额 = 人民币单价 × 报价耗用 × (1 + 损耗%)（客户报价设计稿公式）
export function calcLossAmount(rmbPrice = 0, usage = 0, lossRate = 0): number {
  return rmbPrice * usage * (1 + lossRate / 100);
}

@Injectable()
export class QuoteService {
  constructor(
    @InjectRepository(Quotation) private readonly quoteRepo: Repository<Quotation>,
    @InjectRepository(QuotationItem) private readonly itemRepo: Repository<QuotationItem>,
    @InjectRepository(QuotationFee) private readonly feeRepo: Repository<QuotationFee>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(SampleGarment) private readonly sampleRepo: Repository<SampleGarment>,
    @InjectRepository(SampleMaterial) private readonly sampleMaterialRepo: Repository<SampleMaterial>,
    private readonly customerService: CustomerService,
    private readonly changeLog: ChangeLogService,
    private readonly orderService: OrderService,
    private readonly numbering: NumberingService,
    private readonly config: SysConfigService,
    private readonly dataSource: DataSource,
  ) {}

  private buildItems(quoteId: number, items: CreateQuoteItemDto[], rate: number): QuotationItem[] {
    return items.map((it, idx) => {
      const rmb = +it.rmbPrice || 0;
      const usage = +it.quoteUsage || 0;
      const loss = it.lossRate ?? 3;
      return this.itemRepo.create({
        quote_id: quoteId, sort_order: it.sortOrder ?? idx,
        part: it.part, item_name: it.itemName, width: it.width, color: it.color, supplier: it.supplier,
        unit: it.unit, quote_usage: it.quoteUsage, rmb_price: it.rmbPrice,
        usd_price: rate > 0 ? r4(rmb / rate) : null,
        loss_rate: loss, loss_amount: r4(calcLossAmount(rmb, usage, loss)), remark: it.remark,
      });
    });
  }

  private buildFees(quoteId: number, fees: CreateQuoteFeeDto[], rate: number): QuotationFee[] {
    return fees.map((f, idx) => {
      const rmb = +f.rmbPrice || 0;
      return this.feeRepo.create({
        quote_id: quoteId, sort_order: f.sortOrder ?? idx, fee_name: f.feeName,
        rmb_price: f.rmbPrice, usd_price: rate > 0 ? r4(rmb / rate) : null,
        quote_usage: f.quoteUsage ?? 1,
      });
    });
  }

  // 报价合计 = (含损金额合计 + 费用合计) × (1 + 利润率%)
  private calcTotals(items: QuotationItem[], fees: QuotationFee[], rate: number, profitRate: number) {
    const itemsSum = items.reduce((s, i) => s + (+i.loss_amount || 0), 0);
    const feesSum = fees.reduce((s, f) => s + (+f.rmb_price || 0) * (+f.quote_usage || 0), 0);
    const rmbTotal = r2((itemsSum + feesSum) * (1 + profitRate / 100));
    return { rmb_total: rmbTotal, usd_total: rate > 0 ? r2(rmbTotal / rate) : null };
  }

  private async persistTotals(manager: EntityManager, quote: Quotation, items: QuotationItem[], fees: QuotationFee[]) {
    const totals = this.calcTotals(items, fees, +quote.exchange_rate, +quote.profit_rate);
    quote.rmb_total = totals.rmb_total;
    quote.usd_total = totals.usd_total;
    await manager.update(Quotation, quote.id, totals);
  }

  async create(dto: CreateQuoteDto, createdBy: number): Promise<Quotation> {
    const middlemanId = dto.middlemanId ?? dto.customerId;
    const middleman = await this.customerRepo.findOne({ where: { id: middlemanId, deleted: 0 } });
    if (!middleman) throw new BadRequestException(`中间商客户 #${middlemanId} 不存在`);
    let buyerName: string | undefined; let buyerNo: string | undefined;
    if (dto.buyerId) {
      const buyer = await this.customerRepo.findOne({ where: { id: dto.buyerId, deleted: 0 } });
      buyerName = buyer?.name; buyerNo = buyer?.customer_no;
    }
    const quote_no = await this.numbering.next(NUM_PREFIX.QUOTATION);
    const rate = dto.exchangeRate ?? 1;
    // 费用明细新建自动带 6 行
    const feeDtos: CreateQuoteFeeDto[] = dto.fees?.length
      ? dto.fees
      : DEFAULT_QUOTE_FEES.map((name, i) => ({ feeName: name, quoteUsage: 1, sortOrder: i }));

    return this.dataSource.transaction(async (manager) => {
      const quote = await manager.save(Quotation, manager.create(Quotation, {
        quote_no, inquiry_date: dto.inquiryDate ?? today(), sample_id: dto.sampleId,
        customer_id: middlemanId, middleman_name: middleman.name,
        buyer_id: dto.buyerId, buyer_name: buyerName, buyer_no: buyerNo,
        style_no: dto.styleNo, middleman_contact: dto.middlemanContact,
        currency: dto.currency ?? 'USD', exchange_rate: rate,
        trade_country: dto.tradeCountry, settlement_method: dto.settlementMethod, price_terms: dto.priceTerms,
        salesperson: dto.salesperson, profit_rate: dto.profitRate ?? 0, quote_qty: dto.quoteQty,
        image1: dto.image1, image2: dto.image2, total_remark: dto.totalRemark,
        status: QuoteStatus.DRAFT, created_by: createdBy, deleted: 0,
      }));
      const items = dto.items?.length ? this.buildItems(quote.id, dto.items, rate) : [];
      const fees = this.buildFees(quote.id, feeDtos, rate);
      if (items.length) await manager.save(QuotationItem, items);
      await manager.save(QuotationFee, fees);
      await this.persistTotals(manager, quote, items, fees);
      return quote;
    });
  }

  async findAll(query: QueryQuoteDto, user?: { id: number; role?: string }) {
    const {
      page = 1, size = 20, keyword, status, customer_id,
      quote_no, style_no, middleman_name, buyer_name, salesperson, inquiry_start, inquiry_end,
    } = query;
    // 客户机密行级过滤（设计稿 01：非授权用户在报价中不可见该客户）：
    // 中间商(customer_id)或最终买家(buyer_id)任一指向不可见客户 → 整单隐藏
    const visibleIds = await this.customerService.visibleCustomerIds(user);
    const secretCond: FindOptionsWhere<Quotation> = {};
    if (visibleIds !== null) {
      const set = visibleIds.length ? visibleIds.map(Number) : [0];
      Object.assign(secretCond, {
        customer_id: In(set),
        buyer_id: Raw((a) => `(${a} IS NULL OR ${a} IN (${set.join(',')}))`),
      });
    }
    // 查询参数 customer_id 必须与机密可见集求交集(H4):不可见客户 → 强制空结果(In([0])),绝不用原值覆盖 secretCond
    let customerCond: FindOptionsWhere<Quotation> = {};
    if (customer_id !== undefined) {
      const allowed = visibleIds === null || visibleIds.map(Number).includes(+customer_id);
      customerCond = { customer_id: allowed ? customer_id : In([0]) };
    }
    // 询价日期范围（起/止均含）
    const inquiryCond = inquiry_start && inquiry_end
      ? Between(inquiry_start, inquiry_end)
      : inquiry_start ? MoreThanOrEqual(inquiry_start)
      : inquiry_end ? LessThanOrEqual(inquiry_end)
      : undefined;
    // 高级筛选条件必须进 base：keyword 时 where 是 OR 数组，每个分支都要 AND 上这些条件
    const base: FindOptionsWhere<Quotation> = {
      deleted: 0,
      ...secretCond,
      ...(status !== undefined && { status }),
      ...customerCond,
      ...(quote_no && { quote_no: Like(`%${quote_no}%`) }),
      ...(style_no && { style_no: Like(`%${style_no}%`) }),
      ...(middleman_name && { middleman_name: Like(`%${middleman_name}%`) }),
      ...(buyer_name && { buyer_name: Like(`%${buyer_name}%`) }),
      ...(salesperson && { salesperson: Like(`%${salesperson}%`) }),
      ...(inquiryCond && { inquiry_date: inquiryCond }),
    };
    // 智能搜索：报价单号/中间商/最终买家/客户款号/业务员（设计稿 §B）
    const searchable = ['quote_no', 'middleman_name', 'buyer_name', 'style_no', 'salesperson'];
    const where: FindOptionsWhere<Quotation> | FindOptionsWhere<Quotation>[] = keyword
      ? searchable.map((f) => ({ ...base, [f]: Like(`%${keyword}%`) }))
      : base;

    const [items, total] = await this.quoteRepo.findAndCount({
      where, skip: (page - 1) * size, take: size, order: { id: 'DESC' },
    });
    return { items, total, page, size };
  }

  async findOne(id: number, user?: { id: number; role?: string }) {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    // 机密守卫：报价关联客户不可见 → 与不存在同响应（防探测）
    if (quote) {
      const visibleIds = await this.customerService.visibleCustomerIds(user);
      if (visibleIds !== null) {
        const set = new Set(visibleIds.map(Number));
        const hidden = (quote.customer_id && !set.has(+quote.customer_id))
          || (quote.buyer_id && !set.has(+quote.buyer_id));
        if (hidden) throw new NotFoundException(`报价单 #${id} 不存在`);
      }
    }
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    const [items, fees] = await Promise.all([
      this.itemRepo.find({ where: { quote_id: id }, order: { sort_order: 'ASC' } }),
      this.feeRepo.find({ where: { quote_id: id }, order: { sort_order: 'ASC' } }),
    ]);
    // 关联订单/被引用列表 + 草稿订单「占用中」软标记(P2#20/#23,ORD A8/A6)
    const relatedOrders = await this.orderService.listByQuote(id);
    const occupied_by_draft = relatedOrders.some((o) => o.status === 'DRAFT');
    // 行级标记(P2#20):耗用偏离样衣实测「已偏离样衣」/样衣未实测「单耗为预估」
    let outItems: any[] = items;
    if (quote.sample_id) {
      const mats = await this.sampleMaterialRepo.find({ where: { sample_id: quote.sample_id } });
      const byName = new Map(mats.map((m) => [String(m.item_name || '').trim(), m]));
      outItems = items.map((it) => {
        const m = byName.get(String(it.item_name || '').trim());
        if (!m) return it;
        const sampleUsage = m.actual_usage != null ? +m.actual_usage : (m.qty != null ? +m.qty : null);
        return {
          ...it,
          usage_is_estimate: m.actual_usage == null, // 样衣未实测→单耗为预估
          deviated_from_sample: sampleUsage != null && Math.abs(+it.quote_usage - sampleUsage) > 1e-6,
          sample_usage: sampleUsage,
        };
      });
    }
    return { ...quote, items: outItems, fees, related_orders: relatedOrders, occupied_by_draft };
  }

  // 机密可见性断言(H6):所有写操作与 findOne 同一防线——中间商/最终买家任一不可见 → 与「不存在」同响应(防探测,不抛 403 暴露存在性)
  private async assertVisible(quote: Quotation, user?: { id: number; role?: string }): Promise<void> {
    const visibleIds = await this.customerService.visibleCustomerIds(user);
    if (visibleIds === null) return;
    const set = new Set(visibleIds.map(Number));
    const hidden = (quote.customer_id && !set.has(+quote.customer_id))
      || (quote.buyer_id && !set.has(+quote.buyer_id));
    if (hidden) throw new NotFoundException(`报价单 #${quote.id} 不存在`);
  }

  async update(id: number, dto: Partial<CreateQuoteDto>, user?: { id: number; role?: string }): Promise<Quotation> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    await this.assertVisible(quote, user);
    if (![QuoteStatus.DRAFT, QuoteStatus.ADJUSTING].includes(quote.status)) {
      throw new BadRequestException('只有草稿/客户调整状态的报价单可以编辑');
    }
    const map: Array<[keyof CreateQuoteDto, keyof Quotation]> = [
      ['inquiryDate', 'inquiry_date'], ['sampleId', 'sample_id'], ['buyerId', 'buyer_id'],
      ['styleNo', 'style_no'], ['middlemanContact', 'middleman_contact'], ['currency', 'currency'],
      ['exchangeRate', 'exchange_rate'], ['tradeCountry', 'trade_country'],
      ['settlementMethod', 'settlement_method'], ['priceTerms', 'price_terms'], ['salesperson', 'salesperson'],
      ['profitRate', 'profit_rate'], ['quoteQty', 'quote_qty'], ['image1', 'image1'], ['image2', 'image2'],
      ['totalRemark', 'total_remark'],
    ];
    // 改值留痕(P2#21):汇率/利润率/数量 原值→新值
    const before = { exchange_rate: quote.exchange_rate, profit_rate: quote.profit_rate, quote_qty: quote.quote_qty };
    for (const [k, col] of map) if (dto[k] !== undefined) (quote as any)[col] = dto[k];
    await this.changeLog.record('QUOTE', id, (Object.keys(before) as Array<keyof typeof before>)
      .map((k) => ({ field: k, old: before[k], new: (quote as any)[k] })));
    // 编辑会重算金额:清除已有审批状态,避免「审批通过后改高金额再提交」绕过阈值校验
    quote.approval_status = ApprovalStatus.NONE;
    quote.content_updated_at = new Date(); // 内容级修改——下游订单「源报价已变更」标记依据(P2#20)
    const rate = +quote.exchange_rate;

    return this.dataSource.transaction(async (manager) => {
      await manager.save(Quotation, quote);
      let items: QuotationItem[] = await this.itemRepo.find({ where: { quote_id: id } });
      let fees: QuotationFee[] = await this.feeRepo.find({ where: { quote_id: id } });
      if (dto.items !== undefined) {
        await manager.delete(QuotationItem, { quote_id: id });
        items = this.buildItems(id, dto.items, rate);
        if (items.length) await manager.save(QuotationItem, items);
      }
      if (dto.fees !== undefined) {
        await manager.delete(QuotationFee, { quote_id: id });
        fees = this.buildFees(id, dto.fees, rate);
        if (fees.length) await manager.save(QuotationFee, fees);
      }
      await this.persistTotals(manager, quote, items, fees);
      return quote;
    });
  }

  // 从样衣导入：材料明细 → 报价明细（部位/品名/门幅/颜色/供应商/耗用），独立快照
  async importFromSample(id: number, sampleId: number, user?: { id: number; role?: string }): Promise<Quotation> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    await this.assertVisible(quote, user);
    if (![QuoteStatus.DRAFT, QuoteStatus.ADJUSTING].includes(quote.status)) {
      throw new BadRequestException('只有草稿/客户调整状态可从样衣导入');
    }
    const sample = await this.sampleRepo.findOne({ where: { id: sampleId, deleted: 0 } });
    if (!sample) throw new BadRequestException(`样衣 #${sampleId} 不存在`);
    const materials = await this.sampleMaterialRepo.find({ where: { sample_id: sampleId }, order: { sort_order: 'ASC' } });
    const rate = +quote.exchange_rate;

    return this.dataSource.transaction(async (manager) => {
      quote.sample_id = sampleId;
      quote.sample_no = sample.sample_no;
      if (!quote.style_no) quote.style_no = sample.style_no;
      // 图片随单继承(P3#33/TRI G1):样衣款图带到报价,已有不覆盖。
      // 样衣图片槽已改多值(图片+附件逗号分隔),报价单图取槽内【第一张图片】。
      const firstImg = (s?: string) => (s || '').split(',').map((x) => x.trim())
        .filter(Boolean).find((u) => /\.(png|jpe?g|webp|gif)$/i.test(u));
      if (!quote.image1 && firstImg(sample.image1)) quote.image1 = firstImg(sample.image1);
      if (!quote.image2 && (firstImg(sample.image2) || firstImg(sample.image3))) quote.image2 = firstImg(sample.image2) || firstImg(sample.image3);
      quote.approval_status = ApprovalStatus.NONE; // 导入改金额:清审批,避免绕过阈值
      await manager.save(Quotation, quote);
      await manager.delete(QuotationItem, { quote_id: id });
      const items = this.buildItems(id, materials.map((m) => ({
        part: m.part, itemName: m.item_name, width: m.width, color: m.colors,
        supplier: m.supplier_name, quoteUsage: +m.actual_usage || +m.qty || 0, lossRate: 3,
      } as CreateQuoteItemDto)), rate);
      if (items.length) await manager.save(QuotationItem, items);
      const fees = await this.feeRepo.find({ where: { quote_id: id } });
      await this.persistTotals(manager, quote, items, fees);
      return quote;
    });
  }

  // 样衣材料修改→同步未成单报价（总览走查P1#11/TRI A5/ORD C8，已拍板）：
  // 按品名匹配保留议价（人民币单价/损耗率/单位/备注沿用原行），耗用/颜色/供应商等随样衣刷新；
  // 已成单(ORDERED)报价不动；金额变化清审批（同 importFromSample 语义）。
  async syncFromSample(sampleId: number): Promise<number> {
    const quotes = await this.quoteRepo.find({ where: { sample_id: sampleId, deleted: 0 } });
    const targets = quotes.filter((q) => q.status !== QuoteStatus.ORDERED);
    if (!targets.length) return 0;
    const materials = await this.sampleMaterialRepo.find({ where: { sample_id: sampleId }, order: { sort_order: 'ASC' } });
    for (const quote of targets) {
      const rate = +quote.exchange_rate;
      await this.dataSource.transaction(async (manager) => {
        const oldItems = await manager.find(QuotationItem, { where: { quote_id: quote.id } });
        const byName = new Map(oldItems.map((i) => [String(i.item_name || '').trim(), i]));
        const items = this.buildItems(quote.id, materials.map((m) => {
          const old = byName.get(String(m.item_name || '').trim());
          return {
            part: m.part, itemName: m.item_name, width: m.width, color: m.colors,
            supplier: m.supplier_name, quoteUsage: +m.actual_usage || +m.qty || 0,
            rmbPrice: old ? +old.rmb_price : undefined,
            lossRate: old != null ? +old.loss_rate : 3,
            unit: old?.unit, remark: old?.remark,
          } as CreateQuoteItemDto;
        }), rate);
        await manager.delete(QuotationItem, { quote_id: quote.id });
        if (items.length) await manager.save(QuotationItem, items);
        const fees = await manager.find(QuotationFee, { where: { quote_id: quote.id } });
        quote.approval_status = ApprovalStatus.NONE;
        await manager.save(Quotation, quote);
        await this.persistTotals(manager, quote, items, fees);
      });
    }
    return targets.length;
  }

  // 保存/发出报价：草稿 → 已报价
  async submitQuote(id: number, user?: { id: number; role?: string }): Promise<Quotation> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    await this.assertVisible(quote, user);
    if (![QuoteStatus.DRAFT, QuoteStatus.ADJUSTING].includes(quote.status)) {
      throw new BadRequestException('只有草稿/客户调整状态可发出报价');
    }
    // 金额阈值审批：报价合计超阈值需主管审批后方可发出（设计稿 审批矩阵，阈值可配）
    // 利润率下限审批(P3#42/qc D8;系统参数 quote.min_profit_rate,默认0=不启用)
    if (quote.approval_status !== ApprovalStatus.APPROVED) {
      const threshold = await this.config.getNumber(APPROVAL_THRESHOLD_KEYS.QUOTE);
      const minProfit = await this.config.getNumber('quote.min_profit_rate', 0);
      const reasons: string[] = [];
      if (threshold > 0 && +quote.rmb_total > threshold) reasons.push(`报价金额 ${quote.rmb_total} 超过审批阈值 ${threshold}`);
      if (minProfit > 0 && +(quote.profit_rate ?? 0) < minProfit) {
        reasons.push(`利润率 ${quote.profit_rate ?? 0}% 低于下限 ${minProfit}%`);
      }
      if (reasons.length) {
        if (quote.approval_status !== ApprovalStatus.PENDING) {
          quote.approval_status = ApprovalStatus.PENDING;
          await this.quoteRepo.save(quote);
        }
        throw new BadRequestException(`${reasons.join('；')}，需主管审批后方可发出报价`);
      }
    }
    quote.status = QuoteStatus.QUOTED;
    return this.quoteRepo.save(quote);
  }

  // 主管审批（超阈值报价）：待审批 → 已审批，放行报价
  async approveQuote(id: number, approverId: number, user?: { id: number; role?: string }): Promise<Quotation> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    await this.assertVisible(quote, user); // 同为写操作，与 H6 其他端点同一防线
    if (quote.approval_status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('该报价无待审批项（未超阈值或已审批）');
    }
    quote.approval_status = ApprovalStatus.APPROVED;
    quote.approved_by = approverId;
    quote.approved_at = new Date();
    return this.quoteRepo.save(quote);
  }

  // 客户调整：已报价 → 客户调整
  async adjust(id: number, user?: { id: number; role?: string }): Promise<Quotation> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    await this.assertVisible(quote, user);
    if (quote.status !== QuoteStatus.QUOTED) {
      throw new BadRequestException('只有已报价状态可转客户调整');
    }
    quote.status = QuoteStatus.ADJUSTING;
    return this.quoteRepo.save(quote);
  }

  // 转销售合同：已报价/客户调整 → 已成单；关联样衣自动置已成单（B1）；并自动生成订单草稿（含报价明细导入）
  async toContract(id: number, userId: number, user?: { id: number; role?: string }) {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    await this.assertVisible(quote, user);
    if (![QuoteStatus.QUOTED, QuoteStatus.ADJUSTING].includes(quote.status)) {
      throw new BadRequestException('只有已报价/客户调整状态才可转销售合同');
    }
    // L4:先建订单+导入报价材料,全部成功后才在单个事务内翻转已成单/联动样衣;
    // 中途失败报价保持原状态可整体重试,杜绝「报价已成单但订单缺失且无法重试」
    // 自动建订单：create 必填仅 customer_id/qty_total；customer_po 暂无客户 PO，用报价单号占位（订单草稿可改）
    const order = await this.orderService.create({
      quote_id: id,
      customer_id: quote.customer_id,
      customer_po: quote.quote_no,
      style_no: quote.style_no ?? undefined,
      buyer_id: quote.buyer_id ?? undefined,
      salesperson: quote.salesperson ?? undefined,
      currency: quote.currency ?? undefined,
      // 报价数量不导入订单(总览走查P1#12/ORD A2 决议):留空强制在尺码矩阵补录,矩阵合计回填大货总数
      qty_total: 0,
    } as CreateOrderDto, userId);
    try {
      // 报价明细 → 订单材料明细（快照；importFromQuote 会带出中间商/买家等基础字段）
      await this.orderService.importFromQuote(order.id, id);
      // 状态变更+关联样衣联动同一事务（原来与建单分属多事务,现已收敛为收尾单事务）
      const saved = await this.dataSource.transaction(async (manager) => {
        quote.status = QuoteStatus.ORDERED;
        const s = await manager.save(Quotation, quote);
        if (quote.sample_id) {
          await manager.update(SampleGarment, { id: quote.sample_id, deleted: 0 }, { status: SampleStatus.ORDERED });
        }
        return s;
      });
      return { ...saved, order_id: order.id, order_no: order.order_no };
    } catch (e) {
      // 补偿:后续步骤失败则删除刚建的草稿订单,报价仍原状态,可整体重试
      await this.orderService.remove(order.id).catch(() => {});
      throw e;
    }
  }

  // 报价历史导入(P3#43/TRI J2):历史报价批量入库(仅主表要点:款号/客户/币种/汇率/合计),
  // 状态默认 QUOTED;客户按名精确匹配
  async importBatch(rows: Array<Record<string, any>>, createdBy: number) {
    const failures: Array<{ row: number; reason: string }> = [];
    let ok = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (!r.customer_name) throw new Error('缺客户名称');
        const [cust] = await this.dataSource.query(
          'SELECT id, name FROM customer WHERE name = ? AND deleted = 0 LIMIT 1', [String(r.customer_name).trim()]);
        if (!cust) throw new Error(`客户「${r.customer_name}」不存在(先在基础资料建档)`);
        const quote_no = await this.numbering.next(NUM_PREFIX.QUOTATION);
        await this.quoteRepo.save(this.quoteRepo.create({
          quote_no,
          customer_id: +cust.id,
          middleman_name: cust.name,
          style_no: r.style_no ? String(r.style_no) : null,
          inquiry_date: r.inquiry_date || null,
          currency: r.currency ? String(r.currency).toUpperCase() : 'USD',
          exchange_rate: r.exchange_rate != null && r.exchange_rate !== '' ? +r.exchange_rate : null,
          quote_qty: +r.quote_qty || 0,
          rmb_total: r.rmb_total != null && r.rmb_total !== '' ? +r.rmb_total : null,
          usd_total: r.usd_total != null && r.usd_total !== '' ? +r.usd_total : null,
          salesperson: r.salesperson ? String(r.salesperson) : null,
          total_remark: r.remark ? String(r.remark) : '历史迁移导入',
          status: QuoteStatus.QUOTED,
          created_by: createdBy,
          deleted: 0,
        } as any) as any);
        ok++;
      } catch (e: any) {
        failures.push({ row: i + 1, reason: e?.message ?? '未知错误' });
      }
    }
    return { ok, fail: failures.length, failures };
  }

  // 复制：withItems=true 含明细/费用；false 仅复制基本信息（设计稿：复制可选是否带明细）
  async copy(id: number, createdBy: number, withItems = true, user?: { id: number; role?: string }): Promise<Quotation> {
    const src = await this.findOne(id, user); // findOne 内含机密可见性 404 防探测(H6)
    const quote_no = await this.numbering.next(NUM_PREFIX.QUOTATION);
    const rate = +src.exchange_rate;
    return this.dataSource.transaction(async (manager) => {
      const quote = await manager.save(Quotation, manager.create(Quotation, {
        quote_no, inquiry_date: today(), sample_id: src.sample_id, sample_no: src.sample_no,
        customer_id: src.customer_id, middleman_name: src.middleman_name, buyer_id: src.buyer_id,
        buyer_name: src.buyer_name, buyer_no: src.buyer_no, style_no: src.style_no,
        middleman_contact: src.middleman_contact,
        currency: src.currency, exchange_rate: src.exchange_rate, trade_country: src.trade_country,
        settlement_method: src.settlement_method, price_terms: src.price_terms, salesperson: src.salesperson,
        profit_rate: src.profit_rate, quote_qty: src.quote_qty,
        image1: src.image1, image2: src.image2, total_remark: src.total_remark,
        status: QuoteStatus.DRAFT,
        created_by: createdBy, deleted: 0,
      }));
      const items = (withItems ? src.items ?? [] : []).map((it: any, idx: number) => manager.create(QuotationItem, {
        quote_id: quote.id, sort_order: idx, part: it.part, item_name: it.item_name, width: it.width,
        color: it.color, supplier: it.supplier, unit: it.unit, quote_usage: it.quote_usage,
        rmb_price: it.rmb_price, usd_price: it.usd_price, loss_rate: it.loss_rate, loss_amount: it.loss_amount, remark: it.remark,
      }));
      const fees = (withItems ? src.fees ?? [] : []).map((f: any, idx: number) => manager.create(QuotationFee, {
        quote_id: quote.id, sort_order: idx, fee_name: f.fee_name, rmb_price: f.rmb_price, usd_price: f.usd_price, quote_usage: f.quote_usage,
      }));
      if (items.length) await manager.save(QuotationItem, items);
      if (fees.length) await manager.save(QuotationFee, fees);
      await this.persistTotals(manager, quote, items, fees);
      return quote;
    });
  }

  async remove(id: number, user?: { id: number; role?: string }): Promise<void> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    await this.assertVisible(quote, user);
    if (quote.status !== QuoteStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态的报价单可以删除');
    }
    quote.deleted = 1;
    await this.quoteRepo.save(quote);
  }

  static calcLossAmount = calcLossAmount;
}
