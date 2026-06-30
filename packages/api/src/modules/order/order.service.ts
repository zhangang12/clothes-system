import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderMain } from './order-main.entity';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderMain) private readonly orderRepo: Repository<OrderMain>,
  ) {}

  // TODO Phase 3: implement order management
  async findAll(page = 1, size = 20) {
    const [items, total] = await this.orderRepo.findAndCount({ where: { deleted: 0 }, skip: (page - 1) * size, take: size });
    return { items, total, page, size };
  }
}
