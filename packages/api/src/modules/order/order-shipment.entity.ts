import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('order_shipment')
export class OrderShipment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  order_id: number;

  @Column({ type: 'date' })
  ship_date: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ length: 255, nullable: true })
  remark: string;

  @CreateDateColumn()
  created_at: Date;
}
