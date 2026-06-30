import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { ContractPortalStatus } from '@i9/types';

@Entity('contract_portal_log')
export class ContractPortalLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  contract_id: number;

  @Column({ type: 'enum', enum: ContractPortalStatus })
  action: ContractPortalStatus;

  @Column({ nullable: true })
  operator_id: number;

  @Column({ length: 255, nullable: true })
  remark: string;

  @CreateDateColumn()
  created_at: Date;
}
