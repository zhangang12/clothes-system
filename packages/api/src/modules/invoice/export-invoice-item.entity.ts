import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// 出口发票款项行（一票多款；Q3 推荐项：收汇按各款发票金额占比分摊）
@Entity('export_invoice_item')
export class ExportInvoiceItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  invoice_id: number;

  @Column({ type: 'bigint', nullable: true })
  order_id: number; // 关联订单——结算(按订单)据此拉取本款收汇份额

  @Column({ length: 60, nullable: true })
  style_no: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number; // 该款发票金额（分摊基数）
}
