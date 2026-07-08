import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, DataSource } from 'typeorm';
import { SampleGarment } from './sample-garment.entity';
import { SampleMaterial } from './sample-material.entity';
import { SampleVersion } from './sample-version.entity';
import { Customer } from '../customer/customer.entity';
import { Quotation } from '../quote/quotation.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { SampleStatus } from '@i9/types';
import {
  CreateSampleDto, PushPatternmakerDto, PatternmakerSaveDto, ShipSampleDto,
} from './dto/create-sample.dto';
import { QuerySampleDto } from './dto/query-sample.dto';

const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class SampleService {
  constructor(
    @InjectRepository(SampleGarment) private readonly repo: Repository<SampleGarment>,
    @InjectRepository(SampleMaterial) private readonly materialRepo: Repository<SampleMaterial>,
    @InjectRepository(SampleVersion) private readonly versionRepo: Repository<SampleVersion>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Quotation) private readonly quoteRepo: Repository<Quotation>,
    private readonly numbering: NumberingService,
    private readonly dataSource: DataSource,
  ) {}

  private buildMaterials(sampleId: number, materials: CreateSampleDto['materials']): SampleMaterial[] {
    return (materials ?? []).map((m, idx) => this.materialRepo.create({
      sample_id: sampleId, sort_order: m.sortOrder ?? idx,
      arrange_date: m.arrangeDate, item_name: m.itemName, width: m.width, colors: m.colors,
      part: m.part, composition: m.composition, code_band: m.codeBand, zipper_length: m.zipperLength,
      puller: m.puller, qty: m.qty, size: m.size, ref_price: m.refPrice, actual_usage: m.actualUsage,
      supplier_id: m.supplierId, supplier_name: m.supplierName, image: m.image, remark: m.remark,
    }));
  }

  private async log(sampleId: number, version: number, action: string, operatorId: number, remark?: string) {
    await this.versionRepo.save(this.versionRepo.create({
      sample_id: sampleId, version, action, operator_id: operatorId, remark,
    } as any));
  }

  async create(dto: CreateSampleDto, createdBy: number): Promise<SampleGarment> {
    const middlemanId = dto.middlemanId ?? dto.customerId;
    const middleman = await this.customerRepo.findOne({ where: { id: middlemanId, deleted: 0 } });
    if (!middleman) throw new BadRequestException(`中间商客户 #${middlemanId} 不存在`);

    // 材料明细至少 1 行且品名必填（设计稿 §A 校验）
    const materials = (dto.materials ?? []).filter((m) => m.itemName || m.supplierId || m.composition);
    if (materials.length === 0) throw new BadRequestException('材料明细至少 1 行');
    if (materials.some((m) => !m.itemName)) throw new BadRequestException('材料明细「品名」必填');

    let buyerName: string | undefined; let buyerNo: string | undefined;
    if (dto.buyerId) {
      const buyer = await this.customerRepo.findOne({ where: { id: dto.buyerId, deleted: 0 } });
      buyerName = buyer?.name; buyerNo = buyer?.customer_no;
    }
    const sample_no = await this.numbering.next(NUM_PREFIX.SAMPLE);

    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(SampleGarment, manager.create(SampleGarment, {
        sample_no, categories: dto.categories, customer_id: middlemanId, middleman_name: middleman.name,
        style_no: dto.styleNo, buyer_id: dto.buyerId, buyer_name: buyerName, buyer_no: buyerNo,
        patternmaker_id: dto.patternmakerId, patternmaker_name: dto.patternmakerName,
        maker: dto.maker, make_date: today(),
        ship_sample_date: dto.shipSampleDate, recipient: dto.recipient, file_location: dto.fileLocation,
        garment_remark: dto.garmentRemark, image1: dto.image1, image2: dto.image2, image3: dto.image3,
        status: SampleStatus.PENDING, version: 1, created_by: createdBy, deleted: 0,
      }));
      await manager.save(SampleMaterial, this.buildMaterials(saved.id, materials));
      return saved;
    });
  }

  async findAll(query: QuerySampleDto) {
    const { page = 1, size = 20, keyword, status, customer_id, patternmaker_id } = query;
    const base: FindOptionsWhere<SampleGarment> = {
      deleted: 0,
      ...(status !== undefined && { status }),
      ...(customer_id !== undefined && { customer_id }),
      ...(patternmaker_id !== undefined && { patternmaker_id }),
    };
    // 智能搜索：样衣编号/客户款号/中间商名称/最终买家/制版师/制单人员（设计稿 §C）
    const searchable = ['sample_no', 'style_no', 'middleman_name', 'buyer_name', 'patternmaker_name', 'maker'];
    const where: FindOptionsWhere<SampleGarment> | FindOptionsWhere<SampleGarment>[] = keyword
      ? searchable.map((f) => ({ ...base, [f]: Like(`%${keyword}%`) }))
      : base;

    const [items, total] = await this.repo.findAndCount({
      where, skip: (page - 1) * size, take: size, order: { id: 'DESC' },
    });
    return { items, total, page, size };
  }

  async findOne(id: number) {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`样衣 #${id} 不存在`);
    const materials = await this.materialRepo.find({ where: { sample_id: id }, order: { sort_order: 'ASC' } });
    return { ...entity, materials };
  }

  async update(id: number, dto: Partial<CreateSampleDto>): Promise<SampleGarment> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`样衣 #${id} 不存在`);
    if (![SampleStatus.PENDING, SampleStatus.SAMPLING].includes(entity.status)) {
      throw new BadRequestException('该状态样衣不允许修改基本信息');
    }
    // 中间商/最终买家改动:回填名称/编号快照(编辑态联动,设计稿页面事件)
    let mmName: string | undefined;
    if (dto.middlemanId !== undefined) {
      const mm = await this.customerRepo.findOne({ where: { id: dto.middlemanId, deleted: 0 } });
      if (!mm) throw new BadRequestException(`中间商客户 #${dto.middlemanId} 不存在`);
      mmName = mm.name;
    }
    let buyerName: string | null | undefined; let buyerNo: string | null | undefined;
    if (dto.buyerId !== undefined) {
      if (dto.buyerId) {
        const b = await this.customerRepo.findOne({ where: { id: dto.buyerId, deleted: 0 } });
        buyerName = b?.name ?? null; buyerNo = b?.customer_no ?? null;
      } else { buyerName = null; buyerNo = null; }
    }
    return this.dataSource.transaction(async (manager) => {
      if (dto.categories !== undefined) entity.categories = dto.categories;
      if (dto.styleNo !== undefined) entity.style_no = dto.styleNo;
      if (dto.recipient !== undefined) entity.recipient = dto.recipient;
      if (dto.fileLocation !== undefined) entity.file_location = dto.fileLocation;
      if (dto.garmentRemark !== undefined) entity.garment_remark = dto.garmentRemark;
      if (dto.shipSampleDate !== undefined) entity.ship_sample_date = dto.shipSampleDate;
      if (dto.image1 !== undefined) entity.image1 = dto.image1;
      if (dto.image2 !== undefined) entity.image2 = dto.image2;
      if (dto.image3 !== undefined) entity.image3 = dto.image3;
      // 此前静默丢弃的字段(设计稿:业务可改中间商/买家/制版师/制单人员)
      if (dto.middlemanId !== undefined) { entity.customer_id = dto.middlemanId; entity.middleman_name = mmName as string; }
      if (dto.buyerId !== undefined) { entity.buyer_id = dto.buyerId || null; entity.buyer_name = buyerName ?? null; entity.buyer_no = buyerNo ?? null; }
      if (dto.patternmakerId !== undefined) entity.patternmaker_id = dto.patternmakerId;
      if (dto.patternmakerName !== undefined) entity.patternmaker_name = dto.patternmakerName;
      if (dto.maker !== undefined) entity.maker = dto.maker;
      const saved = await manager.save(SampleGarment, entity);
      if (dto.materials !== undefined) {
        await manager.delete(SampleMaterial, { sample_id: id });
        await manager.save(SampleMaterial, this.buildMaterials(id, dto.materials));
      }
      return saved;
    });
  }

  // 推送版师：填材料寄出单号 / 指派制版师 → 打样中（设计稿页面事件）
  async pushPatternmaker(id: number, dto: PushPatternmakerDto, operatorId: number): Promise<SampleGarment> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`样衣 #${id} 不存在`);
    if (![SampleStatus.PENDING, SampleStatus.SAMPLING].includes(entity.status)) {
      throw new BadRequestException('当前状态不允许推送版师(仅待派单/打样中)');
    }
    if (dto.patternmakerId !== undefined) entity.patternmaker_id = dto.patternmakerId;
    if (dto.patternmakerName !== undefined) entity.patternmaker_name = dto.patternmakerName;
    if (dto.materialShipNo) {
      entity.material_ship_no = dto.materialShipNo;
      entity.material_ship_date = today();
    }
    entity.status = SampleStatus.SAMPLING;
    const saved = await this.repo.save(entity);
    await this.log(id, entity.version, 'PUSH', operatorId, dto.materialShipNo);
    return saved;
  }

  // 版师视图保存：实际耗用/拉链长度 + 寄回单号 + 件数 + 工时单价（工时金额自动）
  async patternmakerSave(id: number, dto: PatternmakerSaveDto, operatorId: number): Promise<SampleGarment> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`样衣 #${id} 不存在`);
    if (![SampleStatus.SAMPLING, SampleStatus.SHIPPED, SampleStatus.RETURNED, SampleStatus.RECONCILED].includes(entity.status)) {
      throw new BadRequestException('当前状态不允许版师保存(样衣未在打样/寄回/对账阶段,或已成单/完成)');
    }

    if (dto.materials?.length) {
      for (const m of dto.materials) {
        if (m.id) {
          await this.materialRepo.update(
            { id: m.id, sample_id: id },
            { actual_usage: m.actualUsage, zipper_length: m.zipperLength },
          );
        }
      }
    }
    if (dto.returnNo) {
      entity.return_no = dto.returnNo;
      entity.return_date = today();
      entity.status = SampleStatus.RETURNED;
    }
    // 版师填件数+单价 → 工时金额公式生效 + 状态已对账（自动生成对账单的触发点）
    if (dto.pieceCount !== undefined || dto.laborUnitPrice !== undefined) {
      if (dto.pieceCount === undefined || dto.laborUnitPrice === undefined) {
        throw new BadRequestException('版师保存：件数与工时单价必须同时填写');
      }
      entity.piece_count = dto.pieceCount;
      entity.labor_unit_price = dto.laborUnitPrice;
      entity.labor_amount = +(dto.pieceCount * dto.laborUnitPrice).toFixed(2);
      entity.status = SampleStatus.RECONCILED;
    }
    const saved = await this.repo.save(entity);
    await this.log(id, entity.version, 'PATTERNMAKER_SAVE', operatorId, dto.returnNo);
    return saved;
  }

  async markShipped(id: number, dto: ShipSampleDto): Promise<SampleGarment> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`样衣 #${id} 不存在`);
    if (![SampleStatus.SAMPLING, SampleStatus.SHIPPED].includes(entity.status)) {
      throw new BadRequestException('当前状态不允许标记寄出');
    }
    entity.ship_sample_date = dto.shipSampleDate || today();
    entity.status = SampleStatus.SHIPPED;
    return this.repo.save(entity);
  }

  async complete(id: number): Promise<SampleGarment> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`样衣 #${id} 不存在`);
    if (![SampleStatus.RECONCILED, SampleStatus.DONE].includes(entity.status)) {
      throw new BadRequestException('当前状态不允许标记完成(需先对账)');
    }
    entity.status = SampleStatus.DONE;
    return this.repo.save(entity);
  }

  // 被客户报价转销售合同后自动置已成单（B1，供报价/合同模块调用）
  async markOrdered(id: number): Promise<void> {
    await this.repo.update({ id, deleted: 0 }, { status: SampleStatus.ORDERED });
  }

  // 复制：基本信息+材料明细复制；寄样跟踪/状态/制单日期不复制；新单待派单（设计稿加强复制）
  async copy(id: number, createdBy: number): Promise<SampleGarment> {
    const src = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!src) throw new NotFoundException(`样衣 #${id} 不存在`);
    const srcMaterials = await this.materialRepo.find({ where: { sample_id: id }, order: { sort_order: 'ASC' } });
    const sample_no = await this.numbering.next(NUM_PREFIX.SAMPLE);
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(SampleGarment, manager.create(SampleGarment, {
        sample_no, categories: src.categories, customer_id: src.customer_id, middleman_name: src.middleman_name,
        style_no: src.style_no, buyer_id: src.buyer_id, buyer_name: src.buyer_name, buyer_no: src.buyer_no,
        patternmaker_id: src.patternmaker_id, patternmaker_name: src.patternmaker_name,
        maker: src.maker, make_date: today(), recipient: src.recipient, file_location: src.file_location,
        garment_remark: src.garment_remark, status: SampleStatus.PENDING, version: 1, created_by: createdBy, deleted: 0,
      }));
      const copied = srcMaterials.map((m, idx) => manager.create(SampleMaterial, {
        sample_id: saved.id, sort_order: idx, arrange_date: m.arrange_date, item_name: m.item_name,
        width: m.width, colors: m.colors, part: m.part, composition: m.composition, code_band: m.code_band,
        zipper_length: m.zipper_length, puller: m.puller, qty: m.qty, size: m.size, ref_price: m.ref_price,
        supplier_id: m.supplier_id, supplier_name: m.supplier_name, image: m.image, remark: m.remark,
      }));
      if (copied.length) await manager.save(SampleMaterial, copied);
      return saved;
    });
  }

  async getVersionHistory(id: number): Promise<SampleVersion[]> {
    await this.findOne(id);
    return this.versionRepo.find({ where: { sample_id: id }, order: { created_at: 'ASC' } });
  }

  // ★ v1.3 删除规则（A6）：仅待派单可删；被客户报价单引用则阻止删除
  async remove(id: number): Promise<void> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`样衣 #${id} 不存在`);
    if (entity.status !== SampleStatus.PENDING) {
      throw new BadRequestException('仅「待派单」状态的样衣可删除');
    }
    const refs = await this.quoteRepo.count({ where: { sample_id: id, deleted: 0 } });
    if (refs > 0) throw new BadRequestException(`已被 ${refs} 张报价单引用，无法删除`);
    entity.deleted = 1;
    await this.repo.save(entity);
  }
}
