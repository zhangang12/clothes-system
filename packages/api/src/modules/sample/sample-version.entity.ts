import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// 变更记录动作（样衣设计稿 §A 变更记录分组）
export enum SampleAction {
  CREATE = 'CREATE',                       // 创建
  UPDATE = 'UPDATE',                       // 修改
  PUSH = 'PUSH',                           // 推送版师
  PATTERNMAKER_SAVE = 'PATTERNMAKER_SAVE', // 版师保存
  SHIP = 'SHIP',                           // 已寄出
  COMPLETE = 'COMPLETE',                   // 已完成
  COPY = 'COPY',                           // 复制
}

@Entity('sample_version')
export class SampleVersion {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  sample_id: number;

  @Column({ type: 'int' })
  version: number;

  @Column({ length: 40 })
  action: string;

  @Column({ type: 'bigint' })
  operator_id: number;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @Column({ type: 'json', nullable: true })
  attachments: string[];

  @CreateDateColumn()
  created_at: Date;
}
