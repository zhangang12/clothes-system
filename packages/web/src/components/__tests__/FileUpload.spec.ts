import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ElementPlus from 'element-plus';

vi.mock('@/api', () => ({ http: { post: vi.fn() } }));
vi.mock('@/utils/secureFile', () => ({ signedUrl: async (u: string) => u }));
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

async function mountUpload(props: Record<string, unknown>) {
  const w = mount(FileUpload, { props, global: { plugins: [ElementPlus] } });
  await flushPromises();
  return w;
}
const delButtons = (w: any) => w.findAll('button').filter((b: any) => b.text() === '删除');

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
