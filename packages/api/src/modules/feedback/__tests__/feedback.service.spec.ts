import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FeedbackService } from '../feedback.service';
import { Feedback, FeedbackUserType, FeedbackStatus } from '../feedback.entity';
import { FileService } from '../../../common/services/file.service';

// 这组用例守的是「内部用户 ID 与供应商账号 ID 是两套各自独立的自增序列」这件事。
// 门户反馈（2026-08-08）接进来之后，只要有一处漏了 user_type，
// 内部用户#5 就会看到供应商账号#5 的反馈、甚至能把对方的回复标成已读。
const mockQb = { where: jest.fn().mockReturnThis(), getCount: jest.fn().mockResolvedValue(0) };
const mockRepo = {
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockImplementation((v) => Promise.resolve({ ...v, id: 1 })),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn().mockResolvedValue([]),
  createQueryBuilder: jest.fn(() => mockQb),
};

describe('FeedbackService · 内部/供应商隔离', () => {
  let service: FeedbackService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQb.where.mockReturnThis();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: getRepositoryToken(Feedback), useValue: mockRepo },
        { provide: FileService, useValue: {} },
      ],
    }).compile();
    service = module.get(FeedbackService);
  });

  describe('create', () => {
    it('默认按内部用户落库（PC 端不传第四个参数，行为不能变）', async () => {
      await service.create({ content: 'x' } as any, 5, 'zhang');
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 5, user_type: FeedbackUserType.INTERNAL, username: 'zhang',
        status: FeedbackStatus.PENDING,
      }));
    });

    it('门户提交标成 SUPPLIER', async () => {
      await service.create({ content: 'x' } as any, 5, 's105', FeedbackUserType.SUPPLIER);
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 5, user_type: FeedbackUserType.SUPPLIER,
      }));
    });
  });

  describe('mine', () => {
    it('查询条件必须同时带 user_id 与 user_type', async () => {
      await service.mine(5, {}, FeedbackUserType.SUPPLIER);
      expect(mockRepo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({
        where: { user_id: 5, user_type: FeedbackUserType.SUPPLIER, deleted: 0 },
      }));
    });

    it('同一个 ID 的内部用户与供应商，查到的是两批不同的数据', async () => {
      await service.mine(5, {});
      const a = mockRepo.findAndCount.mock.calls.at(-1)![0] as any;
      await service.mine(5, {}, FeedbackUserType.SUPPLIER);
      const b = mockRepo.findAndCount.mock.calls.at(-1)![0] as any;
      expect(a.where.user_type).toBe(FeedbackUserType.INTERNAL);
      expect(b.where.user_type).toBe(FeedbackUserType.SUPPLIER);
      expect(a.where).not.toEqual(b.where);
    });
  });

  describe('unreadCount', () => {
    it('SQL 条件里带上 user_type（否则红点数会把对方的算进来）', async () => {
      await service.unreadCount(5, FeedbackUserType.SUPPLIER);
      const [sql, params] = mockQb.where.mock.calls.at(-1)!;
      expect(String(sql)).toContain('f.user_type = :userType');
      expect(params).toMatchObject({ userId: 5, userType: FeedbackUserType.SUPPLIER });
    });
  });

  describe('markRead', () => {
    it('更新条件里带 user_type——否则供应商能把同号内部用户的回复标成已读', async () => {
      await service.markRead(9, 5, FeedbackUserType.SUPPLIER);
      expect(mockRepo.update).toHaveBeenCalledWith(
        { id: 9, user_id: 5, user_type: FeedbackUserType.SUPPLIER },
        { reply_read: 1 },
      );
    });

    it('不传时按内部用户，PC 端老行为不变', async () => {
      await service.markRead(9, 5);
      expect(mockRepo.update).toHaveBeenCalledWith(
        { id: 9, user_id: 5, user_type: FeedbackUserType.INTERNAL },
        { reply_read: 1 },
      );
    });
  });
});
