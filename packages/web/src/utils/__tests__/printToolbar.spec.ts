import { describe, it, expect, vi, afterEach } from 'vitest';
import { printOrder } from '../orderPrint';
import { printContract } from '../contractPrint';
import { printQuote } from '../quotePrint';
import { printSample, buildSampleHtml } from '../samplePrint';

/**
 * #143（2026-09-16 YSM：「PDF 导出来不能保存文件么」）。
 * 打印框点了取消就只剩一个空白窗口，既没法再打印，也不知道怎么存成 PDF。
 * 四个打印窗口顶部都要有「打印 / 保存为 PDF」条，并且打印时隐藏、不印进单据。
 */
function capture(run: () => void): string {
  let html = '';
  const win = { document: { open: vi.fn(), write: (s: string) => { html += s; }, close: vi.fn() } };
  const spy = vi.spyOn(window, 'open').mockReturnValue(win as any);
  run();
  spy.mockRestore();
  return html;
}
const hasBar = (html: string) => {
  expect(html).toContain('class="pdf-bar"');
  expect(html).toContain('onclick="window.print()"');
  expect(html).toContain('另存为 PDF');
  expect(html).toMatch(/@media print \{ \.pdf-bar \{ display:none !important; \} \}/);
};

describe('打印窗口顶部的「打印 / 保存为 PDF」条', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('合同', () => hasBar(capture(() => printContract({ contract_no: 'HT-1', type: 'MATERIAL', materials: [] } as any, { name: '供应商' } as any, { name: '本司' } as any))));
  it('报价单', () => hasBar(capture(() => printQuote({ quote_no: 'Q-1', items: [], fees: [] }))));
  it('订单', () => hasBar(capture(() => printOrder({ order_no: 'O-1', materials: [], matrix: null } as any, 'customer'))));
  it('样衣制作单（打印窗口有，操作台预览没有）', () => {
    const detail = { sample_no: 'S-1', materials: [], shipRounds: [] };
    hasBar(capture(() => printSample(detail)));
    expect(buildSampleHtml(detail, undefined, false)).not.toContain('class="pdf-bar"');
  });
});
