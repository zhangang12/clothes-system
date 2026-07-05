import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StatsService } from '../stats.service';
import { SampleGarment } from '../../sample/sample-garment.entity';
import { Quotation } from '../../quote/quotation.entity';
import { OrderMain } from '../../order/order-main.entity';
import { Settlement } from '../../settlement/settlement.entity';
import { QuoteStatus } from '@i9/types';

const mockSampleRepo = { count: jest.fn() };
const mockQuoteRepo = { count: jest.fn(), find: jest.fn() };
const mockOrderRepo = { count: jest.fn() };
const mockSettlementRepo = { find: jest.fn() };

describe('StatsService', () => {
  let service: StatsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        StatsService,
        { provide: getRepositoryToken(SampleGarment), useValue: mockSampleRepo },
        { provide: getRepositoryToken(Quotation), useValue: mockQuoteRepo },
        { provide: getRepositoryToken(OrderMain), useValue: mockOrderRepo },
        { provide: getRepositoryToken(Settlement), useValue: mockSettlementRepo },
      ],
    }).compile();
    service = module.get(StatsService);
  });

  it('UT-STAT-01 funnel returns counts and conversion rates', async () => {
    // samples=100, quotes=40, orders=10, wonQuotes=10
    mockSampleRepo.count.mockResolvedValue(100);
    mockOrderRepo.count.mockResolvedValue(10);
    mockQuoteRepo.count
      .mockResolvedValueOnce(40)  // quotes (deleted:0)
      .mockResolvedValueOnce(10); // wonQuotes (ORDERED)
    const r = await service.funnel();
    expect(r).toMatchObject({ samples: 100, quotes: 40, orders: 10, wonQuotes: 10 });
    expect(r.sampleToQuoteRate).toBe(40);   // 40/100
    expect(r.quoteToOrderRate).toBe(25);    // 10/40
    expect(r.overallRate).toBe(10);         // 10/100
  });

  it('UT-STAT-02 winRate groups by salesperson with 成单率', async () => {
    mockQuoteRepo.find.mockResolvedValue([
      { salesperson: '张三', status: QuoteStatus.ORDERED },
      { salesperson: '张三', status: QuoteStatus.QUOTED },
      { salesperson: '李四', status: QuoteStatus.ORDERED },
    ]);
    const rows = await service.winRate('salesperson');
    const zhang = rows.find((r) => r.name === '张三');
    const li = rows.find((r) => r.name === '李四');
    expect(zhang).toMatchObject({ total: 2, won: 1, rate: 50 });
    expect(li).toMatchObject({ total: 1, won: 1, rate: 100 });
  });

  it('UT-STAT-03 profit sums by style, flags 亏损, loss-first ordering', async () => {
    mockSettlementRepo.find.mockResolvedValue([
      { style_no: 'K-100', settle_amount: 1000, gross_profit: 300, net_profit: 200, net_profit_ex_refund: 150 },
      { style_no: 'K-100', settle_amount: 500, gross_profit: 100, net_profit: 80, net_profit_ex_refund: 50 },
      { style_no: 'K-200', settle_amount: 800, gross_profit: -50, net_profit: -120, net_profit_ex_refund: -150 },
    ]);
    const rows = await service.profit('style');
    // 亏损靠前
    expect(rows[0].key).toBe('K-200');
    expect(rows[0].loss).toBe(true);
    const k100 = rows.find((r) => r.key === 'K-100');
    expect(k100).toMatchObject({ count: 2, settleAmount: 1500, netProfit: 280, loss: false });
    // 毛利率% = 毛利/结算金额 = 400/1500
    expect(k100!.grossMargin).toBe(26.7);
  });

  it('UT-STAT-04 profit by customer dimension groups by customer_name', async () => {
    mockSettlementRepo.find.mockResolvedValue([
      { customer_name: '中间商甲', settle_amount: 1000, gross_profit: 300, net_profit: 200, net_profit_ex_refund: 150 },
      { customer_name: '中间商甲', settle_amount: 500, gross_profit: 100, net_profit: 80, net_profit_ex_refund: 50 },
      { customer_name: null, settle_amount: 200, gross_profit: 20, net_profit: 10, net_profit_ex_refund: 5 },
    ]);
    const rows = await service.profit('customer');
    const jia = rows.find((r) => r.key === '中间商甲');
    expect(jia).toMatchObject({ count: 2, settleAmount: 1500, netProfit: 280 });
    expect(rows.find((r) => r.key === '未指定客户')).toBeTruthy();
  });
});
