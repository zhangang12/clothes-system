import type { Router } from 'vue-router';
import { ElNotification } from 'element-plus';

/**
 * 发版后让浏览器主动换到新版本（2026-08-11）。
 *
 * 【为什么需要它】SPA 的页面是按需加载的，chunk 名带内容哈希，发版后旧名字的文件不再存在。
 * 用户**已经打开着的标签页**手里是旧的 index.html：往好里说，点进某页取不到文件 → 白屏；
 * 往坏里说（如果我们保留旧文件不删），他就**一直跑在旧版本上**——今天修好的问题他明天照样遇到，
 * 还会再报一次。所以正解不是"别删旧文件"，而是**让浏览器知道发版了、主动去拿新的**。
 *
 * 【怎么判断】构建时生成 BUILD_ID，同时写进 `version.json` 和运行时常量 `__BUILD_ID__`。
 * 轮询 version.json（禁用缓存）比对二者即可。
 *
 * 【什么时候刷新】不立刻硬刷——用户可能正在填单，刷了就白填。做法是：
 *   ① 提示一条「系统已更新」，用户可以自己点立即刷新；
 *   ② 打上标记，**下一次切换页面时**用整页跳转代替前端路由跳转——那是天然的安全时机，
 *      顺带把新的 index.html 和新 chunk 一起取回来。
 */
declare const __BUILD_ID__: string;

const CHECK_MS = 3 * 60 * 1000;
let pendingUpdate = false;
let notified = false;

async function fetchRemoteBuildId(): Promise<string | null> {
  try {
    // 加时间戳 + no-store 双保险：绕开浏览器与中间层的缓存，否则永远读到旧值
    // BASE_URL 而非写死 '/'：门户挂在 /portal/ 下，同一份逻辑两边都要能取对文件
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j?.buildId === 'string' ? j.buildId : null;
  } catch {
    return null; // 断网/临时故障不打扰用户，下个周期再试
  }
}

async function check(): Promise<void> {
  if (pendingUpdate) return;
  const remote = await fetchRemoteBuildId();
  if (!remote || remote === __BUILD_ID__) return;
  pendingUpdate = true;
  if (notified) return;
  notified = true;
  ElNotification({
    title: '系统已更新',
    message: '已发布新版本，切换页面时会自动加载；也可以立即刷新。',
    type: 'info',
    duration: 0, // 不自动消失：让用户自己决定什么时候刷
    onClick: () => window.location.reload(),
  });
}

export function startVersionWatch(router: Router): void {
  check();
  setInterval(check, CHECK_MS);
  // 切回本标签页时再查一次：离开期间多半已经发过版
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });

  router.beforeEach((to) => {
    if (!pendingUpdate) return true;
    // 已知有新版本：改用整页跳转，把新的 index.html 与新 chunk 一起取回来。
    // 这里必须返回 false 终止前端路由，否则会先按旧 chunk 名去加载、还是白屏。
    window.location.assign(to.fullPath);
    return false;
  });
}
