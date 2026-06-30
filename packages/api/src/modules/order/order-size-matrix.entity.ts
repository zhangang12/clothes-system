import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('order_size_matrix')
export class OrderSizeMatrix {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  order_id: number;

  @Column({ type: 'json' })
  matrix: Record<string, number>;
}
