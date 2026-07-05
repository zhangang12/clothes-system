import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, Not, In, DataSource } from 'typeorm';
import { Factory } from './factory.entity';
import { FactoryContact } from './factory-contact.entity';
import { Contract, ContractStatus } from '../contract/contract.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { QueryFactoryDto } from './dto/query-factory.dto';

@Injectable()
export class FactoryService {
  constructor(
    @InjectRepository(Factory) private readonly repo: Repository<Factory>,
    @InjectRepository(FactoryContact) private readonly contactRepo: Repository<FactoryContact>,
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    private readonly numbering: NumberingService,
    private readonly dataSource: DataSource,
  ) {}

  // camelCase DTO → snake_case 实体列
  private mapDto(dto: Partial<CreateFactoryDto>): Partial<Factory> {
    const e: Partial<Factory> = {};
    if (dto.type !== undefined) e.type = dto.type;
    if (dto.canInvoice !== undefined) e.can_invoice = dto.canInvoice ? 1 : 0;
    if (dto.name !== undefined) e.name = dto.name;
    if (dto.shortName !== undefined) e.short_name = dto.shortName;
    if (dto.province !== undefined) e.province = dto.province;
    if (dto.city !== undefined) e.city = dto.city;
    if (dto.address !== undefined) e.address = dto.address;
    if (dto.businessScope !== undefined) e.business_scope = dto.businessScope;
    if (dto.developDate !== undefined) e.develop_date = dto.developDate;
    if (dto.bankName !== undefined) e.bank_name = dto.bankName;
    if (dto.bankAccount !== undefined) e.bank_account = dto.bankAccount;
    if (dto.taxNo !== undefined) e.tax_no = dto.taxNo;
    if (dto.invoicePhone !== undefined) e.invoice_phone = dto.invoicePhone;
    if (dto.invoiceAddress !== undefined) e.invoice_address = dto.invoiceAddress;
    if (dto.bankName2 !== undefined) e.bank_name2 = dto.bankName2;
    if (dto.bankAccount2 !== undefined) e.bank_account2 = dto.bankAccount2;
    if (dto.taxNo2 !== undefined) e.tax_no2 = dto.taxNo2;
    if (dto.invoicePhone2 !== undefined) e.invoice_phone2 = dto.invoicePhone2;
    if (dto.invoiceAddress2 !== undefined) e.invoice_address2 = dto.invoiceAddress2;
    if (dto.legalRep !== undefined) e.legal_rep = dto.legalRep;
    if (dto.registeredCapital !== undefined) e.registered_capital = dto.registeredCapital;
    if (dto.establishedDate !== undefined) e.established_date = dto.establishedDate;
    if (dto.annualSales !== undefined) e.annual_sales = dto.annualSales;
    if (dto.representativeCustomers !== undefined) e.representative_customers = dto.representativeCustomers;
    if (dto.qualityCerts !== undefined) e.quality_certs = dto.qualityCerts;
    if (dto.remark !== undefined) e.remark = dto.remark;
    return e;
  }

  // 保存前·联系人非空校验 + 主联系人回填（设计稿 §1.1 页面事件）
  private applyContactBackfill(entity: Partial<Factory>, contacts?: CreateFactoryDto['contacts']) {
    if (!contacts || contacts.length === 0) {
      throw new BadRequestException('必须输入至少一个联系人！');
    }
    const first = contacts[0];
    entity.contact_name = first.name ?? null;
    entity.contact_phone = first.phone ?? first.mobile ?? null;
  }

  private async assertNameUnique(name: string, excludeId?: number) {
    const where: FindOptionsWhere<Factory> = { name, deleted: 0 };
    if (excludeId) Object.assign(where, { id: Not(excludeId) });
    const dup = await this.repo.count({ where });
    if (dup > 0) throw new ConflictException(`厂商名称「${name}」已存在，不能重复`);
  }

  private buildContacts(factoryId: number, contacts: CreateFactoryDto['contacts']): FactoryContact[] {
    return (contacts ?? []).map((c, idx) => this.contactRepo.create({
      factory_id: factoryId,
      sort_order: c.sortOrder ?? idx,
      name: c.name, department: c.department, title: c.title,
      phone: c.phone, mobile: c.mobile, email: c.email, remark: c.remark,
    }));
  }

