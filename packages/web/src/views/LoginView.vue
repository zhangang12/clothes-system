<template>
  <div class="login-page">
    <!-- 左：DATEX 动态品牌封面（服装制造主题） -->
    <div class="login-brand">
      <canvas ref="fx" class="brand-fx"></canvas>
      <div class="brand-vignette"></div>
      <div class="brand-inner">
        <div class="brand-chip">
          <img src="/datex-logo.png" alt="DATEX" class="brand-logo-img" />
        </div>
        <h1>服装智造管理系统</h1>
        <p class="brand-sub">从一片布，到一张单，全程可控</p>
        <ul class="brand-flow">
          <li v-for="(s, i) in flow" :key="s" :style="{ '--i': i }">
            <i class="dot"></i>{{ s }}
          </li>
        </ul>
      </div>
    </div>

    <!-- 右：登录表单 -->
    <div class="login-form-wrap">
      <div class="login-card">
        <div class="card-brand">
          <img src="/datex-mark.png" alt="" class="card-mark" />
          <span class="card-name">DATEX</span>
        </div>
        <h2>欢迎登录</h2>
        <p class="form-sub">请输入您的账户信息</p>
        <el-form :model="form" @submit.prevent="handleLogin" label-position="top" size="large">
          <el-form-item label="用户名">
            <el-input v-model="form.username" placeholder="请输入用户名" :prefix-icon="User" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              :prefix-icon="Lock"
              show-password
              @keyup.enter="handleLogin"
            />
          </el-form-item>
          <el-button native-type="submit" :loading="loading" class="login-btn">
            登 录
          </el-button>
        </el-form>
        <p class="copyright">© DATEX 服装智造 · 全流程管理平台</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { User, Lock } from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import { http } from '../api/index';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const loading = ref(false);
const form = ref({ username: '', password: '' });
const flow = ['样衣', '报价', '订单', '合同', '对账', '结算'];

async function handleLogin() {
  loading.value = true;
  try {
    const res: any = await http.post('/auth/login', form.value);
    auth.setAuth(res.data);
    const redirect = (route.query.redirect as string) ?? '/';
    router.push(redirect);
  } catch {
    // 全局 HTTP 拦截器已弹出错误提示
  } finally {
    loading.value = false;
  }
}

/* ── 动态封面：织物经纬 + 缝纫针脚 + 线头微粒（服装制造主题） ── */
const fx = ref<HTMLCanvasElement>();
let raf = 0;
let stop = false;

