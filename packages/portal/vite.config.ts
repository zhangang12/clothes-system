import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// 每次构建一个新标识：写进 version.json，同时内联进代码，运行时比对即知是否发过版
const BUILD_ID = String(Date.now());

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/portal/' : '/',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    vue(),
    {
      name: 'i9-emit-version',
      apply: 'build' as const,
      generateBundle(this: any) {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId: BUILD_ID }) });
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
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
