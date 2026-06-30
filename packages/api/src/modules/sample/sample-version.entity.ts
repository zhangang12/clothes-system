import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('sample_version')
export class SampleVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  garment_id: number;

  @Column({ default: 1 })
  version: number;

  @Column({ length: 255, nullable: true })
  remark: string;

  @Column({ type: 'json', nullable: true })
  attachments: string[];

  @Column({ tinyint: true, default: 0 } as any)
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
