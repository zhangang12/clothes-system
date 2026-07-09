import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract } from '../contract/contract.entity';
import { ContractMaterial } from '../contract/contract-material.entity';
import { ContractShipment } from '../contract/contract-shipment.entity';
import { ContractPortalLog, PortalOperatorType } from '../contract/contract-portal-log.entity';
import { OrderMain } from '../order/order-main.entity';
import { OrderMaterial } from '../order/order-material.entity';
import { OrderSizeMatrix } from '../order/order-size-matrix.entity';
import { Reconciliation, ReconciliationStatus } from '../reconciliation/reconciliation.entity';
import { PaymentRequest } from '../payment/payment-request.entity';
import { ContractPortalStatus, ContractType, ReconcileType, PaymentApprovalStatus } from '@i9/types';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
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
    @InjectRepository(ContractShipment) private readonly shipmentRepo: Repository<ContractShipment>,
    @InjectRepository(ContractPortalLog) private readonly logRepo: Repository<ContractPortalLog>,
    @InjectRepository(OrderMain) private readonly orderRepo: Repository<OrderMain>,
    @InjectRepository(OrderMaterial) private readonly orderMaterialRepo: Repository<OrderMaterial>,
    @InjectRepository(OrderSizeMatrix) private readonly matrixRepo: Repository<OrderSizeMatrix>,
    @InjectRepository(Reconciliation) private readonly reconcileRepo: Repository<Reconciliation>,
    @InjectRepository(PaymentRequest) private readonly prRepo: Repository<PaymentRequest>,
    private readonly numbering: NumberingService,
  ) {}

  async getContracts(factoryId: number, page = 1, size = 20, portalStatus?: string) {
    size = Math.min(Math.max(Number(size) || 20, 1), 100); page = Math.max(Number(page) || 1, 1); // 分页钳制
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

  async stamp(id: number, supplierAccount: string, factoryId: number, agreed = false): Promise<Contract> {
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

  async confirmShipping(
    id: number,
    supplierAccount: string,
    factoryId: number,
    dto: { remark?: string; qty?: number; force?: boolean } = {},
  ): Promise<Contract> {
    const contract = await this.contractRepo.findOne({ where: { id, factory_id: factoryId, deleted: 0 } });
    if (!contract || !VISIBLE_STATUSES.includes(contract.portal_status)) {
      throw new NotFoundException('合同不存在');
    }
    // 发货可在「已盖章」（首批）或「发货中」（续批）进行（设计稿 门户 B3：批次累计）
    if (contract.portal_status !== ContractPortalStatus.STAMPED && contract.portal_status !== ContractPortalStatus.SHIPPING) {
      throw new BadRequestException('只有已盖章或发货中状态才可确认出货');
    }

    const parts: string[] = [];
    if (dto.qty != null) {
      const materials = await this.materialRepo.find({ where: { contract_id: id } });
      const contractQty = materials.reduce((s, m) => s + +m.qty, 0);
      const newShipped = +(+(contract.shipped_qty ?? 0) + dto.qty).toFixed(4);
      // 超合同量拦截，需超发确认（设计稿 门户 C4）
      if (contractQty > 0 && newShipped > contractQty + 0.01 && !dto.force) {
        throw new BadRequestException(`本次发货后累计 ${newShipped} 超过合同量 ${contractQty}，如确需超发请勾选确认`);
      }
      contract.shipped_qty = newShipped;
      // 发货单号 FH-款号-序号（设计稿 补充确认 A2）
      let styleNo = '';
      if (contract.order_id) {
        const order = await this.orderRepo.findOne({ where: { id: contract.order_id, deleted: 0 } });
        styleNo = order?.style_no || '';
      }
      const shipNo = await this.numbering.nextWithSegment(NUM_PREFIX.SHIPMENT, styleNo);
      parts.push(`发货单:${shipNo}`, `本次发货:${dto.qty}`, `累计:${newShipped}/${contractQty}`);

      // 逐批锁价：本批发货记录当时生效合同单价快照（对账付款串流程 B8）
      const contractAmount = materials.reduce((s, m) => s + +m.amount, 0);
      const unitPrice = contractQty > 0 ? +(contractAmount / contractQty).toFixed(4) : null;
      const shipDate = new Date();
      const shipDateStr = shipDate.toISOString().slice(0, 10);
      await this.shipmentRepo.save(this.shipmentRepo.create({
        contract_id: id, ship_no: shipNo, qty: dto.qty,
        snapshot_unit_price: unitPrice, amount: unitPrice != null ? +(unitPrice * dto.qty).toFixed(4) : null,
        ship_date: shipDateStr, operator: supplierAccount,
      }));

      // 到期日 = 最后一次发货日 + 账期（逾期判断依据，对账付款串流程 D15）
      contract.last_ship_date = shipDate;
      if (contract.account_period_days != null) {
        const due = new Date(shipDate);
        due.setDate(due.getDate() + contract.account_period_days);
        contract.due_date = due;
      }
    }
    if (dto.remark) parts.push(dto.remark);

    if (contract.portal_status === ContractPortalStatus.STAMPED) {
      contract.portal_status = ContractPortalStatus.SHIPPING;
    }
    await this.contractRepo.save(contract);

    await this.logRepo.save(
      this.logRepo.create({
        contract_id: id,
        action: 'SHIP',
        operator: supplierAccount,
        operator_type: PortalOperatorType.SUPPLIER,
        remark: parts.length ? parts.join(' · ') : undefined,
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

    // 财务管控（设计稿 门户开票 / 06 D2）：发票号+金额必填,发票金额必须=对账金额(±¥0.01),发票号不可重复
    if (!dto.invoice_no) throw new BadRequestException('请填写发票号');
    if (dto.invoice_amount == null) throw new BadRequestException('请填写发票金额');

    const recons = await this.reconcileRepo.find({ where: { contract_id: id, deleted: 0 } });
    const confirmed = recons.filter(
      (r) => r.status === ReconciliationStatus.CONFIRMED || r.status === ReconciliationStatus.PAID,
    );
    if (confirmed.length === 0) throw new BadRequestException('尚无已确认的对账单,无法开票');
    const pending = confirmed.filter((r) => !r.invoice_no);
    if (pending.length === 0) throw new BadRequestException('该合同对账单已开票,请勿重复提交');
    if (pending.length > 1) throw new BadRequestException('该合同存在多张待开票对账单,请联系业务处理');
    const rec = pending[0];

    const diff = +(dto.invoice_amount - +rec.total_amount).toFixed(4);
    if (Math.abs(diff) > 0.01) {
      throw new BadRequestException(
        `发票金额 ¥${dto.invoice_amount} 与对账金额 ¥${(+rec.total_amount).toFixed(2)} 不一致,无法提交`,
      );
    }
    // 发票号全局查重（防重复报销;DB uk_invoice_no 兜底并发）
    const dup = await this.reconcileRepo.findOne({ where: { invoice_no: dto.invoice_no, deleted: 0 } });
    if (dup && dup.id !== rec.id) {
      throw new BadRequestException(`发票号 ${dto.invoice_no} 已被对账单 ${dup.reconcile_no} 使用（防重复付）`);
    }

    // 发票落到对账单（不再只写日志）
    rec.invoice_no = dto.invoice_no;
    rec.invoice_amount = dto.invoice_amount;
    rec.invoice_diff = diff;
    rec.invoice_url = dto.invoice_url ?? null;
    rec.has_invoice = 1;
    await this.reconcileRepo.save(rec);

    // 开票→推财务:该对账单尚无有效付款申请时,自动生成一张(状态 PENDING,进财务审批台)
    const existingPr = await this.prRepo.findOne({ where: { reconcile_id: rec.id, deleted: 0 } });
    if (!existingPr || existingPr.approval_status === PaymentApprovalStatus.REJECTED) {
      const pr_no = await this.numbering.next(NUM_PREFIX.PAYMENT);
      await this.prRepo.save(this.prRepo.create({
        pr_no,
        type: ReconcileType.CONTRACT,
        reconcile_id: rec.id,
        factory_id: contract.factory_id,
        amount: rec.total_amount,
        prepay_offset: 0,
        actual_pay: rec.total_amount,
        approval_status: PaymentApprovalStatus.PENDING,
        description: `门户开票自动生成(发票 ${dto.invoice_no})`,
        created_by: rec.created_by ?? null,
      }));
    }

    const parts: string[] = [`发票号:${dto.invoice_no}`, `金额:${dto.invoice_amount}`];
    if (dto.invoice_url) parts.push(`附件:${dto.invoice_url}`);
    if (dto.remark) parts.push(dto.remark);
    await this.logRepo.save(
      this.logRepo.create({
        contract_id: id,
        action: 'INVOICE',
        operator: supplierAccount,
        operator_type: PortalOperatorType.SUPPLIER,
        remark: parts.join(' · '),
      }),
    );
  }
}
