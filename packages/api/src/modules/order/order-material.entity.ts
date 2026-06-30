import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('order_material')
export class OrderMaterial {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  order_id: number;

  @Column()
  factory_id: number;

  @Column({ length: 100 })
  material_name: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  quantity: number;

  @Column({ length: 20 })
  unit: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  unit_price: number;
}
