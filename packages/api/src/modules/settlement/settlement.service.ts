import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere, DataSource } from 'typeorm';
import { SettlementStatus } from '@i9/types';
import { Settlement } from './settlement.entity';
import { SettlementCost } from './settlement-cost.entity';
import { SettlementReceipt } from './settlement-receipt.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { AddCostDto } from './dto/add-cost.dto';
import { AddReceiptDto } from './dto/add-receipt.dto';
import { QuerySettlementDto } from './dto/query-settlement.dto';

@Injectable()
export class SettlementService {
  constructor(
    @InjectRepository(Settlement) private readonly repo: Repository<Settlement>,
    @InjectRepository(SettlementCost) private readonly costRepo: Repository<SettlementCost>,
    @InjectRepository(SettlementReceipt) private readonly receiptRepo: Repository<SettlementReceipt>,
    private readonly numbering: NumberingService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSettlementDto, createdBy: number): Promise<Settlement> {
    const settlement_no = await this.numbering.next(NUM_PREFIX.SETTLEMENT);

    return this.dataSource.transaction(async (manager) => {
      const costs = dto.costs ?? [];
      const totalCost = costs.reduce((sum, c) => sum + c.amount, 0);
      const netProfit = +(dto.revenue - totalCost).toFixed(4);

      const settlement = await manager.save(
        Settlement,
        manager.create(Settlement, {
          settlement_no,
          order_id: dto.order_id,
          status: SettlementStatus.DRAFT,
          revenue: +dto.revenue.toFixed(4),
          total_cost: +totalCost.toFixed(4),
          net_profit: netProfit,
          net_profit_ex_refund: netProfit,
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
    const settlement = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
    if (settlement.status !== SettlementStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态才可添加费用');
    }

    await this.costRepo.save(
      this.costRepo.create({
        settlement_id: id,
        cost_name: dto.cost_name,
        amount: +dto.amount.toFixed(4),
        has_invoice: dto.has_invoice ?? 1,
      }),
    );

    return this._recalculate(id);
  }

  async addReceipt(id: number, dto: AddReceiptDto): Promise<void> {
    const settlement = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
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
    const settlement = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!settlement) throw new NotFoundException(`结算单 #${id} 不存在`);
    if (settlement.status !== SettlementStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态才可确认');
    }
    settlement.status = SettlementStatus.CONFIRMED;
    settlement.confirmed_at = new Date();
    return this.repo.save(settlement);
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

  private async _recalculate(id: number): Promise<Settlement> {
    const settlement = await this.repo.findOne({ where: { id } });
    const costs = await this.costRepo.find({ where: { settlement_id: id } });
    const totalCost = costs.reduce((sum, c) => sum + +c.amount, 0);
    const netProfit = +(+settlement.revenue - totalCost).toFixed(4);
    settlement.total_cost = +totalCost.toFixed(4);
    settlement.net_profit = netProfit;
    settlement.net_profit_ex_refund = netProfit;
    return this.repo.save(settlement);
  }
}
