import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('supplier_account')
export class SupplierAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  factory_id: number;

  @Column({ length: 50, unique: true })
  login_name: string;

  @Column({ length: 255 })
  password_hash: string;

  @Column({ tinyint: true, default: 1 } as any)
  enabled: number;

  @Column({ tinyint: true, default: 0 } as any)
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
