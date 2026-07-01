import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { FactoryType } from '@i9/types';

@Entity('factory')
export class Factory {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 10, unique: true })
  factory_no: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, nullable: true })
  short_name: string;

  @Column({ type: 'enum', enum: FactoryType, default: FactoryType.MATERIAL })
  type: FactoryType;

  @Column({ length: 50, nullable: true })
  contact_name: string;

  @Column({ length: 20, nullable: true })
  contact_phone: string;

  @Column({ length: 200, nullable: true })
  address: string;

  @Column({ length: 100, nullable: true })
  bank_name: string;

  @Column({ length: 30, nullable: true })
  bank_account: string;

  @Column({ length: 20, nullable: true })
  tax_no: string;

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
