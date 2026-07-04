<template>
  <div class="edit-page">
    <div class="toolbar">
      <div class="title-wrap">
        <el-button link :icon="Back" @click="goBack">返回</el-button>
        <span class="title">客户资料 · {{ modeLabel }}</span>
        <el-tag size="small" type="danger" effect="plain">🔒 机密 etSecret</el-tag>
        <el-tag v-if="form.customerNo" size="small" type="primary">{{ form.customerNo }}</el-tag>
      </div>
      <el-button v-if="!readonly" type="primary" :icon="Check" :loading="saving" @click="save">保存</el-button>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="104px" :disabled="readonly" class="form-body">
      <!-- 1. 主要信息 -->
      <section-block title="1. 主要信息" badge="21 字段">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="客户名称" prop="name"><el-input v-model="form.name" placeholder="不可与已有客户重复" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="客户类型" prop="type" required>
              <el-select v-model="form.type" placeholder="请选择" style="width:100%" @change="onTypeChange">
                <el-option v-for="t in customerTypes" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="客户编号"><el-input v-model="form.customerNo" placeholder="保存后自动生成 CN001" readonly /></el-form-item></el-col>
          <el-col v-if="form.type === 'BUYER'" :span="16">
            <el-form-item label="关联中间商" prop="relatedMiddleman" required>
              <el-select v-model="middlemanIds" multiple filterable placeholder="选择归属的中间商" style="width:100%" class="highlight-field">
                <el-option v-for="m in middlemen" :key="m.id" :label="`${m.customer_no ?? m.customerNo} · ${m.name}`" :value="String(m.id)" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="贸易国别">
              <el-select v-model="form.tradeCountry" clearable filterable allow-create placeholder="请选择" style="width:100%" @change="onCountryChange">
                <el-option v-for="c in tradeCountries" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="国家区域"><el-input v-model="form.countryRegion" readonly placeholder="随贸易国别自动带出" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="所在城市"><el-input v-model="form.city" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="公司主页"><el-input v-model="form.homepage" placeholder="https://" /></el-form-item></el-col>
          <el-col :span="16"><el-form-item label="详细地址"><el-input v-model="form.address" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="价格条款"><dict-select v-model="form.priceTerms" :options="dictPriceTerms" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="结汇方式"><dict-select v-model="form.settlementMethod" :options="dictSettlement" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="信用等级"><el-select v-model="form.grade" clearable placeholder="请选择" style="width:100%"><el-option label="A级" value="A" /><el-option label="B级" value="B" /><el-option label="C级" value="C" /></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="合作等级"><dict-select v-model="form.cooperationLevel" :options="dictCooperation" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="客户来源"><dict-select v-model="form.customerSource" :options="dictSource" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="付款期限"><el-input v-model="form.paymentDays" type="number"><template #append>天</template></el-input></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="外销员"><el-input v-model="form.salesperson" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="开发时间"><el-date-picker v-model="form.developDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="币种"><el-input v-model="form.currency" placeholder="USD" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="业务范围"><el-input v-model="form.businessScope" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="备用字段1"><el-input v-model="form.spare1" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="备用字段2"><el-input v-model="form.spare2" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="备用字段3"><el-input v-model="form.spare3" /></el-form-item></el-col>
        </el-row>
      </section-block>

      <!-- 联系人子表 -->
      <section-block title="▸ 明细表：联系人" badge="10 列">
        <subtable-ops :disabled="readonly" :can-del="!!selContacts.length" @add="addRow('contacts')" @del="delRow('contacts', selContacts)" hint="出货/结汇/快件单据均取此表" />
        <el-table :data="form.contacts" size="small" border @selection-change="(v: any[]) => selContacts = v">
          <el-table-column type="selection" width="40" />
          <el-table-column label="姓名" min-width="100"><template #default="{ row }"><el-input v-model="row.name" size="small" /></template></el-table-column>
          <el-table-column label="部门" width="110"><template #default="{ row }"><el-select v-model="row.department" size="small" allow-create filterable clearable style="width:100%"><el-option v-for="d in dictDept" :key="d" :label="d" :value="d" /></el-select></template></el-table-column>
          <el-table-column label="性别" width="80"><template #default="{ row }"><el-select v-model="row.gender" size="small" clearable style="width:100%"><el-option label="男" value="M" /><el-option label="女" value="F" /></el-select></template></el-table-column>
          <el-table-column label="职务" width="110"><template #default="{ row }"><el-select v-model="row.title" size="small" allow-create filterable clearable style="width:100%"><el-option v-for="t in dictTitle" :key="t" :label="t" :value="t" /></el-select></template></el-table-column>
          <el-table-column label="电话号码" width="130"><template #default="{ row }"><el-input v-model="row.phone" size="small" /></template></el-table-column>
          <el-table-column label="手机号码" width="120"><template #default="{ row }"><el-input v-model="row.mobile" size="small" /></template></el-table-column>
          <el-table-column label="手机(1)" width="120"><template #default="{ row }"><el-input v-model="row.mobile1" size="small" /></template></el-table-column>
          <el-table-column label="手机(2)" width="120"><template #default="{ row }"><el-input v-model="row.mobile2" size="small" /></template></el-table-column>
          <el-table-column label="电子邮件" min-width="150"><template #default="{ row }"><el-input v-model="row.email" size="small" /></template></el-table-column>
          <el-table-column label="备注" min-width="110"><template #default="{ row }"><el-input v-model="row.remark" size="small" /></template></el-table-column>
        </el-table>
      </section-block>

      <!-- 开户银行子表 -->
      <section-block title="▸ 明细表：开户银行" badge="7 列">
        <subtable-ops :disabled="readonly" :can-del="!!selBanks.length" @add="addRow('banks')" @del="delRow('banks', selBanks)" hint="开户名称自动=客户名称" />
        <el-table :data="form.banks" size="small" border @selection-change="(v: any[]) => selBanks = v">
          <el-table-column type="selection" width="40" />
          <el-table-column label="开户名称" min-width="140"><template #default="{ row }"><el-input v-model="row.accountName" size="small" :placeholder="form.name" /></template></el-table-column>
          <el-table-column label="开户银行" min-width="140"><template #default="{ row }"><el-input v-model="row.bankName" size="small" /></template></el-table-column>
          <el-table-column label="银行帐号" min-width="150"><template #default="{ row }"><el-input v-model="row.bankAccount" size="small" /></template></el-table-column>
          <el-table-column label="银行地址" min-width="140"><template #default="{ row }"><el-input v-model="row.bankAddress" size="small" /></template></el-table-column>
          <el-table-column label="币种" width="100"><template #default="{ row }"><el-input v-model="row.currency" size="small" placeholder="USD/CNY" /></template></el-table-column>
          <el-table-column label="SWIFT" width="120"><template #default="{ row }"><el-input v-model="row.swiftCode" size="small" /></template></el-table-column>
          <el-table-column label="备注" min-width="110"><template #default="{ row }"><el-input v-model="row.remark" size="small" /></template></el-table-column>
        </el-table>
      </section-block>

      <!-- 快件帐号子表 -->
      <section-block title="▸ 明细表：快件帐号" badge="4 列">
        <subtable-ops :disabled="readonly" :can-del="!!selExpress.length" @add="addRow('expresses')" @del="delRow('expresses', selExpress)" hint="快件公司来自工厂资料" />
        <el-table :data="form.expresses" size="small" border @selection-change="(v: any[]) => selExpress = v">
          <el-table-column type="selection" width="40" />
          <el-table-column label="快件公司" min-width="180"><template #default="{ row }"><el-select v-model="row.company" size="small" allow-create filterable clearable style="width:100%"><el-option v-for="f in forwarders" :key="f" :label="f" :value="f" /></el-select></template></el-table-column>
          <el-table-column label="帐号" min-width="150"><template #default="{ row }"><el-input v-model="row.account" size="small" /></template></el-table-column>
          <el-table-column label="付款方式" width="120"><template #default="{ row }"><el-select v-model="row.payMethod" size="small" clearable style="width:100%"><el-option label="到付" value="到付" /><el-option label="预付" value="预付" /></el-select></template></el-table-column>
          <el-table-column label="备注" min-width="140"><template #default="{ row }"><el-input v-model="row.remark" size="small" /></template></el-table-column>
        </el-table>
      </section-block>

      <!-- 收货地址 + 唛头 -->
      <section-block title="3. 收货地址 / 6. 唛头" badge="5 字段">
        <el-form-item label="收货地址"><el-input v-model="form.deliveryAddress" type="textarea" :rows="2" /></el-form-item>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="正面唛头"><el-input v-model="form.frontMark" type="textarea" :rows="2" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="侧面唛头"><el-input v-model="form.sideMark" type="textarea" :rows="2" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="内盒文字"><el-input v-model="form.innerBoxText" type="textarea" :rows="2" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="客户备注"><el-input v-model="form.customerRemark" type="textarea" :rows="2" /></el-form-item></el-col>
        </el-row>
      </section-block>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, h } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { Back, Check, Plus, Minus } from '@element-plus/icons-vue';
