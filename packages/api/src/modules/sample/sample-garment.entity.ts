import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SampleStatus } from '@i9/types';

@Entity('sample_garment')
export class SampleGarment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 20, unique: true })
  sample_no: string;

  @Column({ type: 'bigint' })
  customer_id: number;

  @Column({ length: 100 })
  style_name: string;

  @Column({ length: 20, nullable: true })
  season: string;

  @Column({ length: 50, nullable: true })
  category: string;

  @Column({ type: 'text', nullable: true })
  process_req: string;

  @Column({ type: 'bigint', nullable: true })
  patternmaker_id: number;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'enum', enum: SampleStatus, default: SampleStatus.PENDING })
  status: SampleStatus;

  @Column({ type: 'text', nullable: true })
  reject_reason: string;

  @Column({ type: 'datetime', nullable: true })
  confirmed_at: Date;

  @Column({ type: 'bigint' })
  created_by: number;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
