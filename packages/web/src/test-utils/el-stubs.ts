/**
 * Shared Element Plus component stubs for Vitest tests.
 *
 * Real EP components require a browser DOM and internal injection contexts
 * (ElSelect↔ElOption, ElTabs↔ElTabPane) that break in jsdom. These stubs
 * replace them with minimal HTML that preserves slot rendering and
 * avoids the recursive-update / missing-injection errors.
 *
 * Row rendering strategy:
 *   - A private `ElTableRowContext` component wraps each data row and provides
 *     its `row` prop via a computed ref so that descendant ElTableColumnStub
 *     instances can inject it with per-row isolation.
 *   - A module-level shared ref was avoided because Vue batches VNode creation
 *     before rendering, causing all columns to read the last row's value.
 *   - ElTableColumnStub injects the computed ref and passes `{ row }` to its
 *     own #default slot, so user templates `<template #default="{ row }">` work.
 *   - For prop-only columns (no user #default slot), it renders `row[prop]`.
 */
import { h, computed, provide, inject, defineComponent } from 'vue';
import type { ComputedRef } from 'vue';

const ROW_INJECT_KEY = '__elTableRow';

// Private: provides its row prop as a stable computed so ElTableColumnStub
// instances within the same row see the correct row, regardless of render order.
const ElTableRowContext = defineComponent({
  name: '_ElTableRowContext',
  props: ['row'],
  setup(props, { slots }) {
    provide(ROW_INJECT_KEY, computed(() => props.row));
    return () => h('div', { class: 'el-table__row' }, slots.default?.() ?? []);
  },
});

export const ElTableStub = defineComponent({
  name: 'ElTable',
  props: ['data', 'border', 'stripe', 'size', 'loading'],
  setup(props, { slots }) {
    return () => {
      const rows: any[] = (props.data as any[]) ?? [];
      return h(
        'div',
        { class: 'el-table-stub' },
        rows.map((row: unknown, idx: number) =>
          h(
            ElTableRowContext,
            { key: idx, row, 'data-row-idx': idx },
            { default: () => slots.default?.({ row }) ?? [] },
          ),
        ),
      );
    };
  },
});

export const ElTableColumnStub = defineComponent({
  name: 'ElTableColumn',
  props: ['prop', 'label', 'width', 'fixed', 'align'],
  setup(props, { slots }) {
    const rowRef = inject<ComputedRef<unknown>>(ROW_INJECT_KEY, computed(() => ({})));
    return () => {
      const row = (rowRef.value ?? {}) as Record<string, unknown>;
      const prop = (props as any).prop as string | undefined;
      return h(
        'span',
        { class: 'el-table-column-stub' },
        slots.default
          ? slots.default({ row })
          : [prop ? String(row[prop] ?? '') : ''],
      );
    };
  },
});

export const ElSelectStub = {
  name: 'ElSelect',
  props: ['modelValue', 'clearable', 'placeholder'],
  emits: ['update:modelValue', 'change', 'clear'],
  provide() {
    return { ElSelect: this };
  },
  methods: {
    onChange(e: Event) {
      const val = (e.target as HTMLSelectElement).value;
      (this as any).$emit('update:modelValue', val);
      (this as any).$emit('change', val);
    },
  },
  template: `<select class="el-select-stub" @change="onChange"><slot /></select>`,
};

export const ElOptionStub = {
  name: 'ElOption',
  props: ['label', 'value', 'disabled'],
  inject: { ElSelect: { default: null } },
  template: `<option :value="value" :disabled="disabled">{{ label }}</option>`,
};

export const ElPaginationStub = {
  name: 'ElPagination',
  props: ['total', 'currentPage', 'pageSize', 'pageSizes', 'layout'],
  emits: ['update:currentPage', 'update:pageSize', 'change'],
  template: `<div class="el-pagination-stub">Total: {{ total }}</div>`,
};

export const ElPopconfirmStub = {
  name: 'ElPopconfirm',
  props: ['title'],
  emits: ['confirm'],
  template: `<div class="el-popconfirm-stub"><slot name="reference" /><button class="confirm-btn" @click="$emit('confirm')">OK</button></div>`,
};

export const ElTabsStub = {
  name: 'ElTabs',
  props: ['modelValue'],
  emits: ['update:modelValue', 'tab-click'],
  template: `<div class="el-tabs-stub"><slot /></div>`,
};

export const ElTabPaneStub = {
  name: 'ElTabPane',
  props: ['label', 'name'],
  // Render the label text so tests can assert on tab labels
  template: `<div class="el-tab-pane-stub" :data-name="name"><span class="el-tab-pane__label">{{ label }}</span><slot /></div>`,
};

export const ElDialogStub = {
  name: 'ElDialog',
  props: ['modelValue', 'title', 'width'],
  emits: ['update:modelValue', 'closed'],
  // Render title text so tests can assert on dialog titles
  template: `<div class="el-dialog-stub" v-if="modelValue"><div class="el-dialog__title">{{ title }}</div><slot /><slot name="footer" /></div>`,
};

export const ElDatePickerStub = {
  name: 'ElDatePicker',
  props: ['modelValue', 'type', 'valueFormat', 'placeholder'],
  emits: ['update:modelValue', 'change'],
  template: `<input class="el-date-picker-stub" type="text" />`,
};

export const commonStubs = {
  teleport: true,
  ElTable: ElTableStub,
  ElTableColumn: ElTableColumnStub,
  ElSelect: ElSelectStub,
  ElOption: ElOptionStub,
  ElPagination: ElPaginationStub,
  ElPopconfirm: ElPopconfirmStub,
  ElDialog: ElDialogStub,
  ElDatePicker: ElDatePickerStub,
};

export const paymentStubs = {
  ...commonStubs,
  ElTabs: ElTabsStub,
  ElTabPane: ElTabPaneStub,
};
