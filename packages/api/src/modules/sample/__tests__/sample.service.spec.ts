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
