import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

// 前缀常量（对齐《系统开发手册》核心数据模型 · 编号规则）
export const NUM_PREFIX = {
  FACTORY: 'S',    // 厂商编号 S001（基础资料设计稿 §1.1 D2，nextGlobal 全局递增）
  CUSTOMER: 'CN',  // 客户编号（旧，保留兼容）
  CUSTOMER_MIDDLEMAN: 'CM', // 中间商编号 CM001（设计稿 A8）
  CUSTOMER_BUYER: 'FE',     // 最终买家编号 FE001（设计稿 A8）
  SAMPLE: 'S',     // 样衣编号 S-YYYYMMDD-序号（样衣设计稿 §D1，next 按日递增）
  QUOTATION: 'Q',
  ORDER: 'O',
  CONTRACT: 'HT',
  PAYMENT: 'PR',
  RECONCILIATION: 'DZ',
  SHIPMENT: 'FH',   // 发货单 FH-款号-序号（设计稿 补充确认 A2）
  SETTLEMENT: 'JS',
} as const;

/**
 * 发号服务：Redis 快路径 + DB 影子兜底（消除 Redis 硬单点，CLAUDE.md 待办）。
 *
 * 三态均不重号：
 * - Redis 正常：Lua INCR 发号后，同步把 sys_sequence 影子推进到 GREATEST(影子, 本号)——
 *   保证 Redis 突然挂掉时 DB 兜底的起点不落后；
 * - Redis 挂掉：捕获异常，改用 sys_sequence 行级原子发号（LAST_INSERT_ID(value+1)），
 *   建单只降速、不阻断；
 * - Redis 恢复但计数落后（兜底期间 DB 领先）：影子推进后检测 DB > Redis 号，
 *   放弃 Redis 发出的旧号，改用 DB 续发，并把 Redis SET 追平——自动切回快路径。
 *
 * 纯单测（无 DataSource）时退化为原 Redis-only 行为。
 */
@Injectable()
export class NumberingService {
  private readonly logger = new Logger(NumberingService.name);

  // 全局递增号(nextGlobal)的取数来源:计数器首次创建时用库中现有最大号做基线,
  // 避免与 init.sql 种子/存量数据撞号(如种子工厂 S001),同时兜底 Redis 数据丢失后从 001 重发。
  private static readonly GLOBAL_SOURCE: Record<string, { table: string; col: string }> = {
    S: { table: 'factory', col: 'factory_no' },
    CM: { table: 'customer', col: 'customer_no' },
    FE: { table: 'customer', col: 'customer_no' },
  };

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    // Optional:生产/集成环境由 TypeOrm 注入;纯单测(mock 仓储)不提供时退化为原发号行为。
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  /**
   * 生成带日期的流水号，格式：{prefix}-{YYYYMMDD}-{3位序号}
   * 例如：HT-20260705-001
   */
  async next(prefix: string, date?: Date): Promise<string> {
    const d = date ?? new Date();
    const ymd = this.formatDate(d);
    const key = `seq:${prefix}:${ymd}`;
    const seq = await this.allocate(key, () => this.redis.eval(
      `local v = redis.call('INCR', KEYS[1])
       if v == 1 then redis.call('EXPIRE', KEYS[1], 172800) end
       return v`,
      1,
      key,
    ) as Promise<number>);
    return `${prefix}-${ymd}-${String(seq).padStart(3, '0')}`;
  }

  /**
   * 生成带自定义段的流水号，格式：{prefix}-{segment}-{3位序号}
   * 用于 款号维度 编号：对账单 DZ-款号-序号、发货单 FH-款号-序号（设计稿 补充确认 A2）
   */
  async nextWithSegment(prefix: string, segment: string): Promise<string> {
    // 段(款号等)限长 20：避免嵌入长款号后单号超出列宽(settlement_no/reconcile_no/ship_no 均 VARCHAR(30))插入 500。
    // 完整款号仍存于各表 style_no 字段，单号中的段仅作可读标签。
    const seg = ((segment && String(segment).trim()) || 'NA').slice(0, 20);
    const key = `seq:${prefix}:${seg}`;
    const seq = await this.allocate(key, () => this.redis.eval(
      `local v = redis.call('INCR', KEYS[1])
       if v == 1 then redis.call('EXPIRE', KEYS[1], 2592000) end
       return v`,
      1,
      key,
    ) as Promise<number>);
    return `${prefix}-${seg}-${String(seq).padStart(3, '0')}`;
  }

