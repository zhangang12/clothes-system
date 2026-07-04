import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CustomerGrade, CustomerType } from '@i9/types';

@Entity('customer')
export class Customer {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 20, unique: true })
  customer_no: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, nullable: true })
  short_name: string;

  @Column({ type: 'enum', enum: CustomerType, default: CustomerType.MIDDLEMAN })
  type: CustomerType;

  // 关联中间商（type=BUYER 时必填，存中间商客户ID逗号串）
  @Column({ length: 200, nullable: true })
  related_middleman: string;

  @Column({ length: 50, nullable: true })
  trade_country: string;

  @Column({ length: 50, nullable: true })
  country_region: string;

  @Column({ length: 50, nullable: true })
  city: string;

  @Column({ length: 200, nullable: true })
  homepage: string;

  @Column({ length: 200, nullable: true })
  address: string;

  @Column({ length: 50, nullable: true })
  price_terms: string;

  @Column({ length: 50, nullable: true })
  settlement_method: string;

  @Column({ type: 'enum', enum: CustomerGrade, nullable: true })
  grade: CustomerGrade;

  @Column({ length: 20, nullable: true })
  cooperation_level: string;

  @Column({ length: 50, nullable: true })
  customer_source: string;

  @Column({ type: 'int', nullable: true })
  payment_days: number;

  @Column({ length: 200, nullable: true })
  business_scope: string;

  @Column({ length: 50, nullable: true })
  salesperson: string;

  @Column({ type: 'date', nullable: true })
  develop_date: string;

  @Column({ length: 100, nullable: true })
  spare1: string;

  @Column({ length: 100, nullable: true })
  spare2: string;

  @Column({ length: 100, nullable: true })
  spare3: string;

  @Column({ type: 'text', nullable: true })
  delivery_address: string;

  @Column({ type: 'text', nullable: true })
  front_mark: string;

  @Column({ type: 'text', nullable: true })
  side_mark: string;

  @Column({ type: 'text', nullable: true })
  inner_box_text: string;

  @Column({ type: 'text', nullable: true })
  customer_remark: string;

  @Column({ length: 5, default: 'USD' })
  currency: string;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @Column({ type: 'bigint', nullable: true })
  created_by: number;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
