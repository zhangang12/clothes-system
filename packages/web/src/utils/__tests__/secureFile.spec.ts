import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
vi.mock('@/api', () => ({ http: { get: (...a: any[]) => mockGet(...a) } }));

import { signedUrl, openFile, isPrivateFile } from '../secureFile';

const PRIVATE = '/api/v1/uploads/file?p=private%2F2026%2F09%2Fa.pdf';
const PUBLIC = '/api/v1/uploads/file?p=misc%2F2026%2F09%2Fb.png';

describe('secureFile 签名链接', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('public 文件原样返回，不白跑一次签名请求', async () => {
    expect(await signedUrl(PUBLIC)).toBe(PUBLIC);
    expect(mockGet).not.toHaveBeenCalled();
    expect(isPrivateFile(PUBLIC)).toBe(false);
  });

  it('private 文件换短时签名链接', async () => {
    mockGet.mockResolvedValue({ data: { url: `${PRIVATE}&t=tok` } });
    expect(await signedUrl(PRIVATE)).toBe(`${PRIVATE}&t=tok`);
    expect(isPrivateFile(PRIVATE)).toBe(true);
  });
});

describe('openFile 新窗口（B090 弹窗拦截）', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('B090 先在点击手势里开空窗、签名回来再换地址——不能 await 之后才 window.open', async () => {
    const win: any = { closed: false, opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.fn(() => win);
    vi.stubGlobal('window', { ...globalThis.window, open } as any);
    let release!: (v: any) => void;
    mockGet.mockImplementation(() => new Promise((res) => { release = res; }));

    const p = openFile(PRIVATE);
    // 签名还没回来，空窗已经开了（这一步同步发生，才不会被弹窗拦截器挡下）
    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(win.location.replace).not.toHaveBeenCalled();

    release({ data: { url: `${PRIVATE}&t=tok` } });
    await p;
    expect(win.location.replace).toHaveBeenCalledWith(`${PRIVATE}&t=tok`);
    expect(win.opener).toBeNull();
    vi.unstubAllGlobals();
  });

  it('B090 取签名失败时把空窗关掉，不留一个 about:blank', async () => {
    const win: any = { closed: false, location: { replace: vi.fn() }, close: vi.fn() };
    vi.stubGlobal('window', { ...globalThis.window, open: vi.fn(() => win) } as any);
    mockGet.mockRejectedValue(new Error('网络断了'));
    await expect(openFile(PRIVATE)).rejects.toThrow();
    expect(win.close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('空地址什么都不做', async () => {
    const open = vi.fn();
    vi.stubGlobal('window', { ...globalThis.window, open } as any);
    await openFile('');
    expect(open).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