import { ElButton, ElSelect, ElOption } from 'element-plus';
import { customerApi } from '@/api/customer';
import { factoryApi } from '@/api/factory';
import { CUSTOMER_TYPE_LABEL } from '@i9/types';
import {
  TRADE_COUNTRIES, COUNTRY_REGION, DICT_PRICE_TERMS, DICT_SETTLEMENT,
  DICT_COOPERATION, DICT_CUSTOMER_SOURCE, DICT_DEPARTMENT, DICT_TITLE,
} from '@/constants/regions';

const SectionBlock = (props: { title: string; badge?: string }, { slots }: any) =>
  h('div', { class: 'section-block' }, [
    h('div', { class: 'section-head' }, [
      h('span', { class: 'section-title' }, props.title),
      props.badge ? h('span', { class: 'section-badge' }, props.badge) : null,
    ]),
    h('div', { class: 'section-body' }, slots.default?.()),
  ]);

const SubtableOps = (props: any, { emit }: any) =>
  h('div', { class: 'subtable-ops' }, [
    h(ElButton, { size: 'small', icon: Plus, disabled: props.disabled, onClick: () => emit('add') }, () => '新增行'),
    h(ElButton, { size: 'small', icon: Minus, disabled: props.disabled || !props.canDel, onClick: () => emit('del') }, () => '删除'),
    props.hint ? h('span', { class: 'hint' }, props.hint) : null,
  ]);

