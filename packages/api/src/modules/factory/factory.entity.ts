import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { FactoryType } from '@i9/types';

@Entity('factory')
export class Factory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20, unique: true })
  factory_no: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'enum', enum: FactoryType, default: FactoryType.BOTH })
  type: FactoryType;

  @Column({ length: 20, nullable: true })
  contact_person: string;

  @Column({ length: 20, nullable: true })
  contact_phone: string;

  @Column({ length: 255, nullable: true })
  address: string;

  @Column({ length: 100, nullable: true })
  bank_name: string;

  @Column({ length: 30, nullable: true })
  bank_account: string;

  @Column({ length: 20, nullable: true })
  tax_id: string;

  @Column({ tinyint: true, default: 0 } as any)
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
