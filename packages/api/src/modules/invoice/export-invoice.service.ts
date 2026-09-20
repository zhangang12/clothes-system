import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, DataSource, EntityManager } from 'typeorm';
import { ExportInvoice } from './export-invoice.entity';
import { ExportInvoiceItem } from './export-invoice-item.entity';
import { InvoiceReceipt } from './invoice-receipt.entity';
import { CreateExportInvoiceDto } from './dto/create-export-invoice.dto';
import { AddReceiptDto } from './dto/add-receipt.dto';
import { toLocalDateStr } from '../../common/utils/local-date';
import { releasedInvoiceNo, isDupInvoiceNoError } from '../reconciliation/invoice-no.util';

const r4 = (n: number) => +Number(n).toFixed(4);

// B127：'2026-02-30' 这种格式对、日历上不存在的日期，Date 会滚成 03-02，MySQL 严格模式则直接报错 500；
// 回写比对一次即拦下。格式本身由 DTO 的 @Matches 保证，这里再兜一层给接口直调/脚本用
const isValidDateStr = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return toLocalDateStr(new Date(y, m - 1, d)) === s;
};

// 出口发票/收汇子模块（结算Q12 推荐项）：订单→出口发票→逐笔收汇留痕；
// 拼柜一票多款按款项行金额占比分摊收汇（Q3 推荐项）
@Injectable()
export class ExportInvoiceService {
  constructor(
    @InjectRepository(ExportInvoice) private readonly repo: Repository<ExportInvoice>,
    @InjectRepository(ExportInvoiceItem) private readonly itemRepo: Repository<ExportInvoiceItem>,
    @InjectRepository(InvoiceReceipt) private readonly receiptRepo: Repository<InvoiceReceipt>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateExportInvoiceDto, createdBy: number) {
    if (!dto.items?.length) throw new BadRequestException('请至少填写一行款项(款号+金额)');
    if (dto.invoice_date && !isValidDateStr(dto.invoice_date)) {
      throw new BadRequestException(`发票日期 ${dto.invoice_date} 不是有效日期`);
    }
    const dup = await this.repo.findOne({ where: { invoice_no: dto.invoice_no, deleted: 0 } });
    if (dup) throw new ConflictException(`发票号 ${dto.invoice_no} 已存在`);
    const total = r4(dto.items.reduce((s, it) => s + r4(+it.amount), 0));
    return this.dataSource.transaction(async (manager) => {
      let inv: ExportInvoice;
      try {
        inv = await manager.save(ExportInvoice, manager.create(ExportInvoice, {
          invoice_no: dto.invoice_no,
          invoice_date: dto.invoice_date || null, // '' 须归 NULL：'' 写 DATE 列 500（举一反三 B2）
          currency: dto.currency ?? 'USD',
          total_amount: total,
          customer_name: dto.customer_name ?? null,
          remark: dto.remark ?? null,
          created_by: createdBy,
          deleted: 0,
        } as any) as any);
      } catch (e) {
        // 并发同号抢先落库时上面的查重看不到，撞唯一索引给中文提示（B069 同口径）
        if (isDupInvoiceNoError(e)) throw new ConflictException(`发票号 ${dto.invoice_no} 已存在`);
        throw e;
      }
      await manager.save(ExportInvoiceItem, dto.items.map((it) => manager.create(ExportInvoiceItem, {
        invoice_id: (inv as any).id,
        order_id: it.order_id ?? null,
        style_no: it.style_no ?? null,
        amount: r4(+it.amount),
      } as any)));
      return inv;
    });
  }

