import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// 无合同空白对账单·费用明细（补充确认v1.1：费用项目/事由·金额·相关款号(可空)·附件）
@Entity('reconciliation_expense_item')
export class ReconciliationExpenseItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  reconcile_id: number;

  @Column({ length: 200 })
  expense_name: string; // 费用项目 / 事由

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount: number;

  @Column({ length: 60, nullable: true })
  style_no: string; // 相关款号（可空）

  @Column({ length: 500, nullable: true })
  attach_url: string; // 附件（收据/无票说明）
}
