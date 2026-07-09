import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { NumberingService, REDIS_CLIENT } from '../numbering.service';

const mockRedis = {
  eval: jest.fn(),
  incr: jest.fn(),
  exists: jest.fn(),
  set: jest.fn(),
};
const mockQueryRunner = {
  query: jest.fn(),
  release: jest.fn().mockResolvedValue(undefined),
};
const mockDataSource = {
  query: jest.fn(),
  createQueryRunner: jest.fn(() => mockQueryRunner),
};

describe('NumberingService', () => {
  let service: NumberingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.exists.mockResolvedValue(0); // 默认:计数器不存在
    mockDataSource.query.mockResolvedValue([{ m: 0 }]); // 默认:库中无同前缀数据
    const module = await Test.createTestingModule({
      providers: [
        NumberingService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();
    service = module.get(NumberingService);
  });

  describe('next()', () => {
    it('UT-NUM-01: generates correct format prefix-date-3digit', async () => {
      mockRedis.eval.mockResolvedValue(1);
      const date = new Date('2024-06-01');
      const result = await service.next('Q', date);
      expect(result).toBe('Q-20240601-001');
    });

    it('UT-NUM-02: pads sequence to 3 digits', async () => {
      mockRedis.eval.mockResolvedValue(99);
      const result = await service.next('PR', new Date('2024-06-01'));
      expect(result).toBe('PR-20240601-099');
    });

    it('UT-NUM-03: uses Lua eval for atomic INCR+EXPIRE', async () => {
      mockRedis.eval.mockResolvedValue(1);
      await service.next('Q', new Date('2024-06-01'));
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('INCR'),
        1,
        'seq:Q:20240601',
      );
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('EXPIRE'),
        1,
        'seq:Q:20240601',
      );
    });

    it('UT-NUM-04: uses different key per date', async () => {
      mockRedis.eval.mockResolvedValue(1);
      await service.next('SO', new Date('2024-06-01'));
      await service.next('SO', new Date('2024-06-02'));
      expect(mockRedis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'seq:SO:20240601');
      expect(mockRedis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'seq:SO:20240602');
    });

    it('UT-NUM-05: handles high sequence (seq=99999, exceeds 3-digit pad width)', async () => {
      mockRedis.eval.mockResolvedValue(99999);
      const result = await service.next('HT', new Date('2024-06-01'));
      expect(result).toBe('HT-20240601-99999');
    });
  });

  describe('nextGlobal()', () => {
    it('UT-NUM-06: generates global 3-digit padded number', async () => {
      mockRedis.incr.mockResolvedValue(1);
      const result = await service.nextGlobal('CN');
      expect(result).toBe('CN001');
    });

    it('UT-NUM-07: uses seq:global: key prefix', async () => {
      mockRedis.incr.mockResolvedValue(5);
      await service.nextGlobal('S');
      expect(mockRedis.incr).toHaveBeenCalledWith('seq:global:S');
    });

    it('UT-NUM-08: seeds counter from DB max when key absent (avoids colliding with seed/existing rows)', async () => {
      mockRedis.exists.mockResolvedValue(0); // 计数器不存在
      mockDataSource.query.mockResolvedValue([{ m: 1 }]); // 库中已有 S001
      mockRedis.incr.mockResolvedValue(2);
      const result = await service.nextGlobal('S');
      expect(mockRedis.set).toHaveBeenCalledWith('seq:global:S', 1, 'NX'); // 基线=已有最大号
      expect(result).toBe('S002'); // 下一个不再撞 S001
    });

    it('UT-NUM-09: skips DB seed when counter already exists', async () => {
      mockRedis.exists.mockResolvedValue(1); // 计数器已存在
      mockRedis.incr.mockResolvedValue(7);
      mockDataSource.query.mockResolvedValue([{ value: 7 }]); // 影子推进后读回(不领先)
      const result = await service.nextGlobal('S');
      // 不做种子基线查询(SELECT MAX)、不 SET NX；影子 UPSERT 属发号常规动作,允许
      const seedCalls = mockDataSource.query.mock.calls.filter((c: any[]) => String(c[0]).includes('MAX'));
      expect(seedCalls).toHaveLength(0);
      expect(mockRedis.set).not.toHaveBeenCalled();
      expect(result).toBe('S007');
    });
  });

  // ===== DB 兜底（CLAUDE.md 待办：Redis 挂了只降速、不阻断建单）=====
  describe('DB 兜底', () => {
    it('UT-NUM-10: Redis 挂掉时用 sys_sequence 行锁发号（不阻断建单）', async () => {
      mockRedis.eval.mockRejectedValue(new Error('ECONNREFUSED'));
      // dbAllocate: INSERT..ON DUP(affectedRows=2 走 UPDATE 分支) → SELECT LAST_INSERT_ID
      mockQueryRunner.query
        .mockResolvedValueOnce({ affectedRows: 2 })
        .mockResolvedValueOnce([{ v: 12 }]);
      const result = await service.next('HT', new Date('2024-06-01'));
      expect(result).toBe('HT-20240601-012');
      expect(mockQueryRunner.release).toHaveBeenCalled(); // 连接归还
    });

    it('UT-NUM-10b: 兜底首建（affectedRows=1）以基线+1 起号', async () => {
      mockRedis.eval.mockRejectedValue(new Error('down'));
      mockQueryRunner.query.mockResolvedValueOnce({ affectedRows: 1 });
      const result = await service.next('DZ', new Date('2024-06-01'));
      expect(result).toBe('DZ-20240601-001');
    });

    it('UT-NUM-11: Redis 恢复但计数落后 → 放弃旧号、DB 续发并追平 Redis', async () => {
      mockRedis.eval.mockResolvedValue(3); // Redis 发出 3（落后）
      mockDataSource.query
        .mockResolvedValueOnce({}) // 影子 UPSERT
        .mockResolvedValueOnce([{ value: 9 }]); // 影子读回：DB 已发到 9 > 3
      mockQueryRunner.query
        .mockResolvedValueOnce({ affectedRows: 2 })
        .mockResolvedValueOnce([{ v: 10 }]); // DB 续发 10
      mockRedis.set.mockResolvedValue('OK');
      const result = await service.next('HT', new Date('2024-06-01'));
      expect(result).toBe('HT-20240601-010'); // 用 DB 续发的 10,不用落后的 3
      expect(mockRedis.set).toHaveBeenCalledWith('seq:HT:20240601', 10); // 追平后自动切回快路径
    });

    it('UT-NUM-12: 无 DataSource（纯单测环境）时 Redis 异常原样上抛（退化行为）', async () => {
      const bare = new NumberingService({ eval: jest.fn().mockRejectedValue(new Error('down')) } as any);
      await expect(bare.next('Q')).rejects.toThrow('down');
    });
  });
});
