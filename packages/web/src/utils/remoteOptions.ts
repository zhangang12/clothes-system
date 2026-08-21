// 关联下拉的远程搜索（2026-08-21 #108 ZYT：「报价从样衣导入，有些搜款号还是搜不到」）。
//
// 【这个坑我踩了两次，所以抽出来】全站的关联下拉都是「进页面拉前 100 条 + el-select 本地过滤」。
// 数据没过 100 条时看不出问题，一旦超了，第 101 条之后的**永远搜不出来**——
// 而列表页走的是后端搜索，于是就成了「样衣管理搜得到、报价这边搜不到」。
// 8-19 我只改了报价编辑页的一个对话框，可她用的是**报价列表页**那个「从样衣建报价」，
// 于是白改一轮。同一个页面里就有三个选样衣的地方，逐个打补丁必然再漏。
//
// 生产实测（2026-08-21）：样衣 175 条、报价 117 条——**这两类已经超了**；
// 订单 27 / 工厂 69 / 客户 10 暂时没超，但迟早会超，所以口径统一放这里。
import { ref, type Ref } from 'vue';

export interface RemoteOptionsCfg<T> {
  /** 拉数据：kw 为空表示「没输关键词」，应返回最近的一批 */
  fetch: (kw: string) => Promise<T[]>;
  /** 每次取多少条 */
  size?: number;
}

/**
 * 返回 `{ options, loading, search }`：
 *  - 把 `search` 绑到 el-select 的 `remote-method`，并同时加上 `filterable remote`
 *    （**三个属性缺一不可**：只写 filterable 就是本地过滤，等于没改）
 *  - 组件挂载时调一次 `search('')` 拿默认那批
 *
 * 出错时**保留上一批结果**而不是清空：清空会把用户已经选中的那条也从选项里抹掉，
 * el-select 就会退化成显示裸 id。
 */
export function useRemoteOptions<T>(cfg: RemoteOptionsCfg<T>) {
  // 用 Ref<T[]> 而不是裸对象：模板里要靠 ref 自动解包，写成普通对象后 v-for 的类型会歪掉
  const options = ref([]) as Ref<T[]>;
  const loading = ref(false);

  async function search(kw: string): Promise<void> {
    loading.value = true;
    try {
      options.value = await cfg.fetch((kw ?? '').trim());
    } catch {
      /* 保留上一批，别把已选项也弄没了 */
    } finally {
      loading.value = false;
    }
  }

  return { options, loading, search };
}

/** 列表接口的通用取数：kw 非空才带 keyword，避免空串把后端条件搞成 LIKE '%%' */
export function listParams(kw: string, size = 100): Record<string, unknown> {
  return { page: 1, size, ...(kw ? { keyword: kw } : {}) };
}
