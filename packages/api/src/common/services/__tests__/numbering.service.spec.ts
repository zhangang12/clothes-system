import { Test } from '@nestjs/testing';
import { NumberingService, REDIS_CLIENT } from '../numbering.service';

const mockRedis = {
  eval: jest.fn(),
  incr: jest.fn(),
};

describe('NumberingService', () => {
  let service: NumberingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        NumberingService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
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
  });
});
