import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere, DataSource } from 'typeorm';
import { SettlementStatus } from '@i9/types';
import { Settlement } from './settlement.entity';
import { SettlementCost } from './settlement-cost.entity';
import { SettlementReceipt } from './settlement-receipt.entity';
import { OrderMain } from '../order/order-main.entity';
import { OrderShipment } from '../order/order-shipment.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { AddCostDto } from './dto/add-cost.dto';
import { AddReceiptDto } from './dto/add-receipt.dto';
import { QuerySettlementDto } from './dto/query-settlement.dto';

// 结算成本单价/毛利/毛利率计算（系统开发手册·核心业务规则）
function calcDerived(revenue: number, totalCost: number, shippedQty: number, taxRefund: number) {
  const grossProfit = +(revenue - totalCost).toFixed(4);
  const grossMargin = revenue > 0 ? +((grossProfit / revenue) * 100).toFixed(2) : undefined;
  const costPerUnit = shippedQty > 0 ? +(totalCost / shippedQty).toFixed(4) : undefined;
  const netProfit = +(grossProfit + taxRefund).toFixed(4);
  return { grossProfit, grossMargin, costPerUnit, netProfit, netProfitExRefund: grossProfit };
}

@Injectable()
export class SettlementService {
  constructor(
    @InjectRepository(Settlement) private readonly repo: Repository<Settlement>,
    @InjectRepository(SettlementCost) private readonly costRepo: Repository<SettlementCost>,
    @InjectRepository(SettlementReceipt) private readonly receiptRepo: Repository<SettlementReceipt>,
    @InjectRepository(OrderMain) private readonly orderRepo: Repository<OrderMain>,
    @InjectRepository(OrderShipment) private readonly shipmentRepo: Repository<OrderShipment>,
    private readonly numbering: NumberingService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSettlementDto, createdBy: number): Promise<Settlement> {
    const settlement_no = await this.numbering.next(NUM_PREFIX.SETTLEMENT);

    const order = await this.orderRepo.findOne({ where: { id: dto.order_id, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${dto.order_id} 不存在`);

    const shipments = await this.shipmentRepo.find({ where: { order_id: dto.order_id } });
    const shippedQty = shipments.reduce((sum, s) => sum + s.qty, 0);

    return this.dataSource.transaction(async (manager) => {
      const costs = dto.costs ?? [];
      const totalCost = costs.reduce((sum, c) => sum + c.amount, 0);
      const taxRefund = dto.tax_refund ?? 0;
      const derived = calcDerived(dto.revenue, totalCost, shippedQty, taxRefund);

      const settlement = await manager.save(
        Settlement,
        manager.create(Settlement, {
          settlement_no,
          order_id: dto.order_id,
          shipped_qty: shippedQty,
          currency: order.currency ?? 'CNY',
          exchange_rate: dto.exchange_rate,
          status: SettlementStatus.DRAFT,
          revenue: +dto.revenue.toFixed(4),
          total_cost: +totalCost.toFixed(4),
          cost_per_unit: derived.costPerUnit,
          gross_profit: derived.grossProfit,
          gross_margin: derived.grossMargin,
          tax_refund: +taxRefund.toFixed(4),
          net_profit: derived.netProfit,
          net_profit_ex_refund: derived.netProfitExRefund,
          description: dto.description ?? null,
          created_by: createdBy,
          deleted: 0,
        }),
      );

      if (costs.length) {
        const costLines = costs.map((c) =>
          manager.create(SettlementCost, {
            settlement_id: settlement.id,
            cost_name: c.cost_name,
            amount: +c.amount.toFixed(4),
            has_invoice: c.has_invoice ?? 1,
          }),
        );
        await manager.save(SettlementCost, costLines);
      }

      return settlement;
    });
  }

  async findAll(query: QuerySettlementDto) {
    const { page = 1, size = 20, keyword, status, order_id } = query;
    const base: FindOptionsWhere<Settlement> = {
      deleted: 0,
      ...(status !== undefined && { status: status as SettlementStatus }),
      ...(order_id !== undefined && { order_id }),
    };
    const where = keyword
      ? [{ ...base, settlement_no: Like(`%${keyword}%`) }]
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
    const settlement = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
    const costs = await this.costRepo.find({ where: { settlement_id: id } });
    const receipts = await this.receiptRepo.find({ where: { settlement_id: id }, order: { receipt_date: 'ASC' } });
    return { ...settlement, costs, receipts };
  }

  async addCost(id: number, dto: AddCostDto): Promise<Settlement> {
    return this.dataSource.transaction(async (manager) => {
      const settlement = await manager.findOne(Settlement, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
      if (settlement.status !== SettlementStatus.DRAFT) {
        throw new BadRequestException('只有草稿状态才可添加费用');
      }

      await manager.save(
        SettlementCost,
        manager.create(SettlementCost, {
          settlement_id: id,
          cost_name: dto.cost_name,
          amount: +dto.amount.toFixed(4),
          has_invoice: dto.has_invoice ?? 1,
        }),
      );

      const costs = await manager.find(SettlementCost, { where: { settlement_id: id } });
      const totalCost = costs.reduce((sum, c) => sum + +c.amount, 0);
      const derived = calcDerived(+settlement.revenue, totalCost, settlement.shipped_qty ?? 0, +(settlement.tax_refund ?? 0));
      settlement.total_cost = +totalCost.toFixed(4);
      settlement.cost_per_unit = derived.costPerUnit;
      settlement.gross_profit = derived.grossProfit;
      settlement.gross_margin = derived.grossMargin;
      settlement.net_profit = derived.netProfit;
      settlement.net_profit_ex_refund = derived.netProfitExRefund;
      return manager.save(Settlement, settlement);
    });
  }

  async addReceipt(id: number, dto: AddReceiptDto): Promise<void> {
    const settlement = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
    if (settlement.status !== SettlementStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态才可添加收款');
    }
    await this.receiptRepo.save(
      this.receiptRepo.create({
        settlement_id: id,
        amount: +dto.amount.toFixed(4),
        receipt_date: dto.receipt_date as any,
        remark: dto.remark ?? null,
      }),
    );
  }

  async confirm(id: number): Promise<Settlement> {
    return this.dataSource.transaction(async (manager) => {
      const settlement = await manager.findOne(Settlement, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
      if (settlement.status !== SettlementStatus.DRAFT) {
        throw new BadRequestException('只有草稿状态才可确认');
      }
      settlement.status = SettlementStatus.CONFIRMED;
      settlement.confirmed_at = new Date();
      return manager.save(Settlement, settlement);
    });
  }

  async remove(id: number): Promise<void> {
    const settlement = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
    if (settlement.status !== SettlementStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态的结算单可以删除');
    }
    settlement.deleted = 1;
    await this.repo.save(settlement);
  }

}
