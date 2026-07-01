import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('settlement_receipt')
export class SettlementReceipt {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  settlement_id: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number;

  @Column({ type: 'date' })
  receipt_date: Date;

  @Column({ length: 255, nullable: true })
  remark?: string;

  @CreateDateColumn()
  created_at: Date;
}
