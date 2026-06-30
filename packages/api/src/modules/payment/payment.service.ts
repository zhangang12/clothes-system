import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentRequest } from './payment-request.entity';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(PaymentRequest) private readonly repo: Repository<PaymentRequest>,
  ) {}

  // TODO Phase 6: implement payment requests with overpayment guard
  async findAll(page = 1, size = 20) {
    const [items, total] = await this.repo.findAndCount({ where: { deleted: 0 }, skip: (page - 1) * size, take: size });
    return { items, total, page, size };
  }
}
