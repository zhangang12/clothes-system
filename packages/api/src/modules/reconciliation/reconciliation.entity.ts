import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ReconcileType } from '@i9/types';

@Entity('reconciliation')
export class Reconciliation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 30, unique: true })
  reconcile_no: string;

  @Column()
  factory_id: number;

  @Column({ type: 'enum', enum: ReconcileType })
  type: ReconcileType;

  @Column({ type: 'date' })
  period_start: Date;

  @Column({ type: 'date' })
  period_end: Date;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  total_amount: number;

  @Column({ tinyint: true, default: 0 } as any)
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
