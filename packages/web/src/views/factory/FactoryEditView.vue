<template>
  <div class="edit-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="title-wrap">
        <el-button link :icon="Back" @click="goBack">返回</el-button>
        <span class="title">工厂资料 · {{ modeLabel }}</span>
        <el-tag size="small" effect="plain" type="info">一般 etGeneral</el-tag>
        <el-tag v-if="form.factoryNo" size="small" type="primary">{{ form.factoryNo }}</el-tag>
      </div>
      <div class="ops">
        <el-button v-if="!readonly" type="primary" :icon="Check" :loading="saving" @click="save">保存</el-button>
      </div>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" :disabled="readonly" class="form-body">
      <!-- 1. 主要信息 -->
      <section-block title="1. 主要信息" badge="11 字段">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="厂商编号">
              <el-input v-model="form.factoryNo" placeholder="保存后系统自动生成 S001" readonly />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="工厂类型" prop="type" required>
              <el-select v-model="form.type" placeholder="请选择" style="width:100%">
                <el-option v-for="t in factoryTypes" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="能否开票">
              <el-switch v-model="form.canInvoice" active-text="是" inactive-text="否" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="厂商名称" prop="name" required>
              <el-input v-model="form.name" placeholder="厂商全称，不可重复" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="联系人">
              <el-input v-model="mainContactName" readonly placeholder="自动取联系人首行" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="联系人电话">
              <el-input v-model="mainContactPhone" readonly placeholder="自动取联系人首行" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="所在省份">
              <el-select v-model="form.province" clearable filterable placeholder="请选择" style="width:100%" @change="onProvinceChange">
                <el-option v-for="p in provinces" :key="p" :label="p" :value="p" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="所在城市">
              <el-select v-model="form.city" clearable filterable placeholder="请选择" style="width:100%">
                <el-option v-for="c in cityOptions" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="开发时间">
              <el-date-picker v-model="form.developDate" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="16">
            <el-form-item label="详细地址">
              <el-input v-model="form.address" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="业务范围">
              <el-input v-model="form.businessScope" />
            </el-form-item>
          </el-col>
        </el-row>
      </section-block>

      <!-- 联系人明细表 -->
      <section-block title="▸ 明细表：联系人" badge="7 列">
        <div v-if="!readonly" class="subtable-ops">
          <el-button size="small" :icon="Plus" @click="addContact">新增行</el-button>
          <el-button size="small" :icon="Minus" :disabled="!selectedContacts.length" @click="removeContacts">删除</el-button>
          <span class="hint">保存时自动取首行姓名/电话回填主表联系人</span>
        </div>
        <el-table :data="form.contacts" size="small" border @selection-change="(v: any[]) => selectedContacts = v">
          <el-table-column type="selection" width="40" />
          <el-table-column type="index" label="#" width="44" />
          <el-table-column label="姓名" min-width="110">
            <template #default="{ row }"><el-input v-model="row.name" size="small" /></template>
          </el-table-column>
          <el-table-column label="部门" width="120">
            <template #default="{ row }">
              <el-select v-model="row.department" size="small" allow-create filterable clearable style="width:100%">
                <el-option v-for="d in departments" :key="d" :label="d" :value="d" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="职务" width="120">
            <template #default="{ row }">
              <el-select v-model="row.title" size="small" allow-create filterable clearable style="width:100%">
                <el-option v-for="t in titles" :key="t" :label="t" :value="t" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="电话号码" width="140">
            <template #default="{ row }"><el-input v-model="row.phone" size="small" /></template>
          </el-table-column>
          <el-table-column label="手机号码" width="140">
            <template #default="{ row }"><el-input v-model="row.mobile" size="small" /></template>
          </el-table-column>
          <el-table-column label="电子邮件" min-width="160">
            <template #default="{ row }"><el-input v-model="row.email" size="small" /></template>
          </el-table-column>
          <el-table-column label="备注" min-width="120">
            <template #default="{ row }"><el-input v-model="row.remark" size="small" /></template>
          </el-table-column>
        </el-table>
      </section-block>

      <!-- 2 / 3. 财务信息 -->
      <section-block title="2. 财务信息" badge="5 字段">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="开户银行"><el-input v-model="form.bankName" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="银行帐号"><el-input v-model="form.bankAccount" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="公司税号"><el-input v-model="form.taxNo" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="开票电话"><el-input v-model="form.invoicePhone" /></el-form-item></el-col>
          <el-col :span="16"><el-form-item label="开票地址"><el-input v-model="form.invoiceAddress" /></el-form-item></el-col>
        </el-row>
      </section-block>

      <section-block title="3. 财务信息(2)" badge="5 字段">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="开户银行(2)"><el-input v-model="form.bankName2" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="银行帐号(2)"><el-input v-model="form.bankAccount2" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="公司税号(2)"><el-input v-model="form.taxNo2" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="开票电话(2)"><el-input v-model="form.invoicePhone2" /></el-form-item></el-col>
          <el-col :span="16"><el-form-item label="开票地址(2)"><el-input v-model="form.invoiceAddress2" /></el-form-item></el-col>
        </el-row>
      </section-block>

      <!-- 5. 备注信息 -->
      <section-block title="5. 备注信息" badge="7 字段">
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="法人代表"><el-input v-model="form.legalRep" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="注册资金"><el-input v-model="form.registeredCapital" type="number" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="设立时间"><el-date-picker v-model="form.establishedDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="年销售额"><el-input v-model="form.annualSales" type="number" /></el-form-item></el-col>
          <el-col :span="16"><el-form-item label="代表客户"><el-input v-model="form.representativeCustomers" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="质量证书"><el-input v-model="form.qualityCerts" type="textarea" :rows="2" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item></el-col>
        </el-row>
      </section-block>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { Back, Check, Plus, Minus } from '@element-plus/icons-vue';
