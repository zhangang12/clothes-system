import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, In, DataSource } from 'typeorm';
import { Reconciliation, ReconciliationStatus } from './reconciliation.entity';
import { ReconciliationShipment } from './reconciliation-shipment.entity';
import { ReconciliationLaborItem } from './reconciliation-labor-item.entity';
import { ReconciliationExpenseItem } from './reconciliation-expense-item.entity';
import { Contract } from '../contract/contract.entity';
import { ContractShipment } from '../contract/contract-shipment.entity';
import { OrderMain } from '../order/order-main.entity';
import { SampleGarment } from '../sample/sample-garment.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { ReconcileType, ContractPortalStatus, OrderStatus, SampleStatus, ContractType } from '@i9/types';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { GenerateLaborDto } from './dto/generate-labor.dto';
import { QueryReconciliationDto } from './dto/query-reconciliation.dto';

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(Reconciliation) private readonly repo: Repository<Reconciliation>,
    @InjectRepository(ReconciliationShipment) private readonly shipmentRepo: Repository<ReconciliationShipment>,
    @InjectRepository(ReconciliationLaborItem) private readonly laborItemRepo: Repository<ReconciliationLaborItem>,
    @InjectRepository(ReconciliationExpenseItem) private readonly expenseItemRepo: Repository<ReconciliationExpenseItem>,
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

    return this.dataSource.transaction(async (manager) => {
      const shipmentLines = dto.shipments ?? [];
      const expenseLines = dto.expenses ?? [];
      // 无合同空白对账单以费用明细求和；合同对账以出货批次求和（补充确认v1.1）
      const totalAmount = expenseLines.length
        ? expenseLines.reduce((sum, e) => sum + (+e.amount || 0), 0)
        : shipmentLines.reduce((sum, s) => sum + s.snapshot_unit_price * s.qty, 0);

      // 一张对账单不允许混含材料+加工两类合同（补充确认v1.0 B3：仅同一类型）
      const batchContractIds = Array.from(new Set(
        shipmentLines.map((s) => s.contract_id ?? dto.contract_id).filter(Boolean),
      )) as number[];
      if (batchContractIds.length > 1) {
        const contracts = await manager.find(Contract, { where: { id: In(batchContractIds), deleted: 0 } });
        const types = Array.from(new Set(contracts.map((c) => c.type)));
        if (types.length > 1) {
          throw new BadRequestException('一张对账单只能同一类型合同（材料 或 加工），不可混含');
        }
      }

      // 款号带出（合同→订单），供对账列表按款号检索（设计稿 对账 A2）
      let styleNo: string | null = null;
      if (dto.contract_id) {
        const contract = await manager.findOne(Contract, { where: { id: dto.contract_id, deleted: 0 } });
        if (contract?.order_id) {
          const order = await manager.findOne(OrderMain, { where: { id: contract.order_id, deleted: 0 } });
          styleNo = order?.style_no ?? null;
        }
      }
      // 一单多合同：无单一合同、但批次各自带款号时，汇总款号（款A、款B / 款A 等N款）供检索
      if (!styleNo) {
        const batchStyles = Array.from(new Set(shipmentLines.map((s) => s.style_no).filter(Boolean))) as string[];
        if (batchStyles.length === 1) styleNo = batchStyles[0];
        else if (batchStyles.length > 1) styleNo = `${batchStyles[0]} 等${batchStyles.length}款`;
      }

      // 对账单编号 DZ-款号-序号；无合同 DZ-费用-序号（设计稿 补充确认 A2）
      const seg = dto.type === ReconcileType.NO_CONTRACT ? '费用' : (styleNo || 'NA');
      const reconcile_no = await this.numbering.nextWithSegment(NUM_PREFIX.RECONCILIATION, seg);

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
          sub_type: dto.type === ReconcileType.NO_CONTRACT ? (dto.subType ?? null) : null,
          contract_id: dto.contract_id,
          style_no: styleNo,
          factory_id: dto.factory_id,
          total_amount: +totalAmount.toFixed(4),
          tax_rate: dto.tax_rate ?? null,
          tax_amount: taxAmount,
          invoice_no: dto.invoice_no || null, // 空串归一为 NULL:唯一索引允许多张「无发票」对账单并存,仅拦真实重复发票号
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
            contract_id: s.contract_id ?? dto.contract_id ?? null,
            style_no: s.style_no ?? null,
            item_name: s.item_name,
            snapshot_unit_price: s.snapshot_unit_price,
            qty: s.qty,
            amount: +(s.snapshot_unit_price * s.qty).toFixed(4),
            remark: s.remark ?? null,
          }),
        );
        await manager.save(ReconciliationShipment, lines);
      }

      // 无合同空白对账单·费用明细落库（补充确认v1.1）
      if (expenseLines.length) {
        const items = expenseLines.map((e) =>
          manager.create(ReconciliationExpenseItem, {
            reconcile_id: reconciliation.id,
            expense_name: e.expense_name,
            amount: +(+e.amount).toFixed(4),
            style_no: e.style_no ?? null,
            attach_url: e.attach_url ?? null,
          }),
        );
        await manager.save(ReconciliationExpenseItem, items);
      }

      return reconciliation;
    });
  }

  // 样衣打样工时对账：业务自由勾选多款样衣（须同一版师、均已对账），合并生成一张工时对账单
  // 设计稿 样衣确认清单 rec:0「业务自由勾选多款合并生成工时对账单，工时单价默认 CNY」（批注#8：工时对账要一起提取很多款）
  async generateLabor(dto: GenerateLaborDto, createdBy: number): Promise<Reconciliation> {
    const ids = Array.from(new Set(dto.sampleIds));
    return this.dataSource.transaction(async (manager) => {
      const samples = await manager.find(SampleGarment, { where: { id: In(ids), deleted: 0 } });
      if (samples.length !== ids.length) {
        throw new BadRequestException('部分样衣不存在或已删除，无法生成工时对账');
      }
      // 均须已对账（版师填完件数+单价、状态已对账）且有工时金额
      const notReady = samples.filter((s) => s.status !== SampleStatus.RECONCILED || !(+s.labor_amount > 0));
      if (notReady.length) {
        throw new BadRequestException(
          `样衣 ${notReady.map((s) => s.sample_no || s.id).join('、')} 未完成工时（需版师填件数+单价、状态已对账）`,
        );
      }
      // 一张工时对账单受款方唯一：须同一版师
      const makerIds = Array.from(new Set(samples.map((s) => s.patternmaker_id ?? 0)));
      if (makerIds.length > 1 || makerIds[0] === 0) {
        throw new BadRequestException('工时对账须同一版师的样衣合并（受款方唯一）');
      }
      // 防重复对账：所选样衣不得已在未删除的工时对账单中
      const existed = await manager.find(ReconciliationLaborItem, { where: { sample_id: In(ids) } });
      if (existed.length) {
        const recIds = Array.from(new Set(existed.map((e) => e.reconcile_id)));
        const active = await manager.find(Reconciliation, { where: { id: In(recIds), deleted: 0 } });
        if (active.length) {
          throw new BadRequestException('部分样衣已在其他工时对账单中，不能重复对账');
        }
      }

      const total = +samples.reduce((s, x) => s + (+x.labor_amount || 0), 0).toFixed(2);
      const firstStyle = samples[0].style_no;
      const styleNo = samples.length > 1 ? `${firstStyle} 等${samples.length}款` : firstStyle;
      const reconcile_no = await this.numbering.nextWithSegment(NUM_PREFIX.RECONCILIATION, '工时');

      const reconciliation = await manager.save(
        Reconciliation,
        manager.create(Reconciliation, {
          reconcile_no,
          type: ReconcileType.LABOR,
          contract_id: null,
          style_no: styleNo,
          factory_id: null,
          patternmaker_id: samples[0].patternmaker_id,
          patternmaker_name: samples[0].patternmaker_name ?? null,
          currency: 'CNY',
          total_amount: total,
          has_invoice: 0,
          description: `样衣打样工时对账·${samples.length}款`,
          status: ReconciliationStatus.DRAFT,
          created_by: createdBy,
        }),
      );

      const items = samples.map((s) =>
        manager.create(ReconciliationLaborItem, {
          reconcile_id: reconciliation.id,
          sample_id: s.id,
          sample_no: s.sample_no,
          style_no: s.style_no,
          piece_count: s.piece_count,
          labor_unit_price: s.labor_unit_price,
          labor_amount: s.labor_amount,
        }),
      );
      await manager.save(ReconciliationLaborItem, items);

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
    // 工时对账带出多款明细（批次可点跳回样衣）
    const laborItems = reconciliation.type === ReconcileType.LABOR
      ? await this.laborItemRepo.find({ where: { reconcile_id: id } })
      : [];
    // 无合同空白对账单带出费用明细（补充确认v1.1）
    const expenseItems = reconciliation.type === ReconcileType.NO_CONTRACT
      ? await this.expenseItemRepo.find({ where: { reconcile_id: id } })
      : [];
    return { ...reconciliation, shipments, laborItems, expenseItems };
  }

  // 业务员初审提交：草稿→待主管复核（设计稿 对账 B1/C1 二级审批）
  async submit(id: number): Promise<Reconciliation> {
    const rec = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!rec) throw new NotFoundException(`对账单 #${id} 不存在`);
    if (rec.status !== ReconciliationStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态才可提交复核');
    }
    await this.assertBatchesStillHeld(id);
    rec.status = ReconciliationStatus.PENDING;
    return this.repo.save(rec);
  }

  // 主管整单退回：待复核→草稿，记录退回批注（补充确认：可逐批批注、整单退回）。
  // 同时释放被本单占用的发货批次——供应商在门户看到批注后可修正并重新勾选发起（门户B3）；
  // 释放后的批次型对账单不可再提交（防同批次两单重复计费），仅作退回留痕。
  async reject(id: number, remark?: string): Promise<Reconciliation> {
    return this.dataSource.transaction(async (manager) => {
      const rec = await manager.findOne(Reconciliation, { where: { id, deleted: 0 } });
      if (!rec) throw new NotFoundException(`对账单 #${id} 不存在`);
      if (rec.status !== ReconciliationStatus.PENDING) {
        throw new BadRequestException('只有待复核状态才可整单退回');
      }
      rec.status = ReconciliationStatus.DRAFT;
      rec.review_remark = remark ?? null;
      await manager.update(ContractShipment, { reconcile_id: id }, { reconcile_id: null as any });
      return manager.save(Reconciliation, rec);
    });
  }

  // 批次型对账单（门户勾选发货批次生成）被退回后批次已释放——不可再提交/确认，防同批次重复计费
  private async assertBatchesStillHeld(id: number): Promise<void> {
    const linked = await this.shipmentRepo.count({ where: { reconcile_id: id } });
    if (!linked) return; // 非批次型对账单
    const held = await this.dataSource.getRepository(ContractShipment).count({ where: { reconcile_id: id } });
    if (!held) {
      throw new BadRequestException(
        '该对账单为门户批次对账且已整单退回、批次已释放——请由供应商在门户按批注重新发起，本单仅作退回留痕',
      );
    }
  }

  // 主管复核确认：待复核→已确认（二级审批第二级）
  async confirm(id: number): Promise<Reconciliation> {
    return this.dataSource.transaction(async (manager) => {
      const rec = await manager.findOne(Reconciliation, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!rec) throw new NotFoundException(`对账单 #${id} 不存在`);
      if (rec.status !== ReconciliationStatus.PENDING) {
        throw new BadRequestException('只有待复核状态才可复核确认（需业务员先提交）');
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
        if (contract) {
          if (contract.portal_status === ContractPortalStatus.SHIPPING) {
            contract.portal_status = ContractPortalStatus.RECONCILED;
            await manager.save(Contract, contract);
          }
          // 对账确认驱动订单进入「已完成」（设计稿 订单 D1：后两态由下游回写）
          if (contract.order_id) {
            const order = await manager.findOne(OrderMain, { where: { id: contract.order_id, deleted: 0 } });
            if (order && order.status === OrderStatus.PRODUCING) {
              order.status = OrderStatus.DONE;
              await manager.save(OrderMain, order);
            }
          }
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
    // 释放被本单占用的发货批次（门户「我要对账」占用防重复；删单后供应商可重新勾选）
    await this.dataSource.query(
      'UPDATE contract_shipment SET reconcile_id = NULL WHERE reconcile_id = ?', [id],
    );
  }
}
