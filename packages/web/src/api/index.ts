import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';

export const http = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
});

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res: AxiosResponse) => {
    if (res.data.code !== 0) {
      ElMessage.error(res.data.msg ?? '请求失败');
      return Promise.reject(new Error(res.data.msg));
    }
    return res.data;
  },
  (err) => {
    const status = err.response?.status;
    const onLogin = window.location.pathname.endsWith('/login');
    if (status === 401 && !onLogin) {
      // 登录态失效:清理并跳登录
      localStorage.removeItem('token');
      window.location.href = '/login';
    } else {
      // 登录页密码错(401)或其它错误:提示而非刷新丢失输入
      ElMessage.error(err.response?.data?.msg ?? (status === 401 ? '用户名或密码错误' : '网络错误'));
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
