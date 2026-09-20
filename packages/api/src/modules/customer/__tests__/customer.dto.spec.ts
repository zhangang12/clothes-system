import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto, GrantBatchDto } from '../dto/update-customer.dto';

// 与 main.ts 全局 ValidationPipe 同参数：whitelist + forbidNonWhitelisted
const check = (cls: any, body: any) => validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true });
const flat = (errs: any[]): string[] => errs.flatMap((e) => [
  ...Object.values(e.constraints ?? {}) as string[],
  ...flat(e.children ?? []),
]);

describe('B006 UpdateCustomerDto（PUT /customers/:id 从 Partial<Dto> 改成真 DTO）', () => {
  // CustomerEditView.buildDto 实际发送的字段（编辑模式，联系人行是详情接口原样回传的实体行）
  const editPayload = {
    name: '上海福德', type: 'MIDDLEMAN', relatedMiddleman: undefined, tradeCountry: '美国', countryRegion: undefined,
    city: '上海', homepage: undefined, address: undefined, priceTerms: 'FOB', settlementMethod: 'TT',
    grade: 'A', cooperationLevel: undefined, customerSource: undefined, paymentDays: 30,
    businessScope: undefined, salesperson: '张三', developDate: null, currency: 'USD',
    spare1: undefined, spare2: undefined, spare3: undefined, deliveryAddress: undefined, frontMark: undefined,
    sideMark: undefined, innerBoxText: undefined, customerRemark: undefined, commissionRate: 5,
    contacts: [{ id: '17', customer_id: '5', sort_order: 0, name: '张建国', department: null, gender: '男', title: null,
      phone: null, mobile: '13901588888', mobile1: null, mobile2: null, email: null, remark: null }],
    banks: [{ accountName: '上海福德', bankName: '中行', bankAccount: '622', bankAddress: '', currency: 'USD', swiftCode: '', remark: '' }],
    expresses: [{ company: 'DHL', account: '123', payMethod: '到付', remark: '' }],
  };

  it('B006 前端编辑页实际发送的字段全部通过（含原样回传的联系人实体行 id/customer_id/sort_order）', async () => {
    const errs = await check(UpdateCustomerDto, JSON.parse(JSON.stringify(editPayload)));
    expect(flat(errs)).toEqual([]);
  });

  it('B006 全部字段可省略（只改一个字段也行）；type 不再必填', async () => {
    expect(flat(await check(UpdateCustomerDto, { city: '苏州' }))).toEqual([]);
    expect(flat(await check(UpdateCustomerDto, {}))).toEqual([]);
  });

  it('B006 校验规则真的生效：超长/非法枚举/未知字段都会被拦（以前 Partial<Dto> 整体跳过）', async () => {
    expect(flat(await check(UpdateCustomerDto, { name: 'x'.repeat(101) })).join()).toMatch(/name/);
    expect(flat(await check(UpdateCustomerDto, { grade: 'Z' })).join()).toMatch(/grade/);
    expect(flat(await check(UpdateCustomerDto, { bogus: 1 })).join()).toMatch(/bogus/);
    expect(flat(await check(UpdateCustomerDto, { contacts: [{ name: 'a', wechat: 'x' }] })).join()).toMatch(/wechat/);
  });

  it('B006 复制为新建（联系人实体行原样进 CreateCustomerDto）同样放行', async () => {
    const body = { ...JSON.parse(JSON.stringify(editPayload)) };
    expect(flat(await check(CreateCustomerDto, body))).toEqual([]);
  });
});

describe('B006 GrantBatchDto（POST /customers/grants 从内联类型改成真 DTO）', () => {
  it('B006 前端 CustomerListView 实际发送的 body 通过；bigint 字符串 id 转成数字', async () => {
    const dto = plainToInstance(GrantBatchDto, { customer_ids: ['12', '13'], user_ids: [8, '9'], can_edit: false, expire_at: '2026-12-31', remark: '' });
    expect(flat(await validate(dto, { whitelist: true, forbidNonWhitelisted: true }))).toEqual([]);
    expect(dto.customer_ids).toEqual([12, 13]);
    expect(dto.user_ids).toEqual([8, 9]);
    // expire_at/remark 不传（undefined 被 JSON 丢掉）也行
    expect(flat(await check(GrantBatchDto, { customer_ids: [1], user_ids: [2], can_edit: true }))).toEqual([]);
  });

  it('B006 空数组 / 非数字 / 日期格式错 / 未知字段 → 400', async () => {
    expect(flat(await check(GrantBatchDto, { customer_ids: [], user_ids: [2] })).join()).toMatch(/customer_ids/);
    expect(flat(await check(GrantBatchDto, { customer_ids: ['abc'], user_ids: [2] })).join()).toMatch(/customer_ids/);
    expect(flat(await check(GrantBatchDto, { customer_ids: [1], user_ids: [2], expire_at: '20261231' })).join()).toMatch(/YYYY-MM-DD/);
    expect(flat(await check(GrantBatchDto, { customer_ids: [1], user_ids: [2], admin: true })).join()).toMatch(/admin/);
  });
});
