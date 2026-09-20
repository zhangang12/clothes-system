import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { commonStubs } from '@/test-utils/el-stubs';

// 敏感附件要换签名链接：这里如实模拟「private/ 才加令牌」
const mockSignedUrl = vi.fn(async (u: string) => (u.includes('private') ? `${u}&t=tok` : u));
vi.mock('@/utils/secureFile', () => ({ signedUrl: (u: string) => mockSignedUrl(u) }));
const mockParseXlsx = vi.fn();
vi.mock('@/utils/sheetPreview', () => ({ parseXlsx: (...a: any[]) => mockParseXlsx(...a) }));

import FilePreviewDialog from '../FilePreviewDialog.vue';

const PDF = '/api/v1/uploads/file?p=private%2F2026%2F09%2Fslip.pdf';
const PNG = '/api/v1/uploads/file?p=private%2F2026%2F09%2Fslip.png';
const XLSX = '/api/v1/uploads/file?p=private%2F2026%2F09%2Fstatement.xlsx';
const DOCX = '/api/v1/uploads/file?p=misc%2F2026%2F09%2Fnote.docx';

const ElTabsStub = { name: 'ElTabs', props: ['modelValue'], template: '<div><slot /></div>' };
const ElTabPaneStub = { name: 'ElTabPane', props: ['label', 'name'], template: '<div>{{ label }}</div>' };

async function openWith(url: string, label?: string) {
  const w = mount(FilePreviewDialog, {
    global: { plugins: [ElementPlus], stubs: { ...commonStubs, ElTabs: ElTabsStub, ElTabPane: ElTabPaneStub } },
  });
  await (w.vm as any).open(url, label);
  await flushPromises();
  return w;
}

describe('FilePreviewDialog 按 URL 判类型（B021）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignedUrl.mockImplementation(async (u: string) => (u.includes('private') ? `${u}&t=tok` : u));
    mockParseXlsx.mockResolvedValue([{ name: 'Sheet1', rows: [['款号', '金额'], ['A1', '100']], truncated: false }]);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  });

  it('B021 传中文标题的图片水单 → 弹窗里出 <img>，而不是「没法预览」', async () => {
    const w = await openWith(PNG, '付款水单');
    expect(w.find('img.fp-img').exists()).toBe(true);
    expect(w.text()).not.toContain('没法在页面里预览');
    // 标题用业务标题，判型用 URL——两者不再混为一谈
    expect(w.text()).toContain('付款水单');
  });

  it('B021 传中文标题的 PDF 水单 → iframe 内嵌预览（原来一律「未知格式」）', async () => {
    const w = await openWith(PDF, '付款水单');
    expect(w.find('iframe.fp-frame').exists()).toBe(true);
    expect(w.text()).not.toContain('没法在页面里预览');
  });

  it('B021 敏感附件用签名链接，不是裸地址（裸的必 403）', async () => {
    const w = await openWith(PDF, '预付款水单');
    expect(mockSignedUrl).toHaveBeenCalledWith(PDF);
    expect(w.find('iframe.fp-frame').attributes('src')).toBe(`${PDF}&t=tok`);
  });

  it('B021 对账单 xlsx → 解析成表格显示', async () => {
    const w = await openWith(XLSX, '对账单');
    expect(mockParseXlsx).toHaveBeenCalled();
    expect(w.find('table.fp-table').exists()).toBe(true);
    expect(w.text()).toContain('款号');
    expect(w.text()).toContain('A1');
  });

  it('B021 xlsx 解析失败时不关窗，退回「请下载」并仍可下载', async () => {
    mockParseXlsx.mockRejectedValue(new Error('读取失败（HTTP 500）'));
    const w = await openWith(XLSX, '对账单');
    expect(w.find('table.fp-table').exists()).toBe(false);
    expect(w.text()).toContain('下载');
    expect(w.findAll('button').find((b) => b.text().includes('下载'))?.attributes('disabled')).toBeUndefined();
  });

  it('B021 确实没法预览的格式（.docx）才显示「没法在页面里预览」，并说出格式名', async () => {
    const w = await openWith(DOCX, '扣款附件');
    expect(w.text()).toContain('没法在页面里预览');
    expect(w.text()).toContain('docx');
  });

  it('B021 连点两个附件只认最后一次（慢响应不覆盖新的）', async () => {
    const w = mount(FilePreviewDialog, {
      global: { plugins: [ElementPlus], stubs: { ...commonStubs, ElTabs: ElTabsStub, ElTabPane: ElTabPaneStub } },
    });
    let releaseFirst!: (v: string) => void;
    mockSignedUrl.mockImplementationOnce(() => new Promise<string>((res) => { releaseFirst = res; }));
    const p1 = (w.vm as any).open(PDF, '第一张');
    const p2 = (w.vm as any).open(PNG, '第二张');
    await p2;
    releaseFirst(`${PDF}&t=late`);
    await p1;
    await flushPromises();
    expect(w.find('img.fp-img').exists()).toBe(true);           // 第二张（图片）仍在
    expect(w.find('iframe.fp-frame').exists()).toBe(false);     // 慢到的第一张没有盖回来
  });
});