const DictSelect = (props: any, { emit }: any) =>
  h(ElSelect, {
    modelValue: props.modelValue, filterable: true, clearable: true, allowCreate: true,
    placeholder: '点击选择', style: 'width:100%', 'onUpdate:modelValue': (v: any) => emit('update:modelValue', v),
  }, () => (props.options ?? []).map((o: string) => h(ElOption, { key: o, label: o, value: o })));

const route = useRoute();
const router = useRouter();
const readonly = computed(() => !!route.meta.readonly);
const editId = computed(() => (route.params.id ? Number(route.params.id) : null));
const modeLabel = computed(() => (readonly.value ? '查看' : editId.value ? '编辑' : '新建'));

const customerTypes = Object.entries(CUSTOMER_TYPE_LABEL).map(([value, label]) => ({ value, label }));
const tradeCountries = TRADE_COUNTRIES;
const dictPriceTerms = DICT_PRICE_TERMS, dictSettlement = DICT_SETTLEMENT, dictCooperation = DICT_COOPERATION;
const dictSource = DICT_CUSTOMER_SOURCE, dictDept = DICT_DEPARTMENT, dictTitle = DICT_TITLE;

const emptyContact = () => ({ name: '', department: '', gender: '', title: '', phone: '', mobile: '', mobile1: '', mobile2: '', email: '', remark: '' });
const emptyBank = () => ({ accountName: '', bankName: '', bankAccount: '', bankAddress: '', currency: '', swiftCode: '', remark: '' });
const emptyExpress = () => ({ company: '', account: '', payMethod: '', remark: '' });

