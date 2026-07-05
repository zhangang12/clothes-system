import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('settlement_cost')
export class SettlementCost {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  settlement_id: number;

  @Column({ length: 100 })
  cost_name: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number;

  @Column({ type: 'tinyint', default: 1, comment: '1=有票 0=无票' })
  has_invoice: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 13, comment: '该行税率%(有票按此换不含税,禁一刀切13)' })
  tax_rate: number;

  @CreateDateColumn()
  created_at: Date;
}
