import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { OrderStatus, ApprovalStatus } from '@i9/types';

@Entity('order_main')
export class OrderMain {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 20, unique: true })
  order_no: string;

  @Column({ length: 50, nullable: true })
  customer_po: string;

  @Column({ type: 'bigint' })
  customer_id: number;

  @Column({ type: 'bigint', nullable: true })
  quote_id: number;

  @Column({ length: 100, nullable: true })
  style_name: string;

  @Column({ length: 100, nullable: true })
  style_no: string; // 客户款号

  @Column({ length: 100, nullable: true })
  middleman_name: string; // 中间商名称（报价带入）

  @Column({ type: 'bigint', nullable: true })
  buyer_id: number;

  @Column({ length: 100, nullable: true })
  buyer_name: string; // 最终买家（报价带入）

  @Column({ type: 'date', nullable: true })
  delivery_date: Date;

  @Column({ type: 'int', default: 0 })
  qty_total: number;

  @Column({ length: 5, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  unit_price: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  commission_rate: number; // 佣金%

  @Column({ type: 'bigint', nullable: true })
  factory_id: number; // 生产工厂（可后填，绑定订单）

  @Column({ length: 50, nullable: true })
  salesperson: string; // 外销员

  @Column({ type: 'date', nullable: true })
  make_date: string; // 制单日期

  @Column({ type: 'varchar', length: 10, default: 'NONE' })
  split_mode: string; // 整单核算模式 NONE/BY_SIZE/BY_COLOR

  // 附件档案 5 类（逗号分隔多文件 URL）
  @Column({ type: 'text', nullable: true })
  att_artwork: string;   // 彩稿

  @Column({ type: 'text', nullable: true })
  att_sizechart: string; // 大货尺寸表

  @Column({ type: 'text', nullable: true })
  att_board: string;     // 大货纸板

  @Column({ type: 'text', nullable: true })
  att_packing: string;   // 包装资料

  @Column({ type: 'text', nullable: true })
  att_filling: string;   // 填充量

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  total_amount: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.DRAFT })
  status: OrderStatus;

  // 金额阈值审批（total_amount 超阈值时订单需主管审批后方可「已下单」）
  @Column({ type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.NONE })
  approval_status: ApprovalStatus;

  @Column({ type: 'bigint', nullable: true })
  approved_by: number;

  @Column({ type: 'datetime', nullable: true })
  approved_at: Date;

  @Column({ type: 'text', nullable: true })
  remark: string;

  @Column({ type: 'bigint' })
  created_by: number;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;

  @CreateDateColumn()
  created_at: Date;


  @Column({ type: 'datetime', nullable: true })
  content_updated_at?: Date; // 内容级修改时间(仅编辑/矩阵/材料写入)——合同侧「源订单已变更」标记依据(P2#20)

  @Column({ type: 'datetime', nullable: true })
  quote_synced_at?: Date; // 最近一次从报价导入时间——「源报价已变更」= quote.content_updated_at > 此值(P2#20)
  @UpdateDateColumn()
  updated_at: Date;
}
