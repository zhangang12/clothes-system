import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('reconciliation_shipment')
export class ReconciliationShipment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  reconcile_id: number;

  @Column()
  order_id: number;

  @Column({ nullable: true })
  contract_id: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  snapshot_unit_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number;
}
