import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// 出口发票逐笔收汇（多笔多汇率留痕，结算Q12/Q13）
@Entity('invoice_receipt')
export class InvoiceReceipt {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  invoice_id: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number; // 该笔收汇金额(USD)

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  exchange_rate: number; // 该笔汇率（银行水单）

  @Column({ type: 'date' })
  receipt_date: string;

  @Column({ length: 500, nullable: true })
  slip_url: string;

  @Column({ length: 255, nullable: true })
  remark: string;

  @CreateDateColumn()
  created_at: Date;
}
