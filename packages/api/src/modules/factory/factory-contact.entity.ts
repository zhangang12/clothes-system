import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// 工厂资料·联系人明细表（基础资料设计稿 §1.1，7 列）
@Entity('factory_contact')
export class FactoryContact {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  factory_id: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ length: 50, nullable: true })
  name: string;

  @Column({ length: 50, nullable: true })
  department: string;

  @Column({ length: 50, nullable: true })
  title: string;

  @Column({ length: 30, nullable: true })
  phone: string;

  @Column({ length: 30, nullable: true })
  mobile: string;

  @Column({ length: 100, nullable: true })
  email: string;

  @Column({ length: 200, nullable: true })
  remark: string;
}
