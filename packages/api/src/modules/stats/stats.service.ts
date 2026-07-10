import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SampleGarment } from '../sample/sample-garment.entity';
import { Quotation } from '../quote/quotation.entity';
import { OrderMain } from '../order/order-main.entity';
import { Settlement } from '../settlement/settlement.entity';
import { QuoteStatus } from '@i9/types';

// 报表/KPI（设计稿 样衣确认清单 rec:0：本期出「转化漏斗 + 成单率 + 利润汇总(亏损预警)」）
@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(SampleGarment) private readonly sampleRepo: Repository<SampleGarment>,
    @InjectRepository(Quotation) private readonly quoteRepo: Repository<Quotation>,
    @InjectRepository(OrderMain) private readonly orderRepo: Repository<OrderMain>,
    @InjectRepository(Settlement) private readonly settlementRepo: Repository<Settlement>,
  ) {}

  private static rate(a: number, b: number): number {
    return b > 0 ? +((a / b) * 100).toFixed(1) : 0;
  }

  // 转化漏斗：样衣建档 → 客户报价 → 销售订单（成单）
  // 订单维度统计(P3#34/ORD D8):按 PO/客户/工厂/币种 聚合 单数/数量/金额
  async orderStats(dimension: 'po' | 'customer' | 'factory' | 'currency' = 'customer') {
    const col = { po: 'o.customer_po', customer: 'o.middleman_name', factory: 'o.factory_id', currency: 'o.currency' }[dimension];
    const rows = await this.orderRepo.createQueryBuilder('o')
      .select(`${col}`, 'k')
      .addSelect('COUNT(*)', 'cnt')
      .addSelect('COALESCE(SUM(o.qty_total),0)', 'qty')
      .addSelect('COALESCE(SUM(o.total_amount),0)', 'amount')
      .where('o.deleted = 0')
      .groupBy(col)
      .orderBy('amount', 'DESC')
      .getRawMany();
    let nameOf: (k: any) => string = (k) => (k == null || k === '' ? '未指定' : String(k));
    if (dimension === 'factory') {
      const ids = rows.map((r) => +r.k).filter(Boolean);
      const fs = ids.length ? await this.orderRepo.manager.getRepository('factory').find({ where: ids.map((id) => ({ id })) as any }) : [];
      const byId = new Map((fs as any[]).map((f) => [+f.id, f.short_name || f.name]));
      nameOf = (k) => (k ? byId.get(+k) ?? `工厂#${k}` : '未指定');
    }
    return rows.map((r) => ({
      key: nameOf(r.k),
      count: +r.cnt,
      qtyTotal: +r.qty,
      amountTotal: +(+r.amount).toFixed(2),
    }));
  }

  async funnel() {
    const [samples, quotes, orders, wonQuotes] = await Promise.all([
      this.sampleRepo.count({ where: { deleted: 0 } }),
      this.quoteRepo.count({ where: { deleted: 0 } }),
      this.orderRepo.count({ where: { deleted: 0 } }),
      this.quoteRepo.count({ where: { deleted: 0, status: QuoteStatus.ORDERED } }),
    ]);
    return {
      samples,
      quotes,
      orders,
      wonQuotes,
      sampleToQuoteRate: StatsService.rate(quotes, samples), // 样衣→报价
      quoteToOrderRate: StatsService.rate(wonQuotes, quotes), // 报价→成单
      overallRate: StatsService.rate(orders, samples), // 样衣→订单
    };
  }

  // 成单率：按业务员 或 按客户（成单 = 报价状态已成单 ORDERED）
  async winRate(dimension: 'salesperson' | 'customer') {
    const quotes = await this.quoteRepo.find({ where: { deleted: 0 } });
    const map = new Map<string, { name: string; total: number; won: number }>();
    for (const q of quotes) {
      const key = dimension === 'customer'
        ? (q.middleman_name || `客户#${q.customer_id}`)
        : (q.salesperson || '未指定');
      const row = map.get(key) ?? { name: key, total: 0, won: 0 };
      row.total += 1;
      if (q.status === QuoteStatus.ORDERED) row.won += 1;
      map.set(key, row);
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, rate: StatsService.rate(r.won, r.total) }))
      .sort((a, b) => b.total - a.total);
  }

  // 利润汇总：按款号 / 月份 / 客户，含毛利率%，净利<0 标亏损预警
  async profit(dimension: 'style' | 'month' | 'customer') {
    const settlements = await this.settlementRepo.find({ where: { deleted: 0 } });
    const map = new Map<string, {
      key: string; count: number; settleAmount: number;
      grossProfit: number; netProfit: number; netProfitExRefund: number;
    }>();
    for (const s of settlements) {
      let key: string;
      if (dimension === 'month') {
        const d = s.created_at ? new Date(s.created_at) : null;
        key = d && !isNaN(d.getTime())
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          : '未知';
      } else if (dimension === 'customer') {
        key = s.customer_name || '未指定客户';
      } else {
        key = s.style_no || '未指定';
      }
      const row = map.get(key) ?? {
        key, count: 0, settleAmount: 0, grossProfit: 0, netProfit: 0, netProfitExRefund: 0,
      };
      row.count += 1;
      row.settleAmount += +s.settle_amount || 0;
      row.grossProfit += +s.gross_profit || 0;
      row.netProfit += +s.net_profit || 0;
      row.netProfitExRefund += +s.net_profit_ex_refund || 0;
      map.set(key, row);
    }
    return Array.from(map.values())
      .map((r) => ({
        key: r.key,
        count: r.count,
        settleAmount: +r.settleAmount.toFixed(2),
        grossProfit: +r.grossProfit.toFixed(2),
        grossMargin: r.settleAmount > 0 ? +((r.grossProfit / r.settleAmount) * 100).toFixed(1) : 0, // 毛利率%
        netProfit: +r.netProfit.toFixed(2),
        netProfitExRefund: +r.netProfitExRefund.toFixed(2),
        loss: r.netProfit < 0, // 亏损预警
      }))
      .sort((a, b) => a.netProfit - b.netProfit); // 亏损靠前
  }
}
