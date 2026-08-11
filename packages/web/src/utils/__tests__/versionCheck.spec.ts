import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('element-plus', () => ({ ElNotification: vi.fn() }));

/** 造一个够用的 router 替身：只关心 beforeEach 守卫拿到什么、返回什么 */
function makeRouter() {
  let guard: any = null;
  return {
    beforeEach: (fn: any) => { guard = fn; },
    run: (to: any) => guard?.(to),
  };
}

/**
 * versionCheck 有模块级状态（pendingUpdate/notified）——那是刻意的，一个页面只该有一份。
 * 所以每个用例都得重新加载模块，否则上一条的"已发现新版本"会漏到下一条。
 */
async function load(remoteBuildId: string | Error) {
  vi.resetModules();
  vi.stubGlobal('__BUILD_ID__', 'BUILD-A');
  const fetchMock = remoteBuildId instanceof Error
    ? vi.fn().mockRejectedValue(remoteBuildId)
    : vi.fn().mockResolvedValue({ ok: true, json: async () => ({ buildId: remoteBuildId }) });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('location', { assign: vi.fn(), reload: vi.fn() });
  const { startVersionWatch } = await import('../versionCheck');
  const { ElNotification } = await import('element-plus');
  (ElNotification as any).mockClear();
  const router = makeRouter();
  startVersionWatch(router as any);
  await new Promise((r) => setTimeout(r, 0)); // 等首次 check 的微任务跑完
  return { router, fetchMock, notify: ElNotification as any, location: globalThis.location };
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('发版后主动换新版本', () => {
  it('构建标识一致时什么都不做，切页照常走前端路由', async () => {
    const { router, notify } = await load('BUILD-A');
    expect(notify).not.toHaveBeenCalled();
    expect(router.run({ fullPath: '/orders' })).toBe(true);
  });

  it('发现新版本后，下次切页改成整页跳转去取新资源', async () => {
    const { router, location } = await load('BUILD-B');
    // 必须返回 false 终止前端路由——否则会先按旧 chunk 名去加载，还是白屏
    expect(router.run({ fullPath: '/contracts' })).toBe(false);
    expect(location.assign).toHaveBeenCalledWith('/contracts');
  });

  it('提示不自动消失，交给用户决定什么时候刷（可能正在填单）', async () => {
    const { notify } = await load('BUILD-B');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ duration: 0 });
  });

  it('只提示一次，不会每个轮询周期都弹', async () => {
    const { notify } = await load('BUILD-B');
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('取不到 version.json（断网/临时故障）时不打扰用户，也不拦路由', async () => {
    const { router, notify } = await load(new Error('offline'));
    expect(notify).not.toHaveBeenCalled();
    expect(router.run({ fullPath: '/x' })).toBe(true);
  });

  it('请求带 no-store 与时间戳，绕开缓存（否则永远读到旧值）', async () => {
    const { fetchMock } = await load('BUILD-A');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/^\/version\.json\?t=\d+/);
    expect(opts).toMatchObject({ cache: 'no-store' });
  });
});

describe('组件内 import() 失败（不走路由那条）', () => {
  it('认得出 chunk 加载失败的各种说法（各家浏览器文案不同）', async () => {
    vi.resetModules();
    vi.stubGlobal('__BUILD_ID__', 'A');
    vi.stubGlobal('fetch', vi.fn());
    const { isChunkLoadError } = await import('../versionCheck');
    // Chrome / Firefox / Safari 对同一件事的三种说法，都得认
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/x.js'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    // 普通业务错误不能被误判成"发版了"，否则一报错就刷页面
    expect(isChunkLoadError(new Error('保存失败：款号已存在'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });

  it('确认发过版才刷页面', async () => {
    const { location } = await load('BUILD-B');
    const { recoverFromChunkError } = await import('../versionCheck');
    await expect(recoverFromChunkError()).resolves.toBe(true);
    expect(location.reload).toHaveBeenCalled();
  });

  it('版本没变说明不是发版引起的——不刷，免得把真故障刷成无限循环', async () => {
    const { location } = await load('BUILD-A');
    const { recoverFromChunkError } = await import('../versionCheck');
    await expect(recoverFromChunkError()).resolves.toBe(false);
    expect(location.reload).not.toHaveBeenCalled();
  });
});
