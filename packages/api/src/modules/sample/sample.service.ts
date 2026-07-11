import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository, FindOptionsWhere, Like, IsNull, Between, MoreThanOrEqual, LessThanOrEqual, DataSource,
} from 'typeorm';
import { SampleGarment } from './sample-garment.entity';
import { SampleMaterial } from './sample-material.entity';
import { SampleVersion } from './sample-version.entity';
import { Customer } from '../customer/customer.entity';
import { Quotation } from '../quote/quotation.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { QuoteService } from '../quote/quote.service';
import { Reconciliation, ReconciliationStatus } from '../reconciliation/reconciliation.entity';
import { ReconciliationExpenseItem } from '../reconciliation/reconciliation-expense-item.entity';
import { Factory } from '../factory/factory.entity';
import { ReconcileType } from '@i9/types';
import { CustomerService } from '../customer/customer.service';
import { SampleStatus } from '@i9/types';
import {
  CreateSampleDto, PushPatternmakerDto, PatternmakerSaveDto, ShipSampleDto, ImportSampleRowDto,
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
    private readonly quoteService: QuoteService,
    private readonly customerService: CustomerService,
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

    const saved = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(SampleGarment, manager.create(SampleGarment, {
        sample_no, categories: dto.categories, customer_id: middlemanId, middleman_name: middleman.name,
        style_no: dto.styleNo, buyer_id: dto.buyerId, buyer_name: buyerName, buyer_no: buyerNo,
        patternmaker_id: dto.patternmakerId, patternmaker_name: dto.patternmakerName,
        maker: dto.maker, make_date: today(),
        ship_sample_date: dto.shipSampleDate, recipient: dto.recipient, file_location: dto.fileLocation,
        garment_remark: dto.garmentRemark, image1: dto.image1, image2: dto.image2, image3: dto.image3,
        feedback_attachments: dto.feedbackAttachments,
        status: SampleStatus.PENDING, version: 1, created_by: createdBy, deleted: 0,
      }));
      await manager.save(SampleMaterial, this.buildMaterials(created.id, materials));
      return created;
    });
    await this.log(saved.id, saved.version ?? 1, 'CREATE', createdBy, saved.sample_no);
    return saved;
  }

  async findAll(query: QuerySampleDto, user?: { id: number; role?: string }) {
    const {
      page = 1, size = 20, keyword, status, customer_id, patternmaker_id,
      style_no, middleman_name, patternmaker_name, maker, categories,
      make_start, make_end, ship_start, ship_end,
    } = query;
    const dateRange = (start?: string, end?: string) =>
      start && end ? Between(start, end) : start ? MoreThanOrEqual(start) : end ? LessThanOrEqual(end) : undefined;
    const makeDateCond = dateRange(make_start, make_end);
    const shipDateCond = dateRange(ship_start, ship_end);
    const base: FindOptionsWhere<SampleGarment> = {
      deleted: 0,
      ...(status !== undefined && { status }),
      ...(customer_id !== undefined && { customer_id }),
      ...(patternmaker_id !== undefined && { patternmaker_id }),
      // 高级筛选（设计稿 §C：款号/中间商/制版师/制单人/类别/日期范围）
      ...(style_no && { style_no: Like(`%${style_no}%`) }),
      ...(middleman_name && { middleman_name: Like(`%${middleman_name}%`) }),
      ...(patternmaker_name && { patternmaker_name: Like(`%${patternmaker_name}%`) }),
      ...(maker && { maker: Like(`%${maker}%`) }),
      ...(categories && { categories: Like(`%${categories}%`) }),
      ...(makeDateCond && { make_date: makeDateCond }),
      ...(shipDateCond && { ship_sample_date: shipDateCond }),
    };
    // 版师默认范围：只看自己名下 + 未指派（设计稿 §C）
    const bases: FindOptionsWhere<SampleGarment>[] =
      user?.role === 'PATTERNMAKER' && patternmaker_id === undefined
        ? [{ ...base, patternmaker_id: user.id }, { ...base, patternmaker_id: IsNull() }]
        : [base];
    // 智能搜索：样衣编号/客户款号/中间商名称/最终买家/制版师/制单人员（设计稿 §C）
    const searchable = ['sample_no', 'style_no', 'middleman_name', 'buyer_name', 'patternmaker_name', 'maker'];
    const conds: FindOptionsWhere<SampleGarment>[] = keyword
      ? bases.flatMap((b) => searchable.map((f) => ({ ...b, [f]: Like(`%${keyword}%`) })))
      : bases;
    const where: FindOptionsWhere<SampleGarment> | FindOptionsWhere<SampleGarment>[] =
      conds.length === 1 ? conds[0] : conds;

    const [items, total] = await this.repo.findAndCount({
      where, skip: (page - 1) * size, take: size, order: { id: 'DESC' },
    });
    await this.maskConfidentialNames(items, user);
    return { items, total, page, size };
  }

  // 机密客户名称快照遮蔽(P1#18/A2):未授权用户在样衣列表/详情看到 🔒
  private async maskConfidentialNames<T extends { customer_id?: number; buyer_id?: number; middleman_name?: string; buyer_name?: string }>(
    rows: T[], user?: { id: number; role?: string },
  ): Promise<void> {
    if (!user) return;
    const ids = await this.customerService.visibleCustomerIds(user);
    if (ids === null) return;
    const visible = new Set(ids);
    for (const r of rows) {
      if (r.customer_id && !visible.has(+r.customer_id)) r.middleman_name = '🔒 机密' as any;
      if (r.buyer_id && !visible.has(+r.buyer_id)) r.buyer_name = '🔒 机密' as any;
    }
  }

  async findOne(id: number, user?: { id: number; role?: string }) {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`样衣 #${id} 不存在`);
    const materials = await this.materialRepo.find({ where: { sample_id: id }, order: { sort_order: 'ASC' } });
    await this.maskConfidentialNames([entity], user);
    return { ...entity, materials };
  }

  async update(id: number, dto: Partial<CreateSampleDto>, operatorId?: number): Promise<SampleGarment> {
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
    const saved = await this.dataSource.transaction(async (manager) => {
      if (dto.categories !== undefined) entity.categories = dto.categories;
      if (dto.styleNo !== undefined) entity.style_no = dto.styleNo;
      if (dto.recipient !== undefined) entity.recipient = dto.recipient;
      if (dto.fileLocation !== undefined) entity.file_location = dto.fileLocation;
      if (dto.garmentRemark !== undefined) entity.garment_remark = dto.garmentRemark;
      if (dto.shipSampleDate !== undefined) entity.ship_sample_date = dto.shipSampleDate;
      if (dto.image1 !== undefined) entity.image1 = dto.image1;
      if (dto.image2 !== undefined) entity.image2 = dto.image2;
      if (dto.image3 !== undefined) entity.image3 = dto.image3;
      if (dto.feedbackAttachments !== undefined) entity.feedback_attachments = dto.feedbackAttachments;
      // 此前静默丢弃的字段(设计稿:业务可改中间商/买家/制版师/制单人员)
      if (dto.middlemanId !== undefined) { entity.customer_id = dto.middlemanId; entity.middleman_name = mmName as string; }
      if (dto.buyerId !== undefined) { entity.buyer_id = dto.buyerId || null; entity.buyer_name = buyerName ?? null; entity.buyer_no = buyerNo ?? null; }
      if (dto.patternmakerId !== undefined) entity.patternmaker_id = dto.patternmakerId;
      if (dto.patternmakerName !== undefined) entity.patternmaker_name = dto.patternmakerName;
      if (dto.maker !== undefined) entity.maker = dto.maker;
      const updated = await manager.save(SampleGarment, entity);
      if (dto.materials !== undefined) {
        await manager.delete(SampleMaterial, { sample_id: id });
        await manager.save(SampleMaterial, this.buildMaterials(id, dto.materials));
      }
      return updated;
    });
    await this.log(id, entity.version, 'UPDATE', operatorId ?? entity.created_by);
    // 样衣材料修改→同步未成单报价(P1#11 已拍板):品名匹配保留议价,已成单不动
    if (dto.materials !== undefined) {
      await this.quoteService.syncFromSample(id);
    }
    return saved;
  }

  // 行级「生成材料订单」(样衣稿🟠按钮,B方案落地):为该材料行生成一张【无合同费用对账单】(打样材料),
  // 金额=数量×参考价格,供应商带入,直接进对账→付款链(打样采购小额零星,不走合同/门户全套)
  async purchaseMaterial(sampleId: number, materialId: number, userId: number) {
    const sample = await this.repo.findOne({ where: { id: sampleId, deleted: 0 } });
    if (!sample) throw new NotFoundException(`样衣 #${sampleId} 不存在`);
    const material = await this.materialRepo.findOne({ where: { id: materialId, sample_id: sampleId } });
    if (!material) throw new NotFoundException(`材料行 #${materialId} 不属于该样衣`);
    const qty = +(material.qty ?? 0);
    const price = +(material.ref_price ?? 0);
    if (!(qty > 0) || !(price > 0)) throw new BadRequestException('该行需先填写 数量 与 参考价格 再生成采购');
    // 供应商→工厂库(采购须落库,同订单 B9 口径)
    let factoryId = material.supplier_id ? +material.supplier_id : null;
    if (!factoryId && material.supplier_name) {
      const f = await this.dataSource.getRepository(Factory).findOne({ where: { name: material.supplier_name, deleted: 0 } });
      factoryId = f ? +f.id : null;
    }
    if (!factoryId) throw new BadRequestException('该行供应商未落工厂库,请先在行内从工厂库选择供应商');

    const amount = +(qty * price).toFixed(4);
    const reconcile_no = await this.numbering.nextWithSegment(NUM_PREFIX.RECONCILIATION, sample.style_no || sample.sample_no || 'YY');
    const rec = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(Reconciliation, manager.create(Reconciliation, {
        reconcile_no,
        type: ReconcileType.NO_CONTRACT,
        sub_type: 'EXPENSE',
        style_no: sample.style_no ?? null,
        factory_id: factoryId,
        total_amount: amount,
        status: ReconciliationStatus.DRAFT,
        description: `打样材料采购 · ${sample.sample_no} · ${material.item_name} × ${qty} @ ${price}`,
        created_by: userId,
        deleted: 0,
      } as any) as any);
      await manager.save(ReconciliationExpenseItem, manager.create(ReconciliationExpenseItem, {
        reconcile_id: (saved as any).id,
        expense_name: `打样材料·${material.item_name ?? ''}`.slice(0, 100),
        amount,
        style_no: sample.style_no ?? null,
      } as any));
      return saved;
    });
    await this.log(sampleId, sample.version, 'PURCHASE', userId, `${material.item_name}×${qty} → ${reconcile_no}`);
    return rec;
  }

  // 废弃(P2#25/qc B4):不删改废弃——下游(报价/订单)引用留快照;已成单不可废弃;废弃后不可编辑(状态守卫天然拦截)
  async abandon(id: number, operatorId: number): Promise<SampleGarment> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`样衣 #${id} 不存在`);
    if (entity.status === SampleStatus.ORDERED) throw new BadRequestException('已成单样衣不可废弃');
    if (entity.status === SampleStatus.ABANDONED) throw new BadRequestException('该样衣已是废弃状态');
    entity.status = SampleStatus.ABANDONED;
    const saved = await this.repo.save(entity);
    await this.log(id, entity.version, 'ABANDON', operatorId);
    return saved;
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
      // 版师实测耗用落库→同步未成单报价的报价耗用(P1#11:实耗替换预估)
      await this.quoteService.syncFromSample(id);
    }
    if (dto.returnNo) {
      entity.return_no = dto.returnNo;
      entity.return_date = today();
      entity.status = SampleStatus.RETURNED;
    }
    if (dto.feedbackAttachments !== undefined) entity.feedback_attachments = dto.feedbackAttachments;
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

  async markShipped(id: number, dto: ShipSampleDto, operatorId?: number): Promise<SampleGarment> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`样衣 #${id} 不存在`);
    if (![SampleStatus.SAMPLING, SampleStatus.SHIPPED].includes(entity.status)) {
      throw new BadRequestException('当前状态不允许标记寄出');
    }
    entity.ship_sample_date = dto.shipSampleDate || today();
    entity.status = SampleStatus.SHIPPED;
    const saved = await this.repo.save(entity);
    await this.log(id, entity.version, 'SHIP', operatorId ?? entity.created_by, entity.ship_sample_date);
    return saved;
  }

  async complete(id: number, operatorId?: number): Promise<SampleGarment> {
    const entity = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!entity) throw new NotFoundException(`样衣 #${id} 不存在`);
    if (![SampleStatus.RECONCILED, SampleStatus.DONE].includes(entity.status)) {
      throw new BadRequestException('当前状态不允许标记完成(需先对账)');
    }
    entity.status = SampleStatus.DONE;
    const saved = await this.repo.save(entity);
    await this.log(id, entity.version, 'COMPLETE', operatorId ?? entity.created_by);
    return saved;
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
    const newSample = await this.dataSource.transaction(async (manager) => {
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
    await this.log(newSample.id, newSample.version ?? 1, 'COPY', createdBy, `复制自 ${src.sample_no ?? `#${id}`}`);
    return newSample;
  }

  // 历史样衣批量导入：中间商按名称精确匹配；材料串按分号拆为品名行；复用 create（含类别/材料校验）
  async importBatch(rows: ImportSampleRowDto[], createdBy: number) {
    let ok = 0;
    const failures: Array<{ row: number; reason: string }> = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const middleman = await this.customerRepo.findOne({ where: { name: r.middlemanName, deleted: 0 } });
        if (!middleman) throw new BadRequestException(`中间商「${r.middlemanName}」不存在（需与客户资料名称完全一致）`);
        const materials = String(r.materials ?? '')
          .split(/[;；]/).map((s) => s.trim()).filter(Boolean)
          .map((itemName) => ({ itemName }));
        if (!materials.length) throw new BadRequestException('材料品名为空（分号分隔，至少 1 个）');
        await this.create({
          categories: r.categories, middlemanId: middleman.id, styleNo: r.styleNo,
          patternmakerName: r.patternmakerName || undefined, maker: r.maker || undefined,
          materials,
        } as CreateSampleDto, createdBy);
        ok += 1;
      } catch (e: any) {
        failures.push({ row: i + 1, reason: e?.message ?? '未知错误' });
      }
    }
    return { ok, fail: failures.length, failures };
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
    const refQuotes = await this.quoteRepo.find({ where: { sample_id: id, deleted: 0 }, select: ['quote_no'] as any, take: 5 });
    if (refQuotes.length > 0) {
      const nos = refQuotes.map((q: any) => q.quote_no).join('、');
      throw new BadRequestException(`已被报价单 ${nos} 引用，无法删除`);
    }
    entity.deleted = 1;
    await this.repo.save(entity);
  }
}
