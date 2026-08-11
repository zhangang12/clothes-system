import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import { progressStart, progressDone } from '../utils/progress';
import { useTabsStore } from '../stores/tabs';

// 错误提示去重:全局拦截器与各视图 catch 可能对同一错误各弹一次,800ms 内相同文案只显示一次
let _lastErr = { m: '', t: 0 };
export function errToast(msg?: string) {
  const m = msg || '请求失败';
  const now = Date.now();
  if (m === _lastErr.m && now - _lastErr.t < 800) return;
  _lastErr = { m, t: now };
  ElMessage.error(m);
}

// 401 只跳一次登录页：并发请求会同时 401（见下方拦截器里的说明）
let redirectingToLogin = false;

export const http = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
});

http.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    progressStart(); // 顶部进度条：请求在途计数 +1
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (err) => {
    progressDone();
    return Promise.reject(err);
  },
);

http.interceptors.response.use(
  (res: AxiosResponse) => {
    progressDone();
    if (res.data.code !== 0) {
      errToast(res.data.msg);
      return Promise.reject(new Error(res.data.msg));
    }
    return res.data;
  },
  (err) => {
    progressDone();
    const status = err.response?.status;
    const onLogin = window.location.pathname.endsWith('/login');
    if (status === 401 && !onLogin) {
      // 登录态失效:清理并跳登录。页签存 sessionStorage，整页刷新清不掉，
      // 必须显式 reset，否则换账号登录会看到上一个人开的页签。
      // （reset 幂等；pinia 未就绪的极端场景下静默跳过，不挡登出跳转）
      //
      // 【为什么要去重】一个页面同时打好几个请求（列表 + 徽标统计 + 字典 + 反馈未读轮询），
      // token 一过期就**同时**401。生产日志实证：8 个列表接口各 17~18 次 401 挤在同一刻，
      // 原来每一条都执行一次 `location.href='/login'`，等于连着赋值七八次，
      // 还会把后面那几条的错误提示一起弹出来。这里只放行第一条。
      if (redirectingToLogin) return Promise.reject(err);
      redirectingToLogin = true;
      try { useTabsStore().reset(); } catch { /* 忽略 */ }
      localStorage.removeItem('token');
      localStorage.removeItem('menuKeys'); // 与 clearAuth 口径一致，防下一账号读到上一人的菜单配置
      // 带上当前地址，登录后回到原来那一页（LoginView 已经在读 route.query.redirect）。
      // 不带的话，做到一半被踢出去的人重新登录只能回工作台、自己找回原来那页。
      const back = window.location.pathname + window.location.search;
      const skip = !back || back === '/' || back.startsWith('/login');
      window.location.href = skip ? '/login' : `/login?redirect=${encodeURIComponent(back)}`;
    } else {
      // 登录页密码错(401)或其它错误:提示而非刷新丢失输入
      errToast(err.response?.data?.msg ?? (status === 401 ? '用户名或密码错误' : '网络错误'));
    }
    return Promise.reject(err);
  },
);

export * from './factory';
export * from './customer';
export * from './sample';
export * from './quote';
export * from './order';
export * from './contract';
export * from './reconciliation';
export * from './payment';
export * from './settlement';
