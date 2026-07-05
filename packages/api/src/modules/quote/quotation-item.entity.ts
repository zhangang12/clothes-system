import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// 报价明细（从样衣导入，客户报价设计稿 §报价明细，12 字段）
@Entity('quotation_item')
export class QuotationItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  quote_id: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ length: 50, nullable: true })
  part: string; // 部位

  @Column({ length: 100 })
  item_name: string; // 品名

  @Column({ length: 30, nullable: true })
  width: string; // 门幅

  @Column({ length: 50, nullable: true })
  color: string; // 颜色

  @Column({ length: 100, nullable: true })
  supplier: string; // 供应商（PDF 隐藏）

  @Column({ length: 20, nullable: true })
  unit: string; // 计量单位

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  quote_usage: number; // 报价耗用

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  rmb_price: number; // 人民币单价

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  usd_price: number; // 美金单价（自动）

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 3 })
  loss_rate: number; // 损耗%（默认 3）

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  loss_amount: number; // 含损金额（自动）

  @Column({ length: 200, nullable: true })
  remark: string;
}