const form = reactive<any>({
  customerNo: '', name: '', type: '', relatedMiddleman: '', tradeCountry: '', countryRegion: '',
  city: '', homepage: '', address: '', priceTerms: '', settlementMethod: '', grade: '',
  cooperationLevel: '', customerSource: '', paymentDays: '', businessScope: '', salesperson: '',
  developDate: new Date().toISOString().slice(0, 10), currency: 'USD', spare1: '', spare2: '', spare3: '',
  deliveryAddress: '', frontMark: '', sideMark: '', innerBoxText: '', customerRemark: '',
  contacts: [emptyContact()], banks: [emptyBank()], expresses: [emptyExpress()],
});

const middlemen = ref<any[]>([]);
const forwarders = ref<string[]>([]);
const middlemanIds = computed({
  get: () => (form.relatedMiddleman ? String(form.relatedMiddleman).split(',').filter(Boolean) : []),
  set: (v: string[]) => { form.relatedMiddleman = v.join(','); },
});

const formRef = ref<FormInstance>();
const saving = ref(false);
const selContacts = ref<any[]>([]); const selBanks = ref<any[]>([]); const selExpress = ref<any[]>([]);
const rules: FormRules = {
  type: [{ required: true, message: '请选择客户类型', trigger: 'change' }],
  relatedMiddleman: [{
    validator: (_r, _v, cb) => (form.type === 'BUYER' && !form.relatedMiddleman ? cb(new Error('最终买家须选关联中间商')) : cb()),
    trigger: 'change',
  }],
};

function onTypeChange() { if (form.type !== 'BUYER') form.relatedMiddleman = ''; }
function onCountryChange() { form.countryRegion = COUNTRY_REGION[form.tradeCountry] ?? form.countryRegion; }

const factories: Record<string, () => any> = { contacts: emptyContact, banks: emptyBank, expresses: emptyExpress };
function addRow(key: string) { form[key].push(factories[key]()); }
function delRow(key: string, sel: any[]) {
  form[key] = form[key].filter((r: any) => !sel.includes(r));
  if (!form[key].length) form[key].push(factories[key]());
}

async function loadRefs() {
  const [ms, fs] = await Promise.all([
    customerApi.list({ page: 1, size: 200, type: 'MIDDLEMAN' }),
    factoryApi.select(),
  ]);
  middlemen.value = (ms as any).data?.items ?? (ms as any).items ?? [];
  forwarders.value = (((fs as any).data ?? fs) as any[]).map((f) => f.name);
}

async function load() {
  if (!editId.value) return;
  const res: any = await customerApi.get(editId.value);
  const d = res.data ?? res;
  Object.assign(form, {
    customerNo: d.customer_no, name: d.name ?? '', type: d.type, relatedMiddleman: d.related_middleman ?? '',
    tradeCountry: d.trade_country ?? '', countryRegion: d.country_region ?? '', city: d.city ?? '',
    homepage: d.homepage ?? '', address: d.address ?? '', priceTerms: d.price_terms ?? '',
    settlementMethod: d.settlement_method ?? '', grade: d.grade ?? '', cooperationLevel: d.cooperation_level ?? '',
    customerSource: d.customer_source ?? '', paymentDays: d.payment_days ?? '', businessScope: d.business_scope ?? '',
    salesperson: d.salesperson ?? '', developDate: d.develop_date ?? '', currency: d.currency ?? 'USD',
    spare1: d.spare1 ?? '', spare2: d.spare2 ?? '', spare3: d.spare3 ?? '',
    deliveryAddress: d.delivery_address ?? '', frontMark: d.front_mark ?? '', sideMark: d.side_mark ?? '',
    innerBoxText: d.inner_box_text ?? '', customerRemark: d.customer_remark ?? '',
    contacts: d.contacts?.length ? d.contacts : [emptyContact()],
    banks: d.banks?.length ? d.banks : [emptyBank()],
    expresses: d.expresses?.length ? d.expresses : [emptyExpress()],
  });
}

