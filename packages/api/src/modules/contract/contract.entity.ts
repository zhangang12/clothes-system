import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ContractType, ContractPortalStatus, ApprovalStatus } from '@i9/types';

export enum ContractStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('contract')
export class Contract {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 40, unique: true })
  contract_no: string; // HT-日期-序号；补料合同为「补料-母合同号-序号」，故留足 40（20 会溢出→500）

  @Column({ type: 'enum', enum: ContractType })
  type: ContractType;

  @Column({ type: 'bigint', nullable: true })
  parent_id: number;

  @Column({ type: 'bigint' })
  factory_id: number;

  @Column({ type: 'bigint' })
  order_id: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  total_amount: number;

  @Column({ length: 5, default: 'CNY' })
  currency: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 30 })
  deposit_ratio: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 40 })
  mid_ratio: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 30 })
  final_ratio: number;

  @Column({ type: 'date', nullable: true })
  last_ship_date: Date;

  @Column({ type: 'datetime', nullable: true })
  ship_done_at: Date; // 供应商宣布「发货完成」时间（门户C3；开票后据此闭环到已完成）

  @Column({ length: 200, nullable: true })
  ship_to_address: string; // 收货地址（发货时带入，设计稿 门户 C1）

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  shipped_qty: number; // 累计已发数量（批次累计，设计稿 门户 B3）

  @Column({ type: 'int', default: 90 })
  account_period_days: number; // 账期天数（材料90/加工45，发货日+账期=到期日）

  @Column({ type: 'date', nullable: true })
  due_date: Date;

  // ===== 编辑页扩展字段（设计稿 04-合同 v1.3 两类编辑页）=====
  @Column({ length: 100, nullable: true })
  sign_place: string; // 签约地点（默认本司地址，可改）

  @Column({ type: 'date', nullable: true })
  sign_date: Date; // 签约日期（默认今天，可改）

  @Column({ type: 'bigint', nullable: true })
  company_id: number; // 乙方/委托方=本司主体（company_profile 字典，多抬头 B4）

  @Column({ length: 50, nullable: true })
  company_rep: string; // 乙方/委托方代表（默认登录业务员，可改 B5）

  @Column({ length: 50, nullable: true })
  guarantor: string; // 担保人（丙方，选填；填了 PDF 自动插担保条款 D7）

  @Column({ length: 500, nullable: true })
  guarantor_id_photo: string; // 担保人身份证照片 URL（选填 B6）

  @Column({ type: 'date', nullable: true })
  delivery_deadline: Date; // 交货期限（默认 加工=订单交期−10天 / 材料=−45天，可改 A7）

  @Column({ length: 500, nullable: true })
  style_nos: string; // 关联款号（多选逗号分隔 D2；默认订单款号）

  @Column({ type: 'json', nullable: true })
  price_includes: string[] | null; // 价格包含项勾选（加工合同；仅汇入 PDF 文字不改金额 D4）

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  vat_rate: number; // 增值税%（加工合同默认13，含税不另计 D4）

  @Column({ length: 200, nullable: true })
  price_other: string; // 价格包含项·其他说明（手填）

  @Column({ type: 'json', nullable: true })
  terms_json: Record<string, string> | null; // 合同条款模板填空（质量/交货/验收/结算/违约/争议 D3）

  @Column({ type: 'enum', enum: ContractPortalStatus, default: ContractPortalStatus.DRAFT })
  portal_status: ContractPortalStatus;

  @Column({ type: 'datetime', nullable: true })
  pushed_at: Date;

  @Column({ type: 'datetime', nullable: true })
  stamped_at: Date;

  @Column({ length: 100, nullable: true })
  stamped_by_supplier: string;

  @Column({ type: 'json', nullable: true })
  snapshot_json: Record<string, unknown>;

  // 撤销推送后修改重推标记：门户向供应商提示「合同已更新，请重新核对」，盖章后清零
  @Column({ type: 'tinyint', default: 0 })
  revised: number;

  @Column({ type: 'enum', enum: ContractStatus, default: ContractStatus.ACTIVE })
  status: ContractStatus;

  // 金额阈值审批（total_amount 超阈值时合同需主管审批后方可推送供应商）
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

  @UpdateDateColumn()
  updated_at: Date;
}
