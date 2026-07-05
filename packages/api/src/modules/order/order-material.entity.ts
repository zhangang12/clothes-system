import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('order_material')
export class OrderMaterial {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  order_id: number;

  @Column({ type: 'bigint', nullable: true })
  quote_item_id: number;

  @Column({ length: 100 })
  item_name: string; // 品名（报价带入，可改）

  @Column({ length: 50, nullable: true })
  part: string; // 部位

  @Column({ length: 50, nullable: true })
  width: string; // 门幅/尺寸

  @Column({ length: 100, nullable: true })
  color: string; // 颜色

  @Column({ length: 100, nullable: true })
  composition: string; // 成份

  @Column({ length: 100, nullable: true })
  supplier: string; // 供应商

  @Column({ length: 10, default: 'NONE' })
  split_mode: string; // 拆分 NONE/BY_SIZE/BY_COLOR

  @Column({ length: 20, nullable: true })
  unit: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  net_usage: number; // 单件耗用

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  loss_rate: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  loss_usage: number;

  @Column({ type: 'int', nullable: true })
  qty: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  total_purchase: number; // 系统采购量 = 大货总数×单件耗用×(1+损耗%)

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  final_purchase: number; // 最终采购量（业务微调，超±10%需确认）

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  unit_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  budget: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;
}
