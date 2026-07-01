import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ContractType, ContractPortalStatus } from '@i9/types';

export enum ContractStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('contract')
export class Contract {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 20, unique: true })
  contract_no: string;

  @Column({ type: 'enum', enum: ContractType })
  type: ContractType;

  @Column({ type: 'bigint', nullable: true })
  parent_id: number;

  @Column({ type: 'bigint' })
  factory_id: number;

  @Column({ type: 'bigint' })
  order_id: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  total_amount: number;

  @Column({ length: 5, default: 'CNY' })
  currency: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 30 })
  deposit_ratio: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 40 })
  mid_ratio: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 30 })
  final_ratio: number;

  @Column({ type: 'date', nullable: true })
  last_ship_date: Date;

  @Column({ type: 'int', default: 45 })
  account_period_days: number;

  @Column({ type: 'date', nullable: true })
  due_date: Date;

  @Column({ type: 'enum', enum: ContractPortalStatus, default: ContractPortalStatus.DRAFT })
  portal_status: ContractPortalStatus;

  @Column({ type: 'datetime', nullable: true })
  pushed_at: Date;

  @Column({ type: 'datetime', nullable: true })
  stamped_at: Date;

  @Column({ length: 100, nullable: true })
  stamped_by_supplier: string;

  @Column({ type: 'json', nullable: true })
  snapshot_json: Record<string, unknown>;

  @Column({ type: 'enum', enum: ContractStatus, default: ContractStatus.ACTIVE })
  status: ContractStatus;

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
