import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reconciliation } from './reconciliation.entity';

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(Reconciliation) private readonly repo: Repository<Reconciliation>,
  ) {}

  // TODO Phase 6: implement reconciliation with snapshot_unit_price and account-period logic
  async findAll(page = 1, size = 20) {
    const [items, total] = await this.repo.findAndCount({ where: { deleted: 0 }, skip: (page - 1) * size, take: size });
    return { items, total, page, size };
  }
}
