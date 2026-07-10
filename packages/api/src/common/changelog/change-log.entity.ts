import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// 改值留痕（P2#21）：原值X→改为Y；field 也可为事件名(RECALC/REOPEN,new_value 存快照摘要)
@Entity('change_log')
export class ChangeLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 20 })
  biz_type: string; // QUOTE/ORDER/CONTRACT/SETTLEMENT

  @Column({ type: 'bigint' })
  biz_id: number;

  @Column({ length: 50 })
  field: string;

  @Column({ length: 500, nullable: true })
  old_value?: string;

  @Column({ length: 500, nullable: true })
  new_value?: string;

  @Column({ type: 'bigint', nullable: true })
  operator_id?: number;

  @CreateDateColumn()
  created_at: Date;
}
