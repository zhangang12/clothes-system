import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Factory } from '../factory.entity';
import { FactoryContact } from '../factory-contact.entity';
import { Contract } from '../../contract/contract.entity';
import { FactoryService } from '../factory.service';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';

const makeQb = () => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue([]),
  getRawMany: jest.fn().mockResolvedValue([]),
});
const mockRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(() => makeQb()),
};
const mockContactRepo = {
  create: jest.fn().mockImplementation((v) => v),
  find: jest.fn().mockResolvedValue([]),
  createQueryBuilder: jest.fn(() => makeQb()), // findAll 联系人检索子查询
};
const mockContractRepo = { count: jest.fn() };
const mockRedis = { incr: jest.fn(), expire: jest.fn(), exists: jest.fn().mockResolvedValue(1), set: jest.fn() };
const mockManager = {
  create: jest.fn().mockImplementation((_e: any, v: any) => v),
  save: jest.fn().mockImplementation((_e: any, v: any) => Promise.resolve(Array.isArray(v) ? v : { ...v, id: v.id ?? 1 })),
  delete: jest.fn().mockResolvedValue({}),
};
const mockDataSource = {
  transaction: jest.fn((cb: any) => cb(mockManager)),
  query: jest.fn().mockResolvedValue([{ cnt: 0 }]), // 删除前下游引用计数
};

const CONTACTS = [{ name: '张建国', phone: '0512-6877', mobile: '13901588888' }];

