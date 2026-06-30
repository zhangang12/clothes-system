import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quotation } from './quotation.entity';
import { QuotationItem } from './quotation-item.entity';

@Injectable()
export class QuoteService {
  constructor(
    @InjectRepository(Quotation) private readonly quoteRepo: Repository<Quotation>,
    @InjectRepository(QuotationItem) private readonly itemRepo: Repository<QuotationItem>,
  ) {}

  // TODO Phase 2: implement quote management with loss_rate/loss_price calculation
  async findAll(page = 1, size = 20) {
    const [items, total] = await this.quoteRepo.findAndCount({ where: { deleted: 0 }, skip: (page - 1) * size, take: size });
    return { items, total, page, size };
  }
}
