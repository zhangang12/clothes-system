import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SysConfig } from './sys-config.entity';
import { APPROVAL_THRESHOLD_KEYS } from '@i9/types';

@Injectable()
export class SysConfigService {
  constructor(
    @InjectRepository(SysConfig) private readonly repo: Repository<SysConfig>,
  ) {}

  async getNumber(key: string, fallback = 0): Promise<number> {
    const row = await this.repo.findOne({ where: { cfg_key: key } });
    if (!row || row.cfg_value == null || row.cfg_value === '') return fallback;
    const n = Number(row.cfg_value);
    return Number.isNaN(n) ? fallback : n;
  }

  async set(key: string, value: string, remark?: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { cfg_key: key } });
    if (existing) {
      existing.cfg_value = value;
      if (remark !== undefined) existing.remark = remark;
      await this.repo.save(existing);
    } else {
      await this.repo.save(this.repo.create({ cfg_key: key, cfg_value: value, remark }));
    }
  }

  // 金额审批阈值（0 或未配 = 不启用审批闸门）
  async getThresholds() {
    const [quote, order, contract] = await Promise.all([
      this.getNumber(APPROVAL_THRESHOLD_KEYS.QUOTE),
      this.getNumber(APPROVAL_THRESHOLD_KEYS.ORDER),
      this.getNumber(APPROVAL_THRESHOLD_KEYS.CONTRACT),
    ]);
    return { quote, order, contract };
  }
}
