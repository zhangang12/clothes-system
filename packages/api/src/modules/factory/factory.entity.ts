import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { FactoryType } from '@i9/types';

@Entity('factory')
export class Factory {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 20, unique: true })
  factory_no: string;

  @Column({ type: 'enum', enum: FactoryType, default: FactoryType.FABRIC })
  type: FactoryType; // 主身份

  @Column({ length: 100, nullable: true })
  extra_types: string; // 附加身份（逗号分隔 FactoryType，工厂双身份：如材料供应商+加工厂，设计稿 A4）

  @Column({ length: 500, nullable: true })
  seal_url: string; // 供应商电子章图片（盖章后 PDF 落款贴章，A3）

  @Column({ type: 'tinyint', default: 1 })
  can_invoice: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, nullable: true })
  short_name: string;

  // 主表联系人（保存时自动取联系人子表首行回填）
  @Column({ length: 50, nullable: true })
  contact_name: string;

  @Column({ length: 30, nullable: true })
  contact_phone: string;

  @Column({ length: 30, nullable: true })
  province: string;

  @Column({ length: 30, nullable: true })
  city: string;

  @Column({ length: 200, nullable: true })
  address: string;

  @Column({ length: 200, nullable: true })
  business_scope: string;

  @Column({ length: 10, nullable: true })
  grade: string; // 信用等级 A/B/C(设计稿 §1.2 列表信用列)

  @Column({ type: 'date', nullable: true })
  develop_date: string;

  // 财务信息
  @Column({ length: 100, nullable: true })
  bank_name: string;

  @Column({ length: 40, nullable: true })
  bank_account: string;

  @Column({ length: 30, nullable: true })
  tax_no: string;

  @Column({ length: 30, nullable: true })
  invoice_phone: string;

  @Column({ length: 200, nullable: true })
  invoice_address: string;

  // 财务信息(2)
  @Column({ length: 100, nullable: true })
  bank_name2: string;

  @Column({ length: 40, nullable: true })
  bank_account2: string;

  @Column({ length: 30, nullable: true })
  tax_no2: string;

  @Column({ length: 30, nullable: true })
  invoice_phone2: string;

  @Column({ length: 200, nullable: true })
  invoice_address2: string;

  // 备注信息
  @Column({ length: 50, nullable: true })
  legal_rep: string;

  @Column({ type: 'bigint', nullable: true })
  registered_capital: number;

  @Column({ type: 'date', nullable: true })
  established_date: string;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true })
  annual_sales: number;

  @Column({ length: 200, nullable: true })
  representative_customers: string;

  @Column({ type: 'text', nullable: true })
  quality_certs: string;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @Column({ type: 'date', nullable: true })
  last_trade_date: string;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ type: 'bigint', nullable: true })
  created_by: number;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
