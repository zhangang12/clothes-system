import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { UserRole } from '@i9/types';

@Entity('sys_user')
export class SysUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  username: string;

  @Column({ length: 255 })
  password_hash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.BUSINESS })
  role: UserRole;

  @Column({ length: 50 })
  real_name: string;

  @Column({ tinyint: true, default: 0 } as any)
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
