import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/** 样衣寄样多轮跟踪:一轮打不完时多轮寄样;各轮工价合计 Σ 回填 sample_garment.labor_amount 供对账。 */
@Entity('sample_ship_round')
export class SampleShipRound {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sample_id: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'int', nullable: true, comment: '轮次' })
  round_no: number;

  @Column({ length: 50, nullable: true, comment: '样衣尺码' })
  size: string;

  @Column({ type: 'int', nullable: true, comment: '数量(件)' })
  qty: number;

  @Column({ type: 'date', nullable: true, comment: '寄样日期(业务)' })
  ship_date: string;

  @Column({ length: 50, nullable: true, comment: '寄样单号(业务)' })
  ship_no: string;

  @Column({ type: 'date', nullable: true, comment: '寄回日期(版师)' })
  return_date: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, comment: '工价单价(版师)' })
  labor_unit_price: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, comment: '工价金额=数量×单价' })
  labor_amount: number;

  @Column({ length: 200, nullable: true })
  remark: string;
}
