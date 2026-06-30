import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract } from '../contract/contract.entity';

@Injectable()
export class PortalService {
  constructor(
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
  ) {}

  // TODO Phase 5: implement supplier portal 4-step flow
  async getContracts(factoryId: number, page = 1, size = 20) {
    const [items, total] = await this.contractRepo.findAndCount({ where: { factory_id: factoryId, deleted: 0 }, skip: (page - 1) * size, take: size });
    return { items, total, page, size };
  }
}