  async create(dto: CreateFactoryDto, createdBy: number): Promise<Factory> {
    await this.assertNameUnique(dto.name);
    const factory_no = await this.numbering.nextGlobal(NUM_PREFIX.FACTORY);
    const base = this.mapDto(dto);
    this.applyContactBackfill(base, dto.contacts);
    if (base.develop_date === undefined || base.develop_date === null) {
      base.develop_date = new Date().toISOString().slice(0, 10);
    }
    if (dto.canInvoice === undefined) base.can_invoice = 1;

    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(Factory, manager.create(Factory, {
        ...base, factory_no, created_by: createdBy, status: 1, deleted: 0,
      }));
      const contacts = this.buildContacts(saved.id, dto.contacts);
      if (contacts.length) await manager.save(FactoryContact, contacts);
      return saved;
    });
  }

  // 批量导入（Excel→CSV 前端解析后逐行入库，返回每行结果）
  async importBatch(rows: CreateFactoryDto[], createdBy: number) {
    const failed: Array<{ index: number; name?: string; error: string }> = [];
    let created = 0;
    for (let i = 0; i < rows.length; i++) {
      try {
        await this.create(rows[i], createdBy);
        created += 1;
      } catch (e: any) {
        failed.push({ index: i + 1, name: rows[i]?.name, error: e?.message ?? '未知错误' });
      }
    }
    return { total: rows.length, created, failedCount: failed.length, failed };
  }

  async findAll(query: QueryFactoryDto) {
    const { page = 1, size = 20, keyword, type, status } = query;
    const base: FindOptionsWhere<Factory> = {
      deleted: 0,
      ...(type !== undefined && { type }),
      ...(status !== undefined && { status }),
    };
    // 智能搜索：厂商编号/名称/省份/城市/地址/业务范围/法人代表（设计稿 §1.2）
    const searchable = ['factory_no', 'name', 'province', 'city', 'address', 'business_scope', 'legal_rep'];
    const where: FindOptionsWhere<Factory> | FindOptionsWhere<Factory>[] = keyword
      ? searchable.map((f) => ({ ...base, [f]: Like(`%${keyword}%`) }))
      : base;

    const [items, total] = await this.repo.findAndCount({
      where, skip: (page - 1) * size, take: size, order: { id: 'DESC' },
    });
    return { items, total, page, size };
  }

  async findOne(id: number): Promise<Factory & { contacts: FactoryContact[] }> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`工厂 #${id} 不存在`);
    const contacts = await this.contactRepo.find({ where: { factory_id: id }, order: { sort_order: 'ASC' } });
    return { ...entity, contacts };
  }

  async update(id: number, dto: Partial<CreateFactoryDto>): Promise<Factory> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`工厂 #${id} 不存在`);
    if (dto.name && dto.name !== entity.name) await this.assertNameUnique(dto.name, id);

    const base = this.mapDto(dto);
    // 联系人子表随主表整体覆盖保存；提供 contacts 时回填主联系人
    if (dto.contacts !== undefined) this.applyContactBackfill(base, dto.contacts);

    return this.dataSource.transaction(async (manager) => {
      Object.assign(entity, base);
      const saved = await manager.save(Factory, entity);
      if (dto.contacts !== undefined) {
        await manager.delete(FactoryContact, { factory_id: id });
        const contacts = this.buildContacts(id, dto.contacts);
        if (contacts.length) await manager.save(FactoryContact, contacts);
      }
      return saved;
    });
  }

  async toggleStatus(id: number): Promise<Factory> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`工厂 #${id} 不存在`);
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

  // ★ v1.3 删除规则（C2）：被任何下游单据引用则阻止删除
  async remove(id: number): Promise<void> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`工厂 #${id} 不存在`);
    const refs = await this.contractRepo.count({ where: { factory_id: id, deleted: 0 } });
    if (refs > 0) {
      throw new BadRequestException(`已被 ${refs} 张单据引用，无法删除`);
    }
    entity.deleted = 1;
    await this.repo.save(entity);
  }

  // 下拉选择：仅返回启用的工厂
  async listForSelect(type?: string) {
    const where: FindOptionsWhere<Factory> = { status: 1, deleted: 0 };
    if (type) Object.assign(where, { type });
    return this.repo.find({
      where,
      select: ['id', 'factory_no', 'name', 'short_name', 'type'],
      order: { factory_no: 'ASC' },
    });
  }
}
