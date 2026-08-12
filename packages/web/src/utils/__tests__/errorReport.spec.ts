import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const post = vi.fn().mockResolvedValue(undefined);
vi.mock('@/api', () => ({ http: { post } }));

/** 每个用例重载模块：限流计数是模块级的，不重载第二条就被上一条的配额挡掉。
 *  window/navigator 用 jsdom 真实那份（stubGlobal 顶不掉 navigator 这种只读属性），
 *  只把 addEventListener 换成 spy 以便拿到注册进去的处理函数。 */
async function load() {
  vi.resetModules();
  post.mockClear();
  vi.stubGlobal('__BUILD_ID__', 'BUILD-A');
  const listeners: Record<string, any> = {};
  const spy = vi.spyOn(window, 'addEventListener').mockImplementation(((t: string, fn: any) => { listeners[t] = fn; }) as any);
  const { startErrorReport } = await import('../errorReport');
  const app: any = { config: {} };
  const routerErrors: any[] = [];
  const router: any = { onError: (fn: any) => routerErrors.push(fn) };
  startErrorReport(app, router);
  spy.mockRestore();
  return { app, listeners, onRouterError: routerErrors[0] };
}

const curPath = () => window.location.pathname + window.location.search;

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('前端错误上报', () => {
  it('组件渲染出错时把错误、堆栈、所在路由一起报上去', async () => {
    const { app } = await load();
    app.config.errorHandler(new Error('boom'), null, 'render');
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/error-logs/client');
    expect(body).toMatchObject({ kind: 'VUE', path: curPath(), build_id: 'BUILD-A' });
    expect(body.message).toContain('boom');
    expect(body.message).toContain('render');
  });

  it('同一条错误 30 秒内只报一次——出问题时往往是同一个错在狂刷', async () => {
    const { app } = await load();
    for (let i = 0; i < 6; i++) app.config.errorHandler(new Error('同一个错'), null, 'render');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('单页最多报 5 条，防止把服务器打满', async () => {
    const { app } = await load();
    for (let i = 0; i < 9; i++) app.config.errorHandler(new Error(`错误${i}`), null, 'render');
    expect(post).toHaveBeenCalledTimes(5);
  });

  it('chunk 加载失败不报——那有专门的换版本逻辑，报了只是噪音', async () => {
    const { app } = await load();
    app.config.errorHandler(new Error('Failed to fetch dynamically imported module: /assets/x.js'), null, 'render');
    expect(post).not.toHaveBeenCalled();
  });

  it('ResizeObserver 的告警不报——上线一天就 12 条，会把真问题埋掉', async () => {
    const { app, listeners } = await load();
    app.config.errorHandler(new Error('ResizeObserver loop completed with undelivered notifications.'), null, 'render');
    listeners.error({ message: 'ResizeObserver loop limit exceeded' });
    expect(post).not.toHaveBeenCalled();
  });

  it('接口错误从 Vue 通道漏进来时也要挡住（后端已记，含 400 的具体原因）', async () => {
    const { app } = await load();
    app.config.errorHandler(new Error('Request failed with status code 403'), null, 'render');
    app.config.errorHandler(new Error('Request failed with status code 400'), null, 'setup');
    expect(post).not.toHaveBeenCalled();
  });

  it('上报请求标了遥测标记——撞 401 时不能把正在干活的人踹到登录页', async () => {
    const { app } = await load();
    app.config.errorHandler(new Error('组件炸了'), null, 'render');
    expect(post.mock.calls[0][2]).toMatchObject({ telemetry: true });
  });

  it('接口错误不报——后端自己已经记了，重复上报会把错误表淹掉', async () => {
    const { listeners } = await load();
    listeners.unhandledrejection({ reason: { isAxiosError: true, message: '请求失败' } });
    listeners.unhandledrejection({ reason: { response: { status: 500 }, message: '服务器错误' } });
    expect(post).not.toHaveBeenCalled();
  });

  it('路由跳转失败连目标地址一起报，才知道是去哪儿的时候崩的', async () => {
    const { onRouterError } = await load();
    onRouterError(new Error('nav failed'), { fullPath: '/settlements' });
    expect(post.mock.calls[0][1].message).toContain('/settlements');
  });

  it('保留原有的 errorHandler，不把别人挂的钩子顶掉', async () => {
    vi.resetModules();
    post.mockClear();
    vi.stubGlobal('__BUILD_ID__', 'B');
    const { startErrorReport } = await import('../errorReport');
    const before = vi.fn();
    const app: any = { config: { errorHandler: before } };
    startErrorReport(app, { onError: () => {} } as any);
    app.config.errorHandler(new Error('e'), null, 'render');
    expect(before).toHaveBeenCalled();
  });

  it('上报失败自己咽下去，绝不影响用户操作', async () => {
    const { app } = await load();
    post.mockRejectedValueOnce(new Error('网络断了'));
    expect(() => app.config.errorHandler(new Error('x'), null, 'render')).not.toThrow();
  });
});
