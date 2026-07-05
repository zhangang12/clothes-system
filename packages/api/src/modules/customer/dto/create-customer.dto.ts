import {
  IsString, IsEnum, IsOptional, IsArray, IsInt, MaxLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerGrade, CustomerType } from '@i9/types';

export class CustomerContactDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2) gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) mobile?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) mobile1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) mobile2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) remark?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class CustomerBankDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) accountName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) bankAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) bankAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) swiftCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) remark?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class CustomerExpressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) company?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) account?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) payMethod?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) remark?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class CreateCustomerDto {
  @ApiPropertyOptional({ example: '上海福德贸易有限公司' })
  @IsOptional() @IsString() @MaxLength(100) name?: string;

  @ApiProperty({ enum: CustomerType, example: CustomerType.MIDDLEMAN })
  @IsEnum(CustomerType) type: CustomerType;

  @ApiPropertyOptional({ description: '关联中间商客户ID逗号串（type=BUYER 必填）' })
  @IsOptional() @IsString() @MaxLength(200) relatedMiddleman?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) tradeCountry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) countryRegion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) homepage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) priceTerms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) settlementMethod?: string;
  @ApiPropertyOptional({ enum: CustomerGrade }) @IsOptional() @IsEnum(CustomerGrade) grade?: CustomerGrade;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) cooperationLevel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) customerSource?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() paymentDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) businessScope?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) salesperson?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() developDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) spare1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) spare2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) spare3?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deliveryAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() frontMark?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sideMark?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() innerBoxText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerRemark?: string;
  @ApiPropertyOptional({ example: 'USD' }) @IsOptional() @IsString() @MaxLength(5) currency?: string;

  @ApiPropertyOptional({ type: [CustomerContactDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CustomerContactDto)
  contacts?: CustomerContactDto[];

  @ApiPropertyOptional({ type: [CustomerBankDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CustomerBankDto)
  banks?: CustomerBankDto[];

  @ApiPropertyOptional({ type: [CustomerExpressDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CustomerExpressDto)
  expresses?: CustomerExpressDto[];
}

export class ImportCustomerDto {
  @ApiProperty({ type: [CreateCustomerDto], description: 'CSV 前端解析后的客户行' })
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateCustomerDto)
  rows: CreateCustomerDto[];
}
