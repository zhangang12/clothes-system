import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, DataSource } from 'typeorm';
import { OrderMain } from './order-main.entity';
import { OrderSizeMatrix } from './order-size-matrix.entity';
import { OrderMaterial } from './order-material.entity';
import { OrderShipment } from './order-shipment.entity';
import { Quotation } from '../quote/quotation.entity';
import { QuotationItem } from '../quote/quotation-item.entity';
import { SampleMaterial } from '../sample/sample-material.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { CustomerService } from '../customer/customer.service';
import { SysConfigService } from '../../common/config/sys-config.service';
import { OrderStatus, QuoteStatus, ApprovalStatus, APPROVAL_THRESHOLD_KEYS } from '@i9/types';
import { CreateOrderDto, CreateOrderMaterialDto, AddShipmentDto } from './dto/create-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus> = {
  [OrderStatus.DRAFT]: OrderStatus.CONFIRMED,
  [OrderStatus.CONFIRMED]: OrderStatus.CONTRACTED,
  [OrderStatus.CONTRACTED]: OrderStatus.PRODUCING,
  [OrderStatus.PRODUCING]: OrderStatus.DONE,
  [OrderStatus.DONE]: OrderStatus.DONE,
};

// 整数类材料（离散单位 个/条/件/套/对 等）：损耗后向上取整、保留整数（订单设计稿 E5/Q43）
const INT_UNITS = ['个', '条', '只', '件', '粒', '套', '对', 'pcs', 'PCS', 'PC'];