  /**
   * 生成不带日期的全局递增号，格式：{prefix}{6位序号}
   * 用于工厂编号(CN001)、客户编号(S001)等永久性编号
   */
  async nextGlobal(prefix: string): Promise<string> {
    const key = `seq:global:${prefix}`;
    const seq = await this.allocate(
      key,
      async () => {
        // 计数器不存在时(全新装机 / Redis 数据丢失),用库中现有最大号做基线,避免撞号。
        if (this.dataSource && !(await this.redis.exists(key))) {
          const base = await this.currentMaxSeq(prefix);
          if (base > 0) await this.redis.set(key, base, 'NX');
        }
        return this.redis.incr(key);
      },
      () => this.currentMaxSeq(prefix), // DB 兜底首建时的基线（防撞 S001 种子）
    );
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  /**
   * 发号核心：Redis 快路径 → DB 影子推进/落后检测 → 异常时 DB 行锁兜底。
   */
  private async allocate(
    key: string,
    redisAlloc: () => Promise<number>,
    baseline?: () => Promise<number>,
  ): Promise<number> {
    let redisSeq: number | null = null;
    try {
      redisSeq = Number(await redisAlloc());
    } catch (e) {
      // Redis 挂了：DB 行锁兜底发号（降速不阻断；无 DataSource 的纯单测环境只能上抛）
      if (!this.dataSource) throw e;
      this.logger.warn(`Redis 发号失败，走 DB 兜底：${key}（${(e as Error).message}）`);
      return this.dbAllocate(key, baseline);
    }
    if (!this.dataSource) return redisSeq;

    // 影子推进 + 落后检测（同步一条 UPSERT + 一条 SELECT，建单低频可承受）
    try {
      await this.dataSource.query(
        'INSERT INTO sys_sequence (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = GREATEST(value, VALUES(value))',
        [key, redisSeq],
      );
      const rows = await this.dataSource.query('SELECT value FROM sys_sequence WHERE name = ?', [key]);
      const dbSeq = Number(rows?.[0]?.value ?? 0);
      if (dbSeq > redisSeq) {
        // Redis 恢复但计数落后（兜底期间 DB 已发到 dbSeq）：放弃旧号，DB 续发并把 Redis 追平
        const seq = await this.dbAllocate(key, baseline);
        await this.redis.set(key, seq).catch(() => undefined);
        this.logger.warn(`Redis 计数落后（redis=${redisSeq} < db=${dbSeq}），已用 DB 续发 ${seq} 并追平 Redis：${key}`);
        return seq;
      }
    } catch {
      // 影子推进失败不阻断发号（尽力而为；极端时序下兜底可能撞唯一索引报错重试，不静默错号）
    }
    return redisSeq;
  }

  /** DB 行级原子发号（同一 queryRunner 保证 LAST_INSERT_ID 会话一致） */
  private async dbAllocate(key: string, baseline?: () => Promise<number>): Promise<number> {
    const qr = this.dataSource!.createQueryRunner();
    try {
      const base = baseline ? await baseline() : 0;
      const res: any = await qr.query(
        'INSERT INTO sys_sequence (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = LAST_INSERT_ID(value + 1)',
        [key, base + 1],
      );
      if (Number(res?.affectedRows) === 1) return base + 1; // 首建：直接以基线+1 起号
      const rows = await qr.query('SELECT LAST_INSERT_ID() AS v');
      return Number(rows?.[0]?.v);
    } finally {
      await qr.release();
    }
  }

  /** 查库中该前缀现有最大序号(仅用于全局号基线,前缀取自固定白名单,非用户输入) */
  private async currentMaxSeq(prefix: string): Promise<number> {
    const src = NumberingService.GLOBAL_SOURCE[prefix];
    if (!src || !this.dataSource) return 0;
    const start = prefix.length + 1;
    try {
      const rows = await this.dataSource.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(\`${src.col}\`, ${start}) AS UNSIGNED)), 0) AS m
         FROM \`${src.table}\` WHERE \`${src.col}\` LIKE ?`,
        [`${prefix}%`],
      );
      return Number(rows?.[0]?.m ?? 0);
    } catch {
      return 0; // 查询失败时退化为原行为,不阻断发号
    }
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }
}
