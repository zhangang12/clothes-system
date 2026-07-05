import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SysConfigService } from '../sys-config.service';
import { SysConfig } from '../sys-config.entity';

const mockRepo = {
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn().mockImplementation((v) => v),
};

describe('SysConfigService', () => {
  let service: SysConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SysConfigService,
        { provide: getRepositoryToken(SysConfig), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(SysConfigService);
  });

  it('UT-CFG-01 getNumber parses numeric cfg_value', async () => {
    mockRepo.findOne.mockResolvedValue({ cfg_key: 'approval.quote.threshold', cfg_value: '50000' });
    expect(await service.getNumber('approval.quote.threshold')).toBe(50000);
  });

  it('UT-CFG-02 getNumber returns fallback when key missing or empty', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    expect(await service.getNumber('nope', 0)).toBe(0);
    mockRepo.findOne.mockResolvedValue({ cfg_key: 'x', cfg_value: '' });
    expect(await service.getNumber('x', 7)).toBe(7);
    mockRepo.findOne.mockResolvedValue({ cfg_key: 'x', cfg_value: 'abc' });
    expect(await service.getNumber('x', 3)).toBe(3);
  });

  it('UT-CFG-03 set updates existing row', async () => {
    const row = { cfg_key: 'approval.order.threshold', cfg_value: '0' };
    mockRepo.findOne.mockResolvedValue(row);
    await service.set('approval.order.threshold', '100000', '订单阈值');
    expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ cfg_value: '100000' }));
  });

  it('UT-CFG-04 getThresholds returns quote/order/contract thresholds', async () => {
    mockRepo.findOne.mockImplementation(({ where }: any) => {
      const map: Record<string, string> = {
        'approval.quote.threshold': '10000',
        'approval.order.threshold': '20000',
        'approval.contract.threshold': '30000',
      };
      return Promise.resolve({ cfg_value: map[where.cfg_key] ?? null });
    });
    expect(await service.getThresholds()).toEqual({ quote: 10000, order: 20000, contract: 30000 });
  });
});
