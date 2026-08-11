import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// 构建标识：每次构建生成一个新值，同时写进产物里的 version.json 和运行时常量 __BUILD_ID__。
// 前端定时/切页时比对两者，不一致就说明发过版了 → 主动去取新资源（见 utils/versionCheck.ts）。
// 【别改成内容哈希】只要构建就该算新版本；内容哈希在"只改了后端"的发版里不变，反而漏报。
const BUILD_ID = String(Date.now());

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    vue(),
    {
      // 把构建标识随产物一起发出去，供前端轮询比对
      name: 'i9-emit-version',
      apply: 'build' as const,
      generateBundle(this: any) {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ buildId: BUILD_ID }),
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@i9/types': resolve(__dirname, '../types/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia'],
          elementPlus: ['element-plus'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
