// 构建时由 vite.config.ts 的 define 注入（见 utils/versionCheck.ts）
declare const __BUILD_ID__: string;

// tsconfig 没引 vite/client，这里只补用到的这一项（门户同样，见 portal/src/build-id.d.ts）
interface ImportMetaEnv { readonly BASE_URL: string }
interface ImportMeta { readonly env: ImportMetaEnv }
