import {
  IsString, IsOptional, IsInt, IsNumber, IsArray, MaxLength, Min, Max, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateQuoteItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) part?: string;
  @ApiProperty({ example: '32S 全棉府绸' }) @IsString() @MaxLength(100) itemName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) width?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) supplier?: string;
  @ApiPropertyOptional({ example: '米' }) @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @ApiPropertyOptional({ example: 1.2 }) @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) quoteUsage?: number;
  @ApiPropertyOptional({ example: 28.5 }) @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) rmbPrice?: number;
  @ApiPropertyOptional({ example: 3, description: '损耗% 默认3' }) @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) lossRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) remark?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class CreateQuoteFeeDto {
  @ApiProperty({ example: '加工费' }) @IsString() @MaxLength(50) feeName: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) rmbPrice?: number;
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) quoteUsage?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class CreateQuoteDto {
  @ApiProperty({ description: '中间商客户ID' }) @Type(() => Number) @IsInt() @Min(1) middlemanId: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() customerId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() inquiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sampleId?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() buyerId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) styleNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) middlemanContact?: string;
  @ApiPropertyOptional({ example: 'USD' }) @IsOptional() @IsString() @MaxLength(5) currency?: string;
  @ApiPropertyOptional({ example: 7.1, description: '汇率 >0' }) @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) exchangeRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) tradeCountry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) settlementMethod?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) priceTerms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) salesperson?: string;
  @ApiPropertyOptional({ example: 0, description: '利润率%' }) @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) profitRate?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) quoteQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) image1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) image2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() totalRemark?: string;

  @ApiPropertyOptional({ type: [CreateQuoteItemDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateQuoteItemDto)
  items?: CreateQuoteItemDto[];

  @ApiPropertyOptional({ type: [CreateQuoteFeeDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateQuoteFeeDto)
  fees?: CreateQuoteFeeDto[];
}
