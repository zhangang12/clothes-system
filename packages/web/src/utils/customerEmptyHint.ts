// 客户下拉为空时说清原因（2026-09-15 #141 Amanda：新账号「无法选择客户」，下拉只显示「无数据」）。
// 客户资料属机密单据：非管理员只看得到自己建的 + 被授权的客户（CustomerService.visibleCustomerIds），
// 新开的账号一个授权都没有，所有客户下拉都是空的。管理员/主管在「客户管理」勾选客户点「批量授权机密权限」，
// 或在客户行点「授权」即可（授权中间商会连带它名下的最终买家）。
export function customerEmptyText(isAdmin: boolean): string {
  return isAdmin
    ? '还没有客户，请先到「客户管理」新建'
    : '没有你能选的客户：客户资料要主管在「客户管理」里给你授权后才会出现';
}
