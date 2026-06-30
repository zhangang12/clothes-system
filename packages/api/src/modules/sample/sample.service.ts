import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SampleGarment } from './sample-garment.entity';
import { SampleVersion } from './sample-version.entity';

@Injectable()
export class SampleService {
  constructor(
    @InjectRepository(SampleGarment) private readonly garmentRepo: Repository<SampleGarment>,
    @InjectRepository(SampleVersion) private readonly versionRepo: Repository<SampleVersion>,
  ) {}

  // TODO Phase 2: implement sample management
  async findAll(page = 1, size = 20) {
    const [items, total] = await this.garmentRepo.findAndCount({ where: { deleted: 0 }, skip: (page - 1) * size, take: size });
    return { items, total, page, size };
  }
}
