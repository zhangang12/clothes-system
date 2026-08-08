import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('contract_material')
export class ContractMaterial {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  contract_id: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ length: 100 })
  item_name: string;

  @Column({ length: 200, nullable: true })
  spec: string;

  // ── 拉链三件套：样衣→报价→订单→合同 整条链带下来（2026-08-08）──────────
  // 供应商合同按真实版式要把「拉头/拉齿/码带」各自成列，塞进 spec 拼串是印不出来的。
  @Column({ length: 50, nullable: true })
  puller: string; // 拉头

  @Column({ length: 50, nullable: true })
  zipper_teeth: string; // 拉齿

  @Column({ length: 50, nullable: true })
  code_band: string; // 码带


  @Column({ length: 20, nullable: true })
  unit: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  unit_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  qty: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number;

  @Column({ length: 20, nullable: true })
  qty_source: string; // 数量来源标注：采购量含损耗 / 大货数（设计稿 合同 C3）

  // ===== 编辑页扩展列（设计稿 04-合同 v1.3 货物明细）=====
  @Column({ length: 200, nullable: true })
  color: string; // 颜色（分色行）

  @Column({ length: 30, nullable: true })
  size: string; // 尺码/码（分码行）

  @Column({ length: 50, nullable: true })
  style_no: string; // 款号（多款号同表随行标注）

  @Column({ type: 'date', nullable: true })
  delivery_date: Date; // 行交货期限（材料默认=款交期−45天，可改）

  @Column({ length: 500, nullable: true })
  photo_url: string; // 材料照片 URL（可粘贴/上传，v1.1 末列）

  @Column({ length: 200, nullable: true })
  remark: string;

  // 来源订单材料行：由「按供应商拆单」生成合同时写入，供订单编辑页精确标出哪几行已生成合同。
  // 手工新建/手工改过明细的合同行为 null（订单侧即显示未标记）。
  @Column({ type: 'bigint', nullable: true })
  order_material_id: number | null;
}
