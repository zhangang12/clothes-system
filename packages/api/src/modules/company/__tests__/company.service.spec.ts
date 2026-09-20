import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CompanyService } from '../company.service';
import { CompanyProfile } from '../company-profile.entity';

const mockRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockImplementation((v) => Promise.resolve({ id: 1, ...v })),
  find: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn().mockResolvedValue({}),
};
// B117：建/改/设默认在一个事务里，写操作全部走事务 manager
const mockManager = {
  create: jest.fn().mockImplementation((_e: any, v: any) => v),
  save: jest.fn().mockImplementation((_e: any, v: any) => Promise.resolve({ id: 1, ...v })),
  findOne: jest.fn(),
  update: jest.fn().mockResolvedValue({}),
};
const mockDataSource = { transaction: jest.fn((cb: any) => cb(mockManager)) };

describe('CompanyService', () => {
  let service: CompanyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDataSource.transaction.mockImplementation((cb: any) => cb(mockManager));
    const module = await Test.createTestingModule({
      providers: [
        CompanyService,
        { provide: getRepositoryToken(CompanyProfile), useValue: mockRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();
    service = module.get(CompanyService);
  });

  it('UT-CMP-01 create with isDefault makes it the sole default', async () => {
    await service.create({ name: '甲公司', isDefault: true } as any);
    // 先清其它默认，再置本条默认
    expect(mockManager.update).toHaveBeenCalledWith(CompanyProfile, expect.anything(), { is_default: 0 });
    expect(mockManager.update).toHaveBeenCalledWith(CompanyProfile, { id: 1 }, { is_default: 1 });
  });

  it('UT-CMP-02 create without isDefault does not touch other defaults', async () => {
    await service.create({ name: '乙公司' } as any);
    expect(mockManager.update).not.toHaveBeenCalled();
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('UT-CMP-03 findOne throws when missing', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne(9)).rejects.toThrow(NotFoundException);
  });

  it('UT-CMP-04 getDefault falls back to earliest when no default flagged', async () => {
    mockRepo.findOne
      .mockResolvedValueOnce(null) // no is_default=1
      .mockResolvedValueOnce({ id: 3, name: '兜底最早一条' });
    const r = await service.getDefault();
    expect(r).toMatchObject({ id: 3 });
  });

  describe('B117 默认主体切换必须在一个事务内', () => {
    it('B117 create(isDefault)：save + 清别人 + 置自己 全部走同一个事务 manager，不走 repo', async () => {
      await service.create({ name: '甲公司', isDefault: true } as any);
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.save).toHaveBeenCalledWith(CompanyProfile, expect.objectContaining({ name: '甲公司', is_default: 1 }));
      expect(mockManager.update).toHaveBeenCalledTimes(2);
      expect(mockRepo.save).not.toHaveBeenCalled();
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('B117 update(isDefault)：事务内 manager.findOne 取行、manager.save、两条 manager.update', async () => {
      mockManager.findOne.mockResolvedValue({ id: 2, name: '乙', is_default: 0, deleted: 0 });
      await service.update(2, { name: '乙改', isDefault: true } as any);
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.findOne).toHaveBeenCalledWith(CompanyProfile, { where: { id: 2, deleted: 0 } });
      expect(mockManager.save).toHaveBeenCalledWith(CompanyProfile, expect.objectContaining({ id: 2, name: '乙改' }));
      expect(mockManager.update).toHaveBeenCalledWith(CompanyProfile, expect.anything(), { is_default: 0 });
      expect(mockManager.update).toHaveBeenCalledWith(CompanyProfile, { id: 2 }, { is_default: 1 });
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('B117 setDefault：两条 update 在事务内；主体不存在 → 404 且不写', async () => {
      mockManager.findOne.mockResolvedValue({ id: 3, deleted: 0 });
      mockRepo.findOne.mockResolvedValue({ id: 3, is_default: 1 });
      const r = await service.setDefault(3);
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.update).toHaveBeenCalledTimes(2);
      expect(r).toMatchObject({ id: 3 });

      jest.clearAllMocks();
      mockDataSource.transaction.mockImplementation((cb: any) => cb(mockManager));
      mockManager.findOne.mockResolvedValue(null);
      await expect(service.setDefault(99)).rejects.toThrow(NotFoundException);
      expect(mockManager.update).not.toHaveBeenCalled();
    });

    it('B117 事务中途失败整体回滚（第二条 update 抛错 → create 抛错，不留半成品）', async () => {
      // 真事务由 DataSource 回滚；这里验证异常原样冒出，不被吞掉变成「保存成功但默认没切」
      mockManager.update.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('deadlock'));
      await expect(service.create({ name: '丙', isDefault: true } as any)).rejects.toThrow('deadlock');
    });
  });
});
