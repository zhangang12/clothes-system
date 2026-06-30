import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract } from './contract.entity';

@Injectable()
export class ContractService {
  constructor(
    @InjectRepository(Contract) private readonly repo: Repository<Contract>,
  ) {}

  // TODO Phase 4: implement contract management with snapshot locking
  async findAll(page = 1, size = 20) {
    const [items, total] = await this.repo.findAndCount({ where: { deleted: 0 }, skip: (page - 1) * size, take: size });
    return { items, total, page, size };
  }
}
