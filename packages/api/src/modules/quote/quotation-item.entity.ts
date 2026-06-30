import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('quotation_item')
export class QuotationItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  quotation_id: number;

  @Column({ length: 100 })
  item_name: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  unit_price: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  loss_rate: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  loss_price: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1 })
  quantity: number;

  @Column({ length: 20, nullable: true })
  unit: string;
}