// 采购量 = 大货总数 × 单件耗用 × (1 + 损耗%)；roundUp 显式覆盖单位判断（行内手动取整，Q43）
export function calcPurchase(qtyTotal = 0, netUsage = 0, lossRate = 0, unit?: string, roundUp?: boolean) {
  const perUnit = netUsage * (1 + lossRate / 100);
  let total = qtyTotal * perUnit;
  const shouldRound = roundUp !== undefined ? roundUp : !!(unit && INT_UNITS.includes(unit));
  total = shouldRound ? Math.ceil(total) : +total.toFixed(4);
  return { perUnit: +perUnit.toFixed(4), total };
}

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderMain) private readonly orderRepo: Repository<OrderMain>,
    @InjectRepository(OrderSizeMatrix) private readonly matrixRepo: Repository<OrderSizeMatrix>,
    @InjectRepository(OrderMaterial) private readonly materialRepo: Repository<OrderMaterial>,
    @InjectRepository(OrderShipment) private readonly shipmentRepo: Repository<OrderShipment>,
    @InjectRepository(Quotation) private readonly quoteRepo: Repository<Quotation>,
    @InjectRepository(QuotationItem) private readonly quoteItemRepo: Repository<QuotationItem>,
    @InjectRepository(SampleMaterial) private readonly sampleMaterialRepo: Repository<SampleMaterial>,
    private readonly numbering: NumberingService,
    private readonly config: SysConfigService,
    private readonly dataSource: DataSource,
    private readonly customerService: CustomerService,
  ) {}

  private buildMaterials(orderId: number, qtyTotal: number, materials: CreateOrderMaterialDto[]): OrderMaterial[] {
    return materials.map((m, idx) => {
      const lossRate = m.loss_rate ?? 3;
      const roundOverride = m.round_up == null ? undefined : m.round_up === 1;
      const { perUnit, total } = calcPurchase(qtyTotal, m.net_usage ?? 0, lossRate, m.unit, roundOverride);
      const finalPurchase = m.final_purchase ?? total;
      const budget = m.unit_price ? +(finalPurchase * m.unit_price).toFixed(4) : null;
      return this.materialRepo.create({
        order_id: orderId, quote_item_id: m.quote_item_id, item_name: m.item_name,
        part: m.part, width: m.width, color: m.color, composition: m.composition, supplier: m.supplier,
        split_mode: m.split_mode ?? 'NONE', unit: m.unit, net_usage: m.net_usage, loss_rate: lossRate,
        loss_usage: perUnit, qty: qtyTotal, total_purchase: total, final_purchase: finalPurchase,
        round_up: m.round_up ?? null, unit_price: m.unit_price, budget, sort_order: m.sort_order ?? idx,
      });
    });
  }

  async create(dto: CreateOrderDto, createdBy: number): Promise<OrderMain> {
    const order_no = await this.numbering.next(NUM_PREFIX.ORDER);
    const today = new Date().toISOString().slice(0, 10);
    // 中间商默认佣金率带出(P3#36/ORD B8):未显式给佣金时取客户档案默认值
    let commissionRate = dto.commission_rate;
    if (commissionRate == null && dto.customer_id) {
      const [row] = await this.dataSource.query(
        'SELECT commission_rate FROM customer WHERE id = ? AND deleted = 0', [dto.customer_id]);
      if (row?.commission_rate != null) commissionRate = +row.commission_rate;
    }

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.save(OrderMain, manager.create(OrderMain, {
        order_no, customer_id: dto.customer_id, customer_po: dto.customer_po, quote_id: dto.quote_id,
        style_name: dto.style_name, style_no: dto.style_no, buyer_id: dto.buyer_id,
        delivery_date: dto.delivery_date as any, qty_total: dto.qty_total, currency: dto.currency ?? 'USD',
        unit_price: dto.unit_price,
        total_amount: dto.unit_price && dto.qty_total ? +(dto.unit_price * dto.qty_total).toFixed(4) : null,
        commission_rate: commissionRate ?? 0, factory_id: dto.factory_id, salesperson: dto.salesperson,
        make_date: today, split_mode: dto.split_mode ?? 'NONE', remark: dto.remark,
        att_artwork: dto.att_artwork, att_sizechart: dto.att_sizechart, att_board: dto.att_board,
        att_packing: dto.att_packing, att_filling: dto.att_filling,
        created_by: createdBy, status: OrderStatus.DRAFT,
      }));

      if (dto.matrix_data) {
        await manager.save(OrderSizeMatrix, manager.create(OrderSizeMatrix, { order_id: order.id, matrix_data: dto.matrix_data }));
      }
      if (dto.materials?.length) {
        await manager.save(OrderMaterial, this.buildMaterials(order.id, dto.qty_total, dto.materials));
      }
      return order;
    });
  }

  // 机密客户名称快照遮蔽(P1#18/A2):未授权用户在订单列表/详情看到 🔒(客户属机密单据的延伸)
  private async maskConfidentialNames<T extends { customer_id?: number; buyer_id?: number; middleman_name?: string; buyer_name?: string }>(
    rows: T[], user?: { id: number; role?: string },
  ): Promise<void> {
    if (!user) return;
    const ids = await this.customerService.visibleCustomerIds(user);
    if (ids === null) return; // 管理员全量可见
    const visible = new Set(ids);
    for (const r of rows) {
      if (r.customer_id && !visible.has(+r.customer_id)) r.middleman_name = '🔒 机密' as any;
      if (r.buyer_id && !visible.has(+r.buyer_id)) r.buyer_name = '🔒 机密' as any;
    }
  }

  async findAll(query: QueryOrderDto, user?: { id: number; role?: string }) {
    const { page = 1, size = 20, keyword, status, customer_id, quote_id } = query;
    const base: FindOptionsWhere<OrderMain> = {
      deleted: 0,
      ...(status !== undefined && { status }),
      ...(customer_id !== undefined && { customer_id }),
      ...(quote_id !== undefined && { quote_id }), // 报价→订单反查（关联单据 chip）
    };
    const searchable = ['order_no', 'customer_po', 'style_no', 'style_name', 'middleman_name', 'buyer_name'];
    const where: FindOptionsWhere<OrderMain> | FindOptionsWhere<OrderMain>[] = keyword
      ? searchable.map((f) => ({ ...base, [f]: Like(`%${keyword}%`) }))
      : base;

    const [items, total] = await this.orderRepo.findAndCount({
      where, skip: (page - 1) * size, take: size, order: { id: 'DESC' },
    });
    await this.maskConfidentialNames(items, user);
    return { items, total, page, size };
  }

  // 报价被哪些订单引用(P2#20/#23):报价详情显示关联订单号/状态,草稿引用=「占用中」软标记
  async listByQuote(quoteId: number): Promise<Array<{ id: number; order_no: string; status: string }>> {
    const orders = await this.orderRepo.find({
      where: { quote_id: quoteId, deleted: 0 },
      select: ['id', 'order_no', 'status'],
      order: { id: 'DESC' },
    });
    return orders.map((o) => ({ id: o.id, order_no: o.order_no, status: o.status }));
  }

  async findOne(id: number, user?: { id: number; role?: string }) {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    await this.maskConfidentialNames([order], user);
    const [matrix, materials, shipments] = await Promise.all([
      this.matrixRepo.findOne({ where: { order_id: id } }),
      this.materialRepo.find({ where: { order_id: id }, order: { sort_order: 'ASC' } }),
      this.shipmentRepo.find({ where: { order_id: id }, order: { shipment_date: 'ASC' } }),
    ]);
    // 变更标记(P2#20):①源报价已变更 ②样衣未实测成单→单耗为预估黄条
    let source_quote_changed = false;
    let usage_estimated = false;
    let quote_no: string | null = null; // 上游单据号（关联单据 chip 显示单据号而非裸 ID）；报价已删→null
    if (order.quote_id) {
      const quote = await this.quoteRepo.findOne({ where: { id: order.quote_id } });
      quote_no = quote?.quote_no ?? null;
      if (quote?.content_updated_at) {
        const baseline = order.quote_synced_at ?? order.created_at;
        source_quote_changed = baseline != null && new Date(quote.content_updated_at) > new Date(baseline);
      }
      if (quote?.sample_id) {
        const mats = await this.sampleMaterialRepo.find({ where: { sample_id: quote.sample_id } });
        usage_estimated = mats.length > 0 && mats.some((m) => m.actual_usage == null);
      }
    }
    return { ...order, matrix, materials, shipments, source_quote_changed, usage_estimated, quote_no };
  }

  async update(id: number, dto: Partial<CreateOrderDto>): Promise<OrderMain> {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态的订单可以编辑');
    }
    const map: Array<[keyof CreateOrderDto, keyof OrderMain]> = [
      ['customer_po', 'customer_po'], ['style_name', 'style_name'], ['style_no', 'style_no'],
      ['buyer_id', 'buyer_id'], ['qty_total', 'qty_total'], ['currency', 'currency'], ['unit_price', 'unit_price'],
      ['commission_rate', 'commission_rate'], ['factory_id', 'factory_id'], ['salesperson', 'salesperson'],
      ['split_mode', 'split_mode'], ['remark', 'remark'],
      ['att_artwork', 'att_artwork'], ['att_sizechart', 'att_sizechart'], ['att_board', 'att_board'],
      ['att_packing', 'att_packing'], ['att_filling', 'att_filling'],
    ];
    for (const [k, col] of map) if (dto[k] !== undefined) (order as any)[col] = dto[k];
    if (dto.delivery_date !== undefined) order.delivery_date = dto.delivery_date as any;
    // 金额与单价/数量始终一致(L5):单价或数量任一被清空(如单价改 null)时同步清空总金额,避免下单审批阈值校验基于陈旧金额
    order.total_amount = order.unit_price && order.qty_total ? +(order.unit_price * order.qty_total).toFixed(4) : null;
    // 编辑会重算金额:清除已有审批状态,避免「审批通过后改高金额再下单」绕过阈值校验
    order.approval_status = ApprovalStatus.NONE;
    order.content_updated_at = new Date(); // 内容级修改——合同侧「源订单已变更」标记依据(P2#20)

    return this.dataSource.transaction(async (manager) => {
      await manager.save(OrderMain, order);
      if (dto.materials !== undefined) {
        await manager.delete(OrderMaterial, { order_id: id });
        await manager.save(OrderMaterial, this.buildMaterials(id, order.qty_total, dto.materials));
      }
      // 尺码数量搭配矩阵（修复：此前编辑从不落库——只有 create 存，编辑改矩阵会静默丢失）
      if (dto.matrix_data !== undefined) {
        const existing = await manager.findOne(OrderSizeMatrix, { where: { order_id: id } });
        if (existing) {
          existing.matrix_data = dto.matrix_data;
          await manager.save(OrderSizeMatrix, existing);
        } else {
          await manager.save(OrderSizeMatrix, manager.create(OrderSizeMatrix, { order_id: id, matrix_data: dto.matrix_data }));
        }
      }
      return order;
    });
  }

  // 从报价一键导入：带出基础字段 + 复制报价明细到材料明细（单件耗用=报价耗用），快照
  async importFromQuote(id: number, quoteId: number): Promise<OrderMain> {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    if (order.status !== OrderStatus.DRAFT) throw new BadRequestException('只有草稿状态可从报价导入');
    const quote = await this.quoteRepo.findOne({ where: { id: quoteId, deleted: 0 } });
    if (!quote) throw new BadRequestException(`报价单 #${quoteId} 不存在`);
    // A7:仅「已报价」及之后状态的报价可建单;草稿报价禁止
    if (![QuoteStatus.QUOTED, QuoteStatus.ADJUSTING, QuoteStatus.ORDERED].includes(quote.status)) {
      throw new BadRequestException('只能从「已报价」及之后状态的报价建单(草稿报价禁止)');
    }
    const items = await this.quoteItemRepo.find({ where: { quote_id: quoteId }, order: { sort_order: 'ASC' } });

    return this.dataSource.transaction(async (manager) => {
      order.quote_id = quoteId;
      order.customer_id = quote.customer_id;
      order.middleman_name = quote.middleman_name;
      order.buyer_id = quote.buyer_id;
      order.buyer_name = quote.buyer_name;
      if (!order.style_no) order.style_no = quote.style_no;
      // 导入默认币种 RMB、报价人民币价→订单单品单价（设计稿 订单 A3/Q3，可改）
      order.currency = 'CNY';
      if (quote.rmb_total != null) order.unit_price = +(+quote.rmb_total).toFixed(4);
      // 图片随单继承(P3#33/ORD C3):报价款图(源自样衣)作订单彩稿候选,已有不覆盖
      if (!order.att_artwork && (quote.image1 || quote.image2)) order.att_artwork = quote.image1 || quote.image2;
      order.approval_status = ApprovalStatus.NONE; // 导入改金额:清审批,避免绕过阈值
      order.quote_synced_at = new Date(); // 「源报价已变更」= quote.content_updated_at > 此值(P2#20)
      await manager.save(OrderMain, order);
      await manager.delete(OrderMaterial, { order_id: id });
      const materials = this.buildMaterials(id, order.qty_total, items.map((it) => ({
        item_name: it.item_name, part: it.part, width: it.width, color: it.color, supplier: it.supplier,
        unit: it.unit, net_usage: +it.quote_usage || 0, loss_rate: +it.loss_rate || 3, unit_price: +it.rmb_price || undefined,
        quote_item_id: it.id,
      } as CreateOrderMaterialDto)));
      if (materials.length) await manager.save(OrderMaterial, materials);
      return order;
    });
  }

  // 在产订单迁移导入(P3#43/ORD D10):历史系统在产单批量入库,external_no 存原单号;
  // 客户按名精确匹配(找不到记失败行),状态默认 PRODUCING(在产),可指定 CONFIRMED/CONTRACTED/DONE
  async importBatch(rows: Array<Record<string, any>>, createdBy: number) {
    const failures: Array<{ row: number; reason: string }> = [];
    let ok = 0;
    const ALLOWED = ['CONFIRMED', 'CONTRACTED', 'PRODUCING', 'DONE'];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (!r.customer_name) throw new Error('缺客户名称');
        const [cust] = await this.dataSource.query(
          'SELECT id, name FROM customer WHERE name = ? AND deleted = 0 LIMIT 1', [String(r.customer_name).trim()]);
        if (!cust) throw new Error(`客户「${r.customer_name}」不存在(先在基础资料建档)`);
        const status = ALLOWED.includes(String(r.status ?? '').toUpperCase()) ? String(r.status).toUpperCase() : 'PRODUCING';
        const order_no = await this.numbering.next(NUM_PREFIX.ORDER);
        const qty = +r.qty_total || 0;
        const price = r.unit_price != null && r.unit_price !== '' ? +r.unit_price : null;
        await this.orderRepo.save(this.orderRepo.create({
          order_no,
          external_no: r.external_no ? String(r.external_no).slice(0, 50) : null,
          customer_id: +cust.id,
          middleman_name: cust.name,
          customer_po: r.customer_po ? String(r.customer_po) : null,
          style_no: r.style_no ? String(r.style_no) : null,
          style_name: r.style_name ? String(r.style_name) : null,
          qty_total: qty,
          currency: r.currency ? String(r.currency).toUpperCase() : 'CNY',
          unit_price: price,
          total_amount: price != null && qty ? +(price * qty).toFixed(4) : null,
          delivery_date: r.delivery_date || null,
          salesperson: r.salesperson ? String(r.salesperson) : null,
          remark: r.remark ? String(r.remark) : '历史迁移导入',
          status,
          created_by: createdBy,
          deleted: 0,
        } as any) as any);
        ok++;
      } catch (e: any) {
        failures.push({ row: i + 1, reason: e?.message ?? '未知错误' });
      }
    }
    return { ok, fail: failures.length, failures };
  }

  // 订单复制(P3#34/qc I5):同客户复购/同款改单——复制主表+用料+尺码矩阵为新草稿
  async copy(id: number, createdBy: number): Promise<OrderMain> {
    const src = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!src) throw new NotFoundException(`订单 #${id} 不存在`);
    const order_no = await this.numbering.next(NUM_PREFIX.ORDER);
    return this.dataSource.transaction(async (manager) => {
      const { id: _id, created_at, updated_at, ...rest } = src as any;
      const copy = manager.create(OrderMain, {
        ...rest,
        order_no,
        status: OrderStatus.DRAFT,
        approval_status: ApprovalStatus.NONE,
        approved_by: null, approved_at: null,
        quote_synced_at: null, content_updated_at: null,
        created_by: createdBy,
        deleted: 0,
      });
      const saved = await manager.save(OrderMain, copy);
      const materials = await manager.find(OrderMaterial, { where: { order_id: id } });
      if (materials.length) {
        await manager.save(OrderMaterial, materials.map(({ id: _mid, ...m }: any) =>
          manager.create(OrderMaterial, { ...m, order_id: saved.id })));
      }
      const matrix = await manager.findOne(OrderSizeMatrix, { where: { order_id: id } });
      if (matrix) {
        await manager.save(OrderSizeMatrix, manager.create(OrderSizeMatrix, { order_id: saved.id, matrix_data: matrix.matrix_data }));
      }
      return saved;
    });
  }

  async advanceStatus(id: number): Promise<OrderMain> {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    // D1:仅「下单」(草稿→已下单)为手动动作;已生成合同/生产中/已完成均由下游事件自动回写,不可手改
    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException('订单下单后,状态由下游事件(生成合同/发货/对账)自动推进,不可手动推进');
    }
    const next = STATUS_TRANSITIONS[order.status];
    // 金额阈值审批：下单（草稿→已下单）时订单金额超阈值需主管审批（设计稿 审批矩阵，阈值可配）
    if (order.status === OrderStatus.DRAFT && order.approval_status !== ApprovalStatus.APPROVED) {
      const threshold = await this.config.getNumber(APPROVAL_THRESHOLD_KEYS.ORDER);
      // 佣金>阈值 或 币种=USD 触发审批(P3#36/ORD D7;系统参数,默认0=不启用)
      const commissionThreshold = await this.config.getNumber('approval.order.commission_threshold', 0);
      const usdRequired = await this.config.getNumber('approval.order.usd_required', 0);
      const reasons: string[] = [];
      if (threshold > 0 && +order.total_amount > threshold) reasons.push(`订单金额 ${order.total_amount} 超过审批阈值 ${threshold}`);
      if (commissionThreshold > 0 && +(order.commission_rate ?? 0) > commissionThreshold) {
        reasons.push(`佣金率 ${order.commission_rate}% 超过阈值 ${commissionThreshold}%`);
      }
      if (usdRequired > 0 && order.currency === 'USD') reasons.push('美金订单须审批');
      if (reasons.length) {
        if (order.approval_status !== ApprovalStatus.PENDING) {
          order.approval_status = ApprovalStatus.PENDING;
          await this.orderRepo.save(order);
        }
        throw new BadRequestException(`${reasons.join('；')}，需主管审批后方可下单`);
      }
    }
    order.status = next;
    const saved = await this.orderRepo.save(order);
    // 下单（→已下单）时反写关联报价「已成单」（设计稿 订单 D2/A8）
    if (next === OrderStatus.CONFIRMED && order.quote_id) {
      await this.quoteRepo.update({ id: order.quote_id }, { status: QuoteStatus.ORDERED });
    }
    return saved;
  }

  // 主管审批（超阈值订单）：待审批 → 已审批，放行下单
  async approveOrder(id: number, approverId: number): Promise<OrderMain> {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    if (order.approval_status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('该订单无待审批项（未超阈值或已审批）');
    }
    order.approval_status = ApprovalStatus.APPROVED;
    order.approved_by = approverId;
    order.approved_at = new Date();
    return this.orderRepo.save(order);
  }

  // 已下单撤回（用户反馈：已下单订单需要能改）——已下单→草稿，可再编辑；已生成合同起不可撤回
  async revertToDraft(id: number): Promise<OrderMain> {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    if (order.status !== OrderStatus.CONFIRMED) {
      throw new BadRequestException(
        order.status === OrderStatus.DRAFT
          ? '订单本就是草稿，可直接编辑'
          : '已生成合同的订单不可撤回——请先处理下游合同后再操作',
      );
    }
    order.status = OrderStatus.DRAFT;
    // 撤回后可改金额/数量，重新下单须重走阈值审批（与「审批后改金额清审批」同一口径）
    order.approval_status = ApprovalStatus.NONE;
    order.approved_by = null;
    order.approved_at = null;
    return this.orderRepo.save(order);
  }

  async addShipment(id: number, dto: AddShipmentDto, createdBy: number): Promise<OrderShipment> {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    // 发货可在「已生成合同/生产中」进行；已完成为终态不可再发货（设计稿 订单 D1）
    if (order.status !== OrderStatus.CONTRACTED && order.status !== OrderStatus.PRODUCING) {
      throw new BadRequestException('只有已生成合同或生产中状态可以添加出货记录');
    }
    const shipment = await this.shipmentRepo.save(this.shipmentRepo.create({
      order_id: id, shipment_date: dto.shipment_date as any, qty: dto.qty,
      cartons: dto.cartons, tracking_no: dto.tracking_no, remark: dto.remark, created_by: createdBy,
    }));
    // 发货自动驱动订单进入「生产中」（下游事件回写，业务无需手动推进）
    if (order.status === OrderStatus.CONTRACTED) {
      order.status = OrderStatus.PRODUCING;
      await this.orderRepo.save(order);
    }
    return shipment;
  }

  // 尺码数量搭配矩阵独立更新(M9):终态守卫 + 回填 qty_total + 重算材料,保证矩阵/主表/材料三线一致
  async updateMatrix(id: number, matrix_data: Record<string, unknown>): Promise<OrderSizeMatrix> {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    // 状态守卫:终态订单禁止改矩阵(订单状态机无「已取消」,DONE 为唯一终态)
    if (order.status === OrderStatus.DONE) {
      throw new BadRequestException('已完成订单不可再修改尺码数量矩阵');
    }
    const existing = await this.matrixRepo.findOne({ where: { order_id: id } });
    // 矩阵→大货总数:新结构 qtys=各PO数量数组;旧平铺行 qty 单值(口径同合同材料拆行 expandMaterialLines)
    const rows = Array.isArray((matrix_data as any)?.rows) ? ((matrix_data as any).rows as any[]) : null;
    const qtyTotal = rows == null ? null : rows.reduce((s: number, r: any) =>
      s + (Array.isArray(r?.qtys) ? r.qtys.reduce((x: number, n: any) => x + (+n || 0), 0) : (+r?.qty || 0)), 0);
    const matrixChanged = JSON.stringify(existing?.matrix_data ?? null) !== JSON.stringify(matrix_data ?? null);
    const qtyChanged = qtyTotal != null && qtyTotal !== +order.qty_total;

    return this.dataSource.transaction(async (manager) => {
      if (matrixChanged || qtyChanged) {
        // 矩阵内容确有变化才 bump——合同材料拆行直接读矩阵行,属合同侧需感知的内容级修改;
        // 无变化重复提交不 bump,防合同侧「源订单已变更」误报(P2#20)
        if (matrixChanged) order.content_updated_at = new Date();
        if (qtyTotal != null && qtyChanged) {
          order.qty_total = qtyTotal;
          // 金额与单价/数量始终一致(同 L5 口径);数量变动→清审批,避免「审批通过后改高金额再下单」绕过阈值校验
          order.total_amount = order.unit_price && qtyTotal ? +(order.unit_price * qtyTotal).toFixed(4) : null;
          order.approval_status = ApprovalStatus.NONE;
        }
        await manager.save(OrderMain, order);
      }
      if (qtyTotal != null && qtyChanged) {
        // 按既有逻辑重算材料(采购量=大货总数×单件耗用×(1+损耗%),与 buildMaterials 同式)
        const materials = await manager.find(OrderMaterial, { where: { order_id: id } });
        for (const m of materials) {
          const roundOverride = m.round_up == null ? undefined : m.round_up === 1;
          const lossRate = m.loss_rate == null ? 3 : +m.loss_rate;
          const { perUnit, total } = calcPurchase(qtyTotal, m.net_usage == null ? 0 : +m.net_usage, lossRate, m.unit, roundOverride);
          // final_purchase=业务微调值:与系统量一致(未微调)时跟随重算;有偏差(人工微调过)则保留人工值
          const wasAuto = m.final_purchase == null || +m.final_purchase === +m.total_purchase;
          m.loss_usage = perUnit;
          m.qty = qtyTotal;
          m.total_purchase = total;
          m.final_purchase = wasAuto ? total : m.final_purchase;
          m.budget = m.unit_price ? +(m.final_purchase * +m.unit_price).toFixed(4) : null;
        }
        if (materials.length) await manager.save(OrderMaterial, materials);
      }
      if (existing) {
        if (!matrixChanged) return existing; // 矩阵无变化:幂等返回,不写库
        existing.matrix_data = matrix_data;
        return manager.save(OrderSizeMatrix, existing);
      }
      return manager.save(OrderSizeMatrix, manager.create(OrderSizeMatrix, { order_id: id, matrix_data }));
    });
  }

  async remove(id: number): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态的订单可以删除');
    }
    order.deleted = 1;
    await this.orderRepo.save(order);
    // 删除引用报价的草稿订单：若该报价已无其它订单引用，解锁报价（已成单→已报价）使其可再编辑/转单
    if (order.quote_id) {
      const others = await this.orderRepo.count({ where: { quote_id: order.quote_id, deleted: 0 } });
      if (!others) {
        await this.quoteRepo.update({ id: order.quote_id, status: QuoteStatus.ORDERED }, { status: QuoteStatus.QUOTED });
      }
    }
  }

  static calcPurchase = calcPurchase;
}
