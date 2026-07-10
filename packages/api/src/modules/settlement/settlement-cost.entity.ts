import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('settlement_cost')
export class SettlementCost {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  settlement_id: number;

  @Column({ length: 100 })
  cost_name: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number;

  @Column({ type: 'tinyint', default: 1, comment: '1=有票 0=无票' })
  has_invoice: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 13, comment: '该行税率%(有票按此换不含税,禁一刀切13)' })
  tax_rate: number;

  @Column({ length: 30, nullable: true, comment: '来源对账单号(AUTO行)' })
  reconcile_no?: string;

  @Column({ length: 100, nullable: true, comment: '供应商(AUTO行)' })
  supplier_name?: string;

  @Column({ length: 20, nullable: true, comment: '付款状态 PAID=已付 CONFIRMED=已确认未付' })
  pay_status?: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true, comment: '实发数(来自对账批次合计,P2#26)' })
  qty?: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true, comment: '加权单价=金额/实发数(P2#26)' })
  unit_price?: number;

  @Column({ length: 10, default: 'MANUAL', comment: 'AUTO=对账汇总快照 MANUAL=手工行' })
  source: string;

  @Column({ type: 'tinyint', default: 1, comment: '1=计入总货款 0=未付不计入(灰显)' })
  included: number;

  @CreateDateColumn()
  created_at: Date;
}
