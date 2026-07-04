import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// 客户资料·联系人明细表（基础资料设计稿 §2.1，10 列）
@Entity('customer_contact')
export class CustomerContact {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  customer_id: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ length: 50, nullable: true })
  name: string;

  @Column({ length: 50, nullable: true })
  department: string;

  @Column({ length: 2, nullable: true })
  gender: string;

  @Column({ length: 50, nullable: true })
  title: string;

  @Column({ length: 30, nullable: true })
  phone: string;

  @Column({ length: 30, nullable: true })
  mobile: string;

  @Column({ length: 30, nullable: true })
  mobile1: string;

  @Column({ length: 30, nullable: true })
  mobile2: string;

  @Column({ length: 100, nullable: true })
  email: string;

  @Column({ length: 200, nullable: true })
  remark: string;
}
