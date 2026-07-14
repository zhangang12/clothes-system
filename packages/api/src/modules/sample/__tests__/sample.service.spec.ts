import { Test } from '@nestjs/testing';
import { QuoteService } from '../../quote/quote.service';
import { CustomerService } from '../../customer/customer.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
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
const mockDataSource = { transaction: jest.fn((cb: any) => cb(mockManager)) };

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
});
