// 构建时由 vite.config.ts 的 define 注入（见 utils/versionCheck.ts）
declare const __BUILD_ID__: string;

// 门户的 tsconfig 没引 vite/client（web 端引了），这里只补用到的这一项
interface ImportMetaEnv { readonly BASE_URL: string }
interface ImportMeta { readonly env: ImportMetaEnv }
