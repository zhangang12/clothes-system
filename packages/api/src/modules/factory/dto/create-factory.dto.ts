import {
  IsString, IsEnum, IsOptional, IsArray, IsBoolean, IsInt, IsNumber,
  IsDateString, MaxLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FactoryType } from '@i9/types';

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

  @ApiPropertyOptional({ type: [FactoryContactDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FactoryContactDto)
  contacts?: FactoryContactDto[];
}
