import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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

  @Column({ tinyint: true, default: 1, comment: '1=有票 0=无票' } as any)
  has_invoice: number;
}
