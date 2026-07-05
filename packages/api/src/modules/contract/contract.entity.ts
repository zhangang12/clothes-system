import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ContractType, ContractPortalStatus, ApprovalStatus } from '@i9/types';

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

  @Column({ length: 200, nullable: true })
  ship_to_address: string; // 收货地址（发货时带入，设计稿 门户 C1）

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  shipped_qty: number; // 累计已发数量（批次累计，设计稿 门户 B3）

  @Column({ type: 'int', default: 90 })
  account_period_days: number; // 账期天数（材料90/加工45，发货日+账期=到期日）

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

  // 金额阈值审批（total_amount 超阈值时合同需主管审批后方可推送供应商）
  @Column({ type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.NONE })
  approval_status: ApprovalStatus;

  @Column({ type: 'bigint', nullable: true })
  approved_by: number;

  @Column({ type: 'datetime', nullable: true })
  approved_at: Date;

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
