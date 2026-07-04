import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Factory } from '../factory.entity';
import { Contract } from '../../contract/contract.entity';
import { FactoryService } from '../factory.service';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';

const mockRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  find: jest.fn(),
};
const mockContractRepo = { count: jest.fn() };
const mockRedis = { incr: jest.fn(), expire: jest.fn() };

describe('FactoryService', () => {
  let service: FactoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockContractRepo.count.mockResolvedValue(0);
    const module = await Test.createTestingModule({
      providers: [
        FactoryService,
        NumberingService,
        { provide: getRepositoryToken(Factory), useValue: mockRepo },
        { provide: getRepositoryToken(Contract), useValue: mockContractRepo },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();
    service = module.get(FactoryService);
  });

  describe('create()', () => {
    it('UT-FAC-01: creates factory with generated factory_no and created_by', async () => {
      mockRedis.incr.mockResolvedValue(1);
      const entity = { id: 1, factory_no: 'CN001', name: '测试工厂' };
      mockRepo.create.mockReturnValue(entity);
      mockRepo.save.mockResolvedValue(entity);

      const result = await service.create({ name: '测试工厂', type: 'process' } as any, 99);
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        factory_no: 'CN001',
        created_by: 99,
        name: '测试工厂',
      }));
      expect(result.factory_no).toBe('CN001');
    });
  });

  describe('findAll()', () => {
    it('UT-FAC-02: returns paginated list without filters', async () => {
      mockRepo.findAndCount.mockResolvedValue([[{ id: 1 }], 1]);
      const result = await service.findAll({ page: 1, size: 20 } as any);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.page).toBe(1);
    });

    it('UT-FAC-03: searches by keyword (name and factory_no)', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 1, size: 20, keyword: 'abc' } as any);
      const call = mockRepo.findAndCount.mock.calls[0][0];
      expect(Array.isArray(call.where)).toBe(true);
      expect(call.where).toHaveLength(2);
    });

    it('UT-FAC-04: filters by type and status when provided', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 1, size: 20, type: 'process', status: 1 } as any);
      const call = mockRepo.findAndCount.mock.calls[0][0];
      expect(call.where).toMatchObject({ type: 'process', status: 1 });
    });

    it('UT-FAC-05: calculates correct skip for pagination', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 3, size: 10 } as any);
      expect(mockRepo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
    });
  });

  describe('findOne()', () => {
    it('UT-FAC-06: returns entity when found', async () => {
      const entity = { id: 1, deleted: 0 };
      mockRepo.findOne.mockResolvedValue(entity);
      const result = await service.findOne(1);
      expect(result).toBe(entity);
    });

    it('UT-FAC-07: throws NotFoundException when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleStatus()', () => {
    it('UT-FAC-08: toggles status from 1 to 0', async () => {
      const entity = { id: 1, status: 1, deleted: 0 };
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, status: 0 });
      const result = await service.toggleStatus(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }));
    });

    it('UT-FAC-09: toggles status from 0 to 1', async () => {
      const entity = { id: 1, status: 0, deleted: 0 };
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, status: 1 });
      await service.toggleStatus(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 1 }));
    });

    it('UT-FAC-13: throws when disabling a factory with open (non-terminal) contracts', async () => {
      const entity = { id: 1, status: 1, deleted: 0 };
      mockRepo.findOne.mockResolvedValue(entity);
      mockContractRepo.count.mockResolvedValue(1);
      await expect(service.toggleStatus(1)).rejects.toThrow('未完成合同');
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('UT-FAC-10: sets deleted=1 (logical delete)', async () => {
      const entity = { id: 1, deleted: 0 };
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, deleted: 1 });
      await service.remove(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: 1 }));
    });
  });

  describe('listForSelect()', () => {
    it('UT-FAC-11: returns only enabled (status=1, deleted=0) factories', async () => {
      mockRepo.find.mockResolvedValue([{ id: 1, factory_no: 'CN001', name: '工厂A' }]);
      await service.listForSelect();
      expect(mockRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ status: 1, deleted: 0 }),
      }));
    });

    it('UT-FAC-12: filters by type when provided', async () => {
      mockRepo.find.mockResolvedValue([]);
      await service.listForSelect('process');
      expect(mockRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ type: 'process' }),
      }));
    });
  });
});
