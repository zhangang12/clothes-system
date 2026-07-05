import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CompanyService } from '../company.service';
import { CompanyProfile } from '../company-profile.entity';

const mockRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockImplementation((v) => Promise.resolve({ id: 1, ...v })),
  find: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn().mockResolvedValue({}),
};

describe('CompanyService', () => {
  let service: CompanyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CompanyService,
        { provide: getRepositoryToken(CompanyProfile), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(CompanyService);
  });

  it('UT-CMP-01 create with isDefault makes it the sole default', async () => {
    await service.create({ name: '甲公司', isDefault: true } as any);
    // 先清其它默认，再置本条默认
    expect(mockRepo.update).toHaveBeenCalledWith(expect.anything(), { is_default: 0 });
    expect(mockRepo.update).toHaveBeenCalledWith({ id: 1 }, { is_default: 1 });
  });

  it('UT-CMP-02 create without isDefault does not touch other defaults', async () => {
    await service.create({ name: '乙公司' } as any);
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
});