  async findAll(page = 1, size = 20, keyword?: string, orderId?: number) {
    size = Math.min(Math.max(+size || 20, 1), 100); page = Math.max(+page || 1, 1);
    const base = { deleted: 0 } as any;
    // 订单→出口发票反查（关联单据 chip）：order_id 挂在款项行(export_invoice_item)上而非发票主表
    // （一票多款），故先取命中该订单的发票 id 再过滤；无命中直接空页，避免 In([]) 全表扫。
    if (orderId !== undefined) {
      const lines = await this.itemRepo.find({ where: { order_id: orderId }, select: ['invoice_id'] });
      const invIds = [...new Set(lines.map((l) => +l.invoice_id))];
      if (!invIds.length) return { items: [], total: 0, page, size };
      base.id = In(invIds);
    }
    const where = keyword
      ? [{ ...base, invoice_no: Like(`%${keyword}%`) }, { ...base, customer_name: Like(`%${keyword}%`) }]
      : base;
    const [items, total] = await this.repo.findAndCount({
      where, skip: (page - 1) * size, take: size, order: { id: 'DESC' },
    });
    // 附款项行与收汇合计
    if (items.length) {
      const ids = items.map((i) => +i.id);
      const [lines, receipts] = await Promise.all([
        this.itemRepo.find({ where: { invoice_id: In(ids) } }),
        this.receiptRepo.find({ where: { invoice_id: In(ids) } }),
      ]);
      for (const inv of items as any[]) {
        inv.items = lines.filter((l) => +l.invoice_id === +inv.id);
        const rs = receipts.filter((rc) => +rc.invoice_id === +inv.id);
        inv.receipt_total = r4(rs.reduce((s, rc) => s + +rc.amount, 0));
        inv.receipt_count = rs.length;
      }
    }
    return { items, total, page, size };
  }

