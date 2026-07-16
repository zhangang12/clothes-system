import { IsString, MinLength, MaxLength, Matches, IsOptional, IsIn, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@i9/types';

// 口令强度：≥8 位且同时含字母与数字。挡住 123456 / Admin@123 这类弱默认密码延续到用户自设。
const STRONG =
  /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;
const STRONG_MSG = '密码至少 8 位，且须同时包含字母和数字';

export class ChangePasswordDto {
  @ApiProperty({ description: '原密码' })
  @IsString()
  @MaxLength(100)
  old_password: string;

  @ApiProperty({ description: '新密码（≥8 位，含字母和数字）' })
  @IsString()
  @Matches(STRONG, { message: STRONG_MSG })
  new_password: string;
}

const INTERNAL_ROLES = [
  UserRole.ADMIN, UserRole.BUSINESS, UserRole.FINANCE,
  UserRole.PATTERNMAKER, UserRole.SUPERVISOR, UserRole.SAMPLE_MAKER,
];

export class CreateUserDto {
  @ApiProperty({ example: 'zhang_san' })
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,50}$/, { message: '用户名 3-50 位，仅限字母/数字/下划线' })
  username: string;

  @ApiProperty({ description: '真实姓名' })
  @IsString()
  @MaxLength(50)
  real_name: string;

  @ApiProperty({ enum: INTERNAL_ROLES })
  @IsIn(INTERNAL_ROLES, { message: '角色不合法' })
  role: UserRole;

  @ApiProperty({ description: '初始密码（≥8 位，含字母和数字）' })
  @IsString()
  @Matches(STRONG, { message: STRONG_MSG })
  password: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(50)
  real_name?: string;

  @ApiPropertyOptional({ enum: INTERNAL_ROLES })
  @IsOptional() @IsIn(INTERNAL_ROLES, { message: '角色不合法' })
  role?: UserRole;

  @ApiPropertyOptional({ description: '1=启用 0=停用' })
  @IsOptional() @IsInt() @IsIn([0, 1])
  status?: number;
}

export class ResetPasswordDto {
  @ApiProperty({ description: '新密码（≥8 位，含字母和数字）' })
  @IsString()
  @Matches(STRONG, { message: STRONG_MSG })
  new_password: string;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional({ description: '1=启用 0=停用' })
  @IsOptional() @IsInt() @IsIn([0, 1])
  status?: number;
}
