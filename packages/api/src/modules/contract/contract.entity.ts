import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ContractType, ContractPortalStatus } from '@i9/types';

@Entity('contract')
export class Contract {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 30, unique: true })
  contract_no: string;

  @Column()
  order_id: number;

  @Column()
  factory_id: number;

  @Column({ type: 'enum', enum: ContractType })
  type: ContractType;

  @Column({ type: 'enum', enum: ContractPortalStatus, default: ContractPortalStatus.PENDING })
  portal_status: ContractPortalStatus;

  @Column({ type: 'json', nullable: true })
  snapshot_json: Record<string, unknown>;

  @Column({ tinyint: true, default: 0 } as any)
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