  async findOne(id: number) {
    const inv = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!inv) throw new NotFoundException(`出口发票 #${id} 不存在`);
    const [items, receipts] = await Promise.all([
      this.itemRepo.find({ where: { invoice_id: id } }),
      this.receiptRepo.find({ where: { invoice_id: id }, order: { receipt_date: 'ASC' } }),
    ]);
    const receipt_total = r4(receipts.reduce((s, rc) => s + +rc.amount, 0));
    return { ...inv, items, receipts, receipt_total, receipt_balance: r4(+inv.total_amount - receipt_total) };
  }

  // B049：发票收汇增删后，凡按该发票款项行「同步过发票收汇」的已确认结算单要打「待重算」软锁——
  // 与对账确认 / 付款侧同一口径（P2#22），否则财务删掉一笔重录后结算金额永远停在旧值、列表也不提示
  private async markSettlementsRecalc(manager: EntityManager, invoiceId: number): Promise<void> {
    await manager.query(
      `UPDATE settlement s
         JOIN export_invoice_item i ON i.order_id = s.order_id
          SET s.needs_recalc = 1
        WHERE i.invoice_id = ? AND s.status = 'CONFIRMED' AND s.deleted = 0`,
      [invoiceId],
    );
  }

  // 逐笔收汇登记（多笔多汇率，Q12/Q13）
  async addReceipt(id: number, dto: AddReceiptDto) {
    if (!(+dto.amount > 0)) throw new BadRequestException('收汇金额须大于 0');
    if (!dto.receipt_date) throw new BadRequestException('请选择收汇日期'); // '' 写 DATE NOT NULL 列必 500，前置拦截（举一反三 B9）
    if (!isValidDateStr(dto.receipt_date)) throw new BadRequestException(`收汇日期 ${dto.receipt_date} 不是有效日期`); // B127
    return this.dataSource.transaction(async (manager) => {
      // B048：锁发票行、事务内累计——同一水单登记两次 / 并发双击都拦在「累计收汇 ≤ 发票金额」闸门，
      // 与付款侧超付闸门同口径；此前收汇 2 倍照收，结算同步后金额与毛利跟着虚高
      const inv = await manager.findOne(ExportInvoice, {
        where: { id, deleted: 0 },
        lock: { mode: 'pessimistic_write' },
      });
      if (!inv) throw new NotFoundException(`出口发票 #${id} 不存在`);
      const existed = await manager.find(InvoiceReceipt, { where: { invoice_id: id } });
      const received = r4(existed.reduce((s, rc) => s + +rc.amount, 0));
      const amount = r4(+dto.amount);
      if (received + amount > +inv.total_amount + 0.01) {
        throw new BadRequestException(
          `累计收汇 ${(received + amount).toFixed(2)} 超过发票金额 ${(+inv.total_amount).toFixed(2)}（已收 ${received.toFixed(2)}，本次 ${amount.toFixed(2)}）`,
        );
      }
      const saved = await manager.save(InvoiceReceipt, manager.create(InvoiceReceipt, {
        invoice_id: id,
        amount,
        exchange_rate: dto.exchange_rate || null, // '' 须归 NULL（举一反三 B9）
        receipt_date: dto.receipt_date,
        slip_url: dto.slip_url ?? null,
        remark: dto.remark ?? null,
      } as any));
      await this.markSettlementsRecalc(manager, id);
      return saved;
    });
  }

  async removeReceipt(id: number, receiptId: number) {
    await this.dataSource.transaction(async (manager) => {
      const row = await manager.findOne(InvoiceReceipt, { where: { id: receiptId, invoice_id: id } });
      if (!row) throw new NotFoundException(`收汇记录 #${receiptId} 不存在`);
      await manager.delete(InvoiceReceipt, { id: receiptId });
      await this.markSettlementsRecalc(manager, id); // B049：删收汇同样要给已确认结算单打「待重算」
    });
  }

  async remove(id: number) {
    const inv = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!inv) throw new NotFoundException(`出口发票 #${id} 不存在`);
    const n = await this.receiptRepo.count({ where: { invoice_id: id } });
    if (n > 0) throw new BadRequestException('已有收汇记录的发票不可删除(先删收汇)');
    inv.deleted = 1;
    // B069：uk_invoice_no 不区分软删行，软删时把发票号改写为「原号#del<id>」让出该号（列宽 VARCHAR(50)），
    // 否则同号重新登记查重看不到、落库撞唯一键 500；查重仍按 deleted:0 口径
    inv.invoice_no = releasedInvoiceNo(inv.invoice_no, +inv.id, 50);
    await this.repo.save(inv);
  }

  // 某订单在各发票中的收汇份额(Q3:按该款发票金额占比分摊逐笔收汇)——供结算拉取
  // B125 同类：此前逐款项行 findOne 发票 + find 收汇（N+1），改为一次 In() 取齐
  async allocatedReceiptsForOrder(orderId: number): Promise<Array<{
    invoice_no: string; amount: number; exchange_rate: number | null; receipt_date: string; slip_url: string | null;
  }>> {
    const lines = await this.itemRepo.find({ where: { order_id: orderId } });
    if (!lines.length) return [];
    const invIds = [...new Set(lines.map((l) => +l.invoice_id))];
    const [invoices, receipts] = await Promise.all([
      this.repo.find({ where: { id: In(invIds), deleted: 0 } }),
      this.receiptRepo.find({ where: { invoice_id: In(invIds) }, order: { receipt_date: 'ASC' } }),
    ]);
    const invById = new Map(invoices.map((i) => [+i.id, i]));
    const out: Array<{ invoice_no: string; amount: number; exchange_rate: number | null; receipt_date: string; slip_url: string | null }> = [];
    for (const line of lines) {
      const inv = invById.get(+line.invoice_id);
      if (!inv || !(+inv.total_amount > 0)) continue;
      const share = +line.amount / +inv.total_amount;
      for (const rc of receipts.filter((r) => +r.invoice_id === +inv.id)) {
        out.push({
          invoice_no: inv.invoice_no,
          amount: r4(+rc.amount * share),
          exchange_rate: rc.exchange_rate != null ? +rc.exchange_rate : null,
          receipt_date: rc.receipt_date,
          slip_url: rc.slip_url ?? null,
        });
      }
    }
    return out;
  }
}
