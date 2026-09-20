import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, DataSource, EntityManager } from 'typeorm';
import { CompanyProfile } from './company-profile.entity';
import { CreateCompanyProfileDto } from './dto/create-company-profile.dto';

const mapDto = (dto: Partial<CreateCompanyProfileDto>): Partial<CompanyProfile> => ({
  name: dto.name,
  short_name: dto.shortName,
  address: dto.address,
  phone: dto.phone,
  tax_no: dto.taxNo,
  bank_name: dto.bankName,
  bank_account: dto.bankAccount,
  legal_rep: dto.legalRep,
  logo_url: dto.logoUrl,
  seal_url: dto.sealUrl,
  remark: dto.remark,
});

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(CompanyProfile) private readonly repo: Repository<CompanyProfile>,
    private readonly dataSource: DataSource,
  ) {}

  // B117：save 与「先清别人再置自己」原是三次独立写，中途失败会留下 0 个或 2 个默认主体（合同甲方随机取一个）；
  // 现在建/改/设默认都在一个事务里完成，事务内一律用 manager。
  async create(dto: CreateCompanyProfileDto): Promise<CompanyProfile> {
    return this.dataSource.transaction(async (manager) => {
      const entity = manager.create(CompanyProfile, { ...mapDto(dto), is_default: dto.isDefault ? 1 : 0 });
      const saved = await manager.save(CompanyProfile, entity);
      if (dto.isDefault) await this.makeSoleDefault(manager, saved.id);
      return saved;
    });
  }

  findAll(): Promise<CompanyProfile[]> {
    return this.repo.find({ where: { deleted: 0 }, order: { is_default: 'DESC', id: 'ASC' } });
  }

  async findOne(id: number): Promise<CompanyProfile> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`本司主体 #${id} 不存在`);
    return entity;
  }

  async update(id: number, dto: Partial<CreateCompanyProfileDto>): Promise<CompanyProfile> {
    return this.dataSource.transaction(async (manager) => {
      const entity = await manager.findOne(CompanyProfile, { where: { id, deleted: 0 } });
      if (!entity) throw new NotFoundException(`本司主体 #${id} 不存在`);
      Object.assign(entity, mapDto({ ...dto, name: dto.name ?? entity.name }));
      const saved = await manager.save(CompanyProfile, entity);
      if (dto.isDefault) await this.makeSoleDefault(manager, id);
      return saved;
    });
  }

  async remove(id: number): Promise<void> {
    const entity = await this.findOne(id);
    entity.deleted = 1;
    await this.repo.save(entity);
  }

  async setDefault(id: number): Promise<CompanyProfile> {
    await this.dataSource.transaction(async (manager) => {
      const entity = await manager.findOne(CompanyProfile, { where: { id, deleted: 0 } });
      if (!entity) throw new NotFoundException(`本司主体 #${id} 不存在`);
      await this.makeSoleDefault(manager, id);
    });
    return this.findOne(id);
  }

  // 默认主体唯一：置 id 为默认，其余清默认（B117：必须在同一事务内两条 update 一起成功或一起回滚）
  private async makeSoleDefault(manager: EntityManager, id: number): Promise<void> {
    await manager.update(CompanyProfile, { id: Not(id) }, { is_default: 0 });
    await manager.update(CompanyProfile, { id }, { is_default: 1 });
  }

  // 供 PDF 抬头/合同甲方取数：默认主体，无默认取最早一条
  async getDefault(): Promise<CompanyProfile | null> {
    const def = await this.repo.findOne({ where: { deleted: 0, is_default: 1 } });
    if (def) return def;
    return this.repo.findOne({ where: { deleted: 0 }, order: { id: 'ASC' } });
  }
}
