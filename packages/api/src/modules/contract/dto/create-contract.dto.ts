import {
  IsString, IsOptional, IsInt, IsNumber, IsArray, IsEnum,
  IsDateString, IsObject, MaxLength, Min, Max, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContractType } from '@i9/types';

export class CreateContractMaterialDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  item_name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  spec?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unit_price: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  qty: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional({ description: '颜色（分色行）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @ApiPropertyOptional({ description: '尺码/码（分码行）' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  size?: string;

  @ApiPropertyOptional({ description: '款号（多款号同表随行标注）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  style_no?: string;

  @ApiPropertyOptional({ description: '行交货期限' })
  @IsOptional()
  @IsDateString()
  delivery_date?: string;

  @ApiPropertyOptional({ description: '材料照片 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photo_url?: string;

  @ApiPropertyOptional({ description: '数量来源标注（采购量含损耗/大货数）' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  qty_source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class CreateContractDto {
  @ApiProperty({ enum: ContractType })
  @IsEnum(ContractType)
  type: ContractType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parent_id?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  factory_id: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  order_id: number;

  @ApiPropertyOptional({ example: 'CNY' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  currency?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  deposit_ratio?: number;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  mid_ratio?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  final_ratio?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  last_ship_date?: string;

  @ApiPropertyOptional({ description: '收货地址（发货时带给供应商）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ship_to_address?: string;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  account_period_days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  // ===== 编辑页扩展字段（设计稿 04-合同 v1.3）=====
  @ApiPropertyOptional({ description: '签约地点（默认本司地址）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sign_place?: string;

  @ApiPropertyOptional({ description: '签约日期（默认今天）' })
  @IsOptional()
  @IsDateString()
  sign_date?: string;

  @ApiPropertyOptional({ description: '乙方/委托方=本司主体 id（company_profile）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  company_id?: number;

  @ApiPropertyOptional({ description: '乙方/委托方代表（默认登录业务员）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  company_rep?: string;

  @ApiPropertyOptional({ description: '担保人（丙方，选填）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  guarantor?: string;

  @ApiPropertyOptional({ description: '担保人身份证照片 URL（选填）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  guarantor_id_photo?: string;

  @ApiPropertyOptional({ description: '交货期限（默认 加工=订单交期−10天 / 材料=−45天）' })
  @IsOptional()
  @IsDateString()
  delivery_deadline?: string;

  @ApiPropertyOptional({ description: '关联款号（多选逗号分隔；默认订单款号）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  style_nos?: string;

  @ApiPropertyOptional({ description: '价格包含项勾选（加工合同）', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  price_includes?: string[];

  @ApiPropertyOptional({ description: '增值税%（加工合同默认13）' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vat_rate?: number;

  @ApiPropertyOptional({ description: '价格包含项·其他说明' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  price_other?: string;

  @ApiPropertyOptional({ description: '合同条款模板填空（key→条款文本）' })
  @IsOptional()
  @IsObject()
  terms_json?: Record<string, string>;

  @ApiPropertyOptional({
    type: [CreateContractMaterialDto],
    description: '材料明细；不传时按合同类型自动从关联订单的用料核算(材料合同)或报价费用项(加工合同)带出',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateContractMaterialDto)
  materials?: CreateContractMaterialDto[];
}
