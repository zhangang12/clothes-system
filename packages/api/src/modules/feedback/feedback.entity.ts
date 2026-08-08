import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export enum FeedbackUserType {
  INTERNAL = 'INTERNAL',   // 内部员工（PC 管理端）
  SUPPLIER = 'SUPPLIER',   // 供应商（门户）
}

export enum FeedbackStatus {
  PENDING = 'PENDING', // 待处理
  HANDLED = 'HANDLED', // 已处理(导出时排除)
}

/** 用户反馈:任意登录用户提交问题+图片;管理员查看/处理/导出 */
@Entity('feedback')
export class Feedback {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint', comment: '提交用户' })
  user_id: number;

  // 【必须与 user_id 成对使用】内部用户和供应商账号是**两套各自独立的自增 ID**，
  // 只按 user_id 过滤会串号：内部用户#5 会看到供应商账号#5 的反馈，反之亦然。
  @Column({ type: 'enum', enum: FeedbackUserType, default: FeedbackUserType.INTERNAL })
  user_type: FeedbackUserType;

  @Column({ length: 50, nullable: true, comment: '提交人(快照)' })
  username: string;

  @Column({ type: 'text', comment: '问题描述' })
  content: string;

  @Column({ type: 'text', nullable: true, comment: '图片 URL(JSON 数组)' })
  images: string;

  @Column({ length: 255, nullable: true, comment: '提交页面(上下文)' })
  page_url: string;

  @Column({ type: 'enum', enum: FeedbackStatus, default: FeedbackStatus.PENDING })
  status: FeedbackStatus;

  @Column({ length: 500, nullable: true, comment: '处理回复' })
  reply: string;

  @Column({ type: 'datetime', nullable: true, comment: '回复时间' })
  reply_at: Date;

  @Column({ type: 'tinyint', default: 0, comment: '提交人是否已读回复(0未读,右下角红点)' })
  reply_read: number;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;

  @CreateDateColumn()
  created_at: Date;
}
