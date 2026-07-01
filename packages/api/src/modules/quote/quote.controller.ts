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
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QueryQuoteDto } from './dto/query-quote.dto';

@ApiTags('客户报价')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quotes')
export class QuoteController {
  constructor(private readonly service: QuoteService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '创建报价单' })
  create(@Body() dto: CreateQuoteDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: '报价单列表（分页）' })
  findAll(@Query() query: QueryQuoteDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '报价单详情（含明细）' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '编辑报价单（草稿状态）' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateQuoteDto>) {
    return this.service.update(id, dto);
  }

  @Patch(':id/send')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '发送报价单（DRAFT→SENT）' })
  send(@Param('id', ParseIntPipe) id: number) {
    return this.service.send(id);
  }

  @Patch(':id/confirm')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '客户确认报价（SENT→CONFIRMED）' })
  confirmQuote(@Param('id', ParseIntPipe) id: number) {
    return this.service.confirmQuote(id);
  }

  @Patch(':id/to-contract')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '转合同（CONFIRMED→TO_CONTRACT）' })
  toContract(@Param('id', ParseIntPipe) id: number) {
    return this.service.toContract(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '删除报价单（草稿状态，逻辑删除）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
