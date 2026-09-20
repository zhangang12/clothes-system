// 表单本地草稿（用户反馈：填了半天数据保存报错/误关页面就白填，需要可暂存）
// 思路：输入即自动防抖写入 localStorage（按路由区分 key），打开页面检测到草稿时询问恢复；
// 保存成功清除。纯浏览器侧——保存 500、网络断、误刷新、浏览器崩溃都能把数据找回来。
import { watch, onBeforeUnmount, type WatchStopHandle } from 'vue';
import { ElMessageBox } from 'element-plus';

export interface DraftEntry { t: number; data: Record<string, unknown> }

const DEBOUNCE_MS = 800;
const DRAFT_PREFIX = 'i9.draft.';

/** 登出时清掉本机所有草稿：同一浏览器换账号登录，不该弹出上一个人的「未保存草稿」（B144） */
export function clearAllDrafts(): void {
  try {
    const ls = localStorage;
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (k && k.startsWith(DRAFT_PREFIX)) ls.removeItem(k);
    }
  } catch { /* 隐私模式/无 storage：忽略 */ }
}

/**
 * 为一个大表单挂自动草稿。
 * @param key   草稿 key（建议用 route.fullPath，新建/各编辑页互不串）
 * @param form  表单的 reactive 对象（深 watch，字段须可 JSON 序列化）
 * @param hooks 可选：多对象表单（如合同 form+terms）自定义快照与恢复
 */
export function useFormDraft(
  key: string,
  form: Record<string, any>,
  hooks?: { snapshot?: () => Record<string, unknown>; restore?: (data: any) => void },
) {
  const storeKey = `${DRAFT_PREFIX}${key}`;
  let stop: WatchStopHandle | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false; // clear() 后不再写（保存成功后离开页面不写回草稿）
  let wroteThisSession = false;

  const snapshotOf = (): Record<string, unknown> =>
    (hooks?.snapshot ? hooks.snapshot() : JSON.parse(JSON.stringify(form)));
  const serialize = (): string | null => {
    try { return JSON.stringify(snapshotOf()); } catch { return null; }
  };

  // 「干净基线」：表单相对它没有改动就不写草稿（B092）。
  // 【为什么需要基线】此前 onBeforeUnmount 无条件 write()，打开订单看一眼就返回也会留下草稿，
  // 下次一进来就弹「检测到未保存草稿」；期间别人改过这张单，点「恢复」再保存就把对方的改动覆盖回去。
  // 基线在两处校准：挂载时（新建页=空表单）、restorePrompt 时（编辑页都是 load 完再问草稿，
  // 此刻的表单就是库里的原样）。之后只有用户真改过东西，快照才会与基线不同。
  let baseline: string | null = serialize();
  const isDirty = (): boolean => {
    const cur = serialize();
    return cur !== null && cur !== baseline;
  };
  /** 把当前表单当作「未改动」的基线（页面把库里数据填进表单之后可调用） */
  function markClean() { baseline = serialize(); }

  function write() {
    try {
      if (!isDirty()) {
        // 没改过：不写。本次会话里曾写过的草稿（改了又手工改回去）顺手清掉，免得下次白弹一次
        if (wroteThisSession) { localStorage.removeItem(storeKey); wroteThisSession = false; }
        return;
      }
      const entry: DraftEntry = { t: Date.now(), data: snapshotOf() };
      localStorage.setItem(storeKey, JSON.stringify(entry));
      wroteThisSession = true;
    } catch { /* 序列化失败/存储满时静默跳过，绝不影响表单 */ }
  }
  function scheduleWrite() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(write, DEBOUNCE_MS);
  }

  function read(): DraftEntry | null {
    try {
      const raw = localStorage.getItem(storeKey);
      if (!raw) return null;
      const entry = JSON.parse(raw) as DraftEntry;
      return entry?.data && typeof entry.data === 'object' ? entry : null;
    } catch { return null; }
  }

  /** 保存成功后调用：清草稿并停止一切写入（避免离开页面时兜底又把草稿写回来） */
  function clear() {
    stopped = true;
    stop?.();
    if (timer) { clearTimeout(timer); timer = null; }
    localStorage.removeItem(storeKey);
  }

  /** 有草稿时弹窗询问：恢复=回填表单并继续监听；丢弃=清除 */
  async function restorePrompt(): Promise<void> {
    // 编辑页在 load 之后才问草稿：此时表单里是库里的原样，以它为基线；
    // 同时把 load 触发的那次防抖写入作废（那不是用户的改动）
    if (timer) { clearTimeout(timer); timer = null; }
    markClean();
    const entry = read();
    if (!entry) return;
    const time = new Date(entry.t).toLocaleString('zh-CN', { hour12: false });
    let restore = true;
    try {
      await ElMessageBox.confirm(
        `检测到 ${time} 的未保存草稿（可能是上次保存失败或未提交就离开了）。`,
        '恢复草稿？',
        { confirmButtonText: '恢复草稿', cancelButtonText: '丢弃', type: 'info', distinguishCancelAndClose: true },
      );
    } catch { restore = false; }
    if (restore) (hooks?.restore ?? ((d: any) => Object.assign(form, d)))(entry.data);
    else clear();
  }

  // 深监听表单，防抖落盘（多对象表单走 snapshot getter，terms 等副对象的改动同样触发）
  const source: any = hooks?.snapshot ? () => hooks.snapshot!() : form;
  stop = watch(source, scheduleWrite, { deep: true });
  onBeforeUnmount(() => {
    stop?.();
    if (stopped) return; // 已保存成功，不写回
    // watch 回调是异步的，卸载时可能有改动尚未落盘——兜底写一次（没改过时 write 内部会跳过）
    if (timer) { clearTimeout(timer); timer = null; }
    write();
  });

  return { read, clear, restorePrompt, write, markClean, isDirty };
}
