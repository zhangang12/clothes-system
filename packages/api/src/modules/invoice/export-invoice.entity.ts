import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// 出口发票（收入侧留痕，结算Q12 推荐项）：订单→出口发票→收汇逐笔留痕，结算按订单份额拉取
@Entity('export_invoice')
export class ExportInvoice {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 50, unique: true })
  invoice_no: string;

  @Column({ type: 'date', nullable: true })
  invoice_date: string;

  @Column({ length: 5, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  total_amount: number; // 发票总额 = Σ款项行（拼柜一票多款）

  @Column({ length: 100, nullable: true })
  customer_name: string;

  @Column({ length: 255, nullable: true })
  remark: string;

  @Column({ type: 'bigint', nullable: true })
  created_by: number;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
