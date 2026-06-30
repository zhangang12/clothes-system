import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SampleStatus } from '@i9/types';

@Entity('sample_garment')
export class SampleGarment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  customer_id: number;

  @Column({ length: 100 })
  style_name: string;

  @Column({ length: 50, nullable: true })
  style_no: string;

  @Column({ type: 'enum', enum: SampleStatus, default: SampleStatus.DRAFT })
  status: SampleStatus;

  @Column({ tinyint: true, default: 0 } as any)
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
