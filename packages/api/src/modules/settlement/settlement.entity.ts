import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SettlementStatus } from '@i9/types';

@Entity('settlement')
export class Settlement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 30, unique: true })
  settlement_no: string;

  @Column()
  order_id: number;

  @Column({ length: 60, nullable: true })
  style_no?: string; // 款号（核算口径，来自订单）

  @Column({ type: 'int', default: 0 })
  shipped_qty: number; // 出货件数（汇总自船务 order_shipment）

  @Column({ length: 5, default: 'CNY' })
  currency: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  exchange_rate?: number; // 结算汇率

  @Column({ type: 'enum', enum: SettlementStatus, default: SettlementStatus.DRAFT })
  status: SettlementStatus;

  // ── 成本明细（对账付款汇总）──
  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  goods_amount_tax: number; // 总货款(含税)

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  goods_amount_extax: number; // 总货款(不含税)=含税÷1.13（无票行按含税全额）

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  cost_per_unit_tax?: number; // 成本单价(含税)=总货款含税÷出货件数

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  cost_per_unit_extax?: number; // 成本单价(不含税)

  // ── 财务收汇 ──
  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  invoice_amount_usd: number; // 发票金额(USD)

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  receipt_usd: number; // 实际收汇金额(USD)

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  usd_unit_price?: number; // 美金单价=发票金额÷出货件数

  // ── 期间费用（进净利扣减）──
  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  freight_fee: number; // 运杂费

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  express_fee: number; // 快邮费（国际+国内）

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  sample_fee: number; // 打样费

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  other_fee: number; // 其它费用

  // ── 毛利对比（自动）──
  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  settle_amount: number; // 结算金额(RMB)=实际收汇×结算汇率

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  finance_fee: number; // 财务及管理费=结算金额×7%

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  gross_profit: number; // 毛利=结算金额−总货款不含税

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  gross_margin?: number; // 毛利率%

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  breakeven_rate_tax?: number; // 保本汇率(含税)=成本单价含税÷美金单价

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  breakeven_rate_extax?: number; // 保本汇率(不含税)

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  tax_refund: number; // 出口退税

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  net_profit: number; // 净利(含退税)=净利+退税

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  net_profit_ex_refund: number; // 净利(不含退税)=毛利−期间费用−财务费

  // ── 兼容旧列（revenue=结算金额, total_cost=总货款含税, cost_per_unit=不含税成本单价）──
  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  revenue: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  total_cost: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  cost_per_unit?: number;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  created_by?: number;

  @Column({ nullable: true, type: 'datetime' })
  confirmed_at?: Date;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
