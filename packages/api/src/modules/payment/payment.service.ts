import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, MoreThanOrEqual, LessThanOrEqual, In } from 'typeorm';
import { Prepayment } from './prepayment.entity';
import { PaymentRequest } from './payment-request.entity';
import { PaymentRecord } from './payment-record.entity';
import { Reconciliation, ReconciliationStatus } from '../reconciliation/reconciliation.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { PaymentApprovalStatus, ReconcileType, UserRole, isAdminRole } from '@i9/types';
import { CreatePrepaymentDto } from './dto/create-prepayment.dto';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';
import { QueryPaymentRequestDto } from './dto/query-payment-request.dto';

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
      style_no: dto.style_no ?? null,
      remark: dto.remark ?? null,
      created_by: createdBy,
    });
    return this.prepayRepo.save(prepayment);
  }

  // 裸ID→名称:给列表行补 factory_name / contract_no(前端展示体验)
  private async enrichNames(items: any[]): Promise<void> {
    if (!items.length) return;
    const fids = [...new Set(items.map((r) => +r.factory_id).filter(Boolean))];
    if (fids.length) {
      const rows = await this.dataSource.query('SELECT id, COALESCE(short_name, name) nm FROM factory WHERE id IN (?)', [fids]);
      const m = new Map(rows.map((x: any) => [+x.id, x.nm]));
      items.forEach((r) => { r.factory_name = r.factory_id ? m.get(+r.factory_id) ?? null : null; });
    }
    const cids = [...new Set(items.map((r) => +r.contract_id).filter(Boolean))];
    if (cids.length) {
      const rows = await this.dataSource.query('SELECT id, contract_no FROM contract WHERE id IN (?)', [cids]);
      const m = new Map(rows.map((x: any) => [+x.id, x.contract_no]));
      items.forEach((r) => { r.contract_no = r.contract_id ? m.get(+r.contract_id) ?? null : null; });
    }
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
    await this.enrichNames(items as any[]);
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
      // 从对账单带出的款号：结算单按款号归集所有相关付款要靠它（2026-08-08 King 反馈）。
      // 此前只有手填的 dto.related_style_no，合同类付款一律为空，结算那边自然一条也带不出来。
      let recStyleNo: string | null = null;
      if (dto.reconcile_id) {
        const rec = await manager.findOne(Reconciliation, {
          where: { id: dto.reconcile_id, deleted: 0 },
          lock: { mode: 'pessimistic_write' },
        });
        if (!rec) throw new NotFoundException(`对账单 #${dto.reconcile_id} 不存在`);
        // 状态闸门(H8):仅「已确认」对账单可建付款申请——DRAFT/PENDING 未完成二级审批,
        // 直接付款会架空超发闸门/发票校验,且付清联动(CONFIRMED→PAID)无法落地
        if (rec.status !== ReconciliationStatus.CONFIRMED) {
          throw new BadRequestException(
            `对账单 #${dto.reconcile_id} 未复核确认（当前状态 ${rec.status}），不可申请付款`,
          );
        }
        // 工厂一致性(M4):申请的 factory_id 必须与对账单供应商一致,
        // 防「按 B 厂扣预付款付 A 厂的账」;工时对账无工厂(factory_id 空)不校验
        if (rec.factory_id != null && Number(rec.factory_id) !== Number(dto.factory_id)) {
          throw new BadRequestException(
            `付款工厂 #${dto.factory_id} 与对账单 #${dto.reconcile_id} 归属工厂 #${rec.factory_id} 不一致`,
          );
        }
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
        recStyleNo = rec.style_no ?? null;
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
        bank_name: dto.bank_name ?? null,
        bank_account: dto.bank_account ?? null,
        invoice_no: dto.invoice_no ?? null,     // #92：非合同付款自行登记发票
        invoice_url: dto.invoice_url ?? null,
        related_style_no: dto.related_style_no ?? recStyleNo ?? null, // 手填优先，没填就用对账单的款号
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
    // 水单必填(P3#40/对账E2):付款动作必须留水单凭证
    if (!dto?.slip_url) throw new BadRequestException('请上传银行水单后再登记付款');
    if (!(dto.amount > 0)) throw new BadRequestException('本次付款金额须大于 0');
    if (!dto.pay_date) throw new BadRequestException('请选择付款日期'); // '' 写 DATE NOT NULL 列必 500，前置拦截（举一反三 B8）
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
        pay_method: dto.pay_method || 'BANK', // '' 写 ENUM 列 1265（举一反三 B8）
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
          await this._syncReconcilePaid(manager, pr.reconcile_id);
        }
      }
      const saved = await manager.save(PaymentRequest, pr);
      return { record, request: saved, paid_total: +saved.paid_total, balance: +(payable - +saved.paid_total).toFixed(4) };
    });
  }

  async getPaymentRecords(id: number) {
    return this.recordRepo.find({ where: { pr_id: id }, order: { id: 'ASC' } });
  }

  // 付款申请列表检索。入参原为 10 个散参，收敛为 DTO（加 reconcile_id 反查时顺手重构）；
  // DTO 键是 snake_case（对齐前端 query），这里解构改回驼峰仅为行内可读，条件语义不变。
  async findPaymentRequests(query: QueryPaymentRequestDto = {}) {
    const {
      factory_id: factoryId, approval_status: approvalStatus, reconcile_id: reconcileId,
      start_date: startDate, end_date: endDate, due_start: dueStart, due_end: dueEnd,
      paid_start: paidStart, paid_end: paidEnd,
    } = query;
    let { page = 1, size = 20 } = query;
    const where: any = { deleted: 0 };
    if (factoryId) where.factory_id = factoryId;
    if (approvalStatus) where.approval_status = approvalStatus;
    // 对账→付款申请反查（关联单据 chip）
    if (reconcileId) where.reconcile_id = reconcileId;
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
    // 付款日范围(P3#40/对账A3:检索维度切换——按实际付款时间 slip_uploaded_at)
    if (paidStart && paidEnd) where.slip_uploaded_at = Between(`${paidStart} 00:00:00`, `${paidEnd} 23:59:59`);
    else if (paidStart) where.slip_uploaded_at = MoreThanOrEqual(`${paidStart} 00:00:00`);
    else if (paidEnd) where.slip_uploaded_at = LessThanOrEqual(`${paidEnd} 23:59:59`);

    size = Math.min(Math.max(Number(size) || 20, 1), 100); page = Math.max(Number(page) || 1, 1); // 分页钳制
    const [items, total] = await this.prRepo.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });
    await this.enrichNames(items as any[]);
    return { items, total, page, size };
  }

  // ——————————————————————————————————————————
  // 工厂账单（2026-08-11 qiao：「可以按工厂名称，下载EXCEL文件，拉出这个公司的所有账单吗」）
  // ——————————————————————————————————————————
  /**
   * 一次取齐一家工厂的往来账：付款申请 + 每笔实付记录 + 预付款 + 对账单 + 汇总。
   *
   * 【为什么单开接口，不让前端循环调列表】列表分页上限 100，而「某张付款申请下的实付记录」
   * 只有 `requests/:id/records` 这条按 ID 取的接口——前端要拼账单就是 N+1 次请求。
   * 今天全库才 5 张申请看不出问题，一家供应商做满一年就是几百张，浏览器要发几百个请求。
   *
   * 【日期区间的口径】三类单据各按自己的自然日期过滤：付款申请按**申请日期**（created_at，
   * 与列表检索同一口径）、预付款按**付款日期**（pay_date）、对账单按**创建日期**。
   * 口径原样回给前端写进表头——否则业务拿着一份「7月账单」，不知道 7 月指的是谁的 7 月。
   *
   * 【合计只算数得上的那些】已驳回的申请一律不进合计（但明细里照列，否则对不上条数）；
   * 「应付/未付」只算**已批准+已付款**——草稿和待审批还不构成欠款，混进去会把应付虚高。
   */
  async getFactoryStatement(factoryId: number, startDate?: string, endDate?: string) {
    const [factory] = await this.dataSource.query(
      'SELECT id, name, short_name FROM factory WHERE id = ?', [factoryId],
    );
    if (!factory) throw new NotFoundException(`工厂 #${factoryId} 不存在`);

    // datetime 列要带时分秒（否则 `2026-08-11` 会把当天 00:00 之后的全漏掉），date 列不能带
    const dtRange = () => {
      if (startDate && endDate) return Between(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
      if (startDate) return MoreThanOrEqual(`${startDate} 00:00:00`);
      if (endDate) return LessThanOrEqual(`${endDate} 23:59:59`);
      return undefined;
    };
    const dRange = () => {
      if (startDate && endDate) return Between(startDate, endDate);
      if (startDate) return MoreThanOrEqual(startDate);
      if (endDate) return LessThanOrEqual(endDate);
      return undefined;
    };

    const prWhere: any = { factory_id: factoryId, deleted: 0 };
    const dt = dtRange();
    if (dt) prWhere.created_at = dt;
    const requests: any[] = await this.prRepo.find({ where: prWhere, order: { id: 'ASC' } });

    const prepayWhere: any = { factory_id: factoryId };
    const d = dRange();
    if (d) prepayWhere.pay_date = d;
    const prepayments: any[] = await this.prepayRepo.find({ where: prepayWhere, order: { id: 'ASC' } });

    const recWhere: any = { factory_id: factoryId, deleted: 0 };
    if (dt) recWhere.created_at = dt;
    const reconciliations: any[] = await this.reconcileRepo.find({ where: recWhere, order: { id: 'ASC' } });

    // 实付记录一次取回按 pr_id 归位（N+1 就是在这里省掉的）
    const prIds = requests.map((r) => +r.id);
    const records: any[] = prIds.length
      ? await this.recordRepo.find({ where: { pr_id: In(prIds) }, order: { id: 'ASC' } })
      : [];
    const byPr = new Map<number, any[]>();
    for (const rec of records) {
      const k = +rec.pr_id;
      if (!byPr.has(k)) byPr.set(k, []);
      byPr.get(k)!.push(rec);
    }

    // 付款申请上补对账单号/合同号/款号：账单要能顺着单号往回查，只给个 reconcile_id 没法用
    const recIds = [...new Set(requests.map((r) => +r.reconcile_id).filter(Boolean))];
    const recMeta = new Map<number, any>();
    if (recIds.length) {
      const rows = await this.dataSource.query(
        'SELECT r.id, r.reconcile_no, r.style_no, c.contract_no FROM reconciliation r'
        + ' LEFT JOIN contract c ON c.id = r.contract_id WHERE r.id IN (?)', [recIds],
      );
      rows.forEach((x: any) => recMeta.set(+x.id, x));
    }
    requests.forEach((r) => {
      const meta = r.reconcile_id ? recMeta.get(+r.reconcile_id) : null;
      r.reconcile_no = meta?.reconcile_no ?? null;
      r.contract_no = meta?.contract_no ?? null;
      r.style_no = r.related_style_no || meta?.style_no || null;
      r.records = byPr.get(+r.id) ?? [];
      r.paid_sum = +(r.records as any[]).reduce((sn: number, x: any) => sn + (Number(x.amount) || 0), 0).toFixed(2);
    });

    // 预付款/对账单的合同号
    const cIds = [...new Set([...prepayments, ...reconciliations].map((r) => +r.contract_id).filter(Boolean))];
    if (cIds.length) {
      const rows = await this.dataSource.query('SELECT id, contract_no FROM contract WHERE id IN (?)', [cIds]);
      const m = new Map(rows.map((x: any) => [+x.id, x.contract_no]));
      [...prepayments, ...reconciliations].forEach((r) => {
        r.contract_no = r.contract_id ? m.get(+r.contract_id) ?? null : null;
      });
    }

    const n = (v: unknown) => Number(v) || 0;
    const r2 = (x: number) => +x.toFixed(2);
    const notRejected = requests.filter((r) => r.approval_status !== PaymentApprovalStatus.REJECTED);
    const owed = requests.filter(
      (r) => r.approval_status === PaymentApprovalStatus.APPROVED || r.approval_status === PaymentApprovalStatus.PAID,
    );
    const payableTotal = r2(owed.reduce((sm, r) => sm + (r.actual_pay != null ? n(r.actual_pay) : n(r.amount) - n(r.prepay_offset)), 0));
    const paidTotal = r2(owed.reduce((sm, r) => sm + n(r.paid_sum), 0));

    return {
      factory: { id: +factory.id, name: factory.name, short_name: factory.short_name },
      range: { start_date: startDate ?? null, end_date: endDate ?? null },
      summary: {
        request_count: requests.length,
        rejected_count: requests.length - notRejected.length,
        request_amount: r2(notRejected.reduce((sm, r) => sm + n(r.amount), 0)),
        prepay_offset_total: r2(notRejected.reduce((sm, r) => sm + n(r.prepay_offset), 0)),
        payable_total: payableTotal,
        paid_total: paidTotal,
        unpaid_total: r2(payableTotal - paidTotal),
        prepay_count: prepayments.length,
        prepay_amount: r2(prepayments.reduce((sm, r) => sm + n(r.amount), 0)),
        prepay_used: r2(prepayments.reduce((sm, r) => sm + n(r.used_amount), 0)),
        prepay_balance: r2(prepayments.reduce((sm, r) => sm + n(r.balance), 0)),
        reconcile_count: reconciliations.length,
        reconcile_amount: r2(reconciliations.reduce((sm, r) => sm + n(r.total_amount), 0)),
      },
      requests,
      prepayments,
      reconciliations,
    };
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

  // 一次性付清(L10):与 addPaymentRecord 同口径——事务内悲观锁读取申请,串行化并发付款,
  // 防「分批流水与标记付清并发」时 paid_total 被盖成全额且不留差额流水
  async markPaid(id: number, slipUrl: string, paidBy: number): Promise<PaymentRequest> {
    if (!slipUrl) throw new BadRequestException('请上传银行水单后再标记付款');
    return this.dataSource.transaction(async (manager) => {
      const pr = await manager.findOne(PaymentRequest, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' }, // 与 addPaymentRecord 互斥,防并发覆盖 paid_total
      });
      if (!pr) throw new NotFoundException(`付款申请 #${id} 不存在`);
      if (pr.approval_status !== PaymentApprovalStatus.APPROVED) {
        throw new BadRequestException('只有已审批状态才可标记付款');
      }
      pr.approval_status = PaymentApprovalStatus.PAID;
      pr.slip_url = slipUrl;
      pr.paid_by = paidBy;
      pr.slip_uploaded_at = new Date();
      pr.paid_total = +(pr.actual_pay ?? pr.amount); // 一次性付清兼容口径：已付=应付
      const saved = await manager.save(PaymentRequest, pr);

      // 付款完成后联动关联对账单进入已付款状态（系统开发手册·状态流转规则）
      if (pr.reconcile_id) {
        await this._syncReconcilePaid(manager, pr.reconcile_id);
      }
      return saved;
    });
  }

  /**
   * 修改草稿态付款申请（2026-08-10 King：「非合同付款草稿可以调整吗？」）。
   *
   * 【为什么此前一直改不了】付款申请从来只有「建/提交/审批/付款/删除」，**没有编辑端点**——
   * 建错了只能删掉重建，而删除还是管理员限定，业务自己建的草稿等于卡死。
   *
   * 【只放行草稿】一旦提交进审批流，金额就是审批依据；已批准/已付款的更不能改，
   * 否则「审的是 A、付的是 B」，且已付金额与申请金额的勾稽会当场断掉。
   * 【业务只能改自己建的】不改动既有角色矩阵（提交/审批/付款仍是财务/管理员），
   * 只是让创建者能收拾自己的草稿。
   */
  async updatePaymentRequest(
    id: number,
    dto: Partial<CreatePaymentRequestDto>,
    user: { id: number; role?: string },
  ): Promise<PaymentRequest> {
    const pr = await this.prRepo.findOne({ where: { id, deleted: 0 } });
    if (!pr) throw new NotFoundException(`付款申请 #${id} 不存在`);
    if (pr.approval_status !== PaymentApprovalStatus.DRAFT) {
      throw new BadRequestException(
        `只有草稿状态可以修改（当前 ${pr.approval_status}）；已提交的请先驳回，已付款的不可修改`,
      );
    }
    // 【用 isAdminRole，别手写 role === ADMIN】主管权限视同 ADMIN（2026-07-22 拍板）；
    // 手写比较会漏掉 SUPERVISOR：前端按 hasRole(ADMIN) 把「编辑」按钮显示给主管、
    // 控制器的 RolesGuard 也放行，结果卡在这一行 403——按钮看得见、点不动。
    // 2026-08-13 由前端错误上报抓到（主管点了 3 次）。
    const privileged = isAdminRole(user.role) || user.role === UserRole.FINANCE;
    if (!privileged && Number(pr.created_by) !== Number(user.id)) {
      throw new ForbiddenException('只能修改自己创建的付款申请草稿');
    }
    // 冲抵预付不能超过该工厂可用余额——与创建时同一道闸门，改单同样要过
    const factoryId = dto.factory_id ?? pr.factory_id;
    const offset = dto.prepay_offset ?? +pr.prepay_offset;
    if (offset) {
      const balance = await this.getAvailablePrepayBalance(factoryId);
      if (offset > balance + 0.0001) {
        throw new BadRequestException(`冲抵预付 ${offset} 超过该工厂可用预付余额 ${balance.toFixed(2)}`);
      }
    }
    const amount = dto.amount ?? +pr.amount;
    if (amount <= 0) throw new BadRequestException('申请金额须大于 0');

    Object.assign(pr, {
      factory_id: factoryId,
      amount,
      prepay_offset: offset,
      actual_pay: +(amount - offset).toFixed(4),
      description: dto.description ?? pr.description,
      bank_name: dto.bank_name ?? pr.bank_name,
      bank_account: dto.bank_account ?? pr.bank_account,
      invoice_no: dto.invoice_no ?? pr.invoice_no,     // #92
      invoice_url: dto.invoice_url ?? pr.invoice_url,
      related_style_no: dto.related_style_no ?? pr.related_style_no,
      account_period_days: dto.account_period_days ?? pr.account_period_days,
      due_date: (dto.due_date ?? pr.due_date) as any,
    });
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

  // 付清联动(H8):对账单须由 CONFIRMED 翻 PAID 且恰好命中一行;
  // 0 行说明对账单状态已漂移(如被退回/未确认),抛错回滚,保证「付款申请 PAID ⇒ 对账单 PAID」原子一致
  private async _syncReconcilePaid(manager: any, reconcileId: number): Promise<void> {
    const upd = await manager.update(Reconciliation,
      { id: reconcileId, status: ReconciliationStatus.CONFIRMED },
      { status: ReconciliationStatus.PAID });
    if (!upd?.affected) {
      throw new BadRequestException(`对账单 #${reconcileId} 非已确认状态，无法联动已付款`);
    }
    // 软锁(P2#22):上游对账/付款变动后,已确认结算单标「待重算」(刷新付款汇总时清除)
    await manager.query(
      `UPDATE settlement s
         JOIN contract c ON c.order_id = s.order_id
         JOIN reconciliation r ON r.contract_id = c.id
          SET s.needs_recalc = 1
        WHERE r.id = ? AND s.status = 'CONFIRMED' AND s.deleted = 0`,
      [reconcileId],
    );
    // 软锁(L7-①):无合同费用对账按款号归入结算期间费用,合同链路 join 不到,按款号补标
    const rec = await manager.findOne(Reconciliation, { where: { id: reconcileId } });
    if (rec?.type === ReconcileType.NO_CONTRACT && rec.style_no) {
      await manager.query(
        `UPDATE settlement s
           JOIN order_main o ON o.id = s.order_id
            SET s.needs_recalc = 1
          WHERE o.style_no = ? AND o.deleted = 0 AND s.status = 'CONFIRMED' AND s.deleted = 0`,
        [rec.style_no],
      );
    }
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
