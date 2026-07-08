import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum ErrorLogStatus {
  OPEN = 'OPEN',       // 未处理
  HANDLED = 'HANDLED', // 已处理(导出时排除)
}

/**
 * 系统报错记录(自动归档):全局异常过滤器把服务器异常写入此表。
 * 同类报错按 fingerprint 去重聚合(次数+首见/末见),并保留最近一次的操作上下文(输入/输出)。
 */
@Entity('error_log')
export class ErrorLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  // 去重指纹:method + 归一化路径 + 错误类型/消息 的哈希
  @Index('uk_fingerprint', { unique: true })
  @Column({ length: 40 })
  fingerprint: string;

  @Column({ length: 10 })
  method: string;

  @Column({ length: 255 })
  path: string;

  @Column({ type: 'int', default: 500 })
  status_code: number;

  @Column({ type: 'int', default: 5000, comment: '业务返回码' })
  code: number;

  @Column({ length: 100, nullable: true, comment: '异常类型(构造器名)' })
  error_type: string;

  @Column({ length: 1000, nullable: true })
  message: string;

  @Column({ type: 'text', nullable: true, comment: '堆栈(仅未捕获/500)' })
  stack: string;

  @Column({ type: 'text', nullable: true, comment: '操作输入上下文:{query,params,body(脱敏)}' })
  req_input: string;

  @Column({ type: 'text', nullable: true, comment: '操作输出:{code,msg}' })
  resp_output: string;

  @Column({ type: 'bigint', nullable: true, comment: '触发用户(最近一次)' })
  user_id: number;

  @Column({ length: 50, nullable: true })
  username: string;

  @Column({ length: 45, nullable: true })
  ip: string;

  @Column({ type: 'int', default: 1, comment: '同类报错累计次数' })
  count: number;

  @Column({ type: 'enum', enum: ErrorLogStatus, default: ErrorLogStatus.OPEN })
  status: ErrorLogStatus;

  @Column({ type: 'datetime' })
  first_seen: Date;

  @Column({ type: 'datetime' })
  last_seen: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
