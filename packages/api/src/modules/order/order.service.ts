import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, DataSource } from 'typeorm';
import { OrderMain } from './order-main.entity';
import { OrderSizeMatrix } from './order-size-matrix.entity';
import { OrderMaterial } from './order-material.entity';
import { OrderShipment } from './order-shipment.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { OrderStatus } from '@i9/types';
import { CreateOrderDto, AddShipmentDto } from './dto/create-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus> = {
  [OrderStatus.DRAFT]: OrderStatus.CONFIRMED,
  [OrderStatus.CONFIRMED]: OrderStatus.PRODUCING,
  [OrderStatus.PRODUCING]: OrderStatus.SHIPPED,
  [OrderStatus.SHIPPED]: OrderStatus.DONE,
  [OrderStatus.DONE]: OrderStatus.DONE,
};

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderMain) private readonly orderRepo: Repository<OrderMain>,
    @InjectRepository(OrderSizeMatrix) private readonly matrixRepo: Repository<OrderSizeMatrix>,
    @InjectRepository(OrderMaterial) private readonly materialRepo: Repository<OrderMaterial>,
    @InjectRepository(OrderShipment) private readonly shipmentRepo: Repository<OrderShipment>,
    private readonly numbering: NumberingService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateOrderDto, createdBy: number): Promise<OrderMain> {
    const order_no = await this.numbering.next(NUM_PREFIX.ORDER);

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.save(OrderMain, manager.create(OrderMain, {
        order_no,
        customer_id: dto.customer_id,
        customer_po: dto.customer_po,
        quote_id: dto.quote_id,
        style_name: dto.style_name,
        delivery_date: dto.delivery_date as any,
        qty_total: dto.qty_total,
        currency: dto.currency ?? 'USD',
        unit_price: dto.unit_price,
        total_amount: dto.unit_price && dto.qty_total ? +(dto.unit_price * dto.qty_total).toFixed(4) : null,
        remark: dto.remark,
        created_by: createdBy,
        status: OrderStatus.DRAFT,
      }));

      if (dto.matrix_data) {
        await manager.save(OrderSizeMatrix, manager.create(OrderSizeMatrix, {
          order_id: order.id,
          matrix_data: dto.matrix_data,
        }));
      }

      if (dto.materials?.length) {
        const materials = dto.materials.map((m, idx) => {
          const lossRate = m.loss_rate ?? 0;
          const lossUsage = m.net_usage != null ? +(m.net_usage / (1 - lossRate / 100)).toFixed(4) : null;
          const totalPurchase = lossUsage != null && dto.qty_total ? +(lossUsage * dto.qty_total).toFixed(4) : null;
          const budget = totalPurchase != null && m.unit_price ? +(totalPurchase * m.unit_price).toFixed(4) : null;
          return manager.create(OrderMaterial, {
            order_id: order.id,
            quote_item_id: m.quote_item_id,
            item_name: m.item_name,
            unit: m.unit,
            net_usage: m.net_usage,
            loss_rate: lossRate,
            loss_usage: lossUsage,
            qty: dto.qty_total,
            total_purchase: totalPurchase,
            unit_price: m.unit_price,
            budget,
            sort_order: m.sort_order ?? idx,
          });
        });
        await manager.save(OrderMaterial, materials);
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
    const where: FindOptionsWhere<OrderMain> | FindOptionsWhere<OrderMain>[] = keyword
      ? [
          { ...base, order_no: Like(`%${keyword}%`) },
          { ...base, customer_po: Like(`%${keyword}%`) },
          { ...base, style_name: Like(`%${keyword}%`) },
        ]
      : base;

    const [items, total] = await this.orderRepo.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
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
    const updateData: Partial<OrderMain> = {};
    if (dto.customer_po !== undefined) updateData.customer_po = dto.customer_po;
    if (dto.style_name !== undefined) updateData.style_name = dto.style_name;
    if (dto.delivery_date !== undefined) updateData.delivery_date = dto.delivery_date as any;
    if (dto.qty_total !== undefined) updateData.qty_total = dto.qty_total;
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.unit_price !== undefined) updateData.unit_price = dto.unit_price;
    if (dto.remark !== undefined) updateData.remark = dto.remark;
    Object.assign(order, updateData);
    return this.orderRepo.save(order);
  }

  async advanceStatus(id: number): Promise<OrderMain> {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    if (order.status === OrderStatus.DONE) {
      throw new BadRequestException('订单已完成，无法继续推进');
    }
    order.status = STATUS_TRANSITIONS[order.status];
    return this.orderRepo.save(order);
  }

  async addShipment(id: number, dto: AddShipmentDto, createdBy: number): Promise<OrderShipment> {
    const order = await this.orderRepo.findOne({ where: { id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${id} 不存在`);
    if (order.status !== OrderStatus.PRODUCING && order.status !== OrderStatus.SHIPPED) {
      throw new BadRequestException('只有生产中或已出货状态可以添加出货记录');
    }
    return this.shipmentRepo.save(this.shipmentRepo.create({
      order_id: id,
      shipment_date: dto.shipment_date as any,
      qty: dto.qty,
      cartons: dto.cartons,
      tracking_no: dto.tracking_no,
      remark: dto.remark,
      created_by: createdBy,
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
}