import { factoryApi } from '@/api/factory';
import { FACTORY_TYPE_LABEL } from '@i9/types';
import { PROVINCES, PROVINCE_CITIES, DICT_DEPARTMENT, DICT_TITLE } from '@/constants/regions';

// 轻量分区容器组件
const SectionBlock = (props: { title: string; badge?: string }, { slots }: any) =>
  h('div', { class: 'section-block' }, [
    h('div', { class: 'section-head' }, [
      h('span', { class: 'section-title' }, props.title),
      props.badge ? h('span', { class: 'section-badge' }, props.badge) : null,
    ]),
    h('div', { class: 'section-body' }, slots.default?.()),
  ]);

const route = useRoute();
const router = useRouter();
const readonly = computed(() => !!route.meta.readonly);
const editId = computed(() => (route.params.id ? Number(route.params.id) : null));
const modeLabel = computed(() => (readonly.value ? '查看' : editId.value ? '编辑' : '新建'));

const provinces = PROVINCES;
const departments = DICT_DEPARTMENT;
const titles = DICT_TITLE;
const factoryTypes = Object.entries(FACTORY_TYPE_LABEL).map(([value, label]) => ({ value, label }));

const emptyContact = () => ({ name: '', department: '', title: '', phone: '', mobile: '', email: '', remark: '' });
const form = reactive<any>({
  factoryNo: '', type: '', canInvoice: true, name: '', province: '', city: '',
  address: '', businessScope: '', developDate: new Date().toISOString().slice(0, 10),
  bankName: '', bankAccount: '', taxNo: '', invoicePhone: '', invoiceAddress: '',
  bankName2: '', bankAccount2: '', taxNo2: '', invoicePhone2: '', invoiceAddress2: '',
  legalRep: '', registeredCapital: '', establishedDate: '', annualSales: '',
  representativeCustomers: '', qualityCerts: '', remark: '',
  contacts: [emptyContact()],
});

const cityOptions = computed(() => PROVINCE_CITIES[form.province] ?? []);
const mainContactName = computed(() => form.contacts[0]?.name ?? '');
const mainContactPhone = computed(() => form.contacts[0]?.phone || form.contacts[0]?.mobile || '');

const formRef = ref<FormInstance>();
const saving = ref(false);
const selectedContacts = ref<any[]>([]);
const rules: FormRules = {
  name: [{ required: true, message: '请输入厂商名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择工厂类型', trigger: 'change' }],
};

