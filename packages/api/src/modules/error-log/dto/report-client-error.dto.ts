import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 前端错误上报（2026-08-12）。字段刻意少：够定位就行，不收任何业务数据。
export class ReportClientErrorDto {
  @ApiProperty({ description: '错误来源：VUE/WINDOW/PROMISE/ROUTER' })
  @IsString()
  @MaxLength(20)
  kind: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  stack?: string;

  @ApiPropertyOptional({ description: '出错时所在的前端路由' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  path?: string;

  @ApiPropertyOptional({ description: '前端构建标识，用来判断用户跑在哪个版本上' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  build_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ua?: string;
}
