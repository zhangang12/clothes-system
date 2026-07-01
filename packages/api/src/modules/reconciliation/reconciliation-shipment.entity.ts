import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('reconciliation_shipment')
export class ReconciliationShipment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  reconcile_id: number;

  @Column({ type: 'bigint' })
  shipment_id: number;

  @Column({ length: 100 })
  item_name: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  snapshot_unit_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  qty: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number;
}
