import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

// 前缀常量（对齐《系统开发手册》核心数据模型 · 编号规则）
export const NUM_PREFIX = {
  FACTORY: 'CN',
  CUSTOMER: 'S',
  SAMPLE: 'S',
  QUOTATION: 'Q',
  ORDER: 'O',
  CONTRACT: 'HT',
  PAYMENT: 'PR',
  RECONCILIATION: 'DZ',
  SETTLEMENT: 'JS',
} as const;

@Injectable()
export class NumberingService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * 生成带日期的流水号，格式：{prefix}-{YYYYMMDD}-{3位序号}
   * 例如：HT-20260705-001
   */
  async next(prefix: string, date?: Date): Promise<string> {
    const d = date ?? new Date();
    const ymd = this.formatDate(d);
    const key = `seq:${prefix}:${ymd}`;
    // Atomic INCR + conditional EXPIRE in one Lua round-trip
    const seq = await this.redis.eval(
      `local v = redis.call('INCR', KEYS[1])
       if v == 1 then redis.call('EXPIRE', KEYS[1], 172800) end
       return v`,
      1,
      key,
    ) as number;
    return `${prefix}-${ymd}-${String(seq).padStart(3, '0')}`;
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
