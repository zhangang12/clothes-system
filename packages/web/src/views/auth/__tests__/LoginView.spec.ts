import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import LoginView from '../../LoginView.vue';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

// ── Mock the http client ─────────────────────────────────────────────────────
// LoginView imports `http` from '../api/index' (relative), which resolves to
// the same module as '@/api/index'. vi.mock uses the resolved module id,
// so we mock the @/ alias path and let Vite resolve both to the same mock.
const mockHttpPost = vi.fn();

vi.mock('@/api/index', () => ({
  http: {
    post: (...args: any[]) => mockHttpPost(...args),
  },
}));

// ── Mock vue-router ─────────────────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ query: {} }),
}));

function mountLoginView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(LoginView, {
    global: {
      plugins: [pinia, ElementPlus],
      stubs: { teleport: true },
    },
  });
}

describe('LoginView', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockHttpPost.mockReset();
    localStorage.clear();
  });

  // ────────────────────────────────────────────────────────── render
  it('renders username input, password input and a submit button', () => {
    const wrapper = mountLoginView();

    const inputs = wrapper.findAll('input');
    const passwordInput = inputs.find((i) => i.element.type === 'password');
    const usernameInput = inputs.find((i) => i.element.type !== 'password');

    expect(usernameInput).toBeTruthy();
    expect(passwordInput).toBeTruthy();
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true);
  });

  it('shows the system title', () => {
    const wrapper = mountLoginView();
    expect(wrapper.text()).toContain('服装智造管理系统');
  });

  // ─────────────────────────────────────────────── successful login
  it('sets auth store and redirects to "/" on successful login', async () => {
    mockHttpPost.mockResolvedValue({
      data: { access_token: 'tok-abc', role: UserRole.ADMIN, real_name: '管理员' },
    });

    const wrapper = mountLoginView();
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('admin');
    await inputs[1].setValue('secret');

    await wrapper.find('form').trigger('submit');
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalled());

    const auth = useAuthStore();
    expect(auth.token).toBe('tok-abc');
    expect(auth.role).toBe(UserRole.ADMIN);
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('posts username and password to /auth/login', async () => {
    mockHttpPost.mockResolvedValue({
      data: { access_token: 't', role: UserRole.FINANCE, real_name: 'F' },
    });

    const wrapper = mountLoginView();
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('finance_user');
    await inputs[1].setValue('mypassword');

    await wrapper.find('form').trigger('submit');
    await vi.waitFor(() => expect(mockHttpPost).toHaveBeenCalled());

    expect(mockHttpPost).toHaveBeenCalledWith(
      '/auth/login',
      { username: 'finance_user', password: 'mypassword' },
    );
  });

  // ─────────────────────────────────────────────── failed login
  it('does not redirect when login request is rejected', async () => {
    mockHttpPost.mockImplementation(() => Promise.reject(
      Object.assign(new Error('Unauthorized'), {
        response: { status: 401, data: { msg: '用户名或密码错误' } },
      }),
    ));

    const wrapper = mountLoginView();
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('bad');
    await inputs[1].setValue('creds');

    await wrapper.find('form').trigger('submit');

    // Give the async handler time to settle
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not store token when login request fails', async () => {
    mockHttpPost.mockImplementation(() => Promise.reject(new Error('Network error')));

    const wrapper = mountLoginView();
    await wrapper.find('form').trigger('submit');
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const auth = useAuthStore();
    expect(auth.token).toBeNull();
  });

  // ─────────────────────────────────────── loading state on submit
  it('submit button is in loading state while the request is pending', async () => {
    // Return a promise that never resolves so loading stays true
    mockHttpPost.mockReturnValue(new Promise(() => {}));

    const wrapper = mountLoginView();
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('user');
    await inputs[1].setValue('pass');

    await wrapper.find('form').trigger('submit');
    await wrapper.vm.$nextTick();

    // Element Plus sets is-loading class or disabled attribute on the button
    const btn = wrapper.find('button[type="submit"]');
    const isInLoadingState =
      btn.classes().some((c) => c.includes('loading')) ||
      (btn.element as HTMLButtonElement).disabled ||
      btn.attributes('aria-disabled') === 'true';

    expect(isInLoadingState).toBe(true);
  });
});
