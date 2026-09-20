import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, EntityManager } from 'typeorm';
import { Contract } from '../contract/contract.entity';
import { ContractMaterial } from '../contract/contract-material.entity';
import { ContractShipment } from '../contract/contract-shipment.entity';
import { ContractShipmentItem } from '../contract/contract-shipment-item.entity';
import { ContractPortalLog, PortalOperatorType } from '../contract/contract-portal-log.entity';
import { OrderMain } from '../order/order-main.entity';
import { OrderMaterial } from '../order/order-material.entity';
import { OrderSizeMatrix } from '../order/order-size-matrix.entity';
import { Reconciliation, ReconciliationStatus } from '../reconciliation/reconciliation.entity';
import { ReconciliationShipment } from '../reconciliation/reconciliation-shipment.entity';
import { PaymentRequest } from '../payment/payment-request.entity';
import { Factory } from '../factory/factory.entity';
import { CompanyProfile } from '../company/company-profile.entity';
import { ContractPortalStatus, ContractType, ReconcileType, PaymentApprovalStatus } from '@i9/types';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { UploadInvoiceDto } from './dto/upload-invoice.dto';
import { toLocalDateStr } from '../../common/utils/local-date';

// 金额统一四位小数：逐批先取整再求和，对账单表头 = 明细合计（B134 同口径）
const r4 = (n: number) => +Number(n).toFixed(4);

const VISIBLE_STATUSES = [
  ContractPortalStatus.PUSHED,
  ContractPortalStatus.STAMPED,
  ContractPortalStatus.SHIPPING,
  ContractPortalStatus.RECONCILED,
  ContractPortalStatus.COMPLETED, // 已完成仍可回看（门户E2「已完成」标签）
];

@Injectable()
export class PortalService {
  constructor(
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    @InjectRepository(ContractMaterial) private readonly materialRepo: Repository<ContractMaterial>,
    @InjectRepository(ContractShipment) private readonly shipmentRepo: Repository<ContractShipment>,
    @InjectRepository(ContractShipmentItem) private readonly shipmentItemRepo: Repository<ContractShipmentItem>,
    @InjectRepository(ContractPortalLog) private readonly logRepo: Repository<ContractPortalLog>,
    @InjectRepository(OrderMain) private readonly orderRepo: Repository<OrderMain>,
    @InjectRepository(OrderMaterial) private readonly orderMaterialRepo: Repository<OrderMaterial>,
    @InjectRepository(OrderSizeMatrix) private readonly matrixRepo: Repository<OrderSizeMatrix>,
    @InjectRepository(Reconciliation) private readonly reconcileRepo: Repository<Reconciliation>,
    @InjectRepository(PaymentRequest) private readonly prRepo: Repository<PaymentRequest>,
    @InjectRepository(Factory) private readonly factoryRepo: Repository<Factory>,
    @InjectRepository(CompanyProfile) private readonly companyRepo: Repository<CompanyProfile>,
    private readonly numbering: NumberingService,
    private readonly dataSource: DataSource,
  ) {}

