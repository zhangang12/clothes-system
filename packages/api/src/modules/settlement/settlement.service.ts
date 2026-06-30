import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settlement } from './settlement.entity';

@Injectable()
export class SettlementService {
  constructor(
    @InjectRepository(Settlement) private readonly repo: Repository<Settlement>,
  ) {}

  // TODO Phase 7: implement settlement with net_profit/net_profit_ex_refund calculation
  async findAll(page = 1, size = 20) {
    const [items, total] = await this.repo.findAndCount({ where: { deleted: 0 }, skip: (page - 1) * size, take: size });
    return { items, total, page, size };
  }
}
