import { Controller, Get, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { QuoteService } from './quote.service';

@ApiTags('客户报价')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('quotes')
export class QuoteController {
  constructor(private readonly service: QuoteService) {}

  @Get()
  findAll(@Query('page', new ParseIntPipe({ optional: true })) page?: number,
          @Query('size', new ParseIntPipe({ optional: true })) size?: number) {
    return this.service.findAll(page, size);
  }
}
