import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysDict } from './dict.entity';
import { DictController } from './dict.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SysDict])],
  controllers: [DictController],
})
export class DictModule {}