function buildDto() {
  const num = (v: any) => (v === '' || v == null ? undefined : Number(v));
  const clean = (arr: any[], keyFields: string[]) => arr.filter((r) => keyFields.some((k) => r[k]));
  return {
    name: form.name || undefined, type: form.type, relatedMiddleman: form.relatedMiddleman || undefined,
    tradeCountry: form.tradeCountry || undefined, countryRegion: form.countryRegion || undefined,
    city: form.city || undefined, homepage: form.homepage || undefined, address: form.address || undefined,
    priceTerms: form.priceTerms || undefined, settlementMethod: form.settlementMethod || undefined,
    grade: form.grade || undefined, cooperationLevel: form.cooperationLevel || undefined,
    customerSource: form.customerSource || undefined, paymentDays: num(form.paymentDays),
    businessScope: form.businessScope || undefined, salesperson: form.salesperson || undefined,
    developDate: form.developDate || undefined, currency: form.currency || undefined,
    spare1: form.spare1 || undefined, spare2: form.spare2 || undefined, spare3: form.spare3 || undefined,
    deliveryAddress: form.deliveryAddress || undefined, frontMark: form.frontMark || undefined,
    sideMark: form.sideMark || undefined, innerBoxText: form.innerBoxText || undefined,
    customerRemark: form.customerRemark || undefined,
    contacts: clean(form.contacts, ['name', 'mobile', 'phone']),
    banks: clean(form.banks, ['bankName', 'bankAccount', 'accountName']),
    expresses: clean(form.expresses, ['company', 'account']),
  };
}

async function save() {
  await formRef.value?.validate();
  const dto = buildDto();
  if (!dto.contacts.length) { ElMessage.error('联系人子表不能为空'); return; }
  saving.value = true;
  try {
    if (editId.value) { await customerApi.update(editId.value, dto as any); ElMessage.success('更新成功'); }
    else { await customerApi.create(dto as any); ElMessage.success('创建成功'); }
    router.push({ name: 'Customers' });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '保存失败');
  } finally {
    saving.value = false;
  }
}
function goBack() { router.push({ name: 'Customers' }); }

// 开户名称留空时随客户名称联动展示
watch(() => form.name, (n) => { form.banks.forEach((b: any) => { if (!b.accountName) b.accountName = ''; }); void n; });

onMounted(async () => { await loadRefs(); await load(); });
</script>

<style scoped>
.edit-page { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.toolbar { position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center;
  background: var(--el-bg-color); padding: 10px 14px; border: 1px solid var(--el-border-color-light); border-radius: 6px; }
.title-wrap { display: flex; align-items: center; gap: 10px; }
.title { font-size: 16px; font-weight: 600; color: #1E3A5F; }
.form-body { display: flex; flex-direction: column; gap: 14px; }
:deep(.section-block) { border: 1px solid var(--el-border-color-light); border-radius: 6px; overflow: hidden; }
:deep(.section-head) { display: flex; align-items: center; gap: 8px; padding: 8px 14px;
  background: #F5EDDC; border-bottom: 1px solid var(--el-border-color-light); }
:deep(.section-title) { font-weight: 600; color: #1E3A5F; }
:deep(.section-badge) { font-size: 12px; color: #C8901E; background: #fff; padding: 1px 8px; border-radius: 10px; }
:deep(.section-body) { padding: 14px; }
:deep(.subtable-ops) { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
:deep(.subtable-ops .hint) { font-size: 12px; color: var(--el-text-color-secondary); margin-left: auto; }
:deep(.highlight-field .el-select__wrapper) { box-shadow: 0 0 0 1px #D17A40 inset; }
</style>
