import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerGrade, CustomerType } from '@i9/types';

export class QueryCustomerDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  keyword?: string;

  @ApiPropertyOptional({ enum: CustomerType })
  @IsOptional()
  @IsEnum(CustomerType)
  type?: CustomerType;

  @ApiPropertyOptional({ enum: CustomerGrade })
  @IsOptional()
  @IsEnum(CustomerGrade)
  grade?: CustomerGrade;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  status?: number;

  @IsOptional() trade_country?: string;
  @IsOptional() cooperation_level?: string;
  @IsOptional() customer_source?: string;
  @IsOptional() salesperson?: string;
  @IsOptional() contact?: string;
  @IsOptional() develop_start?: string;
  @IsOptional() develop_end?: string;
}
