import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// 分批付款记录（设计稿 06 v1.1：可多次付款，每次填「本次付款金额」并上传水单，
// 系统自动累计「已付总额」与「未付余额」；余额=0 时付款申请整单转「已付清」）
@Entity('payment_record')
export class PaymentRecord {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  pr_id: number; // 所属付款申请

  @Column({ type: 'enum', enum: ['BANK', 'ACCEPTANCE', 'OTHER'], default: 'BANK' })
  pay_method: string; // 付款方式：银行转账/承兑汇票/其他

  @Column({ type: 'date' })
  pay_date: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number; // 本次付款金额

  @Column({ length: 500, nullable: true })
  slip_url: string; // 付款凭证（水单）

  @Column({ length: 200, nullable: true })
  remark: string;

  @Column({ type: 'bigint' })
  created_by: number;

  @CreateDateColumn()
  created_at: Date;
}
