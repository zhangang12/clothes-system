import { Controller, Get, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SampleService } from './sample.service';

@ApiTags('样衣管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('samples')
export class SampleController {
  constructor(private readonly service: SampleService) {}

  @Get()
  findAll(@Query('page', new ParseIntPipe({ optional: true })) page?: number,
          @Query('size', new ParseIntPipe({ optional: true })) size?: number) {
    return this.service.findAll(page, size);
  }
}
