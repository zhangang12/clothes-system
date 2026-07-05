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

  @CreateDateColumn()
  created_at: Date;
}
