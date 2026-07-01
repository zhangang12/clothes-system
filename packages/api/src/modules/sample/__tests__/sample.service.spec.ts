import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SampleGarment } from '../sample-garment.entity';
import { SampleVersion, SampleAction } from '../sample-version.entity';
import { SampleService } from '../sample.service';
import { NumberingService, REDIS_CLIENT } from '../../../common/services/numbering.service';
import { SampleStatus } from '@i9/types';

const mockRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
};
const mockVersionRepo = {
  save: jest.fn(),
  find: jest.fn(),
};
const mockRedis = { eval: jest.fn().mockResolvedValue(1), incr: jest.fn(), expire: jest.fn() };

describe('SampleService', () => {
  let service: SampleService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SampleService,
        NumberingService,
        { provide: getRepositoryToken(SampleGarment), useValue: mockRepo },
        { provide: getRepositoryToken(SampleVersion), useValue: mockVersionRepo },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();
    service = module.get(SampleService);
  });

  describe('create()', () => {
    it('UT-SAM-01: creates sample with PENDING status and sample_no', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      const entity = { id: 1, sample_no: 'SM20240601xxxxx', status: SampleStatus.PENDING };
      mockRepo.create.mockReturnValue(entity);
      mockRepo.save.mockResolvedValue(entity);
      const result = await service.create({ customer_id: 1, style_name: '测试款' }, 99);
      expect(result.status).toBe(SampleStatus.PENDING);
    });
  });

  describe('assignPatternmaker()', () => {
    it('UT-SAM-02: assigns patternmaker and moves to PATTERN status', async () => {
      const entity = { id: 1, status: SampleStatus.PENDING, deleted: 0 };
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, status: SampleStatus.PATTERN, patternmaker_id: 5 });
      await service.assignPatternmaker(1, { patternmaker_id: 5 });
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        status: SampleStatus.PATTERN, patternmaker_id: 5,
      }));
    });

    it('UT-SAM-03: throws if not PENDING status', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.PATTERN, deleted: 0 });
      await expect(service.assignPatternmaker(1, { patternmaker_id: 5 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitVersion()', () => {
    it('UT-SAM-04: moves PATTERN→DONE and records version history', async () => {
      const entity = { id: 1, status: SampleStatus.PATTERN, version: 1, deleted: 0 };
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, status: SampleStatus.DONE });
      mockVersionRepo.save.mockResolvedValue({});
      await service.submitVersion(1, { remark: '首版' }, 10);
      expect(mockVersionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        sample_id: 1, action: SampleAction.SUBMIT, operator_id: 10,
      }));
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: SampleStatus.DONE }));
    });

    it('UT-SAM-05: throws if not PATTERN status', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.PENDING, deleted: 0 });
      await expect(service.submitVersion(1, {}, 1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('reject()', () => {
    it('UT-SAM-06: rejects DONE sample and increments version counter', async () => {
      const entity = { id: 1, status: SampleStatus.DONE, version: 1, deleted: 0, reject_reason: null };
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, status: SampleStatus.REJECTED, version: 2 });
      mockVersionRepo.save.mockResolvedValue({});
      await service.reject(1, { reject_reason: '领口不对' }, 5);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        status: SampleStatus.REJECTED,
        version: 2,
        reject_reason: '领口不对',
      }));
    });

    it('UT-SAM-07: throws if not DONE status', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.PATTERN, deleted: 0 });
      await expect(service.reject(1, { reject_reason: '测试' }, 1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirm()', () => {
    it('UT-SAM-08: confirms DONE sample and sets confirmed_at', async () => {
      const entity = { id: 1, status: SampleStatus.DONE, version: 1, deleted: 0 };
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, status: SampleStatus.CONFIRMED });
      mockVersionRepo.save.mockResolvedValue({});
      await service.confirm(1, 3);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        status: SampleStatus.CONFIRMED,
        confirmed_at: expect.any(Date),
      }));
    });

    it('UT-SAM-09: throws if not DONE status', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 1, status: SampleStatus.PENDING, deleted: 0 });
      await expect(service.confirm(1, 1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove()', () => {
    it('UT-SAM-10: sets deleted=1', async () => {
      const entity = { id: 1, deleted: 0 };
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, deleted: 1 });
      await service.remove(1);
      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: 1 }));
    });
  });
});
