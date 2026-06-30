import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Customer } from './customer.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { CreateCustomerDto } from '@i9/types';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer) private readonly repo: Repository<Customer>,
    private readonly numbering: NumberingService,
  ) {}

  async create(dto: CreateCustomerDto): Promise<Customer> {
    const customer_no = await this.numbering.nextGlobal(NUM_PREFIX.CUSTOMER);
    const entity = this.repo.create({ ...dto, customer_no });
    return this.repo.save(entity);
  }

  async findAll(page = 1, size = 20, keyword?: string) {
    const where = keyword
      ? [{ name: Like(`%${keyword}%`), deleted: 0 }, { customer_no: Like(`%${keyword}%`), deleted: 0 }]
      : { deleted: 0 };
    const [items, total] = await this.repo.findAndCount({ where, skip: (page - 1) * size, take: size, order: { id: 'DESC' } });
    return { items, total, page, size };
  }

  async findOne(id: number): Promise<Customer> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`客户 #${id} 不存在`);
    return entity;
  }

  async update(id: number, dto: Partial<CreateCustomerDto>): Promise<Customer> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: number): Promise<void> {
    const entity = await this.findOne(id);
    entity.deleted = 1;
    await this.repo.save(entity);
  }
}
