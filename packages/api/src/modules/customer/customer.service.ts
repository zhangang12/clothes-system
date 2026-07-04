import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, Not } from 'typeorm';
import { Customer } from './customer.entity';
import { OrderMain } from '../order/order-main.entity';
import { OrderStatus } from '@i9/types';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer) private readonly repo: Repository<Customer>,
    @InjectRepository(OrderMain) private readonly orderRepo: Repository<OrderMain>,
    private readonly numbering: NumberingService,
  ) {}

  async create(dto: CreateCustomerDto, createdBy: number): Promise<Customer> {
    const customer_no = await this.numbering.nextGlobal(NUM_PREFIX.CUSTOMER);
    const entity = this.repo.create({ ...dto, customer_no, created_by: createdBy });
    return this.repo.save(entity);
  }

  async findAll(query: QueryCustomerDto) {
    const { page = 1, size = 20, keyword, grade, status } = query;
    const where: FindOptionsWhere<Customer> | FindOptionsWhere<Customer>[] = keyword
      ? [
          { name: Like(`%${keyword}%`), deleted: 0, ...(grade !== undefined && { grade }), ...(status !== undefined && { status }) },
          { customer_no: Like(`%${keyword}%`), deleted: 0, ...(grade !== undefined && { grade }), ...(status !== undefined && { status }) },
        ]
      : { deleted: 0, ...(grade !== undefined && { grade }), ...(status !== undefined && { status }) };

    const [items, total] = await this.repo.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });
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

  async toggleStatus(id: number): Promise<Customer> {
    const entity = await this.findOne(id);
    if (entity.status === 1) {
      const openOrders = await this.orderRepo.count({
        where: { customer_id: id, status: Not(OrderStatus.DONE) },
      });
      if (openOrders > 0) {
        throw new BadRequestException(`该客户有 ${openOrders} 个未完成订单，不可停用`);
      }
    }
    entity.status = entity.status === 1 ? 0 : 1;
    return this.repo.save(entity);
  }

  async remove(id: number): Promise<void> {
    const entity = await this.findOne(id);
    entity.deleted = 1;
    await this.repo.save(entity);
  }

  async listForSelect(grade?: string) {
    const where: FindOptionsWhere<Customer> = { status: 1, deleted: 0 };
    if (grade) Object.assign(where, { grade });
    return this.repo.find({
      where,
      select: ['id', 'customer_no', 'name', 'short_name', 'grade', 'currency'],
      order: { customer_no: 'ASC' },
    });
  }
}
