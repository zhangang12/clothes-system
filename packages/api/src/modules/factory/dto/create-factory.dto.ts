import {
  IsString, IsEnum, IsOptional, IsArray, IsBoolean, IsInt, IsNumber,
  IsDateString, MaxLength, ValidateNested, Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { FactoryType } from '@i9/types';
import { STRONG_PASSWORD, STRONG_PASSWORD_MSG } from '../../auth/dto/account.dto';

export class FactoryContactDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) mobile?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) remark?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class CreateFactoryDto {
  @ApiProperty({ enum: FactoryType, example: FactoryType.FABRIC })
  @IsEnum(FactoryType)
  type: FactoryType;

  @ApiPropertyOptional({ enum: FactoryType, isArray: true, description: '附加身份（工厂双身份，如材料供应商+加工厂）' })
  @IsOptional() @IsArray() @IsEnum(FactoryType, { each: true }) extraTypes?: FactoryType[];

  // 供应商电子章图片(盖章后 PDF 落款贴章,A3)
  @IsOptional() @IsString() @MaxLength(500) sealUrl?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean() canInvoice?: boolean;

  @ApiProperty({ example: '苏州福利纺织有限公司' })
  @IsString() @MaxLength(100) name: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) shortName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) province?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) businessScope?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() developDate?: string;

  // 财务信息
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) bankAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) taxNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) invoicePhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) invoiceAddress?: string;

  // 财务信息(2)
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) bankName2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) bankAccount2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) taxNo2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) invoicePhone2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) invoiceAddress2?: string;

  // 备注信息
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) legalRep?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() registeredCapital?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() establishedDate?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() annualSales?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) representativeCustomers?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() qualityCerts?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remark?: string;

  // 供应商门户账号（可选：填写则建档时开通门户登录账号，用于接收合同推送）
  @ApiPropertyOptional({ description: '门户登录账号（开通后供应商可登录 H5 处理合同）' })
  @IsOptional() @IsString() @MaxLength(50) portalAccount?: string;
  // B045：建档时的门户初始密码也走全系统同一份口令策略（改密/重置接口早已强制 ≥8 位含字母数字，这里曾是唯一缺口）
  @ApiPropertyOptional({ description: '门户登录初始密码（≥8 位，含字母和数字）' })
  @IsOptional() @IsString() @MaxLength(50) @Matches(STRONG_PASSWORD, { message: STRONG_PASSWORD_MSG }) portalPassword?: string;

  @ApiPropertyOptional({ type: [FactoryContactDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FactoryContactDto)
  contacts?: FactoryContactDto[];
}

export class ImportFactoryDto {
  @ApiProperty({ type: [CreateFactoryDto], description: 'CSV 前端解析后的工厂行' })
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateFactoryDto)
  rows: CreateFactoryDto[];
}

// B006：PUT /factories/:id 原来用 Partial<CreateFactoryDto> 接 body，全局 ValidationPipe 整体跳过。
// PartialType 继承全部校验并逐字段 @IsOptional；前端 FactoryEditView.buildDto 发送的字段已逐个核对都在 CreateFactoryDto 里
// （developDate/establishedDate 可能是 null：@IsOptional 对 null 同样放行；contacts 前端已映射成 camelCase）。
export class UpdateFactoryDto extends PartialType(CreateFactoryDto) {}
