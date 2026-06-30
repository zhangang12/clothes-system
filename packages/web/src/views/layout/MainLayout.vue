<template>
  <el-container class="layout">
    <el-aside width="220px">
      <div class="logo">I9 管理系统</div>
      <el-menu :router="true" :default-active="$route.path" background-color="#001529" text-color="#fff" active-text-color="#409EFF">
        <el-menu-item index="/dashboard"><el-icon><Odometer /></el-icon>工作台</el-menu-item>
        <el-sub-menu index="base">
          <template #title><el-icon><Setting /></el-icon>基础资料</template>
          <el-menu-item index="/factories">工厂管理</el-menu-item>
          <el-menu-item index="/customers">客户管理</el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/samples"><el-icon><Shirt /></el-icon>样衣管理</el-menu-item>
        <el-menu-item index="/quotes"><el-icon><Document /></el-icon>客户报价</el-menu-item>
        <el-menu-item index="/orders"><el-icon><List /></el-icon>订单管理</el-menu-item>
        <el-menu-item index="/contracts"><el-icon><Tickets /></el-icon>合同管理</el-menu-item>
        <el-menu-item index="/reconciliations"><el-icon><DataAnalysis /></el-icon>对账管理</el-menu-item>
        <el-menu-item index="/payments"><el-icon><CreditCard /></el-icon>付款管理</el-menu-item>
        <el-menu-item index="/settlements"><el-icon><TrendCharts /></el-icon>结算清单</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header>
        <span>{{ auth.realName }}</span>
        <el-button type="text" @click="logout">退出</el-button>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
const auth = useAuthStore();
const router = useRouter();
function logout() { auth.clearAuth(); router.push('/login'); }
</script>

<style scoped>
.layout { height: 100vh; }
.logo { color: #fff; font-size: 18px; font-weight: bold; padding: 20px; text-align: center; background: #001529; }
.el-header { display: flex; justify-content: flex-end; align-items: center; gap: 12px; border-bottom: 1px solid #eee; }
</style>
