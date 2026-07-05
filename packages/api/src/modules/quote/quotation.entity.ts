import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { QuoteStatus, ApprovalStatus } from '@i9/types';

@Entity('quotation')
export class Quotation {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 20, unique: true })
  quote_no: string;

  @Column({ type: 'date', nullable: true })
  inquiry_date: string;

  @Column({ type: 'bigint', nullable: true })
  sample_id: number;

  @Column({ length: 30, nullable: true })
  sample_no: string;

  // 中间商（= customer_id，保持与下游一致）
  @Column({ type: 'bigint' })
  customer_id: number;

  @Column({ length: 100, nullable: true })
  middleman_name: string;

  @Column({ type: 'bigint', nullable: true })
  buyer_id: number;

  @Column({ length: 100, nullable: true })
  buyer_name: string;

  @Column({ length: 30, nullable: true })
  buyer_no: string;

  @Column({ length: 100, nullable: true })
  style_no: string;

  @Column({ length: 50, nullable: true })
  middleman_contact: string;

  @Column({ length: 30, nullable: true })
  settlement_category: string;

  @Column({ length: 5, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 1 })
  exchange_rate: number;

  @Column({ length: 50, nullable: true })
  trade_country: string;

  @Column({ length: 50, nullable: true })
  settlement_method: string;

  @Column({ length: 50, nullable: true })
  price_terms: string;

  @Column({ length: 50, nullable: true })
  salesperson: string;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  profit_rate: number;

  @Column({ type: 'int', nullable: true })
  quote_qty: number;

  @Column({ length: 255, nullable: true })
  image1: string;

  @Column({ length: 255, nullable: true })
  image2: string;

  // 报价合计
  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true })
  rmb_total: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true })
  usd_total: number;

  @Column({ type: 'text', nullable: true })
  total_remark: string;

  @Column({ type: 'enum', enum: QuoteStatus, default: QuoteStatus.DRAFT })
  status: QuoteStatus;

  // 金额阈值审批（rmb_total 超阈值时报价需主管审批后方可置「已报价」）
  @Column({ type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.NONE })
  approval_status: ApprovalStatus;

  @Column({ type: 'bigint', nullable: true })
  approved_by: number;

  @Column({ type: 'datetime', nullable: true })
  approved_at: Date;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @Column({ type: 'bigint' })
  created_by: number;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
