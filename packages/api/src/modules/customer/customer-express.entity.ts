import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// 客户资料·快件帐号明细表（基础资料设计稿 §2.1，4 列）
@Entity('customer_express')
export class CustomerExpress {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  customer_id: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ length: 100, nullable: true })
  company: string;

  @Column({ length: 50, nullable: true })
  account: string;

  @Column({ length: 10, nullable: true })
  pay_method: string;

  @Column({ length: 200, nullable: true })
  remark: string;
}
