import { Test } from '@nestjs/testing';
import { QuoteService } from '../../quote/quote.service';
import { CustomerService } from '../../customer/customer.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SampleGarment } from '../sample-garment.entity';
import { SampleMaterial } from '../sample-material.entity';
import { SampleVersion } from '../sample-version.entity';
import { SampleShipRound } from '../sample-ship-round.entity';
import { Customer } from '../../customer/customer.entity';
import { Quotation } from '../../quote/quotation.entity';
import { SampleService } from '../sample.service';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';
import { SampleStatus } from '@i9/types';

const mockRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockImplementation((v) => Promise.resolve({ ...v, id: v.id ?? 1 })),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  update: jest.fn().mockResolvedValue({}),
};
const mockMaterialRepo = {
  create: jest.fn().mockImplementation((v) => v),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),   // purchaseMaterial 按 materialId 取材料行
  update: jest.fn().mockResolvedValue({}),
};
const mockVersionRepo = { create: jest.fn().mockImplementation((v) => v), save: jest.fn().mockResolvedValue({}), find: jest.fn().mockResolvedValue([]) };
const mockShipRoundRepo = { create: jest.fn().mockImplementation((v) => v), save: jest.fn().mockResolvedValue({}), find: jest.fn().mockResolvedValue([]) };
const mockCustomerRepo = { findOne: jest.fn() };
const mockQuoteRepo = { count: jest.fn(), find: jest.fn().mockResolvedValue([]) };
const mockRedis = { eval: jest.fn().mockResolvedValue(1), incr: jest.fn(), expire: jest.fn() };
const mockManager = {
  create: jest.fn().mockImplementation((_e: any, v: any) => v),
  save: jest.fn().mockImplementation((_e: any, v: any) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: v.id ?? 1 })),
  delete: jest.fn().mockResolvedValue({}),
};
const mockDataSource = {
  transaction: jest.fn((cb: any) => cb(mockManager)),
  getRepository: jest.fn(), // patternmakerSave 指派校验回查 sys_user
};
const mockSysUserRepo = { findOne: jest.fn() };

const MATERIALS = [{ itemName: '32S 全棉府绸', part: '主面料' }];

const mockQuoteServiceDep = { syncFromSample: jest.fn().mockResolvedValue(0) };
const mockCustomerServiceDep = { visibleCustomerIds: jest.fn().mockResolvedValue(null) };

