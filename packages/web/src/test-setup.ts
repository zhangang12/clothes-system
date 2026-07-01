/**
 * Vitest global setup — polyfills and stubs needed for jsdom + Element Plus
 *
 * Referenced by vite.config.ts `test.setupFiles`.
 */

import { vi } from 'vitest';

// ── ResizeObserver ─────────────────────────────────────────────────────────
// ElTable uses ResizeObserver internally. jsdom does not implement it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// ── matchMedia ─────────────────────────────────────────────────────────────
// Element Plus responsive helpers use window.matchMedia.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ── getComputedStyle ───────────────────────────────────────────────────────
// Some Element Plus table column-width calculations rely on getComputedStyle
// returning sensible numbers. Patch the return value to avoid NaN/infinity.
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = (el, pseudo) => {
  const style = originalGetComputedStyle(el, pseudo);
  // Proxy so that numeric CSS props that would return '' return '0px' instead
  return new Proxy(style, {
    get(target, prop: string) {
      const val = (target as any)[prop];
      if (typeof val === 'function') return val.bind(target);
      if (val === '') {
        const numericProps = [
          'width', 'height', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
          'marginLeft', 'marginRight', 'borderLeftWidth', 'borderRightWidth',
        ];
        if (numericProps.includes(prop)) return '0px';
      }
      return val;
    },
  });
};

// ── Element Plus message utilities ─────────────────────────────────────────
// Stub global ElMessage / ElMessageBox so component code that calls them
// during tests never throws "ElMessage is not a function".
vi.stubGlobal('ElMessage', {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
});

vi.stubGlobal('ElMessageBox', {
  confirm: vi.fn().mockResolvedValue('confirm'),
  alert: vi.fn().mockResolvedValue(undefined),
});
