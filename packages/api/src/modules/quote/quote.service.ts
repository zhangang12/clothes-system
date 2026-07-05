import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, DataSource, EntityManager } from 'typeorm';
import { Quotation } from './quotation.entity';
import { QuotationItem } from './quotation-item.entity';
import { QuotationFee } from './quotation-fee.entity';
import { Customer } from '../customer/customer.entity';
import { SampleGarment } from '../sample/sample-garment.entity';
import { SampleMaterial } from '../sample/sample-material.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { QuoteStatus, SampleStatus, DEFAULT_QUOTE_FEES } from '@i9/types';
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
    private readonly numbering: NumberingService,
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

  async findAll(query: QueryQuoteDto) {
    const { page = 1, size = 20, keyword, status, customer_id } = query;
    const base: FindOptionsWhere<Quotation> = {
      deleted: 0,
      ...(status !== undefined && { status }),
      ...(customer_id !== undefined && { customer_id }),
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

  async findOne(id: number) {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    const [items, fees] = await Promise.all([
      this.itemRepo.find({ where: { quote_id: id }, order: { sort_order: 'ASC' } }),
      this.feeRepo.find({ where: { quote_id: id }, order: { sort_order: 'ASC' } }),
    ]);
    return { ...quote, items, fees };
  }

  async update(id: number, dto: Partial<CreateQuoteDto>): Promise<Quotation> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
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
    for (const [k, col] of map) if (dto[k] !== undefined) (quote as any)[col] = dto[k];
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
  async importFromSample(id: number, sampleId: number): Promise<Quotation> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
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

  // 保存/发出报价：草稿 → 已报价
  async submitQuote(id: number): Promise<Quotation> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    if (![QuoteStatus.DRAFT, QuoteStatus.ADJUSTING].includes(quote.status)) {
      throw new BadRequestException('只有草稿/客户调整状态可发出报价');
    }
    quote.status = QuoteStatus.QUOTED;
    return this.quoteRepo.save(quote);
  }

  // 客户调整：已报价 → 客户调整
  async adjust(id: number): Promise<Quotation> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    if (quote.status !== QuoteStatus.QUOTED) {
      throw new BadRequestException('只有已报价状态可转客户调整');
    }
    quote.status = QuoteStatus.ADJUSTING;
    return this.quoteRepo.save(quote);
  }

  // 转销售合同：已报价/客户调整 → 已成单；关联样衣自动置已成单（B1）
  async toContract(id: number): Promise<Quotation> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    if (![QuoteStatus.QUOTED, QuoteStatus.ADJUSTING].includes(quote.status)) {
      throw new BadRequestException('只有已报价/客户调整状态才可转销售合同');
    }
    quote.status = QuoteStatus.ORDERED;
    const saved = await this.quoteRepo.save(quote);
    if (quote.sample_id) {
      await this.sampleRepo.update({ id: quote.sample_id, deleted: 0 }, { status: SampleStatus.ORDERED });
    }
    return saved;
  }

  async copy(id: number, createdBy: number): Promise<Quotation> {
    const src = await this.findOne(id);
    const quote_no = await this.numbering.next(NUM_PREFIX.QUOTATION);
    const rate = +src.exchange_rate;
    return this.dataSource.transaction(async (manager) => {
      const quote = await manager.save(Quotation, manager.create(Quotation, {
        quote_no, inquiry_date: today(), sample_id: src.sample_id, sample_no: src.sample_no,
        customer_id: src.customer_id, middleman_name: src.middleman_name, buyer_id: src.buyer_id,
        buyer_name: src.buyer_name, buyer_no: src.buyer_no, style_no: src.style_no,
        currency: src.currency, exchange_rate: src.exchange_rate, trade_country: src.trade_country,
        settlement_method: src.settlement_method, price_terms: src.price_terms, salesperson: src.salesperson,
        profit_rate: src.profit_rate, quote_qty: src.quote_qty, status: QuoteStatus.DRAFT,
        created_by: createdBy, deleted: 0,
      }));
      const items = (src.items ?? []).map((it: any, idx: number) => manager.create(QuotationItem, {
        quote_id: quote.id, sort_order: idx, part: it.part, item_name: it.item_name, width: it.width,
        color: it.color, supplier: it.supplier, unit: it.unit, quote_usage: it.quote_usage,
        rmb_price: it.rmb_price, usd_price: it.usd_price, loss_rate: it.loss_rate, loss_amount: it.loss_amount, remark: it.remark,
      }));
      const fees = (src.fees ?? []).map((f: any, idx: number) => manager.create(QuotationFee, {
        quote_id: quote.id, sort_order: idx, fee_name: f.fee_name, rmb_price: f.rmb_price, usd_price: f.usd_price, quote_usage: f.quote_usage,
      }));
      if (items.length) await manager.save(QuotationItem, items);
      if (fees.length) await manager.save(QuotationFee, fees);
      await this.persistTotals(manager, quote, items, fees);
      return quote;
    });
  }

  async remove(id: number): Promise<void> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    if (quote.status !== QuoteStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态的报价单可以删除');
    }
    quote.deleted = 1;
    await this.quoteRepo.save(quote);
  }

  static calcLossAmount = calcLossAmount;
}
