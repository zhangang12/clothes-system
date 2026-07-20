import {
  Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, Not, In, Between, MoreThanOrEqual, LessThanOrEqual, DataSource } from 'typeorm';
import { Customer } from './customer.entity';
import { CustomerGrant } from './customer-grant.entity';
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
    @InjectRepository(CustomerGrant) private readonly grantRepo: Repository<CustomerGrant>,
    private readonly numbering: NumberingService,
    private readonly dataSource: DataSource,
  ) {}

  // ===== 客户机密授权（设计稿 01 v1.3：客户属机密单据，行级可见=创建人/被授权人/管理员）=====

  // 该用户可见的客户 id 集合；ADMIN（或未传 user 的内部调用）返回 null=不限
  async visibleCustomerIds(user?: { id: number; role?: string }): Promise<number[] | null> {
    if (!user || user.role === 'ADMIN') return null;
    const today = new Date().toISOString().slice(0, 10);
    const [allGrants, own] = await Promise.all([
      this.grantRepo.find({ where: { user_id: user.id } }),
      this.repo.find({ where: { created_by: user.id, deleted: 0 }, select: ['id'] }),
    ]);
    // 有效期过滤(设计 D.3:过期授权自动失效)
    const grants = allGrants.filter((g) => !g.expire_at || String(g.expire_at).slice(0, 10) >= today);
    const ids = new Set<number>([...grants.map((g) => +g.customer_id), ...own.map((c) => +c.id)]);
    return [...ids];
  }

  private async assertVisible(id: number, user?: { id: number; role?: string }): Promise<void> {
    const ids = await this.visibleCustomerIds(user);
    if (ids !== null && !ids.includes(+id)) {
      // 与「不存在」同响应，防止未授权用户探测机密客户存在性
      throw new NotFoundException(`客户 #${id} 不存在`);
    }
  }

  private async assertEditable(entity: Customer, user?: { id: number; role?: string }): Promise<void> {
    if (!user || user.role === 'ADMIN' || +entity.created_by === +user.id) return;
    const grant = await this.grantRepo.findOne({ where: { customer_id: entity.id, user_id: user.id } });
    const expired = grant?.expire_at && String(grant.expire_at).slice(0, 10) < new Date().toISOString().slice(0, 10);
    if (!grant || expired) throw new NotFoundException(`客户 #${entity.id} 不存在`); // 不可见/授权已过期
    if (!grant.can_edit) throw new ForbiddenException('您对该机密客户仅有查看权限，无修改权限');
  }

  // 批量授权（仅管理员，controller 层 @Roles 把关；设计稿 §D.3：选多客户×多用户一次授权）
  async grantBatch(customerIds: number[], userIds: number[], canEdit: boolean, byUserId: number, expireAt?: string, remark?: string) {
    if (!customerIds?.length || !userIds?.length) {
      throw new BadRequestException('请至少选择 1 个客户和 1 个用户');
    }
    let created = 0; let updated = 0;
    for (const cid of customerIds) {
      for (const uid of userIds) {
        const existing = await this.grantRepo.findOne({ where: { customer_id: cid, user_id: uid } });
        if (existing) {
          existing.can_edit = canEdit ? 1 : 0;
          existing.expire_at = (expireAt ?? null) as any;
          if (remark !== undefined) existing.remark = remark as any;
          await this.grantRepo.save(existing);
          updated++;
        } else {
          await this.grantRepo.save(this.grantRepo.create({
            customer_id: cid, user_id: uid, can_edit: canEdit ? 1 : 0,
            expire_at: (expireAt ?? null) as any, remark: (remark ?? null) as any, created_by: byUserId,
          }));
          created++;
        }
      }
    }
    return { created, updated, customers: customerIds.length, users: userIds.length };
  }

  // 某客户的授权清单（含用户姓名，供管理界面展示/撤销）
  async getGrants(customerId: number) {
    return this.dataSource.query(
      `SELECT g.id, g.customer_id, g.user_id, g.can_edit, g.expire_at, g.remark, g.created_at,
              u.username, u.real_name, u.role
         FROM customer_grant g LEFT JOIN sys_user u ON u.id = g.user_id
        WHERE g.customer_id = ? ORDER BY g.id`, [customerId],
    );
  }

  async revokeGrant(customerId: number, userId: number) {
    await this.grantRepo.delete({ customer_id: customerId, user_id: userId });
    return { ok: true };
  }

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
    s('customerRemark', 'customer_remark'); s('commissionRate', 'commission_rate'); s('currency', 'currency');
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
    // 客户编号按类型前缀：中间商 CM- / 最终买家 FE-（设计稿 A8）
    const numPrefix = dto.type === CustomerType.BUYER ? NUM_PREFIX.CUSTOMER_BUYER : NUM_PREFIX.CUSTOMER_MIDDLEMAN;
    const customer_no = await this.numbering.nextGlobal(numPrefix);
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
      // 保存后自动登记机密权限：创建人可查看+修改（设计稿 01 §页面事件）
      await manager.save(CustomerGrant, manager.create(CustomerGrant, {
        customer_id: saved.id, user_id: createdBy, can_edit: 1, created_by: createdBy,
      }));
      return saved;
    });
  }

  // 批量导入（Excel→CSV 前端解析后逐行入库，返回每行结果）
  async importBatch(rows: CreateCustomerDto[], createdBy: number) {
    // 撞名覆盖更新必须与单个 update 走同一套 assertEditable 授权校验（修复 M8）：
    // 取操作者真实角色透传，禁止硬编码 ADMIN 绕过机密客户修改权限；无权限的行如实计入 failed
    const opRows = await this.dataSource.query('SELECT role FROM sys_user WHERE id = ? LIMIT 1', [createdBy]);
    const operator = { id: createdBy, role: opRows?.[0]?.role as string | undefined };
    const failed: Array<{ index: number; name?: string; error: string }> = [];
    let created = 0;
    for (let i = 0; i < rows.length; i++) {
      try {
        // 已存在(同名)记录 → 覆盖更新(设计稿 D.2:导入重复默认更新,不再报错跳过)
        const existing = rows[i]?.name
          ? await this.repo.findOne({ where: { name: rows[i].name, deleted: 0 } })
          : null;
        if (existing) {
          await this.update(existing.id, rows[i], operator);
        } else {
          await this.create(rows[i], createdBy);
        }
        created += 1;
      } catch (e: any) {
        failed.push({ index: i + 1, name: rows[i]?.name, error: e?.message ?? '未知错误' });
      }
    }
    return { total: rows.length, created, failedCount: failed.length, failed };
  }

  async findAll(query: QueryCustomerDto, user?: { id: number; role?: string }) {
    const { page = 1, size = 20, keyword, type, grade, status,
      trade_country, cooperation_level, customer_source, salesperson, contact,
      develop_start, develop_end } = query as any;
    // 机密行级过滤：非管理员只见 自建 + 被授权 客户（设计稿 01：客户属机密单据）
    const visibleIds = await this.visibleCustomerIds(user);
    const base: FindOptionsWhere<Customer> = {
      deleted: 0,
      ...(visibleIds !== null && { id: In(visibleIds.length ? visibleIds : [0]) }),
      ...(type !== undefined && { type }),
      ...(grade !== undefined && { grade }),
      ...(status !== undefined && { status }),
      // 高级筛选(设计稿 §2.2):国别/合作等级/来源/外销员/开发时间范围
      ...(trade_country && { trade_country: Like(`%${trade_country}%`) }),
      ...(cooperation_level && { cooperation_level: Like(`%${cooperation_level}%`) }),
      ...(customer_source && { customer_source: Like(`%${customer_source}%`) }),
      ...(salesperson && { salesperson: Like(`%${salesperson}%`) }),
      ...(develop_start && develop_end
        ? { develop_date: Between(develop_start, develop_end) }
        : develop_start ? { develop_date: MoreThanOrEqual(develop_start) }
        : develop_end ? { develop_date: LessThanOrEqual(develop_end) } : {}),
    };
    // 联系人检索(姓名/手机,设计稿 §2.2):命中联系人的客户 id 并入过滤
    if (contact) {
      const hits = await this.contactRepo
        .createQueryBuilder('c')
        .select('DISTINCT c.customer_id', 'cid')
        .where('c.name LIKE :k OR c.mobile LIKE :k OR c.phone LIKE :k', { k: `%${contact}%` })
        .getRawMany();
      const ids = hits.map((h) => +h.cid);
      // 与机密可见集做真正的 Set 交集（修复 H5：曾用 JSON 子串匹配，In([12]) 会误命中 id 1/2）
      const visible = visibleIds !== null ? new Set(visibleIds.map((v) => +v)) : null;
      const merged = visible ? ids.filter((x) => visible.has(x)) : ids;
      Object.assign(base, { id: In(merged.length ? merged : [0]) });
    }
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

  async findOne(id: number, user?: { id: number; role?: string }) {
    await this.assertVisible(id, user);
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`客户 #${id} 不存在`);
    const [contacts, banks, expresses] = await Promise.all([
      this.contactRepo.find({ where: { customer_id: id }, order: { sort_order: 'ASC' } }),
      this.bankRepo.find({ where: { customer_id: id }, order: { sort_order: 'ASC' } }),
      this.expressRepo.find({ where: { customer_id: id }, order: { sort_order: 'ASC' } }),
    ]);
    return { ...entity, contacts, banks, expresses };
  }

  async update(id: number, dto: Partial<CreateCustomerDto>, user?: { id: number; role?: string }): Promise<Customer> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`客户 #${id} 不存在`);
    await this.assertEditable(entity, user); // 机密：仅创建人/有修改授权者/管理员可改
    this.validateType(dto, entity);
    if (dto.name && dto.name !== entity.name) await this.assertNameUnique(dto.name, id);
    if (dto.contacts !== undefined) this.assertContacts(dto.contacts);

    const base = this.mapDto(dto);
    const nameChanged = dto.name && dto.name !== entity.name ? { from: entity.name, to: dto.name } : null;
    return this.dataSource.transaction(async (manager) => {
      Object.assign(entity, base);
      const saved = await manager.save(Customer, entity);
      // C1 实时同步(基础资料稿):客户改名 → 同步 草稿/已报价 单据的名称快照;已成单(ORDERED)不动
      if (nameChanged) {
        await manager.query(
          "UPDATE quotation SET middleman_name = ? WHERE customer_id = ? AND status <> 'ORDERED' AND deleted = 0",
          [nameChanged.to, id]);
        await manager.query(
          "UPDATE quotation SET buyer_name = ? WHERE buyer_id = ? AND status <> 'ORDERED' AND deleted = 0",
          [nameChanged.to, id]);
        await manager.query(
          "UPDATE sample_garment SET middleman_name = ? WHERE customer_id = ? AND status <> 'ORDERED' AND deleted = 0",
          [nameChanged.to, id]);
        // 订单快照同步(总览走查P1#10 决议):草稿/已下单同步,已生成合同(CONTRACTED)起冻结
        await manager.query(
          "UPDATE order_main SET middleman_name = ? WHERE customer_id = ? AND status IN ('DRAFT','CONFIRMED') AND deleted = 0",
          [nameChanged.to, id]);
        await manager.query(
          "UPDATE order_main SET buyer_name = ? WHERE buyer_id = ? AND status IN ('DRAFT','CONFIRMED') AND deleted = 0",
          [nameChanged.to, id]);
      }
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
    const [samples, quotes, orders, sampleBuyerRefs, quoteBuyerRefs, orderBuyerRefs] = await Promise.all([
      this.sampleRepo.count({ where: { customer_id: id, deleted: 0 } }),
      this.quoteRepo.count({ where: { customer_id: id, deleted: 0 } }),
      this.orderRepo.count({ where: { customer_id: id, deleted: 0 } }),
      // 修复 L3：客户作为「最终买家」(buyer_id) 被引用时同样阻止删除，避免留下悬空 buyer_id
      this.sampleRepo.count({ where: { buyer_id: id, deleted: 0 } }),
      this.quoteRepo.count({ where: { buyer_id: id, deleted: 0 } }),
      this.orderRepo.count({ where: { buyer_id: id, deleted: 0 } }),
    ]);
    const refs = samples + quotes + orders + sampleBuyerRefs + quoteBuyerRefs + orderBuyerRefs;
    if (refs > 0) {
      throw new BadRequestException(`已被 ${refs} 张单据引用，无法删除`);
    }
    entity.deleted = 1;
    await this.repo.save(entity);
  }

  async listForSelect(grade?: string, user?: { id: number; role?: string }) {
    const where: FindOptionsWhere<Customer> = { status: 1, deleted: 0 };
    if (grade) Object.assign(where, { grade });
    // 机密行级过滤：下游单据(报价/合同/订单)选客户的下拉同样不可见未授权客户
    const visibleIds = await this.visibleCustomerIds(user);
    if (visibleIds !== null) Object.assign(where, { id: In(visibleIds.length ? visibleIds : [0]) });
    return this.repo.find({
      where,
      select: ['id', 'customer_no', 'name', 'short_name', 'type', 'grade', 'currency'],
      order: { customer_no: 'ASC' },
    });
  }
}
