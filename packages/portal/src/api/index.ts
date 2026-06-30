import axios from 'axios';
import { showToast } from 'vant';

export const http = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('portal_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => {
    if (res.data.code !== 0) {
      showToast(res.data.msg ?? '请求失败');
      return Promise.reject(new Error(res.data.msg));
    }
    return res.data;
  },
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('portal_token');
      window.location.href = '/portal/login';
    } else {
      showToast(err.response?.data?.msg ?? '网络错误');
    }
    return Promise.reject(err);
  },
);
