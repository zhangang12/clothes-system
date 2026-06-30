import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { QuoteStatus } from '@i9/types';

@Entity('quotation')
export class Quotation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 30, unique: true })
  quote_no: string;

  @Column()
  customer_id: number;

  @Column({ nullable: true })
  garment_id: number;

  @Column({ type: 'enum', enum: QuoteStatus, default: QuoteStatus.DRAFT })
  status: QuoteStatus;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  total_amount: number;

  @Column({ tinyint: true, default: 0 } as any)
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
