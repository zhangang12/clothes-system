import { Controller, Get, Post, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, MaxLength, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { SysDict } from './dict.entity';

class CreateDictDto {
  @IsString() @MaxLength(40) type: string;
  @IsString() @MaxLength(100) label: string;
  @IsOptional() @IsString() @MaxLength(100) value?: string;
}

@ApiTags('通用字典')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dicts')
export class DictController {
  constructor(@InjectRepository(SysDict) private readonly repo: Repository<SysDict>) {}

  @Get()
  @ApiOperation({ summary: '按类别取字典项（全员）' })
  list(@Query('type') type: string) {
    return this.repo.find({ where: { type, status: 1 }, order: { sort: 'ASC', id: 'ASC' } });
  }

  @Post()
  @ApiOperation({ summary: '新增字典项（下拉自填自动累积；重复忽略）' })
  async create(@Body() dto: CreateDictDto) {
    const existing = await this.repo.findOne({ where: { type: dto.type, label: dto.label } });
    if (existing) {
      if (!existing.status) { existing.status = 1; await this.repo.save(existing); }
      return existing;
    }
    return this.repo.save(this.repo.create({ type: dto.type, label: dto.label, value: dto.value ?? null }));
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '停用字典项（仅管理员）' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.repo.update({ id }, { status: 0 });
    return { ok: true };
  }
}
