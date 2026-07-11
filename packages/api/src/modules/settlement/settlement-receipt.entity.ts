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

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true, comment: '该笔收汇汇率(银行水单带入,逐笔×汇率)' })
  exchange_rate?: number;

  @Column({ length: 500, nullable: true, comment: '银行水单' })
  slip_url?: string;

  @Column({ length: 10, default: 'MANUAL', comment: 'MANUAL=手录 INVOICE=从出口发票分摊同步(Q12)' })
  source: string;

  @Column({ length: 50, nullable: true, comment: '来源出口发票号(INVOICE行)' })
  invoice_no?: string;

  @Column({ length: 255, nullable: true })
  remark?: string;

  @CreateDateColumn()
  created_at: Date;
}
