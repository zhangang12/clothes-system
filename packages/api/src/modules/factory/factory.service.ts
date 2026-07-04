import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, Not, In } from 'typeorm';
import { Factory } from './factory.entity';
import { Contract, ContractStatus } from '../contract/contract.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { QueryFactoryDto } from './dto/query-factory.dto';

@Injectable()
export class FactoryService {
  constructor(
    @InjectRepository(Factory) private readonly repo: Repository<Factory>,
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    private readonly numbering: NumberingService,
  ) {}

  async create(dto: CreateFactoryDto, createdBy: number): Promise<Factory> {
    const factory_no = await this.numbering.nextGlobal(NUM_PREFIX.FACTORY);
    const entity = this.repo.create({ ...dto, factory_no, created_by: createdBy });
    return this.repo.save(entity);
  }

  async findAll(query: QueryFactoryDto) {
    const { page = 1, size = 20, keyword, type, status } = query;
    const where: FindOptionsWhere<Factory> | FindOptionsWhere<Factory>[] = keyword
      ? [
          { name: Like(`%${keyword}%`), deleted: 0, ...(type !== undefined && { type }), ...(status !== undefined && { status }) },
          { factory_no: Like(`%${keyword}%`), deleted: 0, ...(type !== undefined && { type }), ...(status !== undefined && { status }) },
        ]
      : { deleted: 0, ...(type !== undefined && { type }), ...(status !== undefined && { status }) };

    const [items, total] = await this.repo.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });
    return { items, total, page, size };
  }

  async findOne(id: number): Promise<Factory> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`工厂 #${id} 不存在`);
    return entity;
  }

  async update(id: number, dto: Partial<CreateFactoryDto>): Promise<Factory> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async toggleStatus(id: number): Promise<Factory> {
    const entity = await this.findOne(id);
    if (entity.status === 1) {
      const openContracts = await this.contractRepo.count({
        where: { factory_id: id, status: Not(In([ContractStatus.COMPLETED, ContractStatus.CANCELLED])) },
      });
      if (openContracts > 0) {
        throw new BadRequestException(`该工厂有 ${openContracts} 个未完成合同，不可停用`);
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

  // 下拉选择：仅返回启用的工厂
  async listForSelect(type?: string) {
    const where: FindOptionsWhere<Factory> = { status: 1, deleted: 0 };
    if (type) Object.assign(where, { type });
    return this.repo.find({ where, select: ['id', 'factory_no', 'name', 'short_name', 'type'], order: { factory_no: 'ASC' } });
  }
}
