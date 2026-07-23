import {
  Controller, Get, Post, Put, Delete, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { QuoteService } from './quote.service';
import { maskQuote } from '../../common/masking/field-mask';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QueryQuoteDto } from './dto/query-quote.dto';

@ApiTags('客户报价')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quotes')
export class QuoteController {
  constructor(private readonly service: QuoteService) {}

  @Post('import')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '报价历史迁移导入（CSV 行，P3#43）' })
  importBatch(@Body('rows') rows: Array<Record<string, any>>, @Request() req: any) {
    return this.service.importBatch(rows ?? [], req.user.id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '创建报价单（费用明细自动带6行）' })
  create(@Body() dto: CreateQuoteDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.FINANCE, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '报价单列表（分页；版师/打样不可见——F1）' })
  async findAll(@Query() query: QueryQuoteDto, @Request() req: any) {
    return maskQuote(await this.service.findAll(query, req.user), req.user.role);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.FINANCE, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '报价单详情（含明细；版师/打样不可见——F1）' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return maskQuote(await this.service.findOne(id, req.user), req.user.role);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '编辑报价单（草稿/客户调整状态，覆盖式）' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateQuoteDto>, @Request() req: any) {
    return this.service.update(id, dto, req.user);
  }

  @Patch(':id/import-sample/:sampleId')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '从样衣导入材料明细到报价明细' })
  importFromSample(@Param('id', ParseIntPipe) id: number, @Param('sampleId', ParseIntPipe) sampleId: number, @Request() req: any) {
    return this.service.importFromSample(id, sampleId, req.user);
  }

  @Patch(':id/submit')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '发出报价（草稿/客户调整→已报价；超阈值需先审批）' })
  submit(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.submitQuote(id, req.user);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '主管审批超阈值报价（待审批→已审批）' })
  approve(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.approveQuote(id, req.user.id, req.user);
  }

  @Patch(':id/adjust')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '客户调整（已报价→客户调整）' })
  adjust(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.adjust(id, req.user);
  }

  @Patch(':id/revert')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '撤回调整（已报价/已成单→客户调整；已成单须关联订单全为草稿，草稿单随报价一并软删）' })
  revert(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.revert(id, req.user);
  }

  @Patch(':id/to-contract')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '转销售合同（已报价/客户调整→已成单，关联样衣置已成单，自动生成订单草稿）' })
  toContract(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.toContract(id, req.user.id, req.user);
  }

  @Post(':id/copy')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '复制报价单（新单草稿；with_items=false 仅复制基本信息）' })
  copy(@Param('id', ParseIntPipe) id: number, @Request() req: any, @Body('with_items') withItems?: boolean) {
    return this.service.copy(id, req.user.id, withItems !== false, req.user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '删除报价单（草稿状态，逻辑删除）' })
  remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.remove(id, req.user);
  }
}
