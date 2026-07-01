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

  @Column({ length: 500, nullable: true })
  slip_url: string;

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
