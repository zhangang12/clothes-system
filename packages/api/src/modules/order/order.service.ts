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
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { OrderStatus, QuoteStatus } from '@i9/types';
import { CreateOrderDto, CreateOrderMaterialDto, AddShipmentDto } from './dto/create-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus> = {
  [OrderStatus.DRAFT]: OrderStatus.CONFIRMED,
  [OrderStatus.CONFIRMED]: OrderStatus.CONTRACTED,
  [OrderStatus.CONTRACTED]: OrderStatus.PRODUCING,
  [OrderStatus.PRODUCING]: OrderStatus.DONE,
  [OrderStatus.DONE]: OrderStatus.DONE,
};

// 整数类材料（单位 个/条 等）：损耗后向上取整、保留整数（订单设计稿批注）
const INT_UNITS = ['个', '条', '只', '件', '粒', '套', 'pcs', 'PCS', 'PC'];

// 采购量 = 大货总数 × 单件耗用 × (1 + 损耗%)；整数类材料向上取整
export function calcPurchase(qtyTotal = 0, netUsage = 0, lossRate = 0, unit?: string) {
  const perUnit = netUsage * (1 + lossRate / 100);
  let total = qtyTotal * perUnit;
  total = unit && INT_UNITS.includes(unit) ? Math.ceil(total) : +total.toFixed(4);
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
    private readonly numbering: NumberingService,
    private readonly dataSource: DataSource,
  ) {}

  private buildMaterials(orderId: number, qtyTotal: number, materials: CreateOrderMaterialDto[]): OrderMaterial[] {
    return materials.map((m, idx) => {
      const lossRate = m.loss_rate ?? 3;
      const { perUnit, total } = calcPurchase(qtyTotal, m.net_usage ?? 0, lossRate, m.unit);
      const finalPurchase = m.final_purchase ?? total;
      const budget = m.unit_price ? +(finalPurchase * m.unit_price).toFixed(4) : null;
      return this.materialRepo.create({
        order_id: orderId, quote_item_id: m.quote_item_id, item_name: m.item_name,
        part: m.part, width: m.width, color: m.color, composition: m.composition, supplier: m.supplier,
        split_mode: m.split_mode ?? 'NONE', unit: m.unit, net_usage: m.net_usage, loss_rate: lossRate,
        loss_usage: perUnit, qty: qtyTotal, total_purchase: total, final_purchase: finalPurchase,
        unit_price: m.unit_price, budget, sort_order: m.sort_order ?? idx,
      });
    });
  }

  async create(dto: CreateOrderDto, createdBy: number): Promise<OrderMain> {
    const order_no = await this.numbering.next(NUM_PREFIX.ORDER);
    const today = new Date().toISOString().slice(0, 10);

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.save(OrderMain, manager.create(OrderMain, {
        order_no, customer_id: dto.customer_id, customer_po: dto.customer_po, quote_id: dto.quote_id,
        style_name: dto.style_name, style_no: dto.style_no, buyer_id: dto.buyer_id,
        delivery_date: dto.delivery_date as any, qty_total: dto.qty_total, currency: dto.currency ?? 'USD',
        unit_price: dto.unit_price,
        total_amount: dto.unit_price && dto.qty_total ? +(dto.unit_price * dto.qty_total).toFixed(4) : null,
        commission_rate: dto.commission_rate ?? 0, factory_id: dto.factory_id, salesperson: dto.salesperson,
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

  async findAll(query: QueryOrderDto) {
    const { page = 1, size = 20, keyword, status, customer_id } = query;
    const base: FindOptionsWhere<OrderMain> = {
      deleted: 0,
      ...(status !== undefined && { status }),
      ...(customer_id !== undefined && { customer_id }),
    };
    const searchable = ['order_no', 'customer_po', 'style_no', 'style_name', 'middleman_name', 'buyer_name'];
    const where: FindOptionsWhere<OrderMain> | FindOptionsWhere<OrderMain>[] = keyword
      ? searchable.map((f) => ({ ...base, [f]: Like(`%${keyword}%`) }))
      : base;

    const [items, total] = await this.orderRepo.findAndCount({
      where, skip: (page - 1) * size, take: size, order: { id: 'DESC' },
    });
    return { items, total, page, size };
  }

  async findOne(id: number) {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    const [matrix, materials, shipments] = await Promise.all([
      this.matrixRepo.findOne({ where: { order_id: id } }),
      this.materialRepo.find({ where: { order_id: id }, order: { sort_order: 'ASC' } }),
      this.shipmentRepo.find({ where: { order_id: id }, order: { shipment_date: 'ASC' } }),
    ]);
    return { ...order, matrix, materials, shipments };
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
    if (order.unit_price && order.qty_total) order.total_amount = +(order.unit_price * order.qty_total).toFixed(4);

    return this.dataSource.transaction(async (manager) => {
      await manager.save(OrderMain, order);
      if (dto.materials !== undefined) {
        await manager.delete(OrderMaterial, { order_id: id });
        await manager.save(OrderMaterial, this.buildMaterials(id, order.qty_total, dto.materials));
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
    const items = await this.quoteItemRepo.find({ where: { quote_id: quoteId }, order: { sort_order: 'ASC' } });

    return this.dataSource.transaction(async (manager) => {
      order.quote_id = quoteId;
      order.customer_id = quote.customer_id;
      order.middleman_name = quote.middleman_name;
      order.buyer_id = quote.buyer_id;
      order.buyer_name = quote.buyer_name;
      if (!order.style_no) order.style_no = quote.style_no;
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

  async advanceStatus(id: number): Promise<OrderMain> {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    if (order.status === OrderStatus.DONE) {
      throw new BadRequestException('订单已完成，无法继续推进');
    }
    const next = STATUS_TRANSITIONS[order.status];
    order.status = next;
    const saved = await this.orderRepo.save(order);
    // 下单（→已下单）时反写关联报价「已成单」（设计稿 订单 D2/A8）
    if (next === OrderStatus.CONFIRMED && order.quote_id) {
      await this.quoteRepo.update({ id: order.quote_id }, { status: QuoteStatus.ORDERED });
    }
    return saved;
  }

  async addShipment(id: number, dto: AddShipmentDto, createdBy: number): Promise<OrderShipment> {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    if (order.status !== OrderStatus.PRODUCING && order.status !== OrderStatus.DONE) {
      throw new BadRequestException('只有生产中或已完成状态可以添加出货记录');
    }
    return this.shipmentRepo.save(this.shipmentRepo.create({
      order_id: id, shipment_date: dto.shipment_date as any, qty: dto.qty,
      cartons: dto.cartons, tracking_no: dto.tracking_no, remark: dto.remark, created_by: createdBy,
    }));
  }

  async updateMatrix(id: number, matrix_data: Record<string, unknown>): Promise<OrderSizeMatrix> {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    const existing = await this.matrixRepo.findOne({ where: { order_id: id } });
    if (existing) {
      existing.matrix_data = matrix_data;
      return this.matrixRepo.save(existing);
    }
    return this.matrixRepo.save(this.matrixRepo.create({ order_id: id, matrix_data }));
  }

  async remove(id: number): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态的订单可以删除');
    }
    order.deleted = 1;
    await this.orderRepo.save(order);
  }

  static calcPurchase = calcPurchase;
}
