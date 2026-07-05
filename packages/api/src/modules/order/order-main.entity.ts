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

  @Column({ length: 100, nullable: true })
  style_no: string; // 客户款号

  @Column({ length: 100, nullable: true })
  middleman_name: string; // 中间商名称（报价带入）

  @Column({ type: 'bigint', nullable: true })
  buyer_id: number;

  @Column({ length: 100, nullable: true })
  buyer_name: string; // 最终买家（报价带入）

  @Column({ type: 'date', nullable: true })
  delivery_date: Date;

  @Column({ type: 'int', default: 0 })
  qty_total: number;

  @Column({ length: 5, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  unit_price: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  commission_rate: number; // 佣金%

  @Column({ type: 'bigint', nullable: true })
  factory_id: number; // 生产工厂（可后填，绑定订单）

  @Column({ length: 50, nullable: true })
  salesperson: string; // 外销员

  @Column({ type: 'date', nullable: true })
  make_date: string; // 制单日期

  @Column({ type: 'varchar', length: 10, default: 'NONE' })
  split_mode: string; // 整单核算模式 NONE/BY_SIZE/BY_COLOR

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
