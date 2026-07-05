import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract } from '../contract/contract.entity';
import { ContractMaterial } from '../contract/contract-material.entity';
import { ContractPortalLog, PortalOperatorType } from '../contract/contract-portal-log.entity';
import { ContractPortalStatus } from '@i9/types';
import { UploadInvoiceDto } from './dto/upload-invoice.dto';

const VISIBLE_STATUSES = [
  ContractPortalStatus.PUSHED,
  ContractPortalStatus.STAMPED,
  ContractPortalStatus.SHIPPING,
  ContractPortalStatus.RECONCILED,
];

@Injectable()
export class PortalService {
  constructor(
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    @InjectRepository(ContractMaterial) private readonly materialRepo: Repository<ContractMaterial>,
    @InjectRepository(ContractPortalLog) private readonly logRepo: Repository<ContractPortalLog>,
  ) {}

  async getContracts(factoryId: number, page = 1, size = 20, portalStatus?: string) {
    const base = { factory_id: factoryId, deleted: 0 };
    const where = portalStatus
      ? { ...base, portal_status: portalStatus as ContractPortalStatus }
      : VISIBLE_STATUSES.map((s) => ({ ...base, portal_status: s }));

    const [items, total] = await this.contractRepo.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });
    return { items, total, page, size };
  }

  async getContract(id: number, factoryId: number) {
    const contract = await this.contractRepo.findOne({ where: { id, factory_id: factoryId, deleted: 0 } });
    if (!contract || !VISIBLE_STATUSES.includes(contract.portal_status)) {
      throw new NotFoundException('合同不存在');
    }
    const [materials, logs] = await Promise.all([
      this.materialRepo.find({ where: { contract_id: id }, order: { sort_order: 'ASC' } }),
      this.logRepo.find({ where: { contract_id: id }, order: { created_at: 'ASC' } }),
    ]);
    return { ...contract, materials, logs };
  }

  async stamp(id: number, supplierAccount: string, factoryId: number): Promise<Contract> {
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
    contract.snapshot_json = snapshot;
    await this.contractRepo.save(contract);

    await this.logRepo.save(
      this.logRepo.create({
        contract_id: id,
        action: 'STAMP',
        operator: supplierAccount,
        operator_type: PortalOperatorType.SUPPLIER,
      }),
    );

    return contract;
  }

  async confirmShipping(id: number, supplierAccount: string, factoryId: number, remark?: string): Promise<Contract> {
    const contract = await this.contractRepo.findOne({ where: { id, factory_id: factoryId, deleted: 0 } });
    if (!contract || !VISIBLE_STATUSES.includes(contract.portal_status)) {
      throw new NotFoundException('合同不存在');
    }
    if (contract.portal_status !== ContractPortalStatus.STAMPED) {
      throw new BadRequestException('只有已盖章状态才可确认出货');
    }

    contract.portal_status = ContractPortalStatus.SHIPPING;
    await this.contractRepo.save(contract);

    await this.logRepo.save(
      this.logRepo.create({
        contract_id: id,
        action: 'SHIP',
        operator: supplierAccount,
        operator_type: PortalOperatorType.SUPPLIER,
        remark,
      }),
    );

    return contract;
  }

  async uploadInvoice(id: number, supplierAccount: string, factoryId: number, dto: UploadInvoiceDto): Promise<void> {
    const contract = await this.contractRepo.findOne({ where: { id, factory_id: factoryId, deleted: 0 } });
    if (!contract || !VISIBLE_STATUSES.includes(contract.portal_status)) {
      throw new NotFoundException('合同不存在');
    }
    const allowedStatuses: ContractPortalStatus[] = [
      ContractPortalStatus.STAMPED,
      ContractPortalStatus.SHIPPING,
      ContractPortalStatus.RECONCILED,
    ];
    if (!allowedStatuses.includes(contract.portal_status)) {
      throw new BadRequestException('当前状态不可上传发票');
    }

    const parts: string[] = [];
    if (dto.invoice_no) parts.push(`发票号:${dto.invoice_no}`);
    if (dto.invoice_amount != null) parts.push(`金额:${dto.invoice_amount}`);
    if (dto.invoice_url) parts.push(`附件:${dto.invoice_url}`);
    if (dto.remark) parts.push(dto.remark);
    const remark = parts.length ? parts.join(' · ') : undefined;
    await this.logRepo.save(
      this.logRepo.create({
        contract_id: id,
        action: 'INVOICE',
        operator: supplierAccount,
        operator_type: PortalOperatorType.SUPPLIER,
        remark,
      }),
    );
  }
}
