import {
  Controller, Get, Post, Put, Delete, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { SampleService } from './sample.service';
import {
  CreateSampleDto, PushPatternmakerDto, PatternmakerSaveDto, ShipSampleDto, ImportSampleDto,
} from './dto/create-sample.dto';
import { QuerySampleDto } from './dto/query-sample.dto';

@ApiTags('样衣管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('samples')
export class SampleController {
  constructor(private readonly service: SampleService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '创建样衣（业务视图）' })
  create(@Body() dto: CreateSampleDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Post('import')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '历史样衣批量导入（CSV 行）' })
  importBatch(@Body() dto: ImportSampleDto, @Request() req: any) {
    return this.service.importBatch(dto.rows, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: '样衣列表（分页；版师默认仅自己名下+未指派）' })
  findAll(@Query() query: QuerySampleDto, @Request() req: any) {
    return this.service.findAll(query, req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: '样衣详情（含材料明细）' })
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.findOne(id, req.user);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: '样衣变更记录' })
  getVersionHistory(@Param('id', ParseIntPipe) id: number) {
    return this.service.getVersionHistory(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '更新样衣基本信息（业务视图）' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateSampleDto>, @Request() req: any) {
    return this.service.update(id, dto, req.user.id);
  }

  @Patch(':id/push')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '推送版师 / 填材料寄出单号（→ 打样中）' })
  push(@Param('id', ParseIntPipe) id: number, @Body() dto: PushPatternmakerDto, @Request() req: any) {
    return this.service.pushPatternmaker(id, dto, req.user.id);
  }

  @Patch(':id/patternmaker')
  @Roles(UserRole.ADMIN, UserRole.PATTERNMAKER)
  @ApiOperation({ summary: '版师视图保存（实际耗用/拉链长度/寄回单号/件数/工时单价）' })
  patternmakerSave(@Param('id', ParseIntPipe) id: number, @Body() dto: PatternmakerSaveDto, @Request() req: any) {
    return this.service.patternmakerSave(id, dto, req.user.id);
  }

  @Patch(':id/ship')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '标记已寄出' })
  ship(@Param('id', ParseIntPipe) id: number, @Body() dto: ShipSampleDto, @Request() req: any) {
    return this.service.markShipped(id, dto, req.user.id);
  }

  @Patch(':id/complete')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '标记已完成' })
  complete(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.complete(id, req.user.id);
  }

  @Post(':id/copy')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '复制样衣（基本信息+材料明细，新单待派单）' })
  copy(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.copy(id, req.user.id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除样衣（仅待派单，被引用拦截）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