describe('FactoryService', () => {
  let service: FactoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockContractRepo.count.mockResolvedValue(0);
    mockRepo.count.mockResolvedValue(0);
    mockContactRepo.find.mockResolvedValue([]);
    mockDataSource.transaction.mockImplementation((cb: any) => cb(mockManager));
    mockDataSource.query.mockResolvedValue([{ cnt: 0 }]);
    const module = await Test.createTestingModule({
      providers: [
        FactoryService,
        NumberingService,
        { provide: getRepositoryToken(Factory), useValue: mockRepo },
        { provide: getRepositoryToken(FactoryContact), useValue: mockContactRepo },
        { provide: getRepositoryToken(Contract), useValue: mockContractRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();
    service = module.get(FactoryService);
  });

  describe('create()', () => {
    it('UT-FAC-01: generates S-prefixed factory_no, backfills main contact from subtable first row', async () => {
      mockRedis.incr.mockResolvedValue(1);
      const result = await service.create(
        { name: '测试工厂', type: 'FABRIC', contacts: CONTACTS } as any, 99,
      );
      const savedArg = mockManager.save.mock.calls[0][1];
      expect(savedArg).toMatchObject({
        factory_no: 'S001',
        created_by: 99,
        name: '测试工厂',
        contact_name: '张建国',
        contact_phone: '0512-6877',
      });
      expect(result.factory_no).toBe('S001');
    });

    it('UT-FAC-14: throws when no contacts provided (保存前·联系人非空校验)', async () => {
      mockRedis.incr.mockResolvedValue(2);
      await expect(service.create({ name: 'X', type: 'FABRIC' } as any, 1))
        .rejects.toThrow(BadRequestException);
    });

    it('UT-FAC-15: throws Conflict when factory name duplicated', async () => {
      mockRepo.count.mockResolvedValue(1);
      await expect(service.create({ name: 'Dup', type: 'FABRIC', contacts: CONTACTS } as any, 1))
        .rejects.toThrow(ConflictException);
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

    it('UT-FAC-03: keyword searches across all design-specified fields', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 1, size: 20, keyword: 'abc' } as any);
      const call = mockRepo.findAndCount.mock.calls[0][0];
      expect(Array.isArray(call.where)).toBe(true);
      expect(call.where.length).toBeGreaterThanOrEqual(5);
    });

    it('UT-FAC-04: filters by type and status when provided', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 1, size: 20, type: 'FABRIC', status: 1 } as any);
      const call = mockRepo.findAndCount.mock.calls[0][0];
      expect(call.where).toMatchObject({ type: 'FABRIC', status: 1 });
    });

    it('UT-FAC-05: calculates correct skip for pagination', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 3, size: 10 } as any);
      expect(mockRepo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
    });

    it('UT-FAC-17: keyword 与 contact 同用时为 AND 关系(L8:contact 过滤不丢失)', async () => {
      const contactQb = makeQb();
      contactQb.getRawMany.mockResolvedValue([{ fid: '7' }]); // 联系人子查询命中工厂 #7
      mockContactRepo.createQueryBuilder.mockReturnValueOnce(contactQb);
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ page: 1, size: 20, keyword: 'abc', contact: '张' } as any);
      const call = mockRepo.findAndCount.mock.calls[0][0];
      // keyword 展开为 OR 分支数组,每个分支都必须带上 contact 求出的 id 过滤(In([7]))
      expect(Array.isArray(call.where)).toBe(true);
      expect(call.where.length).toBeGreaterThanOrEqual(5);
      for (const w of call.where) {
        expect(w.deleted).toBe(0);
        expect((w.id as any)?._type).toBe('in');
        expect((w.id as any)?._value).toEqual([7]);
      }
    });
  });

  describe('findOne()', () => {
    it('UT-FAC-06: returns entity with contacts when found', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, deleted: 0, name: 'A' });
      mockContactRepo.find.mockResolvedValue([{ id: 5, name: '张建国' }]);
      const result = await service.findOne(1);
      expect(result).toMatchObject({ id: 1, name: 'A' });
      expect(result.contacts).toHaveLength(1);
    });

    it('UT-FAC-07: throws NotFoundException when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleStatus()', () => {
    it('UT-FAC-08: toggles status from 1 to 0', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: 1, deleted: 0 });
      mockRepo.save.mockResolvedValue({ id: 1, status: 0 });
      await service.toggleStatus(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }));
    });

    it('UT-FAC-09: toggles status from 0 to 1', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: 0, deleted: 0 });
      mockRepo.save.mockResolvedValue({ id: 1, status: 1 });
      await service.toggleStatus(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 1 }));
    });

    it('UT-FAC-13: throws when disabling a factory with open (non-terminal) contracts', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: 1, deleted: 0 });
      mockContractRepo.count.mockResolvedValue(1);
      await expect(service.toggleStatus(1)).rejects.toThrow('未完成合同');
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('UT-FAC-10: sets deleted=1 (logical delete) when not referenced', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, deleted: 0 });
      mockContractRepo.count.mockResolvedValue(0);
      mockRepo.save.mockResolvedValue({ id: 1, deleted: 1 });
      await service.remove(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: 1 }));
    });

    it('UT-FAC-16: blocks delete when referenced by downstream docs (C2/C3:合同/样衣材料/订单/对账/付款)', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, deleted: 0 });
      mockDataSource.query.mockResolvedValue([{ cnt: 2 }]);
      await expect(service.remove(1)).rejects.toThrow('无法删除');
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('listForSelect()', () => {
    it('UT-FAC-11: returns only enabled (status=1, deleted=0), no type filter', async () => {
      const qb = makeQb();
      mockRepo.createQueryBuilder.mockReturnValueOnce(qb);
      await service.listForSelect();
      expect(qb.where).toHaveBeenCalledWith(expect.stringContaining('f.status = 1'));
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('UT-FAC-12: filters by type via 主身份 OR 附加身份 (工厂双身份)', async () => {
      const qb = makeQb();
      mockRepo.createQueryBuilder.mockReturnValueOnce(qb);
      await service.listForSelect('OUTSOURCE');
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('FIND_IN_SET'),
        { t0: 'OUTSOURCE' },
      );
    });

    it('UT-FAC-12b: 多类型过滤(FABRIC,ACCESSORY)——材料供应商下拉限面/辅料', async () => {
      const qb = makeQb();
      mockRepo.createQueryBuilder.mockReturnValueOnce(qb);
      await service.listForSelect('FABRIC,ACCESSORY');
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining(':t1'),
        { t0: 'FABRIC', t1: 'ACCESSORY' },
      );
    });
  });
});
