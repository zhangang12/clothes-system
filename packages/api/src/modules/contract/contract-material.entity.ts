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

  @Column({ length: 200, nullable: true })
  remark: string;
}
