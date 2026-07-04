// 省份 → 城市（基础资料设计稿：所在城市随所在省份联动过滤）
// 精简数据集，覆盖服装外贸常见产地；可后续接字典接口扩展
export const PROVINCE_CITIES: Record<string, string[]> = {
  江苏: ['苏州', '南京', '无锡', '常州', '南通', '徐州', '扬州'],
  浙江: ['杭州', '宁波', '温州', '绍兴', '嘉兴', '金华', '湖州'],
  广东: ['广州', '深圳', '东莞', '佛山', '中山', '珠海', '汕头'],
  上海: ['上海'],
  北京: ['北京'],
  山东: ['青岛', '济南', '烟台', '威海', '潍坊'],
  福建: ['福州', '厦门', '泉州', '莆田'],
  河北: ['石家庄', '保定', '唐山'],
  湖北: ['武汉', '襄阳', '宜昌'],
  安徽: ['合肥', '芜湖', '安庆'],
  香港: ['香港'],
};

export const PROVINCES = Object.keys(PROVINCE_CITIES);

// 贸易国别 → 国家区域（客户资料：选贸易国别后自动带出国家区域）
export const COUNTRY_REGION: Record<string, string> = {
  美国: '北美洲', 加拿大: '北美洲', 墨西哥: '北美洲',
  德国: '欧洲', 法国: '欧洲', 英国: '欧洲', 意大利: '欧洲', 西班牙: '欧洲', 荷兰: '欧洲', 瑞典: '欧洲',
  日本: '亚洲', 韩国: '亚洲', 新加坡: '亚洲', 印度: '亚洲', 越南: '亚洲',
  澳大利亚: '大洋洲', 新西兰: '大洋洲',
  巴西: '南美洲', 阿根廷: '南美洲',
  南非: '非洲', 埃及: '非洲',
};

export const TRADE_COUNTRIES = Object.keys(COUNTRY_REGION);

// 客户资料·字典型 ButtonEdit 字段的候选值（点选弹窗）
export const DICT_PRICE_TERMS = ['FOB 上海', 'FOB 宁波', 'FOB 深圳', 'CIF', 'C&F', 'EXW', 'DDP', 'DDU'];
export const DICT_SETTLEMENT = ['T/T 30天', 'T/T 45天', 'T/T 60天', 'L/C at sight', 'L/C 30天', 'D/A 90天', 'D/P'];
export const DICT_COOPERATION = ['战略客户', '重点客户', '普通客户', '新客户'];
export const DICT_CUSTOMER_SOURCE = ['展会', '老客户介绍', '网络询盘', '主动开发', '其他'];
export const DICT_DEPARTMENT = ['销售部', '业务部', '财务部', '采购部', '跟单部', '仓库', '生产部', '品质部'];
export const DICT_TITLE = ['总经理', '销售经理', '业务经理', '业务跟单', '采购', '会计', '出纳', '船务'];
