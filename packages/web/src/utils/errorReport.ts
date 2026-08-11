import type { App } from 'vue';
import type { Router } from 'vue-router';
import { http } from '@/api';
import { isChunkLoadError } from './versionCheck';

/**
 * 前端错误上报（2026-08-12）。
 *
 * 【为什么加】用户报「经常打开菜单就白屏」，排查全靠翻 nginx 日志倒推——因为
 * `error_log` 表只收**后端**异常，前端崩了服务器一无所知。今晚为此连错两次方向：
 * 先当成 chunk 404（日志里那几天根本没有 404），又当成首屏骨架（用户截图里布局是好的、
 * 只有内容区空）。**没有证据就只能猜**，所以把这条链路补上。
 *
 * 【设计上刻意克制】
 *  · 只报"页面级"的错：渲染异常、未捕获异常、未处理的 Promise 拒绝、路由错误。
 *  · **不报**业务接口的 4xx——那些后端自己已经记了，重复上报只会把错误表淹掉。
 *  · 同一条错误 30 秒内只报一次，单页最多 5 条：出问题时往往是同一个错狂刷，
 *    不限流会把服务器打满，那就从"帮忙定位"变成"制造事故"了。
 *  · 上报本身**绝不抛错、绝不弹提示**：它是旁路，坏了也不能影响用户干活。
 */

const MAX_PER_SESSION = 5;
const DEDUPE_MS = 30_000;

let sent = 0;
const lastSeen = new Map<string, number>();

function shouldSend(key: string): boolean {
  if (sent >= MAX_PER_SESSION) return false;
  const now = Date.now();
  const prev = lastSeen.get(key) ?? 0;
  if (now - prev < DEDUPE_MS) return false;
  lastSeen.set(key, now);
  sent += 1;
  return true;
}

function report(kind: string, message: string, stack?: string): void {
  // chunk 加载失败已经有专门的恢复逻辑（发版换版本），不必再进错误表
  if (isChunkLoadError(message)) return;
  const key = `${kind}|${message}`.slice(0, 200);
  if (!shouldSend(key)) return;
  // 不 await、不 catch 出错提示：上报失败就算了，不能影响用户
  http.post('/error-logs/client', {
    kind,
    message: String(message ?? '').slice(0, 1000),
    stack: stack ? String(stack).slice(0, 4000) : undefined,
    path: window.location.pathname + window.location.search,
    build_id: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : undefined,
    ua: navigator.userAgent.slice(0, 200),
  }).catch(() => { /* 旁路，静默 */ });
}

export function startErrorReport(app: App, router: Router): void {
  // ① Vue 组件渲染/生命周期里抛出的错——「布局在、内容区空」多半是这一类
  const prev = app.config.errorHandler;
  app.config.errorHandler = (err, instance, info) => {
    report('VUE', `${(err as Error)?.message ?? err} @${info}`, (err as Error)?.stack);
    if (prev) prev(err, instance, info);
    else console.error(err); // 保留控制台输出，别把本来看得见的错吞掉
  };

  // ② 全局未捕获异常
  window.addEventListener('error', (e) => {
    if (!e.message) return; // 资源加载失败也会走这里，但没有 message，交给 ③ 和 chunk 恢复
    report('WINDOW', e.message, e.error?.stack);
  });

  // ③ 未处理的 Promise 拒绝（组件内 import()、忘了 catch 的异步调用）
  window.addEventListener('unhandledrejection', (e) => {
    const r: any = e.reason;
    // axios 的错误后端已经记过了，这里跳过，避免把错误表灌满重复内容
    if (r?.isAxiosError || r?.response) return;
    report('PROMISE', r?.message ?? String(r), r?.stack);
  });

  // ④ 路由跳转失败
  router.onError((err, to) => {
    report('ROUTER', `${(err as Error)?.message ?? err} → ${to.fullPath}`, (err as Error)?.stack);
  });
}
