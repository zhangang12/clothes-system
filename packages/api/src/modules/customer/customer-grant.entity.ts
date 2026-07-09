import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// 客户机密授权（设计稿 01 v1.3 §2：客户资料属机密单据——非授权用户在客户列表中不可见该客户；
// 新建保存后自动为创建人登记权限；管理员可批量授权多用户查看/修改）
@Entity('customer_grant')
@Index('uk_cust_user', ['customer_id', 'user_id'], { unique: true })
export class CustomerGrant {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  customer_id: number;

  @Column({ type: 'bigint' })
  user_id: number; // 被授权用户

  @Column({ type: 'tinyint', default: 0 })
  can_edit: number; // 0=仅查看 1=可修改

  @Column({ type: 'date', nullable: true })
  expire_at: string; // 有效期至(设计 D.3;过期授权自动失效,空=永久)

  @Column({ length: 200, nullable: true })
  remark: string; // 授权备注

  @Column({ type: 'bigint', nullable: true })
  created_by: number; // 授权人（管理员）

  @CreateDateColumn()
  created_at: Date;
}
