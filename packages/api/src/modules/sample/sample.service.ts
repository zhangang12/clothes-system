import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like } from 'typeorm';
import { SampleGarment } from './sample-garment.entity';
import { SampleVersion, SampleAction } from './sample-version.entity';
import { Customer } from '../customer/customer.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { SampleStatus } from '@i9/types';
import {
  CreateSampleDto, AssignPatternmakerDto, SubmitVersionDto, RejectSampleDto,
} from './dto/create-sample.dto';
import { QuerySampleDto } from './dto/query-sample.dto';

@Injectable()
export class SampleService {
  constructor(
    @InjectRepository(SampleGarment) private readonly repo: Repository<SampleGarment>,
    @InjectRepository(SampleVersion) private readonly versionRepo: Repository<SampleVersion>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    private readonly numbering: NumberingService,
  ) {}

  async create(dto: CreateSampleDto, createdBy: number): Promise<SampleGarment> {
    const customer = await this.customerRepo.findOne({ where: { id: dto.customer_id, deleted: 0 } });
    if (!customer) throw new BadRequestException(`客户 #${dto.customer_id} 不存在`);
    const sample_no = await this.numbering.next(NUM_PREFIX.SAMPLE);
    const entity = this.repo.create({ ...dto, sample_no, created_by: createdBy, status: SampleStatus.PENDING });
    return this.repo.save(entity);
  }

  async findAll(query: QuerySampleDto) {
    const { page = 1, size = 20, keyword, status, customer_id, patternmaker_id } = query;
    const base: FindOptionsWhere<SampleGarment> = {
      deleted: 0,
      ...(status !== undefined && { status }),
      ...(customer_id !== undefined && { customer_id }),
      ...(patternmaker_id !== undefined && { patternmaker_id }),
    };
    const where: FindOptionsWhere<SampleGarment> | FindOptionsWhere<SampleGarment>[] = keyword
      ? [
          { ...base, style_name: Like(`%${keyword}%`) },
          { ...base, sample_no: Like(`%${keyword}%`) },
        ]
      : base;

    const [items, total] = await this.repo.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });
    return { items, total, page, size };
  }

  async findOne(id: number): Promise<SampleGarment> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`样衣 #${id} 不存在`);
    return entity;
  }

  async update(id: number, dto: Partial<CreateSampleDto>): Promise<SampleGarment> {
    const entity = await this.findOne(id);
    if (entity.status !== SampleStatus.PENDING && entity.status !== SampleStatus.REJECTED) {
      throw new BadRequestException('只有待打版或已驳回的样衣可以修改基本信息');
    }
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async assignPatternmaker(id: number, dto: AssignPatternmakerDto): Promise<SampleGarment> {
    const entity = await this.findOne(id);
    if (entity.status !== SampleStatus.PENDING) {
      throw new BadRequestException('只有待打版状态才可指派版师');
    }
    entity.patternmaker_id = dto.patternmaker_id;
    entity.status = SampleStatus.PATTERN;
    return this.repo.save(entity);
  }

  async submitVersion(id: number, dto: SubmitVersionDto, operatorId: number): Promise<SampleGarment> {
    const entity = await this.findOne(id);
    if (entity.status !== SampleStatus.PATTERN) {
      throw new BadRequestException('只有打版中状态才可提交版次');
    }

    await this.versionRepo.save({
      sample_id: id,
      version: entity.version,
      action: SampleAction.SUBMIT,
      operator_id: operatorId,
      remark: dto.remark,
      attachments: dto.attachments,
    });

    entity.status = SampleStatus.DONE;
    return this.repo.save(entity);
  }

  async reject(id: number, dto: RejectSampleDto, operatorId: number): Promise<SampleGarment> {
    const entity = await this.findOne(id);
    if (entity.status !== SampleStatus.DONE) {
      throw new BadRequestException('只有打版完成状态才可驳回');
    }

    await this.versionRepo.save({
      sample_id: id,
      version: entity.version,
      action: SampleAction.REJECT,
      operator_id: operatorId,
      remark: dto.reject_reason,
    });

    entity.status = SampleStatus.REJECTED;
    entity.reject_reason = dto.reject_reason;
    entity.version = entity.version + 1;
    return this.repo.save(entity);
  }

  async confirm(id: number, operatorId: number): Promise<SampleGarment> {
    const entity = await this.findOne(id);
    if (entity.status !== SampleStatus.DONE) {
      throw new BadRequestException('只有打版完成状态才可确认');
    }

    await this.versionRepo.save({
      sample_id: id,
      version: entity.version,
      action: SampleAction.CONFIRM,
      operator_id: operatorId,
    });

    entity.status = SampleStatus.CONFIRMED;
    entity.confirmed_at = new Date();
    entity.reject_reason = null;
    return this.repo.save(entity);
  }

  async getVersionHistory(id: number): Promise<SampleVersion[]> {
    await this.findOne(id);
    return this.versionRepo.find({
      where: { sample_id: id },
      order: { created_at: 'ASC' },
    });
  }

  async remove(id: number): Promise<void> {
    const entity = await this.findOne(id);
    entity.deleted = 1;
    await this.repo.save(entity);
  }
}
