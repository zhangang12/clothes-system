import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// 工时对账明细：一张 LABOR 对账单下勾选的每一款样衣工时快照（批次明细可点跳回样衣）
@Entity('reconciliation_labor_item')
export class ReconciliationLaborItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  reconcile_id: number;

  @Column({ type: 'bigint' })
  sample_id: number;

  @Column({ length: 30, nullable: true })
  sample_no: string;

  @Column({ length: 100, nullable: true })
  style_no: string; // 客户款号

  @Column({ type: 'int', nullable: true })
  piece_count: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  labor_unit_price: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  labor_amount: number;
}
