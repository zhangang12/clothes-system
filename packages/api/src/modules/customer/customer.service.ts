import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, Not, DataSource } from 'typeorm';
import { Customer } from './customer.entity';
import { CustomerContact } from './customer-contact.entity';
import { CustomerBank } from './customer-bank.entity';
import { CustomerExpress } from './customer-express.entity';
import { OrderMain } from '../order/order-main.entity';
import { Quotation } from '../quote/quotation.entity';
import { SampleGarment } from '../sample/sample-garment.entity';
import { OrderStatus, CustomerType } from '@i9/types';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer) private readonly repo: Repository<Customer>,
    @InjectRepository(CustomerContact) private readonly contactRepo: Repository<CustomerContact>,
    @InjectRepository(CustomerBank) private readonly bankRepo: Repository<CustomerBank>,
    @InjectRepository(CustomerExpress) private readonly expressRepo: Repository<CustomerExpress>,
    @InjectRepository(OrderMain) private readonly orderRepo: Repository<OrderMain>,
    @InjectRepository(Quotation) private readonly quoteRepo: Repository<Quotation>,
    @InjectRepository(SampleGarment) private readonly sampleRepo: Repository<SampleGarment>,
    private readonly numbering: NumberingService,
    private readonly dataSource: DataSource,
  ) {}

  private mapDto(dto: Partial<CreateCustomerDto>): Partial<Customer> {
    const e: Partial<Customer> = {};
    const s = (k: keyof CreateCustomerDto, col: keyof Customer) => {
      if (dto[k] !== undefined) (e as any)[col] = dto[k];
    };
    s('name', 'name'); s('type', 'type'); s('relatedMiddleman', 'related_middleman');
    s('tradeCountry', 'trade_country'); s('countryRegion', 'country_region'); s('city', 'city');
    s('homepage', 'homepage'); s('address', 'address'); s('priceTerms', 'price_terms');
    s('settlementMethod', 'settlement_method'); s('grade', 'grade'); s('cooperationLevel', 'cooperation_level');
    s('customerSource', 'customer_source'); s('paymentDays', 'payment_days'); s('businessScope', 'business_scope');
    s('salesperson', 'salesperson'); s('developDate', 'develop_date'); s('spare1', 'spare1');
    s('spare2', 'spare2'); s('spare3', 'spare3'); s('deliveryAddress', 'delivery_address');
    s('frontMark', 'front_mark'); s('sideMark', 'side_mark'); s('innerBoxText', 'inner_box_text');
    s('customerRemark', 'customer_remark'); s('currency', 'currency');
    return e;
  }

  // 联动校验：type=最终买家 时必须关联中间商（设计稿 §2.1 D.4）
  private validateType(dto: Partial<CreateCustomerDto>, current?: Customer) {
    const type = dto.type ?? current?.type;
    const middleman = dto.relatedMiddleman ?? current?.related_middleman;
    if (type === CustomerType.BUYER && (!middleman || !middleman.trim())) {
      throw new BadRequestException('客户类型为「最终买家」时必须选择关联中间商');
    }
  }

  // 保存前·联系人非空校验（设计稿 §2.1 页面事件）
  private assertContacts(contacts?: CreateCustomerDto['contacts']) {
    if (!contacts || contacts.length === 0) {
      throw new BadRequestException('联系人子表不能为空');
    }
  }

  private async assertNameUnique(name: string, excludeId?: number) {
    if (!name) return;
    const where: FindOptionsWhere<Customer> = { name, deleted: 0 };
    if (excludeId) Object.assign(where, { id: Not(excludeId) });
    if ((await this.repo.count({ where })) > 0) {
      throw new ConflictException(`客户名称「${name}」已存在，不能重复`);
    }
  }

  private buildSubtables(customerId: number, dto: Partial<CreateCustomerDto>, customerName?: string) {
    const contacts = (dto.contacts ?? []).map((c, idx) => this.contactRepo.create({
      customer_id: customerId, sort_order: c.sortOrder ?? idx,
      name: c.name, department: c.department, gender: c.gender, title: c.title,
      phone: c.phone, mobile: c.mobile, mobile1: c.mobile1, mobile2: c.mobile2,
      email: c.email, remark: c.remark,
    }));
    const banks = (dto.banks ?? []).map((b, idx) => this.bankRepo.create({
      customer_id: customerId, sort_order: b.sortOrder ?? idx,
      account_name: b.accountName ?? customerName,  // 开户名称自动=客户名称
      bank_name: b.bankName, bank_account: b.bankAccount, bank_address: b.bankAddress,
      currency: b.currency, swift_code: b.swiftCode, remark: b.remark,
    }));
    const expresses = (dto.expresses ?? []).map((x, idx) => this.expressRepo.create({
      customer_id: customerId, sort_order: x.sortOrder ?? idx,
      company: x.company, account: x.account, pay_method: x.payMethod, remark: x.remark,
    }));
    return { contacts, banks, expresses };
  }

  async create(dto: CreateCustomerDto, createdBy: number): Promise<Customer> {
    this.validateType(dto);
    this.assertContacts(dto.contacts);
    if (dto.name) await this.assertNameUnique(dto.name);
    const customer_no = await this.numbering.nextGlobal(NUM_PREFIX.CUSTOMER);
    const base = this.mapDto(dto);
    if (base.develop_date === undefined || base.develop_date === null) {
      base.develop_date = new Date().toISOString().slice(0, 10);
    }

    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(Customer, manager.create(Customer, {
        ...base, customer_no, created_by: createdBy, status: 1, deleted: 0,
      }));
      const { contacts, banks, expresses } = this.buildSubtables(saved.id, dto, saved.name);
      if (contacts.length) await manager.save(CustomerContact, contacts);
      if (banks.length) await manager.save(CustomerBank, banks);
      if (expresses.length) await manager.save(CustomerExpress, expresses);
      return saved;
    });
  }

  // 批量导入（Excel→CSV 前端解析后逐行入库，返回每行结果）
  async importBatch(rows: CreateCustomerDto[], createdBy: number) {
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

  async findAll(query: QueryCustomerDto) {
    const { page = 1, size = 20, keyword, type, grade, status } = query;
    const base: FindOptionsWhere<Customer> = {
      deleted: 0,
      ...(type !== undefined && { type }),
      ...(grade !== undefined && { grade }),
      ...(status !== undefined && { status }),
    };
    // 智能搜索：客户编号/贸易国别/国家区域/所在城市/公司主页/详细地址 + 客户名称（设计稿 §2.2）
    const searchable = ['customer_no', 'name', 'trade_country', 'country_region', 'city', 'homepage', 'address'];
    const where: FindOptionsWhere<Customer> | FindOptionsWhere<Customer>[] = keyword
      ? searchable.map((f) => ({ ...base, [f]: Like(`%${keyword}%`) }))
      : base;

    const [items, total] = await this.repo.findAndCount({
      where, skip: (page - 1) * size, take: size, order: { id: 'DESC' },
    });
    return { items, total, page, size };
  }

  async findOne(id: number) {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`客户 #${id} 不存在`);
    const [contacts, banks, expresses] = await Promise.all([
      this.contactRepo.find({ where: { customer_id: id }, order: { sort_order: 'ASC' } }),
      this.bankRepo.find({ where: { customer_id: id }, order: { sort_order: 'ASC' } }),
      this.expressRepo.find({ where: { customer_id: id }, order: { sort_order: 'ASC' } }),
    ]);
    return { ...entity, contacts, banks, expresses };
  }

  async update(id: number, dto: Partial<CreateCustomerDto>): Promise<Customer> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`客户 #${id} 不存在`);
    this.validateType(dto, entity);
    if (dto.name && dto.name !== entity.name) await this.assertNameUnique(dto.name, id);
    if (dto.contacts !== undefined) this.assertContacts(dto.contacts);

    const base = this.mapDto(dto);
    return this.dataSource.transaction(async (manager) => {
      Object.assign(entity, base);
      const saved = await manager.save(Customer, entity);
      const { contacts, banks, expresses } = this.buildSubtables(id, dto, saved.name);
      if (dto.contacts !== undefined) {
        await manager.delete(CustomerContact, { customer_id: id });
        if (contacts.length) await manager.save(CustomerContact, contacts);
      }
      if (dto.banks !== undefined) {
        await manager.delete(CustomerBank, { customer_id: id });
        if (banks.length) await manager.save(CustomerBank, banks);
      }
      if (dto.expresses !== undefined) {
        await manager.delete(CustomerExpress, { customer_id: id });
        if (expresses.length) await manager.save(CustomerExpress, expresses);
      }
      return saved;
    });
  }

  async toggleStatus(id: number): Promise<Customer> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`客户 #${id} 不存在`);
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

  // ★ v1.3 删除规则（C3）：被任何下游单据（样衣/报价/合同=订单）引用则阻止删除
  async remove(id: number): Promise<void> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`客户 #${id} 不存在`);
    const [samples, quotes, orders] = await Promise.all([
      this.sampleRepo.count({ where: { customer_id: id, deleted: 0 } }),
      this.quoteRepo.count({ where: { customer_id: id, deleted: 0 } }),
      this.orderRepo.count({ where: { customer_id: id, deleted: 0 } }),
    ]);
    const refs = samples + quotes + orders;
    if (refs > 0) {
      throw new BadRequestException(`已被 ${refs} 张单据引用，无法删除`);
    }
    entity.deleted = 1;
    await this.repo.save(entity);
  }

  async listForSelect(grade?: string) {
    const where: FindOptionsWhere<Customer> = { status: 1, deleted: 0 };
    if (grade) Object.assign(where, { grade });
    return this.repo.find({
      where,
      select: ['id', 'customer_no', 'name', 'short_name', 'type', 'grade', 'currency'],
      order: { customer_no: 'ASC' },
    });
  }
}