onMounted(() => {
  const canvas = fx.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const TEAL = '46, 139, 120';
  let w = 0;
  let h = 0;

  const resize = () => {
    const r = canvas.parentElement!.getBoundingClientRect();
    w = r.width; h = r.height;
    canvas.width = Math.max(1, w * dpr);
    canvas.height = Math.max(1, h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  // 缝线：几条对角缝道，dash 位移模拟走针
  const seams = [
    { x1: -0.1, y1: 0.22, x2: 1.1, y2: 0.30, sp: 0.35, hue: TEAL, wide: 2 },
    { x1: 1.1, y1: 0.58, x2: -0.1, y2: 0.70, sp: 0.28, hue: '255, 255, 255', wide: 1.5 },
    { x1: -0.1, y1: 0.86, x2: 1.1, y2: 0.80, sp: 0.42, hue: TEAL, wide: 2 },
  ];
  // 线头微粒（缓缓上浮）
  const motes = Array.from({ length: 26 }, () => ({
    x: Math.random(), y: Math.random(),
    r: 0.6 + Math.random() * 1.8,
    v: 0.02 + Math.random() * 0.05,
    a: 0.05 + Math.random() * 0.18,
    tw: Math.random() * Math.PI * 2,
  }));

  const drawWeave = (t: number) => {
    const gap = 34;
    ctx.lineWidth = 1;
    // 纬线（横）轻微起伏，模拟织物
    for (let y = 0; y <= h + gap; y += gap) {
      ctx.beginPath();
      const off = Math.sin(t * 0.0006 + y * 0.03) * 3;
      ctx.strokeStyle = `rgba(255,255,255,${0.028})`;
      ctx.moveTo(0, y + off);
      ctx.lineTo(w, y - off);
      ctx.stroke();
    }
    // 经线（竖）
    for (let x = 0; x <= w + gap; x += gap) {
      ctx.beginPath();
      const off = Math.cos(t * 0.0005 + x * 0.03) * 3;
      ctx.strokeStyle = `rgba(255,255,255,${0.022})`;
      ctx.moveTo(x + off, 0);
      ctx.lineTo(x - off, h);
      ctx.stroke();
    }
  };

  const drawSeams = (t: number) => {
    for (const s of seams) {
      const ax = s.x1 * w, ay = s.y1 * h, bx = s.x2 * w, by = s.y2 * h;
      ctx.save();
      ctx.setLineDash([7, 11]);
      ctx.lineDashOffset = -t * 0.05 * (s.sp * 4);
      ctx.lineCap = 'round';
      ctx.lineWidth = s.wide;
      ctx.strokeStyle = `rgba(${s.hue}, 0.5)`;
      ctx.shadowColor = `rgba(${s.hue}, 0.6)`;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      // 走针的针头（沿缝线往复的高亮点）
      const p = (Math.sin(t * 0.0004 * (s.sp * 6) ) + 1) / 2;
      const nx = ax + (bx - ax) * p;
      const ny = ay + (by - ay) * p;
      ctx.setLineDash([]);
      ctx.shadowBlur = 12;
      ctx.fillStyle = `rgba(${s.hue}, 0.95)`;
      ctx.beginPath();
      ctx.arc(nx, ny, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  const drawMotes = (t: number) => {
    for (const m of motes) {
      if (!reduce) {
        m.y -= m.v / h * 60;
        if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
      }
      const tw = 0.6 + 0.4 * Math.sin(t * 0.002 + m.tw);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${TEAL}, ${m.a * tw})`;
      ctx.arc(m.x * w, m.y * h, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const frame = (t: number) => {
    if (stop) return;
    ctx.clearRect(0, 0, w, h);
    drawWeave(t);
    drawSeams(t);
    drawMotes(t);
    if (!reduce) raf = requestAnimationFrame(frame);
  };
  frame(0);
  if (reduce) frame(1200); // 静态一帧

  onBeforeUnmount(() => {
    stop = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  });
});
</script>

<style scoped>
/* DATEX 品牌色 */
.login-page {
  --teal: #2E8B78;
  --teal-d: #1E6B5C;
  --charcoal: #23343A;
  --charcoal-d: #16232A;
  display: flex;
  min-height: 100vh;
  background: #f4f6f7;
}

/* 左侧动态品牌封面 */
.login-brand {
  flex: 1.15;
  position: relative;
  overflow: hidden;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(155deg, var(--teal) 0%, var(--teal-d) 44%, var(--charcoal) 100%);
}
.brand-fx { position: absolute; inset: 0; z-index: 1; }
.brand-vignette {
  position: absolute; inset: 0; z-index: 2;
  background:
    radial-gradient(120% 90% at 30% 20%, transparent 40%, rgba(11, 22, 26, 0.35) 100%),
    radial-gradient(circle at 78% 82%, rgba(46, 139, 120, 0.35) 0%, transparent 45%);
  pointer-events: none;
}
.brand-inner { position: relative; z-index: 3; padding: 0 9%; max-width: 560px; }

.brand-chip {
  width: 168px; height: 168px;
  background: #fff;
  border-radius: 28px;
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.28);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 38px;
  opacity: 0;
  animation: chipIn 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards,
             chipFloat 6s ease-in-out 1.1s infinite;
}
.brand-logo-img { width: 132px; height: auto; display: block; }

.login-brand h1 {
  font-size: 34px; font-weight: 700; margin: 0 0 14px; letter-spacing: 3px;
  opacity: 0; animation: up 0.7s ease 0.35s forwards;
}
.brand-sub {
  font-size: 16px; letter-spacing: 1px; color: rgba(255, 255, 255, 0.82); margin: 0 0 26px;
  opacity: 0; animation: up 0.7s ease 0.5s forwards;
}
.brand-flow {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-wrap: wrap; gap: 10px 8px;
}
.brand-flow li {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 13px; letter-spacing: 1px; color: #fff;
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.18);
  padding: 7px 14px; border-radius: 999px;
  backdrop-filter: blur(4px);
  opacity: 0;
  animation: up 0.55s ease forwards;
  animation-delay: calc(0.65s + var(--i) * 0.09s);
}
.brand-flow .dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #6FD3BE; box-shadow: 0 0 8px #6FD3BE;
  animation: pulse 2.4s ease-in-out infinite;
  animation-delay: calc(var(--i) * 0.35s);
}

@keyframes chipIn { to { opacity: 1; transform: translateY(0); } from { opacity: 0; transform: translateY(16px) scale(0.94); } }
@keyframes chipFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
@keyframes up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse { 0%,100% { opacity: 0.5; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.25); } }

/* 右侧表单区 */
.login-form-wrap {
  flex: 1;
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.login-card {
  width: 380px; background: #fff; border: 1px solid #eceff1; border-radius: 18px;
  box-shadow: 0 12px 40px rgba(35, 52, 58, 0.08); padding: 44px 40px 32px;
}
.card-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; }
.card-mark { width: 38px; height: 38px; }
.card-name { font-size: 22px; font-weight: 800; letter-spacing: 2px; color: var(--charcoal); font-style: italic; }
.login-card h2 { font-size: 22px; color: var(--charcoal); margin: 0 0 6px; font-weight: 600; }
.form-sub { font-size: 13px; color: #9aa4a9; margin: 0 0 26px; }
.login-btn {
  width: 100%; margin-top: 10px; font-size: 15px; letter-spacing: 6px;
  background: linear-gradient(135deg, var(--teal) 0%, var(--teal-d) 100%);
  border: none; color: #fff; height: 44px;
}
.login-btn:hover { background: linear-gradient(135deg, #35a08a 0%, #237a68 100%); }
.copyright { text-align: center; font-size: 12px; color: #b7c0c4; margin: 24px 0 0; }
.login-card :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1px var(--teal) inset; }
.login-card :deep(.el-input__prefix) { color: var(--teal); }

@media (max-width: 768px) {
  .login-brand { display: none; }
  .login-card { box-shadow: none; border: none; }
}
@media (prefers-reduced-motion: reduce) {
  .brand-chip, .login-brand h1, .brand-sub, .brand-flow li, .brand-flow .dot { animation: none !important; opacity: 1 !important; }
}
</style>
