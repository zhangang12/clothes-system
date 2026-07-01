import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { QuoteStatus } from '@i9/types';

@Entity('quotation')
export class Quotation {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 20, unique: true })
  quote_no: string;

  @Column({ type: 'bigint' })
  customer_id: number;

  @Column({ type: 'bigint', nullable: true })
  sample_id: number;

  @Column({ length: 100, nullable: true })
  style_name: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  global_loss_rate: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  unit_price: number;

  @Column({ length: 5, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  gross_margin: number;

  @Column({ type: 'int', nullable: true })
  total_qty: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  total_amount: number;

  @Column({ type: 'enum', enum: QuoteStatus, default: QuoteStatus.DRAFT })
  status: QuoteStatus;

  @Column({ type: 'datetime', nullable: true })
  sent_at: Date;

  @Column({ type: 'datetime', nullable: true })
  confirmed_at: Date;

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
