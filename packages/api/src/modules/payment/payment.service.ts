import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Prepayment } from './prepayment.entity';
import { PaymentRequest } from './payment-request.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { PaymentApprovalStatus, ReconcileType } from '@i9/types';
import { CreatePrepaymentDto } from './dto/create-prepayment.dto';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Prepayment) private readonly prepayRepo: Repository<Prepayment>,
    @InjectRepository(PaymentRequest) private readonly prRepo: Repository<PaymentRequest>,
    private readonly numbering: NumberingService,
    private readonly dataSource: DataSource,
  ) {}

  // ——————————————————————————————————————————
  // Prepayment
  // ——————————————————————————————————————————
  async createPrepayment(dto: CreatePrepaymentDto, createdBy: number): Promise<Prepayment> {
    const prepayment = this.prepayRepo.create({
      factory_id: dto.factory_id,
      contract_id: dto.contract_id ?? null,
      amount: dto.amount,
      used_amount: 0,
      balance: dto.amount,
      pay_date: dto.pay_date as any,
      remark: dto.remark ?? null,
      created_by: createdBy,
    });
    return this.prepayRepo.save(prepayment);
  }

  async findPrepayments(factoryId?: number, page = 1, size = 20) {
    const where: any = factoryId ? { factory_id: factoryId } : {};
    const [items, total] = await this.prepayRepo.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });
    return { items, total, page, size };
  }

  async getAvailablePrepayBalance(factoryId: number): Promise<number> {
    const rows = await this.prepayRepo.find({ where: { factory_id: factoryId } });
    return rows.reduce((sum, r) => sum + (+r.balance), 0);
  }

  // ——————————————————————————————————————————
  // Payment Request
  // ——————————————————————————————————————————
  async createPaymentRequest(dto: CreatePaymentRequestDto, createdBy: number): Promise<PaymentRequest> {
    const prepayOffset = dto.prepay_offset ?? 0;

    // Overpayment guard: prepay_offset cannot exceed available balance
    if (prepayOffset > 0) {
      const availableBalance = await this.getAvailablePrepayBalance(dto.factory_id);
      if (prepayOffset > availableBalance) {
        throw new BadRequestException(
          `预付款冲抵金额 ${prepayOffset} 超过可用余额 ${availableBalance.toFixed(2)}`,
        );
      }
    }

    const prefix = dto.type === ReconcileType.NO_CONTRACT
      ? `${NUM_PREFIX.PAYMENT}NC`
      : NUM_PREFIX.PAYMENT;
    const pr_no = await this.numbering.next(prefix);

    const pr = this.prRepo.create({
      pr_no,
      type: dto.type,
      reconcile_id: dto.reconcile_id ?? null,
      factory_id: dto.factory_id,
      amount: dto.amount,
      prepay_offset: prepayOffset,
      actual_pay: +(dto.amount - prepayOffset).toFixed(4),
      approval_status: PaymentApprovalStatus.DRAFT,
      description: dto.description ?? null,
      created_by: createdBy,
    });
    return this.prRepo.save(pr);
  }

  async findPaymentRequests(factoryId?: number, approvalStatus?: PaymentApprovalStatus, page = 1, size = 20) {
    const where: any = { deleted: 0 };
    if (factoryId) where.factory_id = factoryId;
    if (approvalStatus) where.approval_status = approvalStatus;

    const [items, total] = await this.prRepo.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });
    return { items, total, page, size };
  }

  async submitPaymentRequest(id: number, userId: number): Promise<PaymentRequest> {
    const pr = await this.prRepo.findOne({ where: { id, deleted: 0 } });
    if (!pr) throw new NotFoundException(`付款申请 #${id} 不存在`);
    if (pr.approval_status !== PaymentApprovalStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态才可提交');
    }
    pr.approval_status = PaymentApprovalStatus.PENDING;
    pr.submitted_by = userId;
    pr.submitted_at = new Date();
    return this.prRepo.save(pr);
  }

  async approvePaymentRequest(id: number, userId: number): Promise<PaymentRequest> {
    const pr = await this.prRepo.findOne({ where: { id, deleted: 0 } });
    if (!pr) throw new NotFoundException(`付款申请 #${id} 不存在`);
    if (pr.approval_status !== PaymentApprovalStatus.PENDING) {
      throw new BadRequestException('只有待审批状态才可审批');
    }

    return this.dataSource.transaction(async (manager) => {
      pr.approval_status = PaymentApprovalStatus.APPROVED;
      pr.approved_by = userId;
      pr.approved_at = new Date();
      await manager.save(PaymentRequest, pr);

      // Deduct prepay offset from prepayment balance
      if (+pr.prepay_offset > 0) {
        await this._deductPrepay(manager, pr.factory_id, +pr.prepay_offset);
      }

      return pr;
    });
  }

  async rejectPaymentRequest(id: number, userId: number, reason: string): Promise<PaymentRequest> {
    const pr = await this.prRepo.findOne({ where: { id, deleted: 0 } });
    if (!pr) throw new NotFoundException(`付款申请 #${id} 不存在`);
    if (pr.approval_status !== PaymentApprovalStatus.PENDING) {
      throw new BadRequestException('只有待审批状态才可驳回');
    }
    pr.approval_status = PaymentApprovalStatus.REJECTED;
    pr.approved_by = userId;
    pr.approved_at = new Date();
    pr.reject_reason = reason;
    return this.prRepo.save(pr);
  }

  async markPaid(id: number, slipUrl: string, paidBy: number): Promise<PaymentRequest> {
    const pr = await this.prRepo.findOne({ where: { id, deleted: 0 } });
    if (!pr) throw new NotFoundException(`付款申请 #${id} 不存在`);
    if (pr.approval_status !== PaymentApprovalStatus.APPROVED) {
      throw new BadRequestException('只有已审批状态才可标记付款');
    }
    pr.approval_status = PaymentApprovalStatus.PAID;
    pr.slip_url = slipUrl;
    pr.paid_by = paidBy;
    pr.slip_uploaded_at = new Date();
    return this.prRepo.save(pr);
  }

  async removePaymentRequest(id: number): Promise<void> {
    const pr = await this.prRepo.findOne({ where: { id, deleted: 0 } });
    if (!pr) throw new NotFoundException(`付款申请 #${id} 不存在`);
    if (pr.approval_status !== PaymentApprovalStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态才可删除');
    }
    pr.deleted = 1;
    await this.prRepo.save(pr);
  }

  private async _deductPrepay(manager: any, factoryId: number, amount: number): Promise<void> {
    const rows = await manager.find(Prepayment, {
      where: { factory_id: factoryId },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    let remaining = amount;
    for (const row of rows) {
      if (remaining <= 0) break;
      const available = +row.balance;
      if (available <= 0) continue;
      const deduct = Math.min(remaining, available);
      row.used_amount = +(+row.used_amount + deduct).toFixed(4);
      row.balance = +(available - deduct).toFixed(4);
      await manager.save(Prepayment, row);
      remaining = +(remaining - deduct).toFixed(4);
    }
    if (remaining > 0) {
      throw new BadRequestException(
        `预付款余额不足：仍差 ${remaining.toFixed(4)} 元未能冲抵`,
      );
    }
  }
}
