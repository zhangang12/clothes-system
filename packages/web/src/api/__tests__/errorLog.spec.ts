import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRedirect = vi.fn();
vi.mock('../index', () => ({
  http: { get: vi.fn(), patch: vi.fn() },
  redirectToLogin: (...a: any[]) => mockRedirect(...a),
}));

import { downloadHtml } from '../errorLog';

describe('downloadHtml 裸 fetch 的 401 口径（B137）', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    vi.stubGlobal('localStorage', { getItem: () => 'tok', setItem: () => {}, removeItem: () => {} });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('B137 令牌过期时跳登录，而不是只弹「导出失败 (401)」让人干瞪眼', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
    await expect(downloadHtml('/error-logs/export', 'a.html')).rejects.toThrow('登录已过期');
    expect(mockRedirect).toHaveBeenCalled();
  });

  it('B137 其它错误照旧报错，不跳登录（别把 500 也当登录态失效）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(downloadHtml('/error-logs/export', 'a.html')).rejects.toThrow('导出失败 (500)');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('正常时落盘导出文件', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['<html>']) })));
    await downloadHtml('/error-logs/export', '错误日志.html');
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
