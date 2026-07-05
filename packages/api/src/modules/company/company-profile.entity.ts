import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// 本司主体档案（我方公司；外贸常有多个主体，一个设为默认，供 PDF 抬头/合同甲方/结算收款取数）
@Entity('company_profile')
export class CompanyProfile {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 100 })
  name: string; // 公司全称（PDF 抬头 / 合同甲方 / 开票抬头）

  @Column({ length: 50, nullable: true })
  short_name: string;

  @Column({ length: 200, nullable: true })
  address: string;

  @Column({ length: 30, nullable: true })
  phone: string;

  @Column({ length: 30, nullable: true })
  tax_no: string; // 税号

  @Column({ length: 100, nullable: true })
  bank_name: string;

  @Column({ length: 40, nullable: true })
  bank_account: string;

  @Column({ length: 50, nullable: true })
  legal_rep: string; // 法定代表人

  @Column({ length: 500, nullable: true })
  logo_url: string; // 抬头 Logo（上传返回的 URL）

  @Column({ type: 'tinyint', default: 0 })
  is_default: number; // 1=默认主体（PDF/合同默认取此）

  @Column({ length: 200, nullable: true })
  remark: string;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
