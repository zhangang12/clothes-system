import { Controller, Get, Post, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, MaxLength, IsOptional, IsIn, IsNotEmpty, Matches } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { SysDict } from './dict.entity';

/**
 * 可通过接口新增字典项的类别（B044）：原来 type 任意字符串，任一内部账号可无限灌任意 type 撑表。
 * 与 web 字典维护页 DictManageView.TYPES 及各编辑页 DictSelect 所用 type 一一对应；
 * init.sql 里的费率/比例类配置（vat_rate/export_refund_rate/default_*_ratio）不在此列——它们不该从下拉自填口子新增。
 * 角色未收窄：DictSelect「自填新值自动累积」在客户/订单/报价编辑页对所有内部角色开放，是老板定过的产品口径（见修复报告）。
 */
export const DICT_TYPES = [
  'consignee', 'destination', 'color', 'size', 'composition',
  'trade_country', 'price_terms', 'settlement_method', 'currency',
  'department', 'title', 'customer_source', 'cooperation_level', 'fee_item',
] as const;

export class CreateDictDto {
  @IsString() @MaxLength(40) @IsIn(DICT_TYPES, { message: '字典类别不合法' }) type: string;
  @IsString() @MaxLength(100) @Matches(/\S/, { message: '字典值不能为空' }) label: string;
  @IsOptional() @IsString() @MaxLength(100) value?: string;
}

// B126：原来 @Query('type') 裸接——不传 type 时 where 条件被跳过、整张字典全量返回；?type=a&type=b 变成数组进 find 直接 SQL 500
export class QueryDictDto {
  @IsString({ message: 'type 须为单个字符串' }) @IsNotEmpty({ message: '缺少字典类别 type' }) @MaxLength(40) type: string;
}

@ApiTags('通用字典')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dicts')
export class DictController {
  constructor(@InjectRepository(SysDict) private readonly repo: Repository<SysDict>) {}

  @Get()
  @ApiOperation({ summary: '按类别取字典项（全员）' })
  list(@Query() q: QueryDictDto) {
    return this.repo.find({ where: { type: q.type, status: 1 }, order: { sort: 'ASC', id: 'ASC' } });
  }

  @Post()
  @ApiOperation({ summary: '新增字典项（下拉自填自动累积；重复忽略）' })
  async create(@Body() dto: CreateDictDto) {
    const found = await this.repo.findOne({ where: { type: dto.type, label: dto.label } });
    if (found) return this.reviveIfDisabled(found);
    try {
      return await this.repo.save(this.repo.create({ type: dto.type, label: dto.label, value: dto.value ?? null }));
    } catch (e: any) {
      // B044：并发下两个人同时自填同一个值，先查后插会双双查空 → 以前插出两行一样的下拉项；
      // 库里已有唯一键 uk_dict_type_label(type,label)，撞键说明别人刚插进去，回落成「返回既有项」，
      // 与上面 found 分支同语义（幂等）。非唯一键错误照常抛出。
      if (e?.code !== 'ER_DUP_ENTRY' && e?.errno !== 1062) throw e;
      const raced = await this.repo.findOne({ where: { type: dto.type, label: dto.label } });
      if (!raced) throw e;
      return this.reviveIfDisabled(raced);
    }
  }

  /** 已停用的同名项重新被自填选中 → 恢复启用（原有行为，抽出来给两条路径共用） */
  private async reviveIfDisabled(item: SysDict): Promise<SysDict> {
    if (!item.status) { item.status = 1; await this.repo.save(item); }
    return item;
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '停用字典项（仅管理员）' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.repo.update({ id }, { status: 0 });
    return { ok: true };
  }
}
