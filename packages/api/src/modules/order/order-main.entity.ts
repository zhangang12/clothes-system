import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { OrderStatus } from '@i9/types';

@Entity('order_main')
export class OrderMain {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 20, unique: true })
  order_no: string;

  @Column({ length: 50, nullable: true })
  customer_po: string;

  @Column({ type: 'bigint' })
  customer_id: number;

  @Column({ type: 'bigint', nullable: true })
  quote_id: number;

  @Column({ length: 100, nullable: true })
  style_name: string;

  @Column({ type: 'date', nullable: true })
  delivery_date: Date;

  @Column({ type: 'int', default: 0 })
  qty_total: number;

  @Column({ length: 5, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  unit_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  total_amount: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.DRAFT })
  status: OrderStatus;

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
