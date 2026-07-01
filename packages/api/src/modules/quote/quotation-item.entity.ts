import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('quotation_item')
export class QuotationItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  quote_id: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ length: 100 })
  item_name: string;

  @Column({ length: 20, nullable: true })
  unit: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  usage_qty: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  unit_price: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  loss_rate: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  loss_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  total_usage: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  subtotal: number;

  @CreateDateColumn()
  created_at: Date;
}
