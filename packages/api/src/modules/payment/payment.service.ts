import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Prepayment } from './prepayment.entity';
import { PaymentRequest } from './payment-request.entity';
import { PaymentRecord } from './payment-record.entity';
import { Reconciliation, ReconciliationStatus } from '../reconciliation/reconciliation.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { PaymentApprovalStatus, ReconcileType } from '@i9/types';
import { CreatePrepaymentDto } from './dto/create-prepayment.dto';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Prepayment) private readonly prepayRepo: Repository<Prepayment>,
    @InjectRepository(PaymentRequest) private readonly prRepo: Repository<PaymentRequest>,
    @InjectRepository(PaymentRecord) private readonly recordRepo: Repository<PaymentRecord>,
    @InjectRepository(Reconciliation) private readonly reconcileRepo: Repository<Reconciliation>,
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
    size = Math.min(Math.max(Number(size) || 20, 1), 100); page = Math.max(Number(page) || 1, 1); // 分页钳制,防超大 LIMIT / 负 OFFSET
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

    if (prepayOffset > dto.amount) {
      throw new BadRequestException('预付款冲抵金额不能超过付款申请金额');
    }

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
      ? `${NUM_PREFIX.PAYMENT}-NC`
      : NUM_PREFIX.PAYMENT;
    const pr_no = await this.numbering.next(prefix); // Redis 发号,置于事务外

    return this.dataSource.transaction(async (manager) => {
      // 分批付款·超付拦截（设计稿 G4）：锁定对账单行,串行化同一对账单的并发付款申请,
      // 避免「先查后写」竞态下两笔并发申请双双通过导致累计超付。
      let contractRow: { account_period_days: number | null; due_date: string | null } | null = null;
      if (dto.reconcile_id) {
        const rec = await manager.findOne(Reconciliation, {
          where: { id: dto.reconcile_id, deleted: 0 },
          lock: { mode: 'pessimistic_write' },
        });
        if (!rec) throw new NotFoundException(`对账单 #${dto.reconcile_id} 不存在`);
        const existing = await manager.find(PaymentRequest, {
          where: { reconcile_id: dto.reconcile_id, deleted: 0 },
        });
        const requested = existing
          .filter((p) => p.approval_status !== PaymentApprovalStatus.REJECTED)
          .reduce((s, p) => s + +p.amount, 0);
        if (requested + dto.amount > +rec.total_amount + 0.01) {
          throw new BadRequestException(
            `累计付款申请 ${(requested + dto.amount).toFixed(2)} 超过对账应付 ${(+rec.total_amount).toFixed(2)}（已申请 ${requested.toFixed(2)}，本次 ${dto.amount}）`,
          );
        }
        // 账期/到期日从合同带入（设计稿 06：账期取合同结算条款；到期日=出货日+账期，可人工改）
        if (rec.contract_id) {
          const rows = await manager.query(
            'SELECT account_period_days, due_date FROM contract WHERE id = ? AND deleted = 0', [rec.contract_id],
          );
          contractRow = rows?.[0] ?? null;
        }
      }

      const pr = manager.create(PaymentRequest, {
        pr_no,
        type: dto.type,
        reconcile_id: dto.reconcile_id ?? null,
        factory_id: dto.factory_id,
        amount: dto.amount,
        prepay_offset: prepayOffset,
        actual_pay: +(dto.amount - prepayOffset).toFixed(4),
        account_period_days: dto.account_period_days ?? contractRow?.account_period_days ?? null,
        due_date: (dto.due_date ?? contractRow?.due_date ?? null) as any,
        approval_status: PaymentApprovalStatus.DRAFT,
        description: dto.description ?? null,
        created_by: createdBy,
      });
      return manager.save(pr);
    });
  }

  // ===== 分批付款（设计稿 06 v1.1）：多次付款自动累计已付/未付，余额=0 整单转已付清 =====
  async addPaymentRecord(
    id: number,
    dto: { pay_method?: string; pay_date: string; amount: number; slip_url?: string; remark?: string },
    userId: number,
  ) {
    if (!(dto.amount > 0)) throw new BadRequestException('本次付款金额须大于 0');
    return this.dataSource.transaction(async (manager) => {
      const pr = await manager.findOne(PaymentRequest, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' }, // 串行化同一申请的并发付款，防累计超付
      });
      if (!pr) throw new NotFoundException(`付款申请 #${id} 不存在`);
      if (pr.approval_status !== PaymentApprovalStatus.APPROVED) {
        throw new BadRequestException(
          pr.approval_status === PaymentApprovalStatus.PAID
            ? '该付款申请已付清，不可再付款'
            : '只有已审批状态才可登记付款',
        );
      }
      const payable = +(pr.actual_pay ?? pr.amount); // 应付总额
      const paidTotal = +(pr.paid_total ?? 0);
      if (paidTotal + dto.amount > payable + 0.01) {
        throw new BadRequestException(
          `本次付款后累计 ${(paidTotal + dto.amount).toFixed(2)} 超过应付总额 ${payable.toFixed(2)}（已付 ${paidTotal.toFixed(2)}）`,
        );
      }

      const record = await manager.save(PaymentRecord, manager.create(PaymentRecord, {
        pr_id: id,
        pay_method: dto.pay_method ?? 'BANK',
        pay_date: dto.pay_date,
        amount: +(+dto.amount).toFixed(4),
        slip_url: dto.slip_url ?? null,
        remark: dto.remark ?? null,
        created_by: userId,
      }));

      pr.paid_total = +(paidTotal + dto.amount).toFixed(4);
      // 余额=0（±0.01）→ 整单转已付清 + 联动对账单已付款
      if (payable - pr.paid_total <= 0.01) {
        pr.approval_status = PaymentApprovalStatus.PAID;
        pr.paid_by = userId;
        pr.slip_uploaded_at = new Date();
        if (dto.slip_url) pr.slip_url = dto.slip_url;
        if (pr.reconcile_id) {
          await manager.update(Reconciliation,
            { id: pr.reconcile_id, status: ReconciliationStatus.CONFIRMED },
            { status: ReconciliationStatus.PAID });
      // 软锁(P2#22):上游对账/付款变动后,已确认结算单标「待重算」(刷新付款汇总时清除)
      await manager.query(
        `UPDATE settlement s
           JOIN contract c ON c.order_id = s.order_id
           JOIN reconciliation r ON r.contract_id = c.id
            SET s.needs_recalc = 1
          WHERE r.id = ? AND s.status = 'CONFIRMED' AND s.deleted = 0`,
        [pr.reconcile_id],
      );
        }
      }
      const saved = await manager.save(PaymentRequest, pr);
      return { record, request: saved, paid_total: +saved.paid_total, balance: +(payable - +saved.paid_total).toFixed(4) };
    });
  }

  async getPaymentRecords(id: number) {
    return this.recordRepo.find({ where: { pr_id: id }, order: { id: 'ASC' } });
  }

  async findPaymentRequests(
    factoryId?: number,
    approvalStatus?: PaymentApprovalStatus,
    page = 1,
    size = 20,
    startDate?: string,
    endDate?: string,
    dueStart?: string,
    dueEnd?: string,
  ) {
    const where: any = { deleted: 0 };
    if (factoryId) where.factory_id = factoryId;
    if (approvalStatus) where.approval_status = approvalStatus;
    // 供应商(工厂)+申请日期组合检索（付款申请设计稿 检索区）
    if (startDate && endDate) {
      where.created_at = Between(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    } else if (startDate) {
      where.created_at = MoreThanOrEqual(`${startDate} 00:00:00`);
    } else if (endDate) {
      where.created_at = LessThanOrEqual(`${endDate} 23:59:59`);
    }
    // 到期日范围（设计稿 06 应付汇总筛选）
    if (dueStart && dueEnd) where.due_date = Between(dueStart, dueEnd);
    else if (dueStart) where.due_date = MoreThanOrEqual(dueStart);
    else if (dueEnd) where.due_date = LessThanOrEqual(dueEnd);

    size = Math.min(Math.max(Number(size) || 20, 1), 100); page = Math.max(Number(page) || 1, 1); // 分页钳制
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
    return this.dataSource.transaction(async (manager) => {
      const pr = await manager.findOne(PaymentRequest, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!pr) throw new NotFoundException(`付款申请 #${id} 不存在`);
      if (pr.approval_status !== PaymentApprovalStatus.PENDING) {
        throw new BadRequestException('只有待审批状态才可审批');
      }

      pr.approval_status = PaymentApprovalStatus.APPROVED;
      pr.approved_by = userId;
      pr.approved_at = new Date();
      await manager.save(PaymentRequest, pr);

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
    pr.paid_total = +(pr.actual_pay ?? pr.amount); // 一次性付清兼容口径：已付=应付
    const saved = await this.prRepo.save(pr);

    // 付款完成后联动关联对账单进入已付款状态（系统开发手册·状态流转规则）
    if (pr.reconcile_id) {
      await this.reconcileRepo.update(
        { id: pr.reconcile_id, status: ReconciliationStatus.CONFIRMED },
        { status: ReconciliationStatus.PAID },
      );
      // 软锁(P2#22):上游对账/付款变动后,已确认结算单标「待重算」(刷新付款汇总时清除)
      await this.dataSource.query(
        `UPDATE settlement s
           JOIN contract c ON c.order_id = s.order_id
           JOIN reconciliation r ON r.contract_id = c.id
            SET s.needs_recalc = 1
          WHERE r.id = ? AND s.status = 'CONFIRMED' AND s.deleted = 0`,
        [pr.reconcile_id],
      );
    }
    return saved;
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
