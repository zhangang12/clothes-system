import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SampleController } from './sample.controller';
import { SampleService } from './sample.service';
import { SampleGarment } from './sample-garment.entity';
import { SampleVersion } from './sample-version.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SampleGarment, SampleVersion])],
  controllers: [SampleController],
  providers: [SampleService],
  exports: [SampleService],
})
export class SampleModule {}
