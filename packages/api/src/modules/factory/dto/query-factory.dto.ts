import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FactoryType } from '@i9/types';

export class QueryFactoryDto {
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

  @ApiPropertyOptional({ enum: FactoryType })
  @IsOptional()
  @IsEnum(FactoryType)
  type?: FactoryType;

  @ApiPropertyOptional({ enum: [0, 1] })
  @IsOptional()
  @Type(() => Number)
  status?: number;

  @IsOptional() factory_no?: string;
  @IsOptional() name?: string;
  @IsOptional() bank_name?: string;
  @IsOptional() contact?: string;
  @IsOptional() develop_start?: string;
  @IsOptional() develop_end?: string;
}
