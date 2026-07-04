import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// 客户资料·开户银行明细表（基础资料设计稿 §2.1，7 列）
@Entity('customer_bank')
export class CustomerBank {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  customer_id: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ length: 100, nullable: true })
  account_name: string;

  @Column({ length: 100, nullable: true })
  bank_name: string;

  @Column({ length: 40, nullable: true })
  bank_account: string;

  @Column({ length: 200, nullable: true })
  bank_address: string;

  @Column({ length: 20, nullable: true })
  currency: string;

  @Column({ length: 20, nullable: true })
  swift_code: string;

  @Column({ length: 200, nullable: true })
  remark: string;
}
