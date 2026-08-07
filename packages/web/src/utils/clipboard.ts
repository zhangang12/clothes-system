// 剪贴板读写的统一入口。
//
// 【为什么必须收口】(2026-08-07 线上报错 `Cannot read properties of undefined (reading 'readText')`)
// `navigator.clipboard` **只在安全上下文（HTTPS 或 localhost）才存在**。生产目前是纯 HTTP
// （nginx 只监听 80，HTTPS 尚未配置），于是整个 `navigator.clipboard` 是 undefined：
//   · 报价明细「Excel 粘贴」→ 读 readText 直接抛异常；
//   · 客户/工厂列表「复制当前页」→ 写 writeText 同样抛（而且是在 .then 之前就抛，连失败提示都没有）。
// 这类问题在开发机（localhost 算安全上下文）**永远复现不了**，一上生产必挂，极易被当成偶发。
// 即便日后配了 HTTPS，用户仍可能拒绝剪贴板权限，照样会抛——所以两条路都要有兜底。

import { ElMessageBox } from 'element-plus';

/** 用户在兜底弹窗里点了取消：调用方据此静默返回，不要报错 */
export const CLIPBOARD_CANCELLED = Symbol('clipboard-cancelled');

/**
 * 读剪贴板文本。能直接读就直接读；读不到就弹一个多行框让用户自己 Ctrl+V——
 * 浏览器对「用户亲手按 Ctrl+V」从不设限，这条路在任何环境都通。
 * 用户取消时抛 CLIPBOARD_CANCELLED。
 */
export async function readClipboardText(): Promise<string> {
  try {
    const t = await navigator?.clipboard?.readText?.();
    // 读到空串说明剪贴板确实是空的，交给调用方统一报「剪贴板为空」，不要再弹兜底框
    if (typeof t === 'string') return t;
  } catch {
    // 无权限 / 被浏览器拒绝 → 落到手工粘贴兜底
  }
  try {
    const { value } = await ElMessageBox.prompt(
      '当前站点未启用 HTTPS，浏览器不允许网页直接读取剪贴板。请在下面的框里按 Ctrl+V 粘贴，再点确定。',
      '粘贴 Excel 内容',
      {
        inputType: 'textarea',
        inputPlaceholder: '在此按 Ctrl+V 粘贴从 Excel 复制的表格区域',
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        closeOnClickModal: false,
      },
    );
    return value ?? '';
  } catch {
    throw CLIPBOARD_CANCELLED; // ElMessageBox 取消/关闭都走这里
  }
}

/**
 * 写剪贴板。安全上下文走 navigator.clipboard；否则退回 execCommand('copy')——
 * 它已废弃但所有浏览器仍支持，且不要求安全上下文，正好补上 HTTP 这一段。
 * 返回是否成功，调用方据此提示。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续走 execCommand 兜底
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // 必须在文档里且可聚焦才能被 execCommand 复制；挪出视口避免页面跳动
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length); // iOS Safari 只认这个
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
