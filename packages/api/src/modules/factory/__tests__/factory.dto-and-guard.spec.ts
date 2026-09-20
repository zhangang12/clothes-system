import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CreateFactoryDto, UpdateFactoryDto } from '../dto/create-factory.dto';
import { FactoryController } from '../factory.controller';
import { UserRole } from '@i9/types';
import { MenuGuard, MENU_ACCESS_KEY } from '../../../common/guards/menu.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';

const check = (cls: any, body: any) => validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true });
const flat = (errs: any[]): string[] => errs.flatMap((e) => [
  ...Object.values(e.constraints ?? {}) as string[],
  ...flat(e.children ?? []),
]);

// FactoryEditView.buildDto 实际发送的字段（新建时 portalAccount/portalPassword 可带；编辑时二者为 undefined 被 JSON 丢掉）
const payload = {
  type: 'FABRIC', extraTypes: ['ACCESSORY'], canInvoice: true, name: '苏州福利纺织', sealUrl: undefined,
  province: '江苏', city: '苏州', address: undefined, businessScope: undefined, developDate: null,
  bankName: '工行', bankAccount: '622', taxNo: '9132', invoicePhone: undefined, invoiceAddress: undefined,
  bankName2: undefined, bankAccount2: undefined, taxNo2: undefined, invoicePhone2: undefined, invoiceAddress2: undefined,
  legalRep: '王五', registeredCapital: 500, establishedDate: null, annualSales: 1200.5,
  representativeCustomers: undefined, qualityCerts: undefined, remark: undefined,
  contacts: [{ name: '张建国', department: '', title: '', phone: '0512-6877', mobile: '13901588888', email: '', remark: '' }],
};

describe('B045 工厂建档门户初始密码走同一份口令策略', () => {
  it('B045 弱密码「123」/ 纯字母 / 纯数字 → 400', async () => {
    for (const pwd of ['123', 'abcdefgh', '12345678']) {
      const msgs = flat(await check(CreateFactoryDto, { ...payload, portalAccount: 'f1', portalPassword: pwd }));
      expect(msgs.join()).toMatch(/至少 8 位/);
    }
  });

  it('B045 合规密码通过；不开通门户（不传密码）照常', async () => {
    expect(flat(await check(CreateFactoryDto, { ...payload, portalAccount: 'f1', portalPassword: 'Abc12345' }))).toEqual([]);
    expect(flat(await check(CreateFactoryDto, JSON.parse(JSON.stringify(payload))))).toEqual([]);
  });
});

describe('B006 UpdateFactoryDto（PUT /factories/:id 从 Partial<Dto> 改成真 DTO）', () => {
  it('B006 前端编辑页实际发送的字段全部通过（含 developDate/establishedDate 为 null）', async () => {
    expect(flat(await check(UpdateFactoryDto, JSON.parse(JSON.stringify(payload))))).toEqual([]);
    expect(flat(await check(UpdateFactoryDto, { remark: '只改备注' }))).toEqual([]);
  });

  it('B006 校验真的生效：type 非法 / 银行账号超长 / 未知字段 / 联系人未知字段 → 400', async () => {
    expect(flat(await check(UpdateFactoryDto, { type: 'NOPE' })).join()).toMatch(/type/);
    expect(flat(await check(UpdateFactoryDto, { bankAccount: '1'.repeat(41) })).join()).toMatch(/bankAccount/);
    expect(flat(await check(UpdateFactoryDto, { bank_account: '1' })).join()).toMatch(/bank_account/);
    expect(flat(await check(UpdateFactoryDto, { contacts: [{ name: 'a', wechat: 'x' }] })).join()).toMatch(/wechat/);
  });
});

describe('B046 工厂列表/详情按菜单权限收口，下拉保持开放', () => {
  it('B046 控制器守卫链含 MenuGuard（MenuGuard 不是全局守卫，必须显式挂）', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, FactoryController) ?? [];
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard, MenuGuard]));
  });

  it('B046 GET /factories 与 GET /factories/:id 声明 @MenuAccess(factories)', () => {
    expect(Reflect.getMetadata(MENU_ACCESS_KEY, FactoryController.prototype.findAll)).toEqual(['factories']);
    expect(Reflect.getMetadata(MENU_ACCESS_KEY, FactoryController.prototype.findOne)).toEqual(['factories']);
  });

  it('B046 GET /factories/select 不加菜单限制（客户/样衣/订单/合同编辑页各角色都在用，且不含银行税号）', () => {
    expect(Reflect.getMetadata(MENU_ACCESS_KEY, FactoryController.prototype.listForSelect)).toBeUndefined();
  });

  it('B046 MenuGuard 实判：没有 factories 菜单的船务被拒，有的版师放行', () => {
    const { Reflector } = require('@nestjs/core');
    const guard = new MenuGuard(new Reflector());
    const ctx = (user: any) => ({
      getHandler: () => FactoryController.prototype.findAll,
      getClass: () => FactoryController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;
    expect(() => guard.canActivate(ctx({ role: 'SHIPPING', menu_keys: null, type: 'admin' }))).toThrow(/没有该菜单的访问权限/);
    expect(guard.canActivate(ctx({ role: 'PATTERNMAKER', menu_keys: null, type: 'admin' }))).toBe(true);
    expect(guard.canActivate(ctx({ role: 'FINANCE', menu_keys: ['factories'], type: 'admin' }))).toBe(true);
    expect(() => guard.canActivate(ctx({ role: 'FINANCE', menu_keys: null, type: 'admin' }))).toThrow();
  });
});

describe('B046/G2 配合：工厂银行账号与税号对版师、打样脱敏', () => {
  const row = () => ({
    id: 7, name: '面料厂A', bank_account: '6222020200112233', bank_account2: '6222020200445566',
    tax_no: '91320100MA1X0X0X0X', tax_no2: '91320100MA1Y0Y0Y0Y',
    invoice_phone: '025-8888', invoice_phone2: '025-9999',
    invoice_address: '南京市秦淮区', invoice_address2: '南京市鼓楼区',
    contact_name: '张三', contact_phone: '139000',
  });
  const ctrl = (svc: any) => new FactoryController(svc as any);

  it('版师查列表：敏感字段被抹掉，联系人等照常返回', async () => {
    const c = ctrl({ findAll: jest.fn().mockResolvedValue({ items: [row()], total: 1 }) });
    const res: any = await c.findAll({} as any, { user: { role: UserRole.PATTERNMAKER } });
    const f = res.items[0];
    for (const k of ['bank_account', 'bank_account2', 'tax_no', 'tax_no2', 'invoice_phone', 'invoice_phone2', 'invoice_address', 'invoice_address2']) {
      expect(f[k] ?? null).toBeNull(); // strip 是置 null（与 maskContract 同口径），不是删键
    }
    expect(f.contact_name).toBe('张三');
    expect(f.name).toBe('面料厂A');
  });

  it('打样间查详情同样脱敏；业务、财务、管理员原样拿到', async () => {
    const svc = { findOne: jest.fn().mockImplementation(async () => row()) };
    const maker: any = await ctrl(svc).findOne(7, { user: { role: UserRole.SAMPLE_MAKER } });
    expect(maker.bank_account ?? null).toBeNull();
    for (const role of [UserRole.BUSINESS, UserRole.FINANCE, UserRole.ADMIN]) {
      const r: any = await ctrl(svc).findOne(7, { user: { role } });
      expect(r.bank_account).toBe('6222020200112233');
      expect(r.tax_no).toBe('91320100MA1X0X0X0X');
    }
  });
});
