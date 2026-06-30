import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('prepayment')
export class Prepayment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  factory_id: number;

  @Column()
  contract_id: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  used_amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  balance: number;

  @Column({ length: 255, nullable: true })
  remark: string;

  @Column({ tinyint: true, default: 0 } as any)
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
