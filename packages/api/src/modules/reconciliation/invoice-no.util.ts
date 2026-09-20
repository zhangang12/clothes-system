/**
 * 发票号唯一索引（reconciliation.uk_invoice_no / export_invoice.uk_invoice_no）**不区分软删行**，
 * 而应用层查重按 deleted:0 口径——单据软删后同号重录会撞唯一键 500（2026-09-20 审查 B069）。
 * 零 schema 修法：软删时把发票号改写成「原号#del<id>」让出该号；查重口径不变。
 */
export function releasedInvoiceNo(invoiceNo: string, id: number, maxLen: number): string {
  const suffix = `#del${id}`;
  return `${invoiceNo.slice(0, Math.max(0, maxLen - suffix.length))}${suffix}`;
}

/** 撞到发票号唯一索引（并发同号 / 极端存量脏数据）时识别出来给中文提示，别让业务看「服务器内部错误」 */
export function isDupInvoiceNoError(e: any): boolean {
  const code = e?.code ?? e?.driverError?.code;
  const msg = String(e?.sqlMessage ?? e?.driverError?.sqlMessage ?? e?.message ?? '');
  return code === 'ER_DUP_ENTRY' && /invoice_no/i.test(msg);
}
