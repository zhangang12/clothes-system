import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { OrderStatus } from '@i9/types';

@Entity('order_main')
export class OrderMain {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 30, unique: true })
  order_no: string;

  @Column()
  customer_id: number;

  @Column({ nullable: true })
  quotation_id: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.DRAFT })
  status: OrderStatus;

  @Column({ length: 50, nullable: true })
  style_no: string;

  @Column({ type: 'date', nullable: true })
  delivery_date: Date;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  total_amount: number;

  @Column({ tinyint: true, default: 0 } as any)
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
