import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('order_size_matrix')
export class OrderSizeMatrix {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint', unique: true })
  order_id: number;

  @Column({ type: 'json' })
  matrix_data: Record<string, unknown>;

  @UpdateDateColumn()
  updated_at: Date;
}
