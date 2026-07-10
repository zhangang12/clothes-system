import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// 发货批次物料行（P3#30：逐物料行带入、分行填实发数；批次金额=Σ行金额，比整单加权更准）
@Entity('contract_shipment_item')
export class ContractShipmentItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  shipment_id: number;

  @Column({ type: 'bigint', nullable: true })
  material_id: number; // 合同材料行

  @Column({ length: 100, nullable: true })
  item_name: string; // 品名快照

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  qty: number; // 本行实发数

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  unit_price: number; // 行单价快照（合同材料价）

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  amount: number; // 行金额 = 单价 × 实发数

  @CreateDateColumn()
  created_at: Date;
}
