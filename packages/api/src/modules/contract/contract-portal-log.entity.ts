import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum PortalOperatorType {
  INTERNAL = 'INTERNAL',
  SUPPLIER = 'SUPPLIER',
}

@Entity('contract_portal_log')
export class ContractPortalLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  contract_id: number;

  @Column({ length: 50 })
  action: string;

  @Column({ length: 100 })
  operator: string;

  @Column({ type: 'enum', enum: PortalOperatorType, default: PortalOperatorType.INTERNAL })
  operator_type: PortalOperatorType;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @CreateDateColumn()
  created_at: Date;
}
