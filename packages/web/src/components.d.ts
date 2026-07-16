import RuleHint from './components/RuleHint.vue';
import DocLinks from './components/DocLinks.vue';

declare module 'vue' {
  export interface GlobalComponents {
    RuleHint: typeof RuleHint;
    DocLinks: typeof DocLinks;
  }
}
export {};
