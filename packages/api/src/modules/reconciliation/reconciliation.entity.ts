import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ReconcileType } from '@i9/types';

export enum ReconciliationStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',   // 待主管复核（业务员初审提交后）
  CONFIRMED = 'CONFIRMED',
  PAID = 'PAID',
}

@Entity('reconciliation')
export class Reconciliation {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 30, unique: true })
  reconcile_no: string;

  @Column({ type: 'enum', enum: ReconcileType, default: ReconcileType.CONTRACT })
  type: ReconcileType;

  @Column({ length: 20, nullable: true })
  sub_type: string; // 无合同空白对账单子类型：EXPENSE/CASH_NO_INVOICE/PREPAY（补充确认v1.1）

  @Column({ type: 'bigint', nullable: true })
  contract_id: number;

  @Column({ length: 200, nullable: true })
  style_no: string; // 款号（合同→订单带出，供检索；工时对账多款合并时为「款A 等N款」）

  @Column({ type: 'bigint', nullable: true })
  factory_id: number; // 供应商对账=加工厂/供应商；工时对账无工厂（用 patternmaker_id）

  // 工时对账（LABOR）：版师/打样间为受款方，多款合并
  @Column({ type: 'bigint', nullable: true })
  patternmaker_id: number;

  @Column({ length: 50, nullable: true })
  patternmaker_name: string;

  @Column({ length: 10, default: 'CNY' })
  currency: string; // 工时单价默认 CNY，特殊出口样衣可切币种留痕

  @Column({ length: 20, nullable: true })
  period: string; // 归属账期（如 2026-07，按月合并时填）

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  total_amount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  tax_rate: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  tax_amount: number;

  @Column({ length: 100, nullable: true })
  invoice_no: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  invoice_amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  invoice_diff: number;

  @Column({ length: 500, nullable: true })
  invoice_url: string;

  @Column({ type: 'tinyint', default: 0 })
  has_invoice: number;

  @Column({ type: 'enum', enum: ReconciliationStatus, default: ReconciliationStatus.DRAFT })
  status: ReconciliationStatus;

  @Column({ type: 'datetime', nullable: true })
  confirmed_at: Date;

  @Column({ type: 'varchar', length: 500, nullable: true })
  review_remark: string; // 主管复核批注 / 整单退回原因（补充确认：可逐批批注、整单退回）

  @Column({ type: 'varchar', length: 200, nullable: true })
  over_reason: string; // 超发放行原因（对账确认时业务勾选填写留痕,P2#28/补充B3）

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'bigint' })
  created_by: number;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
