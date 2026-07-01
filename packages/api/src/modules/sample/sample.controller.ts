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
import { CreateSampleDto, AssignPatternmakerDto, SubmitVersionDto, RejectSampleDto } from './dto/create-sample.dto';
import { QuerySampleDto } from './dto/query-sample.dto';

@ApiTags('样衣管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('samples')
export class SampleController {
  constructor(private readonly service: SampleService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '创建样衣' })
  create(@Body() dto: CreateSampleDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: '样衣列表（分页）' })
  findAll(@Query() query: QuerySampleDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '样衣详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: '样衣版次历史' })
  getVersionHistory(@Param('id', ParseIntPipe) id: number) {
    return this.service.getVersionHistory(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '更新样衣基本信息' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateSampleDto>) {
    return this.service.update(id, dto);
  }

  @Patch(':id/assign')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '指派版师（PENDING→PATTERN）' })
  assignPatternmaker(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignPatternmakerDto) {
    return this.service.assignPatternmaker(id, dto);
  }

  @Patch(':id/submit')
  @Roles(UserRole.ADMIN, UserRole.PATTERNMAKER)
  @ApiOperation({ summary: '提交版次（PATTERN→DONE）' })
  submitVersion(@Param('id', ParseIntPipe) id: number, @Body() dto: SubmitVersionDto, @Request() req: any) {
    return this.service.submitVersion(id, dto, req.user.id);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '驳回版次（DONE→REJECTED）' })
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectSampleDto, @Request() req: any) {
    return this.service.reject(id, dto, req.user.id);
  }

  @Patch(':id/confirm')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '确认样衣（DONE→CONFIRMED）' })
  confirm(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.confirm(id, req.user.id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除样衣（逻辑删除）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
