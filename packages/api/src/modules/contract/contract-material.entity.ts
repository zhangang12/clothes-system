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

  @Column({ length: 100, nullable: true })
  spec: string;

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
  @Column({ length: 50, nullable: true })
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
}
