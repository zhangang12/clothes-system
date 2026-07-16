import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, DataSource } from 'typeorm';
import { ExportInvoice } from './export-invoice.entity';
import { ExportInvoiceItem } from './export-invoice-item.entity';
import { InvoiceReceipt } from './invoice-receipt.entity';

const r4 = (n: number) => +Number(n).toFixed(4);

export interface CreateInvoiceDto {
  invoice_no: string;
  invoice_date?: string;
  currency?: string;
  customer_name?: string;
  remark?: string;
  items: Array<{ order_id?: number; style_no?: string; amount: number }>;
}

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

  async create(dto: CreateInvoiceDto, createdBy: number) {
    if (!dto.items?.length) throw new BadRequestException('请至少填写一行款项(款号+金额)');
    const dup = await this.repo.findOne({ where: { invoice_no: dto.invoice_no, deleted: 0 } });
    if (dup) throw new ConflictException(`发票号 ${dto.invoice_no} 已存在`);
    const total = r4(dto.items.reduce((s, it) => s + +it.amount, 0));
    return this.dataSource.transaction(async (manager) => {
      const inv = await manager.save(ExportInvoice, manager.create(ExportInvoice, {
        invoice_no: dto.invoice_no,
        invoice_date: dto.invoice_date ?? null,
        currency: dto.currency ?? 'USD',
        total_amount: total,
        customer_name: dto.customer_name ?? null,
        remark: dto.remark ?? null,
        created_by: createdBy,
        deleted: 0,
      } as any) as any);
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

  // 逐笔收汇登记（多笔多汇率，Q12/Q13）
  async addReceipt(id: number, dto: { amount: number; exchange_rate?: number; receipt_date: string; slip_url?: string; remark?: string }) {
    const inv = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!inv) throw new NotFoundException(`出口发票 #${id} 不存在`);
    if (!(+dto.amount > 0)) throw new BadRequestException('收汇金额须大于 0');
    return this.receiptRepo.save(this.receiptRepo.create({
      invoice_id: id,
      amount: r4(+dto.amount),
      exchange_rate: dto.exchange_rate ?? null,
      receipt_date: dto.receipt_date,
      slip_url: dto.slip_url ?? null,
      remark: dto.remark ?? null,
    } as any));
  }

  async removeReceipt(id: number, receiptId: number) {
    const row = await this.receiptRepo.findOne({ where: { id: receiptId, invoice_id: id } });
    if (!row) throw new NotFoundException(`收汇记录 #${receiptId} 不存在`);
    await this.receiptRepo.delete({ id: receiptId });
  }

  async remove(id: number) {
    const inv = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!inv) throw new NotFoundException(`出口发票 #${id} 不存在`);
    const n = await this.receiptRepo.count({ where: { invoice_id: id } });
    if (n > 0) throw new BadRequestException('已有收汇记录的发票不可删除(先删收汇)');
    inv.deleted = 1;
    await this.repo.save(inv);
  }

  // 某订单在各发票中的收汇份额(Q3:按该款发票金额占比分摊逐笔收汇)——供结算拉取
  async allocatedReceiptsForOrder(orderId: number): Promise<Array<{
    invoice_no: string; amount: number; exchange_rate: number | null; receipt_date: string; slip_url: string | null;
  }>> {
    const lines = await this.itemRepo.find({ where: { order_id: orderId } });
    if (!lines.length) return [];
    const out: Array<{ invoice_no: string; amount: number; exchange_rate: number | null; receipt_date: string; slip_url: string | null }> = [];
    for (const line of lines) {
      const inv = await this.repo.findOne({ where: { id: +line.invoice_id, deleted: 0 } });
      if (!inv || !(+inv.total_amount > 0)) continue;
      const share = +line.amount / +inv.total_amount;
      const receipts = await this.receiptRepo.find({ where: { invoice_id: +inv.id }, order: { receipt_date: 'ASC' } });
      for (const rc of receipts) {
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
