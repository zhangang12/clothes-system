import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { UserRole } from '@i9/types';

@Entity('sys_user')
export class SysUser {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 50, unique: true })
  username: string;

  @Column({ length: 255 })
  password: string;

  @Column({ length: 50 })
  real_name: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.BUSINESS })
  role: UserRole;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  // 账号级菜单权限（key 见 @i9/types MENU_REGISTRY）；NULL=按角色默认菜单（ROLE_DEFAULT_MENUS）
  @Column({ type: 'json', nullable: true })
  menu_keys: string[] | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
