import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ReconcileType, PaymentApprovalStatus } from '@i9/types';

@Entity('payment_request')
export class PaymentRequest {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 30, unique: true })
  pr_no: string;

  @Column({ type: 'enum', enum: ReconcileType, default: ReconcileType.CONTRACT })
  type: ReconcileType;

  @Column({ type: 'bigint', nullable: true })
  reconcile_id: number;

  @Column({ type: 'bigint' })
  factory_id: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  prepay_offset: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  actual_pay: number;

  // ===== 账期/到期日（设计稿 06 v1.4：账期取合同结算条款；到期日=出货日+账期，临近/逾期高亮）=====
  @Column({ type: 'int', nullable: true })
  account_period_days: number; // 结算账期（合同带入：材料90/加工45，可人工改）

  @Column({ type: 'date', nullable: true })
  due_date: Date; // 到期日 = 出货(最后发货)日 + 账期

  // ===== 分批付款（设计稿 06 v1.1：多次付款自动累计已付/未付，余额=0 整单转已付清）=====
  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  paid_total: number; // 已付总额（Σ payment_record.amount）

  @Column({ length: 500, nullable: true })
  slip_url: string;

  @Column({ length: 100, nullable: true })
  bank_name: string; // 收款银行（无合同付款补字段，P3#40/对账E3）

  @Column({ length: 50, nullable: true })
  bank_account: string; // 收款账号

  @Column({ length: 60, nullable: true })
  related_style_no: string; // 相关款号（无合同付款归集用）

  @Column({ type: 'bigint', nullable: true })
  paid_by: number;

  @Column({ type: 'datetime', nullable: true })
  slip_uploaded_at: Date;

  @Column({ type: 'enum', enum: PaymentApprovalStatus, default: PaymentApprovalStatus.DRAFT })
  approval_status: PaymentApprovalStatus;

  @Column({ type: 'bigint', nullable: true })
  submitted_by: number;

  @Column({ type: 'datetime', nullable: true })
  submitted_at: Date;

  @Column({ type: 'bigint', nullable: true })
  approved_by: number;

  @Column({ type: 'datetime', nullable: true })
  approved_at: Date;

  @Column({ type: 'text', nullable: true })
  reject_reason: string;

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
