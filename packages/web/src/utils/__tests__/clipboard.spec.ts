import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyText, readClipboardText, CLIPBOARD_CANCELLED } from '../clipboard';

// 这组用例守的是 2026-08-07 那条线上报错：生产是纯 HTTP，navigator.clipboard 整个是 undefined。
// 开发机（localhost 算安全上下文）永远复现不了，所以必须在测试里把「没有 clipboard」这个环境造出来。
const noClipboard = () => vi.stubGlobal('navigator', {});

beforeEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('copyText 写剪贴板', () => {
  it('安全上下文走 navigator.clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyText('a\tb')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('a\tb');
  });

  it('HTTP 下 navigator.clipboard 不存在时退回 execCommand，不抛异常', async () => {
    noClipboard();
    const exec = vi.fn().mockReturnValue(true);
    (document as any).execCommand = exec;
    expect(await copyText('x')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('writeText 抛错（无权限）也退回 execCommand', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    (document as any).execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText('x')).toBe(true);
  });

  it('两条路都不通时返回 false，由调用方提示，绝不抛到界面上', async () => {
    noClipboard();
    (document as any).execCommand = vi.fn().mockReturnValue(false);
    expect(await copyText('x')).toBe(false);
  });

  it('兜底用的临时 textarea 用完即删，不留在 DOM 里', async () => {
    noClipboard();
    (document as any).execCommand = vi.fn().mockReturnValue(true);
    await copyText('x');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});

describe('readClipboardText 读剪贴板', () => {
  it('安全上下文直接读，不打扰用户', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: vi.fn().mockResolvedValue('a\tb') } });
    expect(await readClipboardText()).toBe('a\tb');
  });

  it('读到空串就照实返回，不弹兜底框（剪贴板确实是空的）', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: vi.fn().mockResolvedValue('') } });
    expect(await readClipboardText()).toBe('');
  });

  it('HTTP 下弹兜底框让用户手工粘贴——这正是线上那条报错的修复', async () => {
    noClipboard();
    const { ElMessageBox } = await import('element-plus');
    vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: '品名\t数量' } as any);
    expect(await readClipboardText()).toBe('品名\t数量');
  });

  it('用户取消兜底框时抛 CLIPBOARD_CANCELLED，调用方据此静默返回而不是报「粘贴失败」', async () => {
    noClipboard();
    const { ElMessageBox } = await import('element-plus');
    vi.spyOn(ElMessageBox, 'prompt').mockRejectedValue('cancel');
    await expect(readClipboardText()).rejects.toBe(CLIPBOARD_CANCELLED);
  });
});
