import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SettlementStatus } from '@i9/types';

@Entity('settlement')
export class Settlement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 30, unique: true })
  settlement_no: string;

  @Column()
  order_id: number;

  @Column({ type: 'enum', enum: SettlementStatus, default: SettlementStatus.DRAFT })
  status: SettlementStatus;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  revenue: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  total_cost: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  net_profit: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  net_profit_ex_refund: number;

  @Column({ tinyint: true, default: 0 } as any)
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
