import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum SampleAction {
  SUBMIT = 'SUBMIT',
  REJECT = 'REJECT',
  CONFIRM = 'CONFIRM',
}

@Entity('sample_version')
export class SampleVersion {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  sample_id: number;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'enum', enum: SampleAction })
  action: SampleAction;

  @Column({ type: 'bigint' })
  operator_id: number;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @Column({ type: 'json', nullable: true })
  attachments: string[];

  @CreateDateColumn()
  created_at: Date;
}
