import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, DataSource } from 'typeorm';
import { Contract, ContractStatus } from './contract.entity';
import { ContractMaterial } from './contract-material.entity';
import { ContractPortalLog, PortalOperatorType } from './contract-portal-log.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { ContractPortalStatus, ContractType } from '@i9/types';

// 账期规则（系统开发手册·核心业务规则）：材料合同 = 最后发货日+45天，加工合同 = 最后发货日+30天
const DEFAULT_ACCOUNT_PERIOD_DAYS: Record<ContractType, number> = {
  [ContractType.MATERIAL]: 45,
  [ContractType.PROCESS]: 30,
  [ContractType.SUPPLEMENT]: 45,
};
import { CreateContractDto } from './dto/create-contract.dto';
import { QueryContractDto } from './dto/query-contract.dto';

@Injectable()
export class ContractService {
  constructor(
    @InjectRepository(Contract) private readonly repo: Repository<Contract>,
    @InjectRepository(ContractMaterial) private readonly materialRepo: Repository<ContractMaterial>,
    @InjectRepository(ContractPortalLog) private readonly logRepo: Repository<ContractPortalLog>,
    private readonly numbering: NumberingService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateContractDto, createdBy: number): Promise<Contract> {
    const contract_no = await this.numbering.next(NUM_PREFIX.CONTRACT);

    const deposit_ratio = dto.deposit_ratio ?? 30;
    const mid_ratio = dto.mid_ratio ?? 40;
    const final_ratio = dto.final_ratio ?? 30;
    // 付款条款验证（系统开发手册·核心业务规则）：定金% + 中期% + 尾款% 必须 = 100%
    if (Math.abs(deposit_ratio + mid_ratio + final_ratio - 100) > 0.01) {
      throw new BadRequestException(
        `定金比例 + 中期比例 + 尾款比例必须等于 100%（当前为 ${deposit_ratio + mid_ratio + final_ratio}%）`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const totalAmount = dto.materials.reduce((sum, m) => sum + m.unit_price * m.qty, 0);

      const contract = await manager.save(Contract, manager.create(Contract, {
        contract_no,
        type: dto.type,
        parent_id: dto.parent_id,
        factory_id: dto.factory_id,
        order_id: dto.order_id,
        total_amount: +totalAmount.toFixed(4),
        currency: dto.currency ?? 'CNY',
        deposit_ratio,
        mid_ratio,
        final_ratio,
        last_ship_date: dto.last_ship_date as any,
        account_period_days: dto.account_period_days ?? DEFAULT_ACCOUNT_PERIOD_DAYS[dto.type],
        remark: dto.remark,
        created_by: createdBy,
        portal_status: ContractPortalStatus.DRAFT,
        status: ContractStatus.ACTIVE,
      }));

      const materials = dto.materials.map((m, idx) => manager.create(ContractMaterial, {
        contract_id: contract.id,
        sort_order: m.sort_order ?? idx,
        item_name: m.item_name,
        spec: m.spec,
        unit: m.unit,
        unit_price: m.unit_price,
        qty: m.qty,
        amount: +(m.unit_price * m.qty).toFixed(4),
        remark: m.remark,
      }));
      await manager.save(ContractMaterial, materials);

      return contract;
    });
  }

  async findAll(query: QueryContractDto) {
    const { page = 1, size = 20, keyword, type, portal_status, factory_id, order_id } = query;
    const base: FindOptionsWhere<Contract> = {
      deleted: 0,
      ...(type !== undefined && { type }),
      ...(portal_status !== undefined && { portal_status }),
      ...(factory_id !== undefined && { factory_id }),
      ...(order_id !== undefined && { order_id }),
    };
    const where: FindOptionsWhere<Contract> | FindOptionsWhere<Contract>[] = keyword
      ? [{ ...base, contract_no: Like(`%${keyword}%`) }]
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
    const contract = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!contract) throw new NotFoundException(`合同 #${id} 不存在`);
    const materials = await this.materialRepo.find({
      where: { contract_id: id },
      order: { sort_order: 'ASC' },
    });
    return { ...contract, materials };
  }

  // 推送给供应商门户 (DRAFT → PUSHED)
  async push(id: number, operatorUsername: string): Promise<Contract> {
    const contract = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!contract) throw new NotFoundException(`合同 #${id} 不存在`);
    if (contract.portal_status !== ContractPortalStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态才可推送');
    }
    contract.portal_status = ContractPortalStatus.PUSHED;
    contract.pushed_at = new Date();
    await this.repo.save(contract);

    await this.logRepo.save(this.logRepo.create({
      contract_id: id,
      action: 'PUSH',
      operator: operatorUsername,
      operator_type: PortalOperatorType.INTERNAL,
    }));

    return contract;
  }

  // 供应商盖章 — 创建快照快照锁定 (PUSHED → STAMPED)
  async stamp(id: number, supplierAccount: string): Promise<Contract> {
    const contract = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!contract) throw new NotFoundException(`合同 #${id} 不存在`);
    if (contract.portal_status !== ContractPortalStatus.PUSHED) {
      throw new ForbiddenException('合同状态不允许盖章');
    }

    // 获取当前材料明细，锁入快照
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
    contract.snapshot_json = snapshot;
    await this.repo.save(contract);

    await this.logRepo.save(this.logRepo.create({
      contract_id: id,
      action: 'STAMP',
      operator: supplierAccount,
      operator_type: PortalOperatorType.SUPPLIER,
    }));

    return contract;
  }

  async updateStatus(id: number, status: ContractStatus): Promise<Contract> {
    const contract = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!contract) throw new NotFoundException(`合同 #${id} 不存在`);
    contract.status = status;
    return this.repo.save(contract);
  }

  async remove(id: number): Promise<void> {
    const contract = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!contract) throw new NotFoundException(`合同 #${id} 不存在`);
    if (contract.portal_status !== ContractPortalStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态的合同可以删除');
    }
    contract.deleted = 1;
    await this.repo.save(contract);
  }

  async getLogs(id: number): Promise<ContractPortalLog[]> {
    return this.logRepo.find({
      where: { contract_id: id },
      order: { created_at: 'ASC' },
    });
  }

  // 从快照获取单价（对账时使用，快照锁定后不允许变化）
  async getSnapshotUnitPrice(contractId: number, itemName: string): Promise<number | null> {
    const contract = await this.repo.findOne({ where: { id: contractId, deleted: 0 } });
    if (!contract?.snapshot_json) return null;
    const snap = contract.snapshot_json as any;
    const item = (snap.materials ?? []).find((m: any) => m.item_name === itemName);
    return item?.unit_price ?? null;
  }
}
