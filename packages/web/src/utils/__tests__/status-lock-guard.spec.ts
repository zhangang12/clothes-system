import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 状态锁守卫（2026-09-09）。
 *
 * 报价单在已报价/已成单、样衣在打样之后，后端一律拒改；以前编辑页照样让填、点保存才报 400
 * （error_log 一个月里 quotes 47 次、samples 21 次）。改法是**前后端共用同一份允许状态**
 * （@i9/types 的 *_EDITABLE_STATUSES），页面据此直接只读并在顶部说清出路。
 * 这里钉住两件事：页面还在用共享常量判锁、后端闸也还在用同一份常量——任何一边退回手写数组都变红。
 */
const here = dirname(fileURLToPath(import.meta.url));
const web = (p: string) => readFileSync(resolve(here, '../../views', p), 'utf-8');
const api = (p: string) => readFileSync(resolve(here, '../../../../api/src/modules', p), 'utf-8');

describe('状态锁守卫：不可编辑状态的编辑页直接只读，且与后端共用同一份允许状态', () => {
  it('报价编辑页：用 QUOTE_EDITABLE_STATUSES 判锁、表单整体禁用、顶部有提示', () => {
    const s = web('quote/QuoteEditView.vue');
    expect(s).toMatch(/QUOTE_EDITABLE_STATUSES as readonly string\[\]\)\.includes\(form\.status\)/);
    expect(s).toMatch(/<el-alert v-if="statusLocked"/);
    expect(s).toMatch(/:disabled="contentDisabled" class="form-body"/);
    expect(s).not.toMatch(/:disabled="readonly" class="form-body"/);
  });

  it('样衣编辑页：业务视图用 SAMPLE_EDITABLE_STATUSES、版师视图用 SAMPLE_PM_EDITABLE_STATUSES 判锁，顶部有提示', () => {
    const s = web('sample/SampleEditView.vue');
    expect(s).toMatch(/SAMPLE_EDITABLE_STATUSES as readonly string\[\]\)\.includes\(form\.status\)/);
    expect(s).toMatch(/SAMPLE_PM_EDITABLE_STATUSES as readonly string\[\]\)\.includes\(form\.status\)/);
    expect(s).toMatch(/<el-alert v-if="locked"/);
    expect(s).toMatch(/const bizDisabled = computed\(\(\) => readonly\.value \|\| patternmaker\.value \|\| statusLocked\.value\)/);
  });

  it('后端闸用的是同一份常量（服务源码里不再手写允许状态数组）', () => {
    expect(api('quote/quote.service.ts')).toMatch(/!QUOTE_EDITABLE_STATUSES\.includes\(quote\.status\)/);
    const sample = api('sample/sample.service.ts');
    expect(sample).toMatch(/!SAMPLE_EDITABLE_STATUSES\.includes\(entity\.status\)/);
    expect(sample).toMatch(/!SAMPLE_PM_EDITABLE_STATUSES\.includes\(entity\.status\)/);
  });
});