  async getContracts(factoryId: number, page = 1, size = 20, portalStatus?: string) {
    size = Math.min(Math.max(Number(size) || 20, 1), 100); page = Math.max(Number(page) || 1, 1); // 分页钳制
    // B058：状态筛选只认门户可见白名单——此前传了 portal_status 就跳过白名单，供应商能列出本厂尚未推送的草稿合同头
    if (portalStatus && !VISIBLE_STATUSES.includes(portalStatus as ContractPortalStatus)) {
      throw new BadRequestException('不支持的合同状态筛选');
    }
    const base = { factory_id: factoryId, deleted: 0 };
    const where = portalStatus
      ? { ...base, portal_status: portalStatus as ContractPortalStatus }
      : VISIBLE_STATUSES.map((s) => ({ ...base, portal_status: s }));

    // 待我处理优先(P2#27):待盖章>待发货>待对账>待开票>已完成,同级新单在前
    const qb = this.contractRepo.createQueryBuilder('c')
      .where('c.factory_id = :fid AND c.deleted = 0', { fid: factoryId });
    if (portalStatus) qb.andWhere('c.portal_status = :ps', { ps: portalStatus });
    else qb.andWhere('c.portal_status IN (:...vs)', { vs: VISIBLE_STATUSES });
    qb.addSelect(`FIELD(c.portal_status,'PUSHED','STAMPED','SHIPPING','RECONCILED','COMPLETED')`, 'todo_rank')
      .orderBy('todo_rank', 'ASC')
      .addOrderBy('c.id', 'DESC')
      .skip((page - 1) * size)
      .take(size);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, size };
  }

  async getContract(id: number, factoryId: number) {
    const contract = await this.contractRepo.findOne({ where: { id, factory_id: factoryId, deleted: 0 } });
    if (!contract || !VISIBLE_STATUSES.includes(contract.portal_status)) {
      throw new NotFoundException('合同不存在');
    }
    const [materials, logs, shipments, reconciliations] = await Promise.all([
      this.materialRepo.find({ where: { contract_id: id }, order: { sort_order: 'ASC' } }),
      this.logRepo.find({ where: { contract_id: id }, order: { created_at: 'ASC' } }),
      // 发货批次（含审批状态/是否已对账）：门户「我要对账」勾选数据源（设计稿 B2）
      this.shipmentRepo.find({ where: { contract_id: id }, order: { id: 'ASC' } }),
      // 对账单回显（含退回批注 review_remark）：供应商可见退回原因并重新发起（门户B3/补充确认）
      this.reconcileRepo.find({
        where: { contract_id: id, deleted: 0 },
        select: ['id', 'reconcile_no', 'status', 'review_remark', 'total_amount', 'invoice_no', 'created_at'],
        order: { id: 'DESC' },
      }),
    ]);
    // 加工合同：把订单明细同步给加工厂（材料/尺寸表/数量搭配/纸板/填充量，设计稿 门户 A2）
    let orderDetail: Record<string, unknown> | null = null;
    if (contract.type === ContractType.PROCESS && contract.order_id) {
      const order = await this.orderRepo.findOne({ where: { id: contract.order_id, deleted: 0 } });
      if (order) {
        const [orderMaterials, matrix] = await Promise.all([
          this.orderMaterialRepo.find({ where: { order_id: order.id }, order: { sort_order: 'ASC' } }),
          this.matrixRepo.findOne({ where: { order_id: order.id } }),
        ]);
        orderDetail = {
          order_no: order.order_no,
          style_no: order.style_no,
          qty_total: order.qty_total,
          att_artwork: order.att_artwork,
          att_sizechart: order.att_sizechart,
          att_board: order.att_board,
          att_packing: order.att_packing,
          att_filling: order.att_filling,
          // 工厂不见任何单价(总览走查P0#5/ORD D5-D6):剥离采购单价/预算,只同步工艺所需字段
          materials: orderMaterials.map(({ unit_price, budget, ...rest }) => rest),
          size_matrix: matrix?.matrix_data ?? null,
        };
      }
    }
    // 批次物料行(P3#30):按批次挂 items
    if (shipments.length) {
      const items = await this.shipmentItemRepo.find({ where: { shipment_id: In(shipments.map((b) => b.id)) } });
      const byShip = new Map<number, ContractShipmentItem[]>();
      items.forEach((it) => {
        const k = +it.shipment_id;
        if (!byShip.has(k)) byShip.set(k, []);
        byShip.get(k)!.push(it);
      });
      (shipments as any[]).forEach((b) => { (b as any).items = byShip.get(+b.id) ?? []; });
    }
    // 门户打印合同：落款甲乙方信息（工厂=本账号所属工厂，本司=默认主体；只取打印所需字段）
    const [factory, company] = await Promise.all([
      this.factoryRepo.findOne({
        where: { id: factoryId, deleted: 0 },
        select: ['id', 'name', 'address', 'contact_name', 'contact_phone', 'seal_url'],
      }),
      this.companyRepo.findOne({
        where: { deleted: 0 },
        select: ['id', 'name', 'address', 'phone', 'legal_rep', 'bank_name', 'bank_account', 'seal_url'],
        order: { is_default: 'DESC', id: 'ASC' },
      }),
    ]);
    return { ...contract, materials, logs, shipments, reconciliations, orderDetail, factory, company };
  }

  async stamp(id: number, supplierAccount: string, factoryId: number, agreed = false, paperUrl?: string): Promise<Contract> {
    // 盖章=电子签约的意思表示，须先勾选「已阅读并同意合同条款」（供应商门户设计稿 §B）
    if (!agreed) {
      throw new BadRequestException('请先阅读并勾选「已阅读并同意合同条款」后再盖章');
    }
    const contract = await this.contractRepo.findOne({ where: { id, factory_id: factoryId, deleted: 0 } });
    if (!contract || !VISIBLE_STATUSES.includes(contract.portal_status)) {
      throw new NotFoundException('合同不存在');
    }
    if (contract.portal_status !== ContractPortalStatus.PUSHED) {
      throw new BadRequestException('只有已推送状态才可盖章');
    }

    const materials = await this.materialRepo.find({
      where: { contract_id: id },
      order: { sort_order: 'ASC' },
    });

    const snapshot = {
      contract_no: contract.contract_no,
      type: contract.type,
      factory_id: contract.factory_id,
      order_id: contract.order_id,
      total_amount: contract.total_amount,
      currency: contract.currency,
      deposit_ratio: contract.deposit_ratio,
      mid_ratio: contract.mid_ratio,
      final_ratio: contract.final_ratio,
      account_period_days: contract.account_period_days,
      materials: materials.map((m) => ({
        item_name: m.item_name,
        spec: m.spec,
        unit: m.unit,
        unit_price: m.unit_price,
        qty: m.qty,
        amount: m.amount,
      })),
      stamped_at: new Date().toISOString(),
    };

    contract.portal_status = ContractPortalStatus.STAMPED;
    contract.stamped_at = new Date();
    contract.stamped_by_supplier = supplierAccount;
    // 电子章/纸质盖章二选一留痕（A3）：传照片=纸质,否则电子章(PDF 落款贴 factory.seal_url)
    contract.stamp_mode = paperUrl ? 'PAPER' : 'ESEAL';
    contract.stamp_paper_url = paperUrl ?? null;
    contract.snapshot_json = snapshot;
    contract.revised = 0; // 供应商已对更新后的合同重新盖章确认，清除「已更新」标记
    await this.contractRepo.save(contract);

    await this.logRepo.save(
      this.logRepo.create({
        contract_id: id,
        action: 'STAMP',
        operator: supplierAccount,
        operator_type: PortalOperatorType.SUPPLIER,
        remark: '已阅读并同意合同条款',
      }),
    );

    return contract;
  }

  // 事务内按行锁取合同（B012/B013/B014）：供应商侧所有会改 shipped_qty / portal_status / 占用批次的动作都从这里进，
  // 同一合同的并发请求在这里排队，后到的看到的是前一个已提交的结果
  private async lockContract(manager: EntityManager, id: number, factoryId: number): Promise<Contract> {
    const contract = await manager.findOne(Contract, {
      where: { id, factory_id: factoryId, deleted: 0 },
      lock: { mode: 'pessimistic_write' },
    });
    if (!contract || !VISIBLE_STATUSES.includes(contract.portal_status)) {
      throw new NotFoundException('合同不存在');
    }
    return contract;
  }

  // 累计已发按「未驳回批次」重算而不是内存加减（B012/B060）：幂等，连点/并发/驳回后撤回都不会算歪
  //（与 contract.service.recalcShippedQty 同口径，这里基于事务 manager 实现，避免跨模块）
  private async recalcShippedQty(manager: EntityManager, contractId: number): Promise<number> {
    const rows = await manager.find(ContractShipment, { where: { contract_id: contractId } });
    return r4(rows
      .filter((r) => r.approval_status !== 'REJECTED')
      .reduce((s, r) => s + (+r.qty || 0), 0));
  }

  // 单批发货入参（P3#30 逐物料行 / P3#31 临时收货地址）。须在事务内调用，contract 已由 lockContract 锁定
  private async createShipmentBatch(
    manager: EntityManager,
    contract: Contract,
    supplierAccount: string,
    dto: { remark?: string; qty?: number; express_company?: string; express_no?: string; attach_url?: string;
           ship_address?: string; items?: Array<{ material_id?: number; qty: number }> },
    mergeNo?: string,
  ): Promise<{ shipNo: string; qty: number; parts: string[] }> {
    const materials = await manager.find(ContractMaterial, { where: { contract_id: contract.id }, order: { sort_order: 'ASC' } });
    const contractQty = materials.reduce((s, m) => s + +m.qty, 0);

    // 逐物料行(P3#30):行=合同材料行,分行填实发数;批次数量=Σ行,金额=Σ(行单价×实发数)——比整单加权更准
    let qty = dto.qty ?? 0;
    let amount: number | null = null;
    let unitPrice: number | null = null;
    let lines: Array<{ material_id: number | null; item_name: string | null; qty: number; unit_price: number | null; amount: number | null }> = [];
    if (dto.items?.length) {
      const byId = new Map(materials.map((m) => [+m.id, m]));
      lines = dto.items
        .filter((it) => +it.qty > 0)
        .map((it) => {
          const m = it.material_id != null ? byId.get(+it.material_id) : undefined;
          const up = m?.unit_price != null ? +m.unit_price : null;
          return {
            material_id: m ? +m.id : null,
            item_name: m?.item_name ?? null,
            qty: +it.qty,
            unit_price: up,
            amount: up != null ? +(up * +it.qty).toFixed(4) : null,
          };
        });
      if (!lines.length) throw new BadRequestException('请至少为一行物料填写实发数');
      qty = +lines.reduce((s, l) => s + l.qty, 0).toFixed(4);
      if (lines.every((l) => l.amount != null)) {
        amount = +lines.reduce((s, l) => s + (l.amount ?? 0), 0).toFixed(4);
        unitPrice = qty > 0 ? +(amount / qty).toFixed(4) : null;
      }
    }
    // 负数/零分开报：用户填 -46 想冲掉发多的量（2026-08-10 King 实际这么干了），
    // 原来一律回「请填写本次实发数量」——他明明填了，等于没告诉他哪儿不对。
    if (qty < 0) {
      throw new BadRequestException(
        '本次实发不能是负数。发多了/发错了请联系业务在系统里驳回该批次，驳回后累计已发会自动扣回，再重新发一次正确的数量',
      );
    }
    if (!(qty > 0)) throw new BadRequestException('请填写本次实发数量');
    if (!dto.express_company?.trim() || !dto.express_no?.trim()) {
      throw new BadRequestException('请填写物流信息（快递公司与单号）');
    }

    // 发货单号 FH-款号-序号（设计稿 补充确认 A2）
    let styleNo = '';
    if (contract.order_id) {
      const order = await manager.findOne(OrderMain, { where: { id: contract.order_id, deleted: 0 } });
      styleNo = order?.style_no || '';
    }
    const shipNo = await this.numbering.nextWithSegment(NUM_PREFIX.SHIPMENT, styleNo);

    // 逐批锁价：无物料行时按合同均价快照（对账付款串流程 B8）
    if (amount == null) {
      const contractAmount = materials.reduce((s, m) => s + +m.amount, 0);
      unitPrice = contractQty > 0 ? +(contractAmount / contractQty).toFixed(4) : null;
      amount = unitPrice != null ? +(unitPrice * qty).toFixed(4) : null;
    }
    const shipDate = new Date();
    const batch = (await manager.save(ContractShipment, manager.create(ContractShipment, {
      contract_id: contract.id, ship_no: shipNo, qty,
      snapshot_unit_price: unitPrice, amount,
      ship_date: toLocalDateStr(shipDate), // B061：业务日期取本地日历日，别用 UTC（凌晨建单会写成昨天）
      operator: supplierAccount,
      express_company: dto.express_company ?? null,
      express_no: dto.express_no ?? null,
      attach_url: dto.attach_url ?? null,
      // 收货地址默认带合同发货地址,门户可临时改(P3#31)
      ship_address: dto.ship_address?.trim() || contract.ship_to_address || null,
      merge_no: mergeNo ?? null,
    } as any) as any)) as ContractShipment;
    if (lines.length) {
      await manager.save(ContractShipmentItem, lines.map((l) => manager.create(ContractShipmentItem, { ...l, shipment_id: batch.id } as any) as ContractShipmentItem));
    }

    // B012：累计已发 = 事务内按未驳回批次重算（含刚落库的这一批），不再拿内存里的旧值加——
    // 供应商连点两次「确认出货」各 500，此前两次都基于 shipped_qty=0 算、累计只记 500
    const newShipped = await this.recalcShippedQty(manager, contract.id);
    const parts: string[] = [];
    // 超合同量不再卡供应商发货(P2#28/补充B3 决议:货已实发,放行并记录;
    // 超发确认移到对账复核——业务确认时须填写放行原因留痕,见 reconciliation.confirm)
    if (contractQty > 0 && newShipped > contractQty + 0.01) {
      parts.push(`⚠️超发:累计 ${newShipped}/合同量 ${contractQty}(对账复核时业务确认放行)`);
    }
    contract.shipped_qty = newShipped;
    parts.push(`发货单:${shipNo}`, `本次发货:${qty}`, `累计:${newShipped}/${contractQty}`);
    if (dto.express_company || dto.express_no) parts.push(`物流:${[dto.express_company, dto.express_no].filter(Boolean).join(' ')}`);
    if (dto.ship_address?.trim() && dto.ship_address.trim() !== (contract.ship_to_address ?? '')) {
      parts.push(`收货地址(临时):${dto.ship_address.trim()}`);
    }
    if (mergeNo) parts.push(`合并发货组:${mergeNo}`);

    // 到期日 = 最后一次发货日 + 账期（逾期判断依据，对账付款串流程 D15）
    contract.last_ship_date = shipDate;
    if (contract.account_period_days != null) {
      const due = new Date(shipDate);
      due.setDate(due.getDate() + contract.account_period_days);
      contract.due_date = due;
    }
    if (dto.remark) parts.push(dto.remark);
    if (contract.portal_status === ContractPortalStatus.STAMPED) {
      contract.portal_status = ContractPortalStatus.SHIPPING;
    }
    await manager.save(Contract, contract);
    await manager.save(ContractPortalLog, manager.create(ContractPortalLog, {
      contract_id: contract.id,
      action: 'SHIP',
      operator: supplierAccount,
      operator_type: PortalOperatorType.SUPPLIER,
      remark: parts.length ? parts.join(' · ') : undefined,
    }));
    return { shipNo, qty, parts };
  }

  async confirmShipping(
    id: number,
    supplierAccount: string,
    factoryId: number,
    dto: { remark?: string; qty?: number; force?: boolean; express_company?: string; express_no?: string; attach_url?: string;
           ship_address?: string; items?: Array<{ material_id?: number; qty: number }> } = {},
  ): Promise<Contract> {
    // B012：整段进事务并锁合同行，并发的第二次「确认出货」要等第一次提交后再算累计
    return this.dataSource.transaction(async (manager) => {
      const contract = await this.lockContract(manager, id, factoryId);
      // 发货可在「已盖章」（首批）或「发货中」（续批）进行（设计稿 门户 B3：批次累计）
      if (contract.portal_status !== ContractPortalStatus.STAMPED && contract.portal_status !== ContractPortalStatus.SHIPPING) {
        throw new BadRequestException('只有已盖章或发货中状态才可确认出货');
      }
      await this.createShipmentBatch(manager, contract, supplierAccount, dto);
      return contract;
    });
  }

  // 跨合同合并发货（P3#29/门户C2/qc G1）：同供应商（登录工厂）勾多张可发货合同，
  // 一套物流信息，逐合同填数量（或逐物料行），明细分摊到各合同（各生成本合同批次，同 merge_no 组号）
  async mergeShip(
    supplierAccount: string,
    factoryId: number,
    dto: { express_company: string; express_no: string; attach_url?: string; ship_address?: string; remark?: string;
           entries: Array<{ contract_id: number; qty?: number; items?: Array<{ material_id?: number; qty: number }> }> },
  ) {
    if (!dto.entries?.length || dto.entries.length < 2) {
      throw new BadRequestException('合并发货请至少勾选 2 张合同');
    }
    if (!dto.express_company?.trim() || !dto.express_no?.trim()) {
      throw new BadRequestException('请填写物流信息（快递公司与单号）');
    }
    // B059：整组一个事务——任一张失败（如物料行全为 0）整组回滚，不再留下半截合并单；合同行按 id 升序加锁防死锁
    return this.dataSource.transaction(async (manager) => {
      const byId = new Map<number, Contract>();
      const orderedIds = [...new Set(dto.entries.map((e) => +e.contract_id))].sort((a, b) => a - b);
      for (const cid of orderedIds) {
        const c = await manager.findOne(Contract, {
          where: { id: cid, factory_id: factoryId, deleted: 0 },
          lock: { mode: 'pessimistic_write' },
        });
        if (!c || !VISIBLE_STATUSES.includes(c.portal_status)) throw new NotFoundException(`合同 #${cid} 不存在`);
        if (c.portal_status !== ContractPortalStatus.STAMPED && c.portal_status !== ContractPortalStatus.SHIPPING) {
          throw new BadRequestException(`合同 ${c.contract_no} 当前状态不可发货（须已盖章/发货中）`);
        }
        byId.set(cid, c);
      }
      const mergeNo = await this.numbering.nextWithSegment(NUM_PREFIX.SHIPMENT, 'M');
      const results: Array<{ contract_id: number; contract_no: string; ship_no: string; qty: number }> = [];
      for (const e of dto.entries) {
        const c = byId.get(+e.contract_id)!;
        const r = await this.createShipmentBatch(manager, c, supplierAccount, {
          qty: e.qty, items: e.items,
          express_company: dto.express_company, express_no: dto.express_no,
          attach_url: dto.attach_url, ship_address: dto.ship_address, remark: dto.remark,
        }, mergeNo);
        results.push({ contract_id: c.id, contract_no: c.contract_no, ship_no: r.shipNo, qty: r.qty });
      }
      return { merge_no: mergeNo, count: results.length, results };
    });
  }

  // 我要对账（设计稿 05 v2.2 §C 第三步）：勾选已审批发货批次 → 系统按批次快照单价×数量自动算
  // → 生成对账单(直接 PENDING 推业务复核) → 占用批次防重复对账；业务复核确认后合同→已对账,解锁开票
  async createReconcile(
    id: number,
    supplierAccount: string,
    factoryId: number,
    dto: { shipment_ids: number[] },
  ) {
    if (!dto.shipment_ids?.length) throw new BadRequestException('请至少勾选 1 个发货批次');
    const ids = [...new Set(dto.shipment_ids.map((x) => +x))];
    let batches: ContractShipment[] = [];
    let totalAmount = 0;
    const rec = await this.dataSource.transaction(async (manager) => {
      // B013：合同行与批次行都在事务内加锁后再判占用——两个标签页同时点「我要对账」勾同一批次，
      // 后到的要等先到的提交，再看到 reconcile_id 已被占而被拦，不再生成两张 PENDING 对账单
      const contract = await this.lockContract(manager, id, factoryId);
      // 顺序锁定（B2）：对账须在发货阶段（至少一批已发货）进行
      if (contract.portal_status !== ContractPortalStatus.SHIPPING) {
        throw new BadRequestException('对账须在发货后进行（当前合同尚未发货或已完成对账）');
      }
      batches = await manager.find(ContractShipment, {
        where: { id: In(ids), contract_id: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (batches.length !== ids.length) {
        throw new BadRequestException('存在不属于本合同的发货批次');
      }
      const notApproved = batches.filter((b) => b.approval_status !== 'APPROVED');
      if (notApproved.length) {
        throw new BadRequestException(
          `批次 ${notApproved.map((b) => b.ship_no ?? b.id).join('、')} 尚未通过业务审批，不可对账（B2）`,
        );
      }
      const occupied = batches.filter((b) => b.reconcile_id);
      if (occupied.length) {
        throw new BadRequestException(
          `批次 ${occupied.map((b) => b.ship_no ?? b.id).join('、')} 已在其他对账单中，不可重复对账`,
        );
      }

      // 款号（DZ-款号-序号 + 对账单检索字段）
      let styleNo: string | null = null;
      if (contract.order_id) {
        const order = await manager.findOne(OrderMain, { where: { id: contract.order_id, deleted: 0 } });
        styleNo = order?.style_no ?? null;
      }
      // B134：逐批先取整再求和，表头总额 = 明细合计
      const lineAmount = (b: ContractShipment) => r4(+b.amount || (+b.snapshot_unit_price || 0) * +b.qty);
      totalAmount = r4(batches.reduce((s, b) => s + lineAmount(b), 0));
      if (!(totalAmount > 0)) throw new BadRequestException('勾选批次合计金额为 0，无法生成对账单');
      const reconcile_no = await this.numbering.nextWithSegment(NUM_PREFIX.RECONCILIATION, styleNo || 'NA');

      const reconciliation = await manager.save(Reconciliation, manager.create(Reconciliation, {
        reconcile_no,
        type: ReconcileType.CONTRACT,
        contract_id: id,
        style_no: styleNo,
        factory_id: factoryId,
        total_amount: totalAmount,
        description: `供应商门户发起（${supplierAccount} 勾选 ${batches.length} 个发货批次）`,
        status: ReconciliationStatus.PENDING, // 直接推业务复核（设计稿：确认对账·推业务审批）
        created_by: contract.created_by ?? 0,  // 归属合同业务员
      }));

      await manager.save(ReconciliationShipment, batches.map((b) => manager.create(ReconciliationShipment, {
        reconcile_id: reconciliation.id,
        shipment_id: b.id,
        contract_id: id,
        style_no: styleNo,
        item_name: b.ship_no ?? `批次#${b.id}`,
        snapshot_unit_price: +b.snapshot_unit_price || 0,
        qty: +b.qty,
        amount: lineAmount(b),
      })));

      // 占用批次（对账单被删除时释放）
      for (const b of batches) {
        b.reconcile_id = reconciliation.id;
      }
      await manager.save(ContractShipment, batches);

      return reconciliation;
    });

    await this.logRepo.save(this.logRepo.create({
      contract_id: id,
      action: 'RECONCILE',
      operator: supplierAccount,
      operator_type: PortalOperatorType.SUPPLIER,
      remark: `对账单:${rec.reconcile_no} · 批次:${batches.map((b) => b.ship_no ?? b.id).join('、')} · 金额:${totalAmount}`,
    }));

    return rec;
  }

  // 发货完成（门户C3）：供应商宣布本合同发货全部完成;开票后据此闭环到「已完成」
  async shipDone(id: number, supplierAccount: string, factoryId: number): Promise<Contract> {
    const contract = await this.contractRepo.findOne({ where: { id, factory_id: factoryId, deleted: 0 } });
    if (!contract || !VISIBLE_STATUSES.includes(contract.portal_status)) {
      throw new NotFoundException('合同不存在');
    }
    if (
      contract.portal_status !== ContractPortalStatus.SHIPPING &&
      contract.portal_status !== ContractPortalStatus.RECONCILED
    ) {
      throw new BadRequestException('至少完成一批发货后才可宣布发货完成');
    }
    if (contract.ship_done_at) throw new BadRequestException('本合同已宣布发货完成，请勿重复操作');
    contract.ship_done_at = new Date();
    await this.contractRepo.save(contract);
    await this.logRepo.save(this.logRepo.create({
      contract_id: id,
      action: 'SHIP_DONE',
      operator: supplierAccount,
      operator_type: PortalOperatorType.SUPPLIER,
      remark: `供应商宣布发货完成（累计已发 ${contract.shipped_qty ?? 0}）`,
    }));
    return contract;
  }

  // 撤回发货批次（门户B3）：错发/多发在未被对账占用前可撤回，累计发货量同步回退
  async withdrawShipment(id: number, shipmentId: number, supplierAccount: string, factoryId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const contract = await this.lockContract(manager, id, factoryId);
      // 状态校验（L33）：仅「发货中/已对账」可撤回；已完成等状态放行会造成既撤不了也对不了账的流程死角
      if (
        contract.portal_status !== ContractPortalStatus.SHIPPING &&
        contract.portal_status !== ContractPortalStatus.RECONCILED
      ) {
        throw new BadRequestException('当前合同状态不可撤回发货批次（仅发货中或已对账状态可撤回）');
      }
      const batch = await manager.findOne(ContractShipment, { where: { id: shipmentId, contract_id: id } });
      if (!batch) throw new NotFoundException('发货批次不存在');
      if (batch.reconcile_id) {
        throw new BadRequestException('该批次已被对账单占用，不可撤回（如需调整请联系业务退回对账）');
      }
      await manager.delete(ContractShipmentItem, { shipment_id: shipmentId });
      await manager.delete(ContractShipment, { id: shipmentId });
      // B060：撤回后累计已发按剩余未驳回批次重算——被驳回的批次业务驳回时已冲回，此前这里不看审批状态又减一次
      contract.shipped_qty = await this.recalcShippedQty(manager, id);
      if (contract.ship_done_at) contract.ship_done_at = null as any; // 撤回后不再视为发货完成
      await manager.save(Contract, contract);
      await manager.save(ContractPortalLog, manager.create(ContractPortalLog, {
        contract_id: id,
        action: 'WITHDRAW_SHIP',
        operator: supplierAccount,
        operator_type: PortalOperatorType.SUPPLIER,
        remark: `撤回发货批次 ${batch.ship_no ?? '#' + shipmentId}（数量 ${batch.qty}），累计已发回退至 ${contract.shipped_qty}`,
      }));
    });
  }

  async uploadInvoice(id: number, supplierAccount: string, factoryId: number, dto: UploadInvoiceDto): Promise<void> {
    // 财务管控（设计稿 门户开票 / 06 D2）：发票号+金额必填,发票金额必须=对账金额(±¥0.01),发票号不可重复
    if (!dto.invoice_no) throw new BadRequestException('请填写发票号');
    if (dto.invoice_amount == null) throw new BadRequestException('请填写发票金额');

    // B014：写发票→建付款申请→改合同状态整段一个事务，并锁合同行与对账单行：
    // 双击/慢网重发的第二个请求等第一个提交后再判「已开票」，不会再生成两张 PENDING 付款申请；
    // 中途任一步失败整体回滚，不会出现「发票已落库、合同仍待开票」再提示「请勿重复提交」的卡死
    await this.dataSource.transaction(async (manager) => {
      const contract = await this.lockContract(manager, id, factoryId);
      // 四步顺序锁定：开票须在对账通过后（设计稿 门户 B2/E4）
      if (contract.portal_status !== ContractPortalStatus.RECONCILED) {
        throw new BadRequestException('开票须在对账通过后进行（当前合同尚未完成对账）');
      }

      const recons = await manager.find(Reconciliation, {
        where: { contract_id: id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      const confirmed = recons.filter(
        (r) => r.status === ReconciliationStatus.CONFIRMED || r.status === ReconciliationStatus.PAID,
      );
      if (confirmed.length === 0) throw new BadRequestException('尚无已确认的对账单,无法开票');
      const pending = confirmed.filter((r) => !r.invoice_no);
      if (pending.length === 0) throw new BadRequestException('该合同对账单已开票,请勿重复提交');
      if (pending.length > 1) throw new BadRequestException('该合同存在多张待开票对账单,请联系业务处理');
      const rec = pending[0];

      const diff = +(dto.invoice_amount! - +rec.total_amount).toFixed(4);
      if (Math.abs(diff) > 0.01) {
        throw new BadRequestException(
          `发票金额 ¥${dto.invoice_amount} 与对账金额 ¥${(+rec.total_amount).toFixed(2)} 不一致,无法提交`,
        );
      }
      // 发票号全局查重（防重复报销;DB uk_invoice_no 兜底并发）
      const dup = await manager.findOne(Reconciliation, { where: { invoice_no: dto.invoice_no, deleted: 0 } });
      if (dup && +dup.id !== +rec.id) {
        throw new BadRequestException(`发票号 ${dto.invoice_no} 已被对账单 ${dup.reconcile_no} 使用（防重复付）`);
      }

      // 发票落到对账单（不再只写日志）
      rec.invoice_no = dto.invoice_no!;
      rec.invoice_amount = dto.invoice_amount!;
      rec.invoice_diff = diff;
      rec.invoice_url = dto.invoice_url ?? null;
      rec.has_invoice = 1;
      await manager.save(Reconciliation, rec);

      // 开票→推财务:自动生成一张付款申请(状态 PENDING,进财务审批台)。
      // B015：此前 findOne 取任意一条既有申请、命中驳回单就再建一张全额，且没有任何累计校验。
      // 现在套用与 payment.service.createPaymentRequest 同一套闸门：
      //  ① 幂等——同一对账单已有非驳回（在途/已批/已付）申请就不再建；
      //  ② 累计申请（非驳回）+ 本次全额 ≤ 对账应付（有任何非驳回申请必然超出 → 不建）；
      //  ③ 工厂一致——对账单归属工厂须与合同一致，否则拦下，不自动往错的工厂付钱。
      const existing = await manager.find(PaymentRequest, { where: { reconcile_id: rec.id, deleted: 0 } });
      const active = existing.filter((p) => p.approval_status !== PaymentApprovalStatus.REJECTED);
      const requested = r4(active.reduce((s, p) => s + +p.amount, 0));
      const payable = +rec.total_amount;
      const canCreate = active.length === 0 && requested + payable <= payable + 0.01;
      if (canCreate) {
        if (rec.factory_id != null && Number(rec.factory_id) !== Number(contract.factory_id)) {
          throw new BadRequestException(
            `对账单 ${rec.reconcile_no} 归属工厂与合同不一致，无法自动生成付款申请，请联系业务处理`,
          );
        }
        const pr_no = await this.numbering.next(NUM_PREFIX.PAYMENT);
        await manager.save(PaymentRequest, manager.create(PaymentRequest, {
          pr_no,
          type: ReconcileType.CONTRACT,
          reconcile_id: rec.id,
          factory_id: contract.factory_id,
          amount: rec.total_amount,
          prepay_offset: 0,
          actual_pay: rec.total_amount,
          account_period_days: contract.account_period_days ?? null,
          due_date: contract.due_date ?? null, // 到期日=最后发货日+账期(发货时已算)
          approval_status: PaymentApprovalStatus.PENDING,
          description: `门户开票自动生成(发票 ${dto.invoice_no})`,
          created_by: rec.created_by ?? null,
        }));
      }

      // 开票后闭环（门户C3/E2）：供应商已宣布发货完成→「已完成」；否则回「发货中」允许继续发后续批次再对账
      contract.portal_status = contract.ship_done_at
        ? ContractPortalStatus.COMPLETED
        : ContractPortalStatus.SHIPPING;
      await manager.save(Contract, contract);

      const parts: string[] = [`发票号:${dto.invoice_no}`, `金额:${dto.invoice_amount}`];
      if (dto.invoice_url) parts.push(`附件:${dto.invoice_url}`);
      if (dto.remark) parts.push(dto.remark);
      await manager.save(ContractPortalLog, manager.create(ContractPortalLog, {
        contract_id: id,
        action: 'INVOICE',
        operator: supplierAccount,
        operator_type: PortalOperatorType.SUPPLIER,
        remark: parts.join(' · '),
      }));
    });
  }
}
