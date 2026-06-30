import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('contract_material')
export class ContractMaterial {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  contract_id: number;

  @Column({ length: 100 })
  material_name: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  quantity: number;

  @Column({ length: 20 })
  unit: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  unit_price: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number;
}
