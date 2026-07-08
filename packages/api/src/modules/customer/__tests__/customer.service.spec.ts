import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Customer } from '../customer.entity';
import { CustomerContact } from '../customer-contact.entity';
import { CustomerBank } from '../customer-bank.entity';
import { CustomerExpress } from '../customer-express.entity';
import { OrderMain } from '../../order/order-main.entity';
import { Quotation } from '../../quote/quotation.entity';
import { SampleGarment } from '../../sample/sample-garment.entity';
import { CustomerService } from '../customer.service';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';
import { CustomerGrade, CustomerType } from '@i9/types';

const mockRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
};
const subRepo = () => ({ create: jest.fn().mockImplementation((v) => v), find: jest.fn().mockResolvedValue([]) });
const mockContactRepo = subRepo();
const mockBankRepo = subRepo();
const mockExpressRepo = subRepo();
const mockOrderRepo = { count: jest.fn() };
const mockQuoteRepo = { count: jest.fn() };
const mockSampleRepo = { count: jest.fn() };
const mockRedis = { incr: jest.fn(), expire: jest.fn(), exists: jest.fn().mockResolvedValue(1), set: jest.fn() };
const mockManager = {
  create: jest.fn().mockImplementation((_e: any, v: any) => v),
  save: jest.fn().mockImplementation((_e: any, v: any) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: v.id ?? 1 })),
  delete: jest.fn().mockResolvedValue({}),
};
const mockDataSource = { transaction: jest.fn((cb: any) => cb(mockManager)) };

const CONTACTS = [{ name: '张建国', mobile: '13901588888' }];

describe('CustomerService', () => {
  let service: CustomerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOrderRepo.count.mockResolvedValue(0);
    mockQuoteRepo.count.mockResolvedValue(0);
    mockSampleRepo.count.mockResolvedValue(0);
    mockRepo.count.mockResolvedValue(0);
    [mockContactRepo, mockBankRepo, mockExpressRepo].forEach((r) => r.find.mockResolvedValue([]));
    mockDataSource.transaction.mockImplementation((cb: any) => cb(mockManager));
    const module = await Test.createTestingModule({
      providers: [
        CustomerService,
        NumberingService,
        { provide: getRepositoryToken(Customer), useValue: mockRepo },
        { provide: getRepositoryToken(CustomerContact), useValue: mockContactRepo },
        { provide: getRepositoryToken(CustomerBank), useValue: mockBankRepo },
        { provide: getRepositoryToken(CustomerExpress), useValue: mockExpressRepo },
        { provide: getRepositoryToken(OrderMain), useValue: mockOrderRepo },
        { provide: getRepositoryToken(Quotation), useValue: mockQuoteRepo },
        { provide: getRepositoryToken(SampleGarment), useValue: mockSampleRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();
    service = module.get(CustomerService);
  });

  describe('create()', () => {
    it('UT-CUS-01: generates CM-prefixed customer_no (中间商) and created_by', async () => {
      mockRedis.incr.mockResolvedValue(3);
      const result = await service.create(
        { name: '美国ABC公司', type: CustomerType.MIDDLEMAN, grade: CustomerGrade.A, currency: 'USD', contacts: CONTACTS } as any,
        42,
      );
      const savedArg = mockManager.save.mock.calls[0][1];
      expect(savedArg).toMatchObject({ customer_no: 'CM003', created_by: 42 });
      expect(result.customer_no).toBe('CM003');
    });

    it('UT-CUS-14: throws when type=BUYER without related middleman (联动校验 D.4)', async () => {
      mockRedis.incr.mockResolvedValue(4);
      await expect(service.create(
        { name: 'H&M', type: CustomerType.BUYER, contacts: CONTACTS } as any, 1,
      )).rejects.toThrow(BadRequestException);
    });

    it('UT-CUS-15: throws when contacts empty (保存前·联系人非空校验)', async () => {
      mockRedis.incr.mockResolvedValue(5);
      await expect(service.create(
        { name: 'NoContact', type: CustomerType.MIDDLEMAN } as any, 1,
      )).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll()', () => {
    it('UT-CUS-02: returns paginated list without filters', async () => {
      mockRepo.findAndCount.mockResolvedValue([[{ id: 1 }], 1]);
      const result = await service.findAll({ page: 1, size: 20 } as any);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('UT-CUS-03: keyword searches across design-specified fields', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 1, size: 20, keyword: 'ABC' } as any);
      const call = mockRepo.findAndCount.mock.calls[0][0];
      expect(Array.isArray(call.where)).toBe(true);
      expect(call.where.length).toBeGreaterThanOrEqual(5);
    });

    it('UT-CUS-04: filters by grade when provided', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 1, size: 20, grade: CustomerGrade.A } as any);
      const call = mockRepo.findAndCount.mock.calls[0][0];
      expect(call.where).toMatchObject({ grade: CustomerGrade.A });
    });

    it('UT-CUS-16: filters by customer type when provided', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 1, size: 20, type: CustomerType.BUYER } as any);
      const call = mockRepo.findAndCount.mock.calls[0][0];
      expect(call.where).toMatchObject({ type: CustomerType.BUYER });
    });

    it('UT-CUS-05: calculates correct skip for page 2', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 2, size: 15 } as any);
      expect(mockRepo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 15, take: 15 }));
    });
  });

  describe('findOne()', () => {
    it('UT-CUS-06: returns entity with contacts/banks/expresses', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, deleted: 0, name: 'A' });
      mockContactRepo.find.mockResolvedValue([{ id: 1 }]);
      const result = await service.findOne(1);
      expect(result).toMatchObject({ id: 1, name: 'A' });
      expect(result.contacts).toHaveLength(1);
      expect(result.banks).toEqual([]);
    });

    it('UT-CUS-07: throws NotFoundException when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleStatus()', () => {
    it('UT-CUS-08: toggles status from 1 to 0', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: 1, deleted: 0 });
      mockRepo.save.mockResolvedValue({ id: 1, status: 0 });
      await service.toggleStatus(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }));
    });

    it('UT-CUS-09: toggles status from 0 to 1', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: 0, deleted: 0 });
      mockRepo.save.mockResolvedValue({ id: 1, status: 1 });
      await service.toggleStatus(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 1 }));
    });

    it('UT-CUS-13: throws when disabling a customer with open (non-DONE) orders', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: 1, deleted: 0 });
      mockOrderRepo.count.mockResolvedValue(2);
      await expect(service.toggleStatus(1)).rejects.toThrow('未完成订单');
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('UT-CUS-10: sets deleted=1 (logical delete) when not referenced', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, deleted: 0 });
      mockRepo.save.mockResolvedValue({ id: 1, deleted: 1 });
      await service.remove(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: 1 }));
    });

    it('UT-CUS-17: blocks delete when referenced by downstream docs (C3)', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, deleted: 0 });
      mockQuoteRepo.count.mockResolvedValue(1);
      await expect(service.remove(1)).rejects.toThrow('无法删除');
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('listForSelect()', () => {
    it('UT-CUS-11: returns only enabled (status=1, deleted=0) customers', async () => {
      mockRepo.find.mockResolvedValue([]);
      await service.listForSelect();
      expect(mockRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ status: 1, deleted: 0 }),
      }));
    });

    it('UT-CUS-12: filters by grade when provided', async () => {
      mockRepo.find.mockResolvedValue([]);
      await service.listForSelect(CustomerGrade.A);
      expect(mockRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ grade: CustomerGrade.A }),
      }));
    });
  });
});