describe('SampleService', () => {
  let service: SampleService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCustomerRepo.findOne.mockResolvedValue({ id: 1, deleted: 0, name: '中间商A', customer_no: 'CN001' });
    mockQuoteRepo.find.mockResolvedValue([]);
    mockDataSource.transaction.mockImplementation((cb: any) => cb(mockManager));
    mockDataSource.getRepository.mockReturnValue(mockSysUserRepo);
    mockSysUserRepo.findOne.mockResolvedValue({ id: 7, role: 'PATTERNMAKER' });
    const module = await Test.createTestingModule({
      providers: [
        SampleService,
        { provide: QuoteService, useValue: mockQuoteServiceDep },
        { provide: CustomerService, useValue: mockCustomerServiceDep },
        NumberingService,
        { provide: getRepositoryToken(SampleGarment), useValue: mockRepo },
        { provide: getRepositoryToken(SampleMaterial), useValue: mockMaterialRepo },
        { provide: getRepositoryToken(SampleVersion), useValue: mockVersionRepo },
        { provide: getRepositoryToken(SampleShipRound), useValue: mockShipRoundRepo },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        { provide: getRepositoryToken(Quotation), useValue: mockQuoteRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();
    service = module.get(SampleService);
  });

  describe('create()', () => {
    it('UT-SAM-01: creates sample S-date no, PENDING, auto middleman name', async () => {
      mockRedis.eval.mockResolvedValue(1);
      const result = await service.create(
        { middlemanId: 1, styleNo: 'H-2026-S001', categories: '外套', materials: MATERIALS } as any, 99,
      );
      const savedArg = mockManager.save.mock.calls[0][1];
      expect(savedArg).toMatchObject({ style_no: 'H-2026-S001', middleman_name: '中间商A', status: SampleStatus.PENDING });
      expect(result.sample_no).toMatch(/^S-/);
    });

    it('UT-SAM-11: throws when material list empty', async () => {
      await expect(service.create({ middlemanId: 1, styleNo: 'X', materials: [] } as any, 1))
        .rejects.toThrow(BadRequestException);
    });

    it('UT-SAM-12: throws when a material line missing 品名', async () => {
      await expect(service.create({ middlemanId: 1, styleNo: 'X', materials: [{ part: '主面料' }] } as any, 1))
        .rejects.toThrow(BadRequestException);
    });

    it('UT-SAM-13: throws when middleman customer not found', async () => {
      mockCustomerRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.create({ middlemanId: 999, styleNo: 'X', materials: MATERIALS } as any, 1))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('pushPatternmaker()', () => {
    it('UT-SAM-02: material ship no → 打样中 + ship date auto', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.PENDING, version: 1, deleted: 0 });
      await service.pushPatternmaker(1, { patternmakerId: 5, materialShipNo: 'SF123' } as any, 10);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        status: SampleStatus.SAMPLING, patternmaker_id: 5, material_ship_no: 'SF123',
      }));
    });

    // #96 nina：材料常是先寄出、隔几天才有空录系统，一律写当天等于把日期记错
    it('UT-SAM-24: 手填了寄出日期就用手填的，不覆盖成今天', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.PENDING, version: 1, deleted: 0 });
      await service.pushPatternmaker(1, { materialShipNo: 'SF123', materialShipDate: '2026-08-01' } as any, 10);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ material_ship_date: '2026-08-01' }));
    });

    it('UT-SAM-25: 没填才落当天（沿用原行为，不给业务添操作）', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.PENDING, version: 1, deleted: 0 });
      await service.pushPatternmaker(1, { materialShipNo: 'SF123' } as any, 10);
      const saved = mockRepo.save.mock.calls[0][0];
      expect(saved.material_ship_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // #96：录错的寄出单号/日期原先落库后就改不动了（update 把这两个字段静默丢弃）
  describe('update() 的材料寄出单号/日期', () => {
    it('UT-SAM-26: 事后能改寄出日期', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SAMPLING, version: 1, deleted: 0, material_ship_date: '2026-08-14' });
      await service.update(1, { materialShipNo: 'SF999', materialShipDate: '2026-08-01' } as any, 10);
      expect(mockManager.save).toHaveBeenCalledWith(SampleGarment, expect.objectContaining({
        material_ship_no: 'SF999', material_ship_date: '2026-08-01',
      }));
    });

    it('UT-SAM-27: 清空日期要存得回去，不能留着错的', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SAMPLING, version: 1, deleted: 0, material_ship_date: '2026-08-14' });
      await service.update(1, { materialShipDate: '' } as any, 10);
      expect(mockManager.save).toHaveBeenCalledWith(SampleGarment, expect.objectContaining({ material_ship_date: null }));
    });

    it('UT-SAM-28: 没传这两个字段就不动原值（别的页面保存不该把日期抹了）', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SAMPLING, version: 1, deleted: 0, material_ship_no: 'SF1', material_ship_date: '2026-08-01' });
      await service.update(1, { recipient: '张三' } as any, 10);
      expect(mockManager.save).toHaveBeenCalledWith(SampleGarment, expect.objectContaining({
        material_ship_no: 'SF1', material_ship_date: '2026-08-01',
      }));
    });
  });

  // #103 nina：单号带出来了，数量和寄样日期却是空的，只能照着上面再抄一遍
  describe('findOne() 合成的第一轮', () => {
    const base = { id: 1, deleted: 0, sample_size: 'M', material_ship_no: 'JDVB672', sample_qty: 3, material_ship_date: '2026-08-14' };

    it('UT-SAM-29: 数量取业务填的样衣数量（版师还没填件数时）', async () => {
      mockRepo.findOne.mockResolvedValue({ ...base, piece_count: null });
      mockShipRoundRepo.find.mockResolvedValue([]);
      const r: any = await service.findOne(1);
      expect(r.shipRounds[0]).toMatchObject({ qty: 3, size: 'M', ship_no: 'JDVB672' });
    });

    it('UT-SAM-30: 版师填过件数就以版师的为准', async () => {
      mockRepo.findOne.mockResolvedValue({ ...base, piece_count: 5 });
      mockShipRoundRepo.find.mockResolvedValue([]);
      const r: any = await service.findOne(1);
      expect(r.shipRounds[0].qty).toBe(5);
    });

    it('UT-SAM-31: 寄样日期没填时用材料寄出日期兜底', async () => {
      mockRepo.findOne.mockResolvedValue({ ...base, ship_sample_date: null });
      mockShipRoundRepo.find.mockResolvedValue([]);
      const r: any = await service.findOne(1);
      expect(r.shipRounds[0].ship_date).toBe('2026-08-14');
    });

    it('UT-SAM-32: 顶层寄样日期填了就用它，不被材料寄出日期顶掉', async () => {
      mockRepo.findOne.mockResolvedValue({ ...base, ship_sample_date: '2026-08-10' });
      mockShipRoundRepo.find.mockResolvedValue([]);
      const r: any = await service.findOne(1);
      expect(r.shipRounds[0].ship_date).toBe('2026-08-10');
    });

    it('UT-SAM-33: 已经有真实轮次时不合成，别把库里的数据盖了', async () => {
      mockRepo.findOne.mockResolvedValue({ ...base, piece_count: 9 });
      mockShipRoundRepo.find.mockResolvedValue([{ id: 7, qty: 1, ship_date: '2026-08-02' }]);
      const r: any = await service.findOne(1);
      expect(r.shipRounds).toHaveLength(1);
      expect(r.shipRounds[0].id).toBe(7);
    });
  });

  // #104 nina：「填写了寄样时间，但是不显示」——列表那一列读的是顶层字段
  describe('多轮寄样日期汇总回顶层', () => {
    it('UT-SAM-34: 顶层没填时，取各轮里最后一次寄出的日期', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SAMPLING, version: 1, deleted: 0, ship_sample_date: null });
      await service.update(1, { shipRounds: [
        { size: 'M', qty: 1, shipDate: '2026-08-02' },
        { size: 'L', qty: 2, shipDate: '2026-08-09' },
      ] } as any, 10);
      expect(mockManager.save).toHaveBeenCalledWith(SampleGarment, expect.objectContaining({ ship_sample_date: '2026-08-09' }));
    });

    it('UT-SAM-35: 顶层自己填了就不动它——人填的优先于推出来的', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SAMPLING, version: 1, deleted: 0 });
      await service.update(1, {
        shipSampleDate: '2026-08-20',
        shipRounds: [{ size: 'M', qty: 1, shipDate: '2026-08-02' }],
      } as any, 10);
      expect(mockManager.save).toHaveBeenCalledWith(SampleGarment, expect.objectContaining({ ship_sample_date: '2026-08-20' }));
    });

    it('UT-SAM-36: 各轮都没填日期时，顶层保持为空，不瞎补一个', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SAMPLING, version: 1, deleted: 0, ship_sample_date: null });
      await service.update(1, { shipRounds: [{ size: 'M', qty: 1 }] } as any, 10);
      const saved = mockManager.save.mock.calls.find((c: any[]) => c[0] === SampleGarment)![1];
      expect(saved.ship_sample_date ?? null).toBeNull();
    });

    it('UT-SAM-37: 新建时同样兜底，列表当场就能看到寄出日期', async () => {
      mockRedis.eval.mockResolvedValue(1);
      await service.create({
        middlemanId: 1, styleNo: 'X', categories: '外套', materials: MATERIALS,
        shipRounds: [{ size: 'M', qty: 1, shipDate: '2026-08-05' }],
      } as any, 9);
      expect(mockManager.save.mock.calls[0][1]).toMatchObject({ ship_sample_date: '2026-08-05' });
    });
  });

  describe('patternmakerSave()', () => {
    it('UT-SAM-03: piece + unit price → labor amount + 已对账', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SAMPLING, version: 1, deleted: 0 });
      await service.patternmakerSave(1, { pieceCount: 3, laborUnitPrice: 50 } as any, 7);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        piece_count: 3, labor_unit_price: 50, labor_amount: 150, status: SampleStatus.RECONCILED,
      }));
    });

    it('UT-SAM-04: return no → 已寄回 + return date', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SAMPLING, version: 1, deleted: 0 });
      await service.patternmakerSave(1, { returnNo: 'RT99' } as any, 7);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        return_no: 'RT99', status: SampleStatus.RETURNED,
      }));
    });

    it('UT-SAM-05: piece without unit price throws', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SAMPLING, version: 1, deleted: 0 });
      await expect(service.patternmakerSave(1, { pieceCount: 3 } as any, 7)).rejects.toThrow(BadRequestException);
    });

    it('UT-SAM-15: 非指派版师保存被拒(L2 指派归属校验)', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SAMPLING, version: 1, deleted: 0, patternmaker_id: 5 });
      mockSysUserRepo.findOne.mockResolvedValue({ id: 7, role: 'PATTERNMAKER' });
      await expect(service.patternmakerSave(1, { pieceCount: 3, laborUnitPrice: 50 } as any, 7))
        .rejects.toThrow(ForbiddenException);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('UT-SAM-16: 指派版师本人可保存(bigint 字符串 id 归一匹配)', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SAMPLING, version: 1, deleted: 0, patternmaker_id: '5' });
      mockSysUserRepo.findOne.mockResolvedValue({ id: 5, role: 'PATTERNMAKER' });
      await service.patternmakerSave(1, { pieceCount: 3, laborUnitPrice: 50 } as any, 5);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        piece_count: 3, labor_amount: 150, status: SampleStatus.RECONCILED,
      }));
    });

    it('UT-SAM-17: 管理员代保存不受指派限制', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SAMPLING, version: 1, deleted: 0, patternmaker_id: 5 });
      mockSysUserRepo.findOne.mockResolvedValue({ id: 1, role: 'ADMIN' });
      await service.patternmakerSave(1, { pieceCount: 3, laborUnitPrice: 50 } as any, 1);
      expect(mockRepo.save).toHaveBeenCalled();
    });
  });

  describe('markShipped() / complete()', () => {
    it('UT-SAM-06: markShipped sets 已寄出', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SAMPLING, deleted: 0 });
      await service.markShipped(1, {} as any);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: SampleStatus.SHIPPED }));
    });

    it('UT-SAM-07: complete sets 已完成', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.RECONCILED, deleted: 0 });
      await service.complete(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: SampleStatus.DONE }));
    });
  });

  // #95 nina：点错「标记已寄出」后退不回来，原先只能重开一张单
  describe('undoShipped()', () => {
    it('UT-SAM-20: 已寄出 → 退回打样中，并清掉寄样日期', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SHIPPED, version: 2, deleted: 0, ship_sample_date: '2026-08-14' });
      await service.undoShipped(1, 10);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        status: SampleStatus.SAMPLING, ship_sample_date: null,
      }));
    });

    it('UT-SAM-21: 只有「已寄出」能撤——已对账/已完成再退会把下游账搞乱', async () => {
      for (const st of [SampleStatus.SAMPLING, SampleStatus.RECONCILED, SampleStatus.DONE, SampleStatus.PENDING]) {
        mockRepo.findOne.mockResolvedValue({ id: 1, status: st, deleted: 0 });
        await expect(service.undoShipped(1, 10)).rejects.toThrow(BadRequestException);
      }
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('UT-SAM-22: 单据不存在报 404', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.undoShipped(9, 10)).rejects.toThrow(NotFoundException);
    });

    it('UT-SAM-23: 记一条操作日志，事后查得到是谁撤的', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SHIPPED, version: 2, deleted: 0 });
      await service.undoShipped(1, 77);
      expect(mockVersionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ action: 'UNDO_SHIP', operator_id: 77 }));
    });
  });

  describe('copy()', () => {
    it('UT-SAM-08: copies base + materials into new PENDING sample', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, deleted: 0, style_no: 'X', customer_id: 1 });
      mockMaterialRepo.find.mockResolvedValue([{ item_name: '面料' }]);
      await service.copy(1, 42);
      const savedArg = mockManager.save.mock.calls[0][1];
      expect(savedArg).toMatchObject({ status: SampleStatus.PENDING, style_no: 'X' });
    });
  });

  describe('remove()', () => {
    it('UT-SAM-09: deletes a PENDING sample not referenced by quotes', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.PENDING, deleted: 0 });
      await service.remove(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: 1 }));
    });

    it('UT-SAM-10: throws when not PENDING', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.SAMPLING, deleted: 0 });
      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    });

    it('UT-SAM-14: blocks delete when referenced by a quotation (A6)', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.PENDING, deleted: 0 });
      mockQuoteRepo.find.mockResolvedValue([{ quote_no: 'Q-20260710-001' }]);
      await expect(service.remove(1)).rejects.toThrow('已被报价单 Q-20260710-001 引用，无法删除');
    });
  });

  // ── 行级生成采购：重复生成软守卫（2026-08-04 举一反三）──────────────────
  describe('purchaseMaterial 重复生成守卫', () => {
    const SAMPLE = { id: 1, sample_no: 'S-20260805-001', style_no: 'K-100', version: 1, deleted: 0 };
    // 关键：这两行「仅部位不同」——品名/数量/单价逐字段相同，description 会逐字节一样。
    // 去重键若用 description 整串匹配，第二行的合法采购会被误挡。
    const ROW_A = { id: 11, sample_id: 1, item_name: '主面料', qty: 10, ref_price: 8, supplier_id: 7 };
    const ROW_B = { id: 12, sample_id: 1, item_name: '主面料', qty: 10, ref_price: 8, supplier_id: 7 };

    function setup(dupFor: string | null) {
      mockRepo.findOne.mockResolvedValue(SAMPLE);
      const reconRepo = { findOne: jest.fn().mockImplementation(({ where }: any) => {
        // 模拟 Like('%[行#N]%')：只有查的那一行标识命中才返回已存在的单
        const pat = String(where?.description?.value ?? where?.description ?? '');
        return Promise.resolve(dupFor && pat.includes(dupFor) ? { id: 99, reconcile_no: 'DZ-K-100-0007' } : null);
      }) };
      mockDataSource.getRepository.mockImplementation((e: any) => (e?.name === 'Factory' ? mockSysUserRepo : reconRepo));
      return reconRepo;
    }

    it('UT-SAM-P1: 首次生成成功，描述带上行标识 [行#id]', async () => {
      setup(null);
      mockMaterialRepo.findOne.mockResolvedValue(ROW_A);
      mockRedis.eval.mockResolvedValue('DZ-K-100-0001');
      await service.purchaseMaterial(1, 11, 1);
      const saved = mockManager.save.mock.calls.find((c: any) => String(c[1]?.description ?? '').includes('打样材料采购'));
      expect(saved[1].description).toContain('[行#11]');
      expect(saved[1].description).toContain('打样材料'); // settlement classify 靠这个前缀归桶，不能丢
    });

    it('UT-SAM-P2: 同一行二次生成 → 400 并报出已存在的单号，而不是再插一张', async () => {
      setup('[行#11]');
      mockMaterialRepo.findOne.mockResolvedValue(ROW_A);
      await expect(service.purchaseMaterial(1, 11, 1)).rejects.toThrow('DZ-K-100-0007');
    });

    it('UT-SAM-P3: 仅部位不同的复制行(描述逐字节相同)必须都能生成——防误挡回归锚点', async () => {
      setup('[行#11]');                       // 只有 11 号行已生成过
      mockMaterialRepo.findOne.mockResolvedValue(ROW_B);   // 现在采 12 号行
      mockRedis.eval.mockResolvedValue('DZ-K-100-0002');
      await expect(service.purchaseMaterial(1, 12, 1)).resolves.toBeDefined();
    });
  });
});
