import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('order_shipment')
export class OrderShipment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  order_id: number;

  @Column({ type: 'date' })
  shipment_date: Date;

  @Column({ type: 'int' })
  qty: number;

  @Column({ type: 'int', nullable: true })
  cartons: number;

  @Column({ length: 100, nullable: true })
  tracking_no: string;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @Column({ type: 'bigint' })
  created_by: number;

  @CreateDateColumn()
  created_at: Date;
}
