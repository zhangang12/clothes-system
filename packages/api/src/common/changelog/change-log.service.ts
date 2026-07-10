import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChangeLog } from './change-log.entity';

export interface FieldDiff { field: string; old?: unknown; new?: unknown }

// 改值留痕（P2#21）：diff 记录「原值X→改为Y」；留痕失败不阻断业务（尽力而为）
@Injectable()
export class ChangeLogService {
  constructor(@InjectRepository(ChangeLog) private readonly repo: Repository<ChangeLog>) {}

  private str(v: unknown): string | null {
    if (v === undefined || v === null || v === '') return null;
    return String(v).slice(0, 500);
  }

  async record(bizType: string, bizId: number, diffs: FieldDiff[], operatorId?: number): Promise<void> {
    const rows = diffs
      .filter((d) => this.str(d.old) !== this.str(d.new))
      .map((d) => this.repo.create({
        biz_type: bizType, biz_id: bizId, field: d.field,
        old_value: this.str(d.old) ?? undefined, new_value: this.str(d.new) ?? undefined,
        operator_id: operatorId ?? null as any,
      }));
    if (!rows.length) return;
    try { await this.repo.save(rows); } catch { /* 留痕尽力而为,不阻断业务 */ }
  }

  async list(bizType: string, bizId: number): Promise<ChangeLog[]> {
    return this.repo.find({ where: { biz_type: bizType, biz_id: bizId }, order: { id: 'DESC' }, take: 100 });
  }
}
