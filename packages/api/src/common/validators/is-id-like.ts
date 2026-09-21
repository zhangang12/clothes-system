import { ValidateBy, ValidationOptions, buildMessage } from 'class-validator';

/**
 * 数据库 ID：接受正整数，或纯数字字符串，**原样放行、不做类型转换**。
 *
 * 【为什么不能用 @Type(() => Number) + @IsInt】（2026-09-21 生产回归，Amanda 一天存不了样衣/订单）
 * mysql2 把 BIGINT 以**字符串**返回，前端拿到的行 ID 都是 "9529" 这样的字符串，保存时原样回传。
 * - 只写 @IsInt：字符串直接被拒，「materials.0.id must be an integer number」，样衣整单 400；
 * - 写 @Type(() => Number)：转成数字 9529，而 TypeORM save 判断「这行是否已存在」时拿它去和库里读出来的
 *   字符串 "9529" 严格比较，认不出是老行 → 当新行 INSERT → Duplicate entry for key PRIMARY → 500。
 * 批次前这些更新接口的 body 不经校验，ID 一直是字符串原样进服务，所以从没出过事。
 * 这里只校验形状（防注入怪值），值保持前端发来的样子，运行时行为与批次前一致。
 */
export function IsIdLike(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isIdLike',
      validator: {
        validate: (v: unknown): boolean =>
          (typeof v === 'number' && Number.isSafeInteger(v) && v > 0)
          || (typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v)),
        defaultMessage: buildMessage((each) => `${each}$property 必须是有效的 ID（正整数）`, validationOptions),
      },
    },
    validationOptions,
  );
}
