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

  // 银行水单（2026-09-11 #134 qiao：「预付款水单没地方上传」）。预付也是一笔真实付款，
  // 与付款申请一样要留凭证；建档时可带，也可事后挂（attachPrepaySlip，只写这一列）
  @Column({ length: 500, nullable: true })
  slip_url: string;

  @Column({ type: 'bigint' })
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
