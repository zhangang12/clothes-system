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

  @Column({ length: 200, nullable: true })
  part: string; // 部位（多部位拼接可长）

  @Column({ length: 50, nullable: true })
  width: string; // 门幅/尺寸

  @Column({ length: 200, nullable: true })
  color: string; // 颜色

  @Column({ length: 100, nullable: true })
  composition: string; // 成份

  // ── 拉链三件套：样衣→报价→订单→合同 整条链带下来（2026-08-08）──────────
  // 供应商合同按真实版式要把「拉头/拉齿/码带」各自成列，塞进 spec 拼串是印不出来的。
  @Column({ length: 50, nullable: true })
  puller: string; // 拉头

  @Column({ length: 50, nullable: true })
  zipper_teeth: string; // 拉齿

  @Column({ length: 50, nullable: true })
  code_band: string; // 码带


  @Column({ length: 100, nullable: true })
  supplier: string; // 供应商

  @Column({ length: 10, default: 'NONE' })
  split_mode: string; // 拆分 NONE/BY_SIZE/BY_COLOR/BY_BOTH(颜色×尺码)。**列是 varchar(10)，新增取值别超 10 字符**

  // 各码尺寸（仅 BY_SIZE 材料）：{"S":"50","M":"52"}，拉链/织带等按码不同尺寸；空=各码同尺寸
  @Column({ type: 'json', nullable: true })
  size_specs: Record<string, string> | null;

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

  @Column({ type: 'tinyint', nullable: true })
  round_up: number; // 行内取整覆盖：1=强制取整/0=不取整/null=按单位自动（Q43）

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  unit_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  budget: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;
}
