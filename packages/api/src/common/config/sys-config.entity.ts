import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

// 系统配置键值表（既有表：金额审批阈值、增值税率、定金比例等，阈值可配）
@Entity('sys_config')
export class SysConfig {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 50 })
  cfg_key: string;

  @Column({ length: 200 })
  cfg_value: string;

  @Column({ length: 200, nullable: true })
  remark: string;

  @Column({ type: 'bigint', nullable: true })
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;
}
