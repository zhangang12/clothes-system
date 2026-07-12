import RuleHint from './components/RuleHint.vue';

declare module 'vue' {
  export interface GlobalComponents {
    RuleHint: typeof RuleHint;
  }
}
export {};
