import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// 通用字典（基础资料稿：部门/职务/贸易国别/价格条款/结汇方式/客户来源/合作等级/币种汇率等
// "从字典选择、可累积录入过的历史值"——下拉允许自填，新值自动落库累积）
@Entity('sys_dict')
@Index('idx_type', ['type'])
export class SysDict {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 40 })
  type: string; // 字典类别：department/title/trade_country/price_terms/settlement_method/customer_source/cooperation_level/currency/composition/consignee

  @Column({ length: 100 })
  label: string; // 显示值

  @Column({ length: 100, nullable: true })
  value: string; // 附加值（如币种字典存默认汇率）

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number; // 1=启用 0=停用

  @CreateDateColumn()
  created_at: Date;
}
