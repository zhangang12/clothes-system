import { Controller, Get, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { OrderService } from './order.service';

@ApiTags('订单管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('orders')
export class OrderController {
  constructor(private readonly service: OrderService) {}

  @Get()
  findAll(@Query('page', new ParseIntPipe({ optional: true })) page?: number,
          @Query('size', new ParseIntPipe({ optional: true })) size?: number) {
    return this.service.findAll(page, size);
  }
}
