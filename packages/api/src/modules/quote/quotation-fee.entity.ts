import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// 费用明细（客户报价设计稿 §费用明细，4 字段，新建自动带 6 行）
@Entity('quotation_fee')
export class QuotationFee {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  quote_id: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ length: 50 })
  fee_name: string; // 费用名称

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  rmb_price: number; // 人民币单价

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  usd_price: number; // 美金单价（自动）

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 1 })
  quote_usage: number; // 报价耗用（默认 1）
}
