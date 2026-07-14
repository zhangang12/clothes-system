import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

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
