import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, DataSource } from 'typeorm';
import { Reconciliation, ReconciliationStatus } from './reconciliation.entity';
import { ReconciliationShipment } from './reconciliation-shipment.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { ReconcileType } from '@i9/types';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { QueryReconciliationDto } from './dto/query-reconciliation.dto';

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(Reconciliation) private readonly repo: Repository<Reconciliation>,
    @InjectRepository(ReconciliationShipment) private readonly shipmentRepo: Repository<ReconciliationShipment>,
    private readonly numbering: NumberingService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateReconciliationDto, createdBy: number): Promise<Reconciliation> {
    const prefix = dto.type === ReconcileType.NO_CONTRACT
      ? `${NUM_PREFIX.RECONCILIATION}-NC`
      : NUM_PREFIX.RECONCILIATION;
    const reconcile_no = await this.numbering.next(prefix);

    return this.dataSource.transaction(async (manager) => {
      const shipmentLines = dto.shipments ?? [];
      const totalAmount = shipmentLines.reduce((sum, s) => sum + s.snapshot_unit_price * s.qty, 0);

      const hasInvoice = dto.invoice_no ? 1 : 0;
      const taxAmount = dto.tax_rate && totalAmount
        ? +(totalAmount * dto.tax_rate / 100).toFixed(4)
        : null;
      const invoiceDiff = dto.invoice_amount != null
        ? +(dto.invoice_amount - totalAmount).toFixed(4)
        : null;

      const reconciliation = await manager.save(
        Reconciliation,
        manager.create(Reconciliation, {
          reconcile_no,
          type: dto.type,
          contract_id: dto.contract_id,
          factory_id: dto.factory_id,
          total_amount: +totalAmount.toFixed(4),
          tax_rate: dto.tax_rate ?? null,
          tax_amount: taxAmount,
          invoice_no: dto.invoice_no ?? null,
          invoice_amount: dto.invoice_amount ?? null,
          invoice_diff: invoiceDiff,
          invoice_url: dto.invoice_url ?? null,
          has_invoice: hasInvoice,
          description: dto.description ?? null,
          status: ReconciliationStatus.DRAFT,
          created_by: createdBy,
        }),
      );

      if (shipmentLines.length) {
        const lines = shipmentLines.map((s) =>
          manager.create(ReconciliationShipment, {
            reconcile_id: reconciliation.id,
            shipment_id: s.shipment_id,
            item_name: s.item_name,
            snapshot_unit_price: s.snapshot_unit_price,
            qty: s.qty,
            amount: +(s.snapshot_unit_price * s.qty).toFixed(4),
          }),
        );
        await manager.save(ReconciliationShipment, lines);
      }

      return reconciliation;
    });
  }

  async findAll(query: QueryReconciliationDto) {
    const { page = 1, size = 20, keyword, type, status, factory_id } = query;
    const base: FindOptionsWhere<Reconciliation> = {
      deleted: 0,
      ...(type !== undefined && { type }),
      ...(status !== undefined && { status }),
      ...(factory_id !== undefined && { factory_id }),
    };
    const where: FindOptionsWhere<Reconciliation> | FindOptionsWhere<Reconciliation>[] = keyword
      ? [{ ...base, reconcile_no: Like(`%${keyword}%`) }]
      : base;

    const [items, total] = await this.repo.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });
    return { items, total, page, size };
  }

  async findOne(id: number) {
    const reconciliation = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!reconciliation) throw new NotFoundException(`对账单 #${id} 不存在`);
    const shipments = await this.shipmentRepo.find({ where: { reconcile_id: id } });
    return { ...reconciliation, shipments };
  }

  async confirm(id: number): Promise<Reconciliation> {
    return this.dataSource.transaction(async (manager) => {
      const rec = await manager.findOne(Reconciliation, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!rec) throw new NotFoundException(`对账单 #${id} 不存在`);
      if (rec.status !== ReconciliationStatus.DRAFT) {
        throw new BadRequestException('只有草稿状态才可确认');
      }
      rec.status = ReconciliationStatus.CONFIRMED;
      rec.confirmed_at = new Date();
      return manager.save(Reconciliation, rec);
    });
  }

  async remove(id: number): Promise<void> {
    const rec = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!rec) throw new NotFoundException(`对账单 #${id} 不存在`);
    if (rec.status !== ReconciliationStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态的对账单可以删除');
    }
    rec.deleted = 1;
    await this.repo.save(rec);
  }
}
