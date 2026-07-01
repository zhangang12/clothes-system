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
  item_name: string;

  @Column({ length: 20, nullable: true })
  unit: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  net_usage: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  loss_rate: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  loss_usage: number;

  @Column({ type: 'int', nullable: true })
  qty: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  total_purchase: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  unit_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  budget: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;
}
