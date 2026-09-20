import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ElementPlus, { ElMessage } from 'element-plus';

const mockPost = vi.fn();
vi.mock('@/api', () => ({ http: { post: (...a: any[]) => mockPost(...a) } }));
vi.mock('@/api/upload', () => ({ UPLOAD_TIMEOUT_MS: 120000 }));
const mockSigned = vi.fn((u: string) => Promise.resolve(u));
vi.mock('@/utils/secureFile', () => ({
  signedUrl: (u: string) => mockSigned(u),
  openFile: vi.fn(),
  isPrivateFile: () => false,
}));
vi.mock('@/utils/sheetPreview', () => ({ parseXlsx: vi.fn(), isXlsxName: () => false, isLegacyXlsName: () => false }));
vi.mock('@/utils/imageCompress', () => ({ compressImage: async (f: File) => f }));

import FileUpload from '../FileUpload.vue';

/**
 * #136（2026-09-14 Helen：「上传了 PDF 资料，传错的怎么删除」）。
 * element-plus 的文本列表只在鼠标悬停时把 ✓ 换成 ✕，没悬停过的人找不到删除。
 * 列表型上传框现在每行常驻一个「删除」。
 */
const A = '/api/v1/uploads/file?p=misc%2F2026%2F09%2Fa.pdf';
const B = '/api/v1/uploads/file?p=misc%2F2026%2F09%2Fb.pdf';

// 【必须逐个卸载】组件把自己的 onPaste 挂进模块级 pasteStack（document 上只有一个监听，
// 由栈「后挂载优先 + 满了让给下一个」派发）。用例里不卸载，上一条用例的上传框还在栈里，
// 会把下一条用例的粘贴接走——B141 那条就是这么假绿的。
const mounted: any[] = [];
function mountFU(props: Record<string, unknown>) {
  const w = mount(FileUpload, { props, global: { plugins: [ElementPlus] } });
  mounted.push(w);
  return w;
}
async function mountUpload(props: Record<string, unknown>) {
  const w = mountFU(props);
  await flushPromises();
  return w;
}
const delButtons = (w: any) => w.findAll('button').filter((b: any) => b.text() === '删除');

beforeEach(() => {
  vi.clearAllMocks();
  mockSigned.mockImplementation((u: string) => Promise.resolve(u));
  vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ id: '' } as any));
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ id: '' } as any));
  vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ id: '' } as any));
});

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount();
});

describe('FileUpload 列表型：删除常驻可见', () => {
  it('每个已传文件一行一个「删除」，点了只去掉那一个', async () => {
    const w = await mountUpload({ modelValue: `${A},${B}`, multiple: true, listType: 'text', accept: '*' });
    expect(w.text()).toContain('a.pdf');
    expect(w.text()).toContain('b.pdf');
    const dels = delButtons(w);
    expect(dels.length).toBe(2);
    await dels[0].trigger('click');
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([B]);
  });

  it('只读（disabled）时不给删除', async () => {
    const w = await mountUpload({ modelValue: A, listType: 'text', disabled: true });
    expect(w.text()).toContain('a.pdf');
    expect(delButtons(w).length).toBe(0);
  });

  it('picture-card 仍用 element-plus 默认的缩略图渲染，不套文字行', async () => {
    const w = await mountUpload({ modelValue: A, listType: 'picture-card' });
    expect(delButtons(w).length).toBe(0);
    expect(w.find('.fu-item').exists()).toBe(false);
  });
});

describe('FileUpload 附件列表重建与粘贴（B140 / B141）', () => {
  it('B140 连续增删附件时，先发的慢签名不能把新列表盖回去', async () => {
    const slow = new Map<string, (v: string) => void>();
    mockSigned.mockImplementation((u: string) => (u === A
      ? new Promise<string>((res) => slow.set(u, res))
      : Promise.resolve(u)));

    const w = mountFU({ modelValue: A, multiple: true, listType: 'text', accept: '*' });
    await flushPromises();
    // 第一批（含慢的 A）还没回来，用户已经把 A 删掉、只剩 B
    await w.setProps({ modelValue: B });
    await flushPromises();
    expect(w.text()).toContain('b.pdf');

    slow.get(A)?.(A); // 慢的第一批这时才回来
    await flushPromises();
    expect(w.text()).toContain('b.pdf');
    expect(w.text()).not.toContain('a.pdf'); // 没被旧结果盖回来
  });

  it('B141 上传框已满时粘贴文件会说一声，不再静默吞掉', async () => {
    const w = mountFU({ modelValue: A, multiple: false, listType: 'text', accept: '*' });
    await flushPromises();

    const file = new File(['x'], 'p.png', { type: 'image/png' });
    const e: any = new Event('paste');
    e.clipboardData = { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] };
    document.dispatchEvent(e);
    await flushPromises();

    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('已满'));
  });

  it('B141 没满时照常接管粘贴，不弹「已满」', async () => {
    mockPost.mockResolvedValue({ data: { url: '/api/v1/uploads/file?p=misc%2Fnew.png' } });
    const w = mountFU({ modelValue: '', multiple: true, limit: 3, listType: 'text', accept: '*' });
    await flushPromises();

    const file = new File(['x'], 'p.png', { type: 'image/png' });
    const e: any = new Event('paste');
    e.clipboardData = { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] };
    document.dispatchEvent(e);
    await flushPromises();

    expect(ElMessage.warning).not.toHaveBeenCalledWith(expect.stringContaining('已满'));
    expect(mockPost).toHaveBeenCalled();
  });

  it('B141 粘贴纯文本一律不拦（输入框里的 Ctrl+V 不受影响）', async () => {
    const w = mountFU({ modelValue: A, multiple: false, listType: 'text', accept: '*' });
    await flushPromises();

    const e: any = new Event('paste');
    e.clipboardData = { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] };
    document.dispatchEvent(e);
    await flushPromises();

    expect(ElMessage.warning).not.toHaveBeenCalled();
  });
});
