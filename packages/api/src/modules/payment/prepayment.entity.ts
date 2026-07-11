import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('prepayment')
export class Prepayment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  factory_id: number;

  @Column({ type: 'bigint', nullable: true })
  contract_id: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  used_amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  balance: number;

  @Column({ type: 'date' })
  pay_date: Date;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @Column({ length: 60, nullable: true })
  style_no: string; // 相关款号（预付登记归集，P3#40/补充C2）

  @Column({ type: 'bigint' })
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
