import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SampleStatus } from '@i9/types';

@Entity('sample_garment')
export class SampleGarment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 30, unique: true })
  sample_no: string;

  @Column({ length: 100, nullable: true })
  categories: string; // 样衣类别（7 类多选，逗号分隔）

  // 中间商（= customer_id，保持与下游/客户删除拦截一致）
  @Column({ type: 'bigint' })
  customer_id: number;

  @Column({ length: 100, nullable: true })
  middleman_name: string;

  @Column({ length: 100 })
  style_no: string; // 客户款号（必填）

  @Column({ type: 'bigint', nullable: true })
  buyer_id: number;

  @Column({ length: 100, nullable: true })
  buyer_name: string;

  @Column({ length: 30, nullable: true })
  buyer_no: string;

  @Column({ type: 'bigint', nullable: true })
  patternmaker_id: number;

  @Column({ length: 50, nullable: true })
  patternmaker_name: string;

  @Column({ length: 50, nullable: true })
  maker: string; // 制单人员

  @Column({ type: 'date', nullable: true })
  make_date: string;

  @Column({ type: 'date', nullable: true })
  ship_sample_date: string;

  @Column({ length: 50, nullable: true })
  recipient: string;

  @Column({ length: 200, nullable: true })
  file_location: string;

  @Column({ type: 'text', nullable: true })
  garment_remark: string;

  @Column({ length: 255, nullable: true })
  image1: string;

  @Column({ length: 255, nullable: true })
  image2: string;

  @Column({ length: 255, nullable: true })
  image3: string;

  // 寄样跟踪
  @Column({ length: 50, nullable: true })
  material_ship_no: string;

  @Column({ type: 'date', nullable: true })
  material_ship_date: string;

  @Column({ length: 50, nullable: true })
  return_no: string;

  @Column({ type: 'date', nullable: true })
  return_date: string;

  @Column({ type: 'int', nullable: true })
  piece_count: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  labor_unit_price: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  labor_amount: number;

  @Column({ type: 'enum', enum: SampleStatus, default: SampleStatus.PENDING })
  status: SampleStatus;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'bigint' })
  created_by: number;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
