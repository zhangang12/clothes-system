import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DictController, CreateDictDto, QueryDictDto, DICT_TYPES } from '../dict.controller';
import { SysDict } from '../dict.entity';

const check = (cls: any, body: any) => validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true });
const flat = (errs: any[]): string[] => errs.flatMap((e) => Object.values(e.constraints ?? {}) as string[]);

describe('B126 GET /dicts 的 type 参数校验', () => {
  it('B126 不传 type → 400（以前 where 条件被跳过、整张字典全量返回）', async () => {
    expect(flat(await check(QueryDictDto, {})).join()).toMatch(/type/);
  });

  it('B126 ?type=a&type=b 解析成数组 → 400（以前进 find 抛 SQL 错误 500）', async () => {
    expect(flat(await check(QueryDictDto, { type: ['currency', 'color'] })).join()).toMatch(/单个字符串/);
  });

  it('B126 正常单值通过；多余参数被拒', async () => {
    expect(flat(await check(QueryDictDto, { type: 'currency' }))).toEqual([]);
    expect(flat(await check(QueryDictDto, { type: 'currency', status: 0 })).join()).toMatch(/status/);
  });

  it('B126 控制器把校验后的 type 传给 find（status=1 启用项）', async () => {
    const repo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn(), save: jest.fn(), create: jest.fn(), update: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [DictController],
      providers: [{ provide: getRepositoryToken(SysDict), useValue: repo }],
    }).compile();
    await module.get(DictController).list({ type: 'currency' });
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { type: 'currency', status: 1 } }));
  });
});

describe('B044 POST /dicts 类别白名单', () => {
  it('B044 任意 type 不再能灌进字典表', async () => {
    expect(flat(await check(CreateDictDto, { type: 'zzz_anything', label: 'x' })).join()).toMatch(/字典类别不合法/);
    expect(flat(await check(CreateDictDto, { type: 'vat_rate', label: '99' })).join()).toMatch(/字典类别不合法/); // 费率配置不走自填口子
  });

  it('B044 字典维护页与各编辑页 DictSelect 用到的类别全部在白名单内', async () => {
    const usedByWeb = [
      'consignee', 'destination', 'color', 'size', 'composition', 'trade_country', 'price_terms',
      'settlement_method', 'currency', 'department', 'title', 'customer_source', 'cooperation_level', 'fee_item',
    ];
    for (const t of usedByWeb) {
      expect(DICT_TYPES).toContain(t);
      expect(flat(await check(CreateDictDto, { type: t, label: '新值' }))).toEqual([]);
    }
  });

  it('B044 空白 label 拒绝；value 可选', async () => {
    expect(flat(await check(CreateDictDto, { type: 'currency', label: '   ' })).join()).toMatch(/不能为空/);
    expect(flat(await check(CreateDictDto, { type: 'currency', label: 'EUR', value: '7.8' }))).toEqual([]);
  });

  describe('B044 先查后插改成幂等（库里已有唯一键 uk_dict_type_label）', () => {
    const makeCtl = async (repo: any) => {
      const module = await Test.createTestingModule({
        controllers: [DictController],
        providers: [{ provide: getRepositoryToken(SysDict), useValue: repo }],
      }).compile();
      return module.get(DictController);
    };
    const baseRepo = () => ({
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((v: any) => v),
      save: jest.fn().mockImplementation((v: any) => Promise.resolve({ id: 1, status: 1, ...v })),
      find: jest.fn(),
      update: jest.fn(),
    });

    it('B044 并发撞唯一键 → 回落为返回既有项，不抛 500、不插重复行', async () => {
      const repo = baseRepo();
      const dup: any = new Error('ER_DUP_ENTRY: Duplicate entry');
      dup.code = 'ER_DUP_ENTRY'; dup.errno = 1062;
      repo.save.mockRejectedValueOnce(dup);
      // 第一次查空（并发对手还没提交），撞键后重查拿到对方插入的那一行
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 7, type: 'currency', label: 'EUR', status: 1 });
      const ctl = await makeCtl(repo);
      await expect(ctl.create({ type: 'currency', label: 'EUR' } as any)).resolves.toMatchObject({ id: 7, label: 'EUR' });
      expect(repo.save).toHaveBeenCalledTimes(1); // 没有第二次插入
    });

    it('B044 撞键回落时，对手插入的是停用项 → 恢复启用后返回', async () => {
      const repo = baseRepo();
      const dup: any = new Error('dup'); dup.errno = 1062;
      repo.save.mockRejectedValueOnce(dup);
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 8, type: 'color', label: '藏青', status: 0 });
      const ctl = await makeCtl(repo);
      const r: any = await ctl.create({ type: 'color', label: '藏青' } as any);
      expect(r.status).toBe(1);
      expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 8, status: 1 }));
    });

    it('B044 非唯一键错误照常抛出（不把真故障吞成成功）', async () => {
      const repo = baseRepo();
      const boom: any = new Error('ER_LOCK_WAIT_TIMEOUT'); boom.code = 'ER_LOCK_WAIT_TIMEOUT'; boom.errno = 1205;
      repo.save.mockRejectedValueOnce(boom);
      const ctl = await makeCtl(repo);
      await expect(ctl.create({ type: 'currency', label: 'JPY' } as any)).rejects.toThrow('ER_LOCK_WAIT_TIMEOUT');
    });

    it('B044 常规路径不变：已存在直接返回；已停用的同名项重新启用', async () => {
      const repo = baseRepo();
      repo.findOne.mockResolvedValue({ id: 3, type: 'size', label: 'XL', status: 1 });
      const ctl = await makeCtl(repo);
      await expect(ctl.create({ type: 'size', label: 'XL' } as any)).resolves.toMatchObject({ id: 3 });
      expect(repo.save).not.toHaveBeenCalled();

      const repo2 = baseRepo();
      repo2.findOne.mockResolvedValue({ id: 4, type: 'size', label: 'XXL', status: 0 });
      const ctl2 = await makeCtl(repo2);
      const r: any = await ctl2.create({ type: 'size', label: 'XXL' } as any);
      expect(r.status).toBe(1);
      expect(repo2.save).toHaveBeenCalledTimes(1);
    });
  });
});
