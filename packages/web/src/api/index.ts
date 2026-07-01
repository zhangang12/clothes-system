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
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    } else {
      ElMessage.error(err.response?.data?.msg ?? '网络错误');
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
