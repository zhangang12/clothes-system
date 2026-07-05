import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// 样衣·材料明细子表（样衣设计稿 §A 材料明细，17 字段）
@Entity('sample_material')
export class SampleMaterial {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  sample_id: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'date', nullable: true })
  arrange_date: string;

  @Column({ length: 100, nullable: true })
  item_name: string; // 品名

  @Column({ length: 30, nullable: true })
  width: string; // 门幅

  @Column({ length: 200, nullable: true })
  colors: string; // 颜色（动态多列，逗号分隔）

  @Column({ length: 50, nullable: true })
  part: string; // 部位

  @Column({ length: 100, nullable: true })
  composition: string; // 成份

  @Column({ length: 50, nullable: true })
  code_band: string; // 码带

  @Column({ length: 30, nullable: true })
  zipper_length: string; // 拉链长度（版师）

  @Column({ length: 30, nullable: true })
  puller: string; // 拉头

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  qty: number; // 数量

  @Column({ length: 50, nullable: true })
  size: string; // 尺寸(长×宽)

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  ref_price: number; // 参考价格

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  actual_usage: number; // 实际耗用（版师）

  @Column({ type: 'bigint', nullable: true })
  supplier_id: number; // 供应商编号

  @Column({ length: 100, nullable: true })
  supplier_name: string; // 供应商名称（自动带出）

  @Column({ length: 255, nullable: true })
  image: string;

  @Column({ length: 200, nullable: true })
  remark: string;
}
