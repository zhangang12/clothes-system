import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

// 前缀常量
export const NUM_PREFIX = {
  FACTORY: 'CN',
  CUSTOMER: 'S',
  QUOTATION: 'Q',
  ORDER: 'SO',
  CONTRACT: 'CT',
  PAYMENT: 'PR',
  RECONCILIATION: 'RC',
  SETTLEMENT: 'SL',
} as const;

@Injectable()
export class NumberingService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * 生成带日期的流水号，格式：{prefix}{YYYYMMDD}{5位序号}
   * 例如：CN2024060100001
   */
  async next(prefix: string, date?: Date): Promise<string> {
    const d = date ?? new Date();
    const ymd = this.formatDate(d);
    const key = `seq:${prefix}:${ymd}`;
    const seq = await this.redis.incr(key);
    // 首次创建时设 24 小时 TTL，避免无限增长
    if (seq === 1) {
      await this.redis.expire(key, 86400 * 2);
    }
    return `${prefix}${ymd}${String(seq).padStart(5, '0')}`;
  }

  /**
   * 生成不带日期的全局递增号，格式：{prefix}{6位序号}
   * 用于工厂编号(CN001)、客户编号(S001)等永久性编号
   */
  async nextGlobal(prefix: string): Promise<string> {
    const key = `seq:global:${prefix}`;
    const seq = await this.redis.incr(key);
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }
}
