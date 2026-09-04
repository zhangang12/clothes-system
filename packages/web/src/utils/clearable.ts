/**
 * 编辑页保存时的"空值"语义（#124 business_user：报价备注删掉再保存，重新打开还在）。
 *
 * 后端所有 update 都是「undefined = 没传、别改；有值 = 改成这个值」（quote/order/contract 的
 * `if (dto[k] !== undefined)`、customer/factory 的 mapDto、TypeORM save 也跳过 undefined）。
 * 于是 `form.x || undefined` 这种写法在**新建**时无害、在**编辑**时等于"清空永远存不进去"——
 * 七个编辑页、几十个字段都是这么写的。
 *
 * 规则：文本/图片 URL 清空发 ''（VARCHAR/TEXT 列接受空串，@IsString 也过）；
 *       日期清空发 null（DATE 列不接受 ''，@IsOptional 放过 null）。
 * 数字用 numGuard.num()；枚举/ID/必填字段仍按各自规则，不走这里。
 * 守卫：__tests__/clear-field-guard.spec.ts 禁止编辑页再出现 `form.x || undefined`。
 */
export const txt = (v: unknown): string => (v == null ? '' : String(v));
export const dateOrNull = (v: unknown): string | null => (v ? String(v) : null);
