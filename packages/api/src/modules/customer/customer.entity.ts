import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CustomerGrade } from '@i9/types';

@Entity('customer')
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20, unique: true })
  customer_no: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'enum', enum: CustomerGrade, default: CustomerGrade.B })
  grade: CustomerGrade;

  @Column({ length: 3, default: 'CNY' })
  currency: string;

  @Column({ length: 20, nullable: true })
  payment_method: string;

  @Column({ length: 20, nullable: true })
  contact_person: string;

  @Column({ length: 20, nullable: true })
  contact_phone: string;

  @Column({ tinyint: true, default: 0 } as any)
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
