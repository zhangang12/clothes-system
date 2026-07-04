import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Customer } from '../customer.entity';
import { OrderMain } from '../../order/order-main.entity';
import { CustomerService } from '../customer.service';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';
import { CustomerGrade } from '@i9/types';

const mockRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  find: jest.fn(),
};
const mockOrderRepo = { count: jest.fn() };
const mockRedis = { incr: jest.fn(), expire: jest.fn() };

describe('CustomerService', () => {
  let service: CustomerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOrderRepo.count.mockResolvedValue(0);
    const module = await Test.createTestingModule({
      providers: [
        CustomerService,
        NumberingService,
        { provide: getRepositoryToken(Customer), useValue: mockRepo },
        { provide: getRepositoryToken(OrderMain), useValue: mockOrderRepo },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();
    service = module.get(CustomerService);
  });

  describe('create()', () => {
    it('UT-CUS-01: creates customer with generated customer_no and created_by', async () => {
      mockRedis.incr.mockResolvedValue(3);
      const entity = { id: 1, customer_no: 'S003', name: '美国ABC公司' };
      mockRepo.create.mockReturnValue(entity);
      mockRepo.save.mockResolvedValue(entity);

      const result = await service.create(
        { name: '美国ABC公司', grade: CustomerGrade.A, currency: 'USD' } as any,
        42,
      );
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        customer_no: 'S003',
        created_by: 42,
      }));
      expect(result.customer_no).toBe('S003');
    });
  });

  describe('findAll()', () => {
    it('UT-CUS-02: returns paginated list without filters', async () => {
      mockRepo.findAndCount.mockResolvedValue([[{ id: 1 }], 1]);
      const result = await service.findAll({ page: 1, size: 20 } as any);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('UT-CUS-03: searches by keyword across name and customer_no', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 1, size: 20, keyword: 'ABC' } as any);
      const call = mockRepo.findAndCount.mock.calls[0][0];
      expect(Array.isArray(call.where)).toBe(true);
      expect(call.where).toHaveLength(2);
    });

    it('UT-CUS-04: filters by grade when provided', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 1, size: 20, grade: CustomerGrade.A } as any);
      const call = mockRepo.findAndCount.mock.calls[0][0];
      expect(call.where).toMatchObject({ grade: CustomerGrade.A });
    });

    it('UT-CUS-05: calculates correct skip for page 2', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 2, size: 15 } as any);
      expect(mockRepo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 15, take: 15 }));
    });
  });

  describe('findOne()', () => {
    it('UT-CUS-06: returns entity when found', async () => {
      const entity = { id: 1, deleted: 0 };
      mockRepo.findOne.mockResolvedValue(entity);
      const result = await service.findOne(1);
      expect(result).toBe(entity);
    });

    it('UT-CUS-07: throws NotFoundException when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleStatus()', () => {
    it('UT-CUS-08: toggles status from 1 to 0', async () => {
      const entity = { id: 1, status: 1, deleted: 0 };
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, status: 0 });
      await service.toggleStatus(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }));
    });

    it('UT-CUS-09: toggles status from 0 to 1', async () => {
      const entity = { id: 1, status: 0, deleted: 0 };
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, status: 1 });
      await service.toggleStatus(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 1 }));
    });

    it('UT-CUS-13: throws when disabling a customer with open (non-DONE) orders', async () => {
      const entity = { id: 1, status: 1, deleted: 0 };
      mockRepo.findOne.mockResolvedValue(entity);
      mockOrderRepo.count.mockResolvedValue(2);
      await expect(service.toggleStatus(1)).rejects.toThrow('未完成订单');
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('UT-CUS-10: sets deleted=1 (logical delete)', async () => {
      const entity = { id: 1, deleted: 0 };
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, deleted: 1 });
      await service.remove(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: 1 }));
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
