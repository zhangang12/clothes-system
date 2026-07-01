import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, DataSource } from 'typeorm';
import { Quotation } from './quotation.entity';
import { QuotationItem } from './quotation-item.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { QuoteStatus } from '@i9/types';
import { CreateQuoteDto, CreateQuoteItemDto } from './dto/create-quote.dto';
import { QueryQuoteDto } from './dto/query-quote.dto';

/**
 * 含损单价计算: loss_price = unit_price ÷ (1 - loss_rate / 100)
 * loss_rate 为百分数，如 5 表示 5%
 */
function calcLossPrice(unitPrice: number, lossRate: number): number {
  if (lossRate <= 0 || lossRate >= 100) return unitPrice;
  return unitPrice / (1 - lossRate / 100);
}

function calcItemFields(item: CreateQuoteItemDto, globalLossRate = 0) {
  const effectiveLossRate = item.loss_rate ?? globalLossRate;
  const lossPrice = calcLossPrice(item.unit_price, effectiveLossRate);
  const totalUsage = item.usage_qty != null ? item.usage_qty / (1 - effectiveLossRate / 100) : null;
  const subtotal = totalUsage != null ? lossPrice * totalUsage : null;
  return {
    loss_rate: effectiveLossRate,
    loss_price: +lossPrice.toFixed(4),
    total_usage: totalUsage != null ? +totalUsage.toFixed(4) : null,
    subtotal: subtotal != null ? +subtotal.toFixed(4) : null,
  };
}

@Injectable()
export class QuoteService {
  constructor(
    @InjectRepository(Quotation) private readonly quoteRepo: Repository<Quotation>,
    @InjectRepository(QuotationItem) private readonly itemRepo: Repository<QuotationItem>,
    private readonly numbering: NumberingService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateQuoteDto, createdBy: number): Promise<Quotation> {
    const quote_no = await this.numbering.next(NUM_PREFIX.QUOTATION);
    const globalLossRate = dto.global_loss_rate ?? 0;

    return this.dataSource.transaction(async (manager) => {
      const quote = await manager.save(Quotation, manager.create(Quotation, {
        quote_no,
        customer_id: dto.customer_id,
        sample_id: dto.sample_id,
        style_name: dto.style_name,
        global_loss_rate: globalLossRate,
        currency: dto.currency ?? 'USD',
        gross_margin: dto.gross_margin,
        total_qty: dto.total_qty,
        remark: dto.remark,
        created_by: createdBy,
        status: QuoteStatus.DRAFT,
      }));

      if (dto.items?.length) {
        const items = dto.items.map((item, idx) => {
          const computed = calcItemFields(item, globalLossRate);
          return manager.create(QuotationItem, {
            quote_id: quote.id,
            sort_order: item.sort_order ?? idx,
            item_name: item.item_name,
            unit: item.unit,
            usage_qty: item.usage_qty,
            unit_price: item.unit_price,
            ...computed,
          });
        });
        await manager.save(QuotationItem, items);

        // 重新计算合计金额
        const totalAmount = items.reduce((s, i) => s + (i.subtotal ?? 0), 0);
        await manager.update(Quotation, quote.id, { total_amount: +totalAmount.toFixed(4) });
        quote.total_amount = +totalAmount.toFixed(4);
      }

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
    const where: FindOptionsWhere<Quotation> | FindOptionsWhere<Quotation>[] = keyword
      ? [
          { ...base, quote_no: Like(`%${keyword}%`) },
          { ...base, style_name: Like(`%${keyword}%`) },
        ]
      : base;

    const [items, total] = await this.quoteRepo.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });
    return { items, total, page, size };
  }

  async findOne(id: number) {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    const items = await this.itemRepo.find({
      where: { quote_id: id },
      order: { sort_order: 'ASC' },
    });
    return { ...quote, items };
  }

  async update(id: number, dto: Partial<CreateQuoteDto>): Promise<Quotation> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    if (quote.status !== QuoteStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态的报价单可以编辑');
    }

    const globalLossRate = dto.global_loss_rate ?? quote.global_loss_rate;

    return this.dataSource.transaction(async (manager) => {
      Object.assign(quote, {
        ...(dto.sample_id !== undefined && { sample_id: dto.sample_id }),
        ...(dto.style_name !== undefined && { style_name: dto.style_name }),
        ...(dto.global_loss_rate !== undefined && { global_loss_rate: dto.global_loss_rate }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.gross_margin !== undefined && { gross_margin: dto.gross_margin }),
        ...(dto.total_qty !== undefined && { total_qty: dto.total_qty }),
        ...(dto.remark !== undefined && { remark: dto.remark }),
      });

      if (dto.items) {
        await manager.delete(QuotationItem, { quote_id: id });
        const items = dto.items.map((item, idx) => {
          const computed = calcItemFields(item, globalLossRate);
          return manager.create(QuotationItem, {
            quote_id: id,
            sort_order: item.sort_order ?? idx,
            item_name: item.item_name,
            unit: item.unit,
            usage_qty: item.usage_qty,
            unit_price: item.unit_price,
            ...computed,
          });
        });
        await manager.save(QuotationItem, items);
        quote.total_amount = +items.reduce((s, i) => s + (i.subtotal ?? 0), 0).toFixed(4);
      }

      return manager.save(Quotation, quote);
    });
  }

  async send(id: number): Promise<Quotation> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    if (quote.status !== QuoteStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态才可发送');
    }
    quote.status = QuoteStatus.SENT;
    quote.sent_at = new Date();
    return this.quoteRepo.save(quote);
  }

  async confirmQuote(id: number): Promise<Quotation> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    if (quote.status !== QuoteStatus.SENT) {
      throw new BadRequestException('只有已发送状态才可确认');
    }
    quote.status = QuoteStatus.CONFIRMED;
    quote.confirmed_at = new Date();
    return this.quoteRepo.save(quote);
  }

  async toContract(id: number): Promise<Quotation> {
    const quote = await this.quoteRepo.findOne({ where: { id, deleted: 0 } });
    if (!quote) throw new NotFoundException(`报价单 #${id} 不存在`);
    if (quote.status !== QuoteStatus.CONFIRMED) {
      throw new BadRequestException('只有已确认状态才可转合同');
    }
    quote.status = QuoteStatus.TO_CONTRACT;
    return this.quoteRepo.save(quote);
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

  // 导出报价明细供损耗计算单元测试使用
  static calcLossPrice = calcLossPrice;
  static calcItemFields = calcItemFields;
}