function onProvinceChange() {
  if (form.city && !cityOptions.value.includes(form.city)) form.city = '';
}
function addContact() { form.contacts.push(emptyContact()); }
function removeContacts() {
  form.contacts = form.contacts.filter((c: any) => !selectedContacts.value.includes(c));
  if (!form.contacts.length) form.contacts.push(emptyContact());
}

async function load() {
  if (!editId.value) return;
  const res: any = await factoryApi.get(editId.value);
  const d = res.data ?? res;
  Object.assign(form, {
    factoryNo: d.factory_no, type: d.type, canInvoice: d.can_invoice !== 0, name: d.name,
    province: d.province ?? '', city: d.city ?? '', address: d.address ?? '',
    businessScope: d.business_scope ?? '', developDate: d.develop_date ?? '',
    bankName: d.bank_name ?? '', bankAccount: d.bank_account ?? '', taxNo: d.tax_no ?? '',
    invoicePhone: d.invoice_phone ?? '', invoiceAddress: d.invoice_address ?? '',
    bankName2: d.bank_name2 ?? '', bankAccount2: d.bank_account2 ?? '', taxNo2: d.tax_no2 ?? '',
    invoicePhone2: d.invoice_phone2 ?? '', invoiceAddress2: d.invoice_address2 ?? '',
    legalRep: d.legal_rep ?? '', registeredCapital: d.registered_capital ?? '',
    establishedDate: d.established_date ?? '', annualSales: d.annual_sales ?? '',
    representativeCustomers: d.representative_customers ?? '', qualityCerts: d.quality_certs ?? '',
    remark: d.remark ?? '',
    contacts: (d.contacts?.length ? d.contacts.map((c: any) => ({
      name: c.name ?? '', department: c.department ?? '', title: c.title ?? '',
      phone: c.phone ?? '', mobile: c.mobile ?? '', email: c.email ?? '', remark: c.remark ?? '',
    })) : [emptyContact()]),
  });
}

function buildDto() {
  const num = (v: any) => (v === '' || v == null ? undefined : Number(v));
  return {
    type: form.type, canInvoice: form.canInvoice, name: form.name,
    province: form.province || undefined, city: form.city || undefined,
    address: form.address || undefined, businessScope: form.businessScope || undefined,
    developDate: form.developDate || undefined,
    bankName: form.bankName || undefined, bankAccount: form.bankAccount || undefined,
    taxNo: form.taxNo || undefined, invoicePhone: form.invoicePhone || undefined,
    invoiceAddress: form.invoiceAddress || undefined,
    bankName2: form.bankName2 || undefined, bankAccount2: form.bankAccount2 || undefined,
    taxNo2: form.taxNo2 || undefined, invoicePhone2: form.invoicePhone2 || undefined,
    invoiceAddress2: form.invoiceAddress2 || undefined,
    legalRep: form.legalRep || undefined, registeredCapital: num(form.registeredCapital),
    establishedDate: form.establishedDate || undefined, annualSales: num(form.annualSales),
    representativeCustomers: form.representativeCustomers || undefined,
    qualityCerts: form.qualityCerts || undefined, remark: form.remark || undefined,
    contacts: form.contacts.filter((c: any) => c.name || c.mobile || c.phone),
  };
}

async function save() {
  await formRef.value?.validate();
  const dto = buildDto();
  if (!dto.contacts.length) { ElMessage.error('必须输入至少一个联系人！'); return; }
  saving.value = true;
  try {
    if (editId.value) {
      await factoryApi.update(editId.value, dto as any);
      ElMessage.success('更新成功');
    } else {
      await factoryApi.create(dto as any);
      ElMessage.success('创建成功');
    }
    router.push({ name: 'Factories' });
  } finally {
    saving.value = false;
  }
}

function goBack() { router.push({ name: 'Factories' }); }
onMounted(load);
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
.subtable-ops { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.subtable-ops .hint { font-size: 12px; color: var(--el-text-color-secondary); margin-left: auto; }
</style>
