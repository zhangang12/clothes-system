import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { PaymentApprovalStatus } from '@i9/types';

@Entity('payment_request')
export class PaymentRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 30, unique: true })
  pr_no: string;

  @Column()
  reconcile_id: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number;

  @Column({ type: 'enum', enum: PaymentApprovalStatus, default: PaymentApprovalStatus.PENDING })
  approval_status: PaymentApprovalStatus;

  @Column({ nullable: true })
  approved_by: number;

  @Column({ type: 'datetime', nullable: true })
  approved_at: Date;

  @Column({ length: 255, nullable: true })
  slip_url: string;

  @Column({ tinyint: true, default: 0 } as any)
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
