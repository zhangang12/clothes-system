import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 拦截器里用到的外部依赖全部打桩
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }));
vi.mock('../../stores/tabs', () => ({ useTabsStore: () => ({ reset: vi.fn() }) }));
vi.mock('../../utils/progress', () => ({ progressStart: vi.fn(), progressDone: vi.fn() }));

/**
 * 取出注册在 axios 上的「响应错误」处理函数——本文件测的就是它。
 * 每个用例都要重新加载模块：拦截器里有「只跳一次」的模块级标志，
 * 不重载的话第二个用例永远跳不动。
 */
async function loadRejectHandler(pathname: string, search = '') {
  vi.resetModules();
  const handlers: any[] = [];
  vi.doMock('axios', () => ({
    default: {
      create: () => ({
        interceptors: {
          request: { use: () => {} },
          response: { use: (_ok: any, bad: any) => { handlers.push(bad); } },
        },
      }),
    },
  }));
  // 记「被赋值了几次」而不是「跳到了几个不同地址」——重复跳的地址是同一个字符串，
  // 只比对值的话，把去重判断整段删掉测试照样绿（变异测试实测踩过）。
  const href = { value: '', writes: 0 };
  vi.stubGlobal('location', {
    pathname,
    search,
    set href(v: string) { href.value = v; href.writes += 1; },
    get href() { return href.value; },
  });
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
  await import('../index');
  return { onReject: handlers[0], href, ls: globalThis.localStorage as Storage };
}

const err401 = () => ({ response: { status: 401, data: {} } });

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock('axios'); });

describe('登录态失效时的跳转', () => {
  it('并发请求同时 401，只跳一次登录页', async () => {
    const { onReject, href } = await loadRejectHandler('/orders');
    // 一页同时打了 5 个请求（列表+徽标+字典+反馈未读…），token 过期后 5 个一起 401
    for (let i = 0; i < 5; i++) await onReject(err401()).catch(() => {});
    expect(href.value).toContain('/login');
    expect(href.writes).toBe(1); // 原来会连着赋值 5 次
  });

  it('跳登录时带上当前地址，登录后能回到原来那一页', async () => {
    const { onReject, href } = await loadRejectHandler('/contracts/12/edit', '?tab=material');
    await onReject(err401()).catch(() => {});
    expect(href.value).toBe(`/login?redirect=${encodeURIComponent('/contracts/12/edit?tab=material')}`);
  });

  it('本来就在首页，不带多余的 redirect 参数', async () => {
    const { onReject, href } = await loadRejectHandler('/');
    await onReject(err401()).catch(() => {});
    expect(href.value).toBe('/login');
  });

  it('清掉 token 和菜单缓存，免得下一个账号读到上一个人的菜单', async () => {
    const { onReject, ls } = await loadRejectHandler('/orders');
    ls.setItem('token', 'x');
    ls.setItem('menuKeys', '["orders"]');
    await onReject(err401()).catch(() => {});
    expect(ls.getItem('token')).toBeNull();
    expect(ls.getItem('menuKeys')).toBeNull();
  });

  it('登录页密码错(401)只提示、不刷新——刷了输入就没了', async () => {
    const { onReject, href } = await loadRejectHandler('/login');
    await onReject(err401()).catch(() => {});
    const { ElMessage } = await import('element-plus');
    expect(href.value).toBe('');
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it('非 401 的错误不跳登录页', async () => {
    const { onReject, href } = await loadRejectHandler('/orders');
    await onReject({ response: { status: 500, data: { msg: '服务器错误' } } }).catch(() => {});
    expect(href.value).toBe('');
  });
});
