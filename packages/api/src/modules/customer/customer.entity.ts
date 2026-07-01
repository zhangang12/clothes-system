import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CustomerGrade } from '@i9/types';

@Entity('customer')
export class Customer {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 10, unique: true })
  customer_no: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, nullable: true })
  short_name: string;

  @Column({ type: 'enum', enum: CustomerGrade, default: CustomerGrade.B })
  grade: CustomerGrade;

  @Column({ length: 5, default: 'USD' })
  currency: string;

  @Column({ length: 50, nullable: true })
  payment_method: string;

  @Column({ length: 50, nullable: true })
  country: string;

  @Column({ length: 50, nullable: true })
  contact_name: string;

  @Column({ length: 100, nullable: true })
  contact_email: string;

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
