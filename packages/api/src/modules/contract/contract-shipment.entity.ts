import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// 合同发货批次（逐批锁价：每批发货记录当时生效的合同单价快照，对账付款串流程 B8）
@Entity('contract_shipment')
export class ContractShipment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint' })
  contract_id: number;

  @Column({ length: 30, nullable: true })
  ship_no: string; // 发货单号 FH-款号-序号

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  qty: number; // 本批发货数量

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  snapshot_unit_price: number; // 逐批锁定单价（发货当时合同单价快照）

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  amount: number; // 本批金额 = 数量 × 快照单价

  @Column({ type: 'date', nullable: true })
  ship_date: string;

  @Column({ length: 50, nullable: true })
  operator: string; // 发货操作供应商账号

  // ===== 门户四步链（设计稿 05 v2.2：发货走业务审批 → 对账只可勾已审批批次）=====
  @Column({ type: 'enum', enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' })
  approval_status: string; // 每次发货提交走业务审批（B2）

  @Column({ type: 'bigint', nullable: true })
  approved_by: number;

  @Column({ type: 'datetime', nullable: true })
  approved_at: Date;

  @Column({ type: 'bigint', nullable: true })
  reconcile_id: number; // 被哪张对账单占用（防同批次重复对账；对账单删除时释放）

  @Column({ length: 50, nullable: true })
  express_company: string; // 快递公司（设计稿 门户发货步）

  @Column({ length: 50, nullable: true })
  express_no: string; // 快递单号

  @Column({ length: 500, nullable: true })
  attach_url: string; // 附件（装箱单/货物照片）

  @CreateDateColumn()
  created_at: Date;
}
