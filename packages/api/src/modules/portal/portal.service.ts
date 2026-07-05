import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract } from '../contract/contract.entity';
import { ContractMaterial } from '../contract/contract-material.entity';
import { ContractPortalLog, PortalOperatorType } from '../contract/contract-portal-log.entity';
import { OrderMain } from '../order/order-main.entity';
import { OrderMaterial } from '../order/order-material.entity';
import { OrderSizeMatrix } from '../order/order-size-matrix.entity';
import { ContractPortalStatus, ContractType } from '@i9/types';
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
    @InjectRepository(OrderMain) private readonly orderRepo: Repository<OrderMain>,
    @InjectRepository(OrderMaterial) private readonly orderMaterialRepo: Repository<OrderMaterial>,
    @InjectRepository(OrderSizeMatrix) private readonly matrixRepo: Repository<OrderSizeMatrix>,
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
          materials: orderMaterials,
          size_matrix: matrix?.matrix_data ?? null,
        };
      }
    }
    return { ...contract, materials, logs, orderDetail };
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
    // 四步顺序锁定：开票须在对账通过后（设计稿 门户 B2/E4）
    if (contract.portal_status !== ContractPortalStatus.RECONCILED) {
      throw new BadRequestException('开票须在对账通过后进行（当前合同尚未完成对账）');
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
