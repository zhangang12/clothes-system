import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('contract_material')
export class ContractMaterial {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  contract_id: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ length: 100 })
  item_name: string;

  @Column({ length: 100, nullable: true })
  spec: string;

  @Column({ length: 20, nullable: true })
  unit: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  unit_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  qty: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number;

  @Column({ length: 200, nullable: true })
  remark: string;
}
