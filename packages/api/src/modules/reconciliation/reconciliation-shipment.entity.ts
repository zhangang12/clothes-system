import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('reconciliation_shipment')
export class ReconciliationShipment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  reconcile_id: number;

  @Column({ type: 'bigint' })
  shipment_id: number;

  // 一单多合同：本批次来源合同/款号（批次明细可点跳，设计稿 对账·一单多合同）
  @Column({ type: 'bigint', nullable: true })
  contract_id: number;

  @Column({ length: 60, nullable: true })
  style_no: string;

  @Column({ length: 100 })
  item_name: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  snapshot_unit_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  qty: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number;

  @Column({ length: 200, nullable: true })
  remark: string; // 逐批批注（复核时对该批次的说明）
}
