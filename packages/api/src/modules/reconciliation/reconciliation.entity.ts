import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ReconcileType } from '@i9/types';

export enum ReconciliationStatus {
  DRAFT = 'DRAFT',
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

  @Column({ type: 'bigint', nullable: true })
  contract_id: number;

  @Column({ length: 60, nullable: true })
  style_no: string; // 款号（合同→订单带出，供检索）

  @Column({ type: 'bigint' })
  factory_id: number;

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
