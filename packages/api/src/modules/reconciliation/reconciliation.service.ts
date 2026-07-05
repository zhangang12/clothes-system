import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, DataSource } from 'typeorm';
import { Reconciliation, ReconciliationStatus } from './reconciliation.entity';
import { ReconciliationShipment } from './reconciliation-shipment.entity';
import { Contract } from '../contract/contract.entity';
import { OrderMain } from '../order/order-main.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { ReconcileType, ContractPortalStatus } from '@i9/types';
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
    // 发票号全局查重，防止同一发票重复对账/重复付款（设计稿 G3）
    if (dto.invoice_no) {
      const dup = await this.repo.findOne({ where: { invoice_no: dto.invoice_no, deleted: 0 } });
      if (dup) {
        throw new BadRequestException(`发票号 ${dto.invoice_no} 已被对账单 ${dup.reconcile_no} 使用（防重复付）`);
      }
    }

    const prefix = dto.type === ReconcileType.NO_CONTRACT
      ? `${NUM_PREFIX.RECONCILIATION}-NC`
      : NUM_PREFIX.RECONCILIATION;
    const reconcile_no = await this.numbering.next(prefix);

    return this.dataSource.transaction(async (manager) => {
      const shipmentLines = dto.shipments ?? [];
      const totalAmount = shipmentLines.reduce((sum, s) => sum + s.snapshot_unit_price * s.qty, 0);

      // 款号带出（合同→订单），供对账列表按款号检索（设计稿 对账 A2）
      let styleNo: string | null = null;
      if (dto.contract_id) {
        const contract = await manager.findOne(Contract, { where: { id: dto.contract_id, deleted: 0 } });
        if (contract?.order_id) {
          const order = await manager.findOne(OrderMain, { where: { id: contract.order_id, deleted: 0 } });
          styleNo = order?.style_no ?? null;
        }
      }

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
          style_no: styleNo,
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
    // 支持按对账单号或款号检索（设计稿 对账 A2）
    const where: FindOptionsWhere<Reconciliation> | FindOptionsWhere<Reconciliation>[] = keyword
      ? [
          { ...base, reconcile_no: Like(`%${keyword}%`) },
          { ...base, style_no: Like(`%${keyword}%`) },
        ]
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
      // 发票=对账金额校验（设计稿 门户 D2/G3）：含票时发票金额须与对账金额相等，允许 ≤¥0.01 舍入，否则拦截、不进付款
      if (rec.invoice_amount != null && Math.abs(+(rec.invoice_diff ?? 0)) > 0.01) {
        throw new BadRequestException(
          `发票金额 ${rec.invoice_amount} 须与对账金额 ${rec.total_amount} 一致（允许±0.01），当前差额 ${rec.invoice_diff}`,
        );
      }
      rec.status = ReconciliationStatus.CONFIRMED;
      rec.confirmed_at = new Date();
      const saved = await manager.save(Reconciliation, rec);

      // 对账确认后推进合同门户至「已对账」，解锁供应商开票（设计稿 门户 B2/E4：开票须对账后）
      if (rec.type === ReconcileType.CONTRACT && rec.contract_id) {
        const contract = await manager.findOne(Contract, { where: { id: rec.contract_id, deleted: 0 } });
        if (contract && contract.portal_status === ContractPortalStatus.SHIPPING) {
          contract.portal_status = ContractPortalStatus.RECONCILED;
          await manager.save(Contract, contract);
        }
      }

      return saved;
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
