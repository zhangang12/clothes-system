import { reactive } from 'vue';

/**
 * 顶部进度条的计数源：路由跳转与在途 API 请求都往这里 +1/-1，
 * TopProgress 组件只看 pending 是否 > 0。
 * 保持无副作用（不碰 DOM），单测环境 import 也安全。
 */
export const progress = reactive({ pending: 0 });

export function progressStart() {
  progress.pending += 1;
}

export function progressDone() {
  progress.pending = Math.max(0, progress.pending - 1);
}
