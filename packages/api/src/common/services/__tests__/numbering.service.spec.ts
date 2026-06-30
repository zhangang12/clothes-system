import { Test } from '@nestjs/testing';
import { NumberingService, REDIS_CLIENT } from '../numbering.service';

const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
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
    it('UT-NUM-01: generates correct format prefix+date+5digit', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      const date = new Date('2024-06-01');
      const result = await service.next('Q', date);
      expect(result).toBe('Q2024060100001');
    });

    it('UT-NUM-02: pads sequence to 5 digits', async () => {
      mockRedis.incr.mockResolvedValue(99);
      const result = await service.next('PR', new Date('2024-06-01'));
      expect(result).toBe('PR2024060100099');
    });

    it('UT-NUM-03: sets 48h TTL on first increment', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      await service.next('Q', new Date('2024-06-01'));
      expect(mockRedis.expire).toHaveBeenCalledWith('seq:Q:20240601', 86400 * 2);
    });

    it('UT-NUM-04: does NOT set TTL on subsequent increments', async () => {
      mockRedis.incr.mockResolvedValue(2);
      await service.next('Q', new Date('2024-06-01'));
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('UT-NUM-05: uses different key per date', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      await service.next('SO', new Date('2024-06-01'));
      await service.next('SO', new Date('2024-06-02'));
      expect(mockRedis.incr).toHaveBeenCalledWith('seq:SO:20240601');
      expect(mockRedis.incr).toHaveBeenCalledWith('seq:SO:20240602');
    });

    it('UT-NUM-06: handles high sequence (seq=99999)', async () => {
      mockRedis.incr.mockResolvedValue(99999);
      const result = await service.next('CT', new Date('2024-06-01'));
      expect(result).toBe('CT2024060199999');
    });
  });

  describe('nextGlobal()', () => {
    it('UT-NUM-07: generates global 3-digit padded number', async () => {
      mockRedis.incr.mockResolvedValue(1);
      const result = await service.nextGlobal('CN');
      expect(result).toBe('CN001');
    });

    it('UT-NUM-08: uses seq:global: key prefix', async () => {
      mockRedis.incr.mockResolvedValue(5);
      await service.nextGlobal('S');
      expect(mockRedis.incr).toHaveBeenCalledWith('seq:global:S');
    });
  });
});
