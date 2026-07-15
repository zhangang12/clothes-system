import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, DataSource, In } from 'typeorm';
import { Contract, ContractStatus } from './contract.entity';
import { ContractMaterial } from './contract-material.entity';
import { ContractShipment } from './contract-shipment.entity';
import { ContractShipmentItem } from './contract-shipment-item.entity';
import { ContractPortalLog, PortalOperatorType } from './contract-portal-log.entity';
import { OrderMaterial } from '../order/order-material.entity';
import { OrderMain } from '../order/order-main.entity';
import { OrderSizeMatrix } from '../order/order-size-matrix.entity';
import { Factory } from '../factory/factory.entity';
import { SupplierAccount } from '../auth/supplier-account.entity';
import { NumberingService, NUM_PREFIX } from '../../common/services/numbering.service';
import { ChangeLogService } from '../../common/changelog/change-log.service';
import { SysConfigService } from '../../common/config/sys-config.service';
import { ContractPortalStatus, ContractType, OrderStatus, ApprovalStatus, APPROVAL_THRESHOLD_KEYS } from '@i9/types';

// 账期规则（06-对账付款设计稿 v1.4「v1.3 业务定」+ 补充确认清单 C）：材料 = 发货日+90天，加工 = 发货日+45天（可人工改）
const DEFAULT_ACCOUNT_PERIOD_DAYS: Record<ContractType, number> = {
  [ContractType.MATERIAL]: 90,
  [ContractType.PROCESS]: 45,
  [ContractType.SUPPLEMENT]: 90,
};
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { QueryContractDto } from './dto/query-contract.dto';

// 加工合同价格包含项默认勾选（设计稿 04 v1.3：取自真实加工合同「以上价格包含…」写法；胶袋默认不含）
const DEFAULT_PRICE_INCLUDES = ['工缴', '裁剪', '线', '后道', '运费', '纸箱', '拷贝纸', '干燥剂', '运杂费', '进仓费'];

// 交货期限默认偏移（设计稿 合同 A7：加工=订单交期−10天 / 材料=−45天，可改）
const DELIVERY_OFFSET_DAYS: Record<ContractType, number> = {
  [ContractType.MATERIAL]: 45,
  [ContractType.PROCESS]: 10,
  [ContractType.SUPPLEMENT]: 45,
};

function minusDays(date: Date | string | null | undefined, days: number): string | null {
  if (!date) return null;
  const d = new Date(typeof date === 'string' ? date : date.toISOString());
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// 整数类单位（设计稿 订单⑤：损耗后向上取整）
const INT_UNITS = ['个', '条', '只', '件', '粒', '套', '对', 'pcs', 'PCS', 'PC'];

@Injectable()
export class ContractService {
  constructor(
    @InjectRepository(Contract) private readonly repo: Repository<Contract>,
    @InjectRepository(ContractMaterial) private readonly materialRepo: Repository<ContractMaterial>,
    @InjectRepository(ContractShipment) private readonly shipmentRepo: Repository<ContractShipment>,
    @InjectRepository(ContractPortalLog) private readonly logRepo: Repository<ContractPortalLog>,
    @InjectRepository(OrderMaterial) private readonly orderMaterialRepo: Repository<OrderMaterial>,
    @InjectRepository(OrderMain) private readonly orderRepo: Repository<OrderMain>,
    @InjectRepository(OrderSizeMatrix) private readonly matrixRepo: Repository<OrderSizeMatrix>,
    @InjectRepository(Factory) private readonly factoryRepo: Repository<Factory>,
    @InjectRepository(SupplierAccount) private readonly supplierRepo: Repository<SupplierAccount>,
    private readonly numbering: NumberingService,
    private readonly changeLog: ChangeLogService,
    private readonly config: SysConfigService,
    private readonly dataSource: DataSource,
  ) {}

  // 分色/分码出行（设计稿 合同 A4 / 订单 v1.0）：材料按订单【尺码数量搭配】矩阵拆行——
  // 分色→各颜色一行、分码→各尺码一行；某色(码)该料量 = 该色(码)件数 × 单件耗用 × (1+损耗率)，
  // 无耗用数据时按件数占比分摊最终采购量；整数类单位向上取整。不拆分则单行(采购量含损耗)。
  private expandMaterialLines(
    om: OrderMaterial,
    matrixRows: any[],
    styleNo: string | null,
    deliveryDate: string | null,
  ): Array<Record<string, any>> {
    const base = {
      item_name: om.item_name,
      spec: [om.width, om.composition].filter(Boolean).join(' / ') || undefined,
      unit: om.unit,
      unit_price: +om.unit_price || 0,
      style_no: styleNo || undefined,
      delivery_date: deliveryDate || undefined,
    };
    const mode = om.split_mode;
    if ((mode === 'BY_COLOR' || mode === 'BY_SIZE') && matrixRows?.length) {
      const dim = mode === 'BY_COLOR' ? 'color' : 'size';
      const groups = new Map<string, number>();
      for (const r of matrixRows) {
        const key = String(r?.[dim] ?? '').trim();
        // 新矩阵结构 qtys=各PO数量数组；旧平铺行 qty 单值
        const qty = Array.isArray(r?.qtys)
          ? r.qtys.reduce((s: number, n: any) => s + (+n || 0), 0)
          : +r?.qty || 0;
        if (!key || !qty) continue;
        groups.set(key, (groups.get(key) ?? 0) + qty);
      }
      if (groups.size) {
        const per = +om.net_usage || 0;
        const loss = 1 + (+om.loss_rate || 0) / 100;
        const totalGroupQty = [...groups.values()].reduce((a, b) => a + b, 0);
        const fallbackBase = +(om.final_purchase ?? om.total_purchase) || 0;
        const round = om.round_up === 1
          || (om.round_up == null && INT_UNITS.includes(om.unit ?? ''));
        return [...groups].map(([key, groupQty]) => {
          let qty = per > 0
            ? groupQty * per * loss
            : (totalGroupQty ? (fallbackBase * groupQty) / totalGroupQty : 0);
          qty = round ? Math.ceil(qty) : +qty.toFixed(2);
          return {
            ...base,
            color: mode === 'BY_COLOR' ? key : (om.color || undefined),
            size: mode === 'BY_SIZE' ? key : undefined,
            qty,
            qty_source: mode === 'BY_COLOR' ? '采购量·分色' : '采购量·分码',
          };
        });
      }
    }
    return [{
      ...base,
      color: om.color || undefined,
      qty: +(om.final_purchase ?? om.total_purchase) || 0,
      qty_source: '采购量含损耗',
    }];
  }

  private async getMatrixRows(orderId: number | null | undefined): Promise<any[]> {
    if (!orderId) return [];
    const matrix = await this.matrixRepo.findOne({ where: { order_id: orderId } });
    return ((matrix?.matrix_data as any)?.rows ?? []) as any[];
  }

  // 供应商拆单：按订单材料的供应商分组，每个供应商生成一张材料合同（设计稿 合同 A1）
  async generateFromOrder(orderId: number, createdBy: number) {
    const order = await this.orderRepo.findOne({ where: { id: orderId, deleted: 0 } });
    if (!order) throw new NotFoundException(`订单 #${orderId} 不存在`);
    const materials = await this.orderMaterialRepo.find({ where: { order_id: orderId }, order: { sort_order: 'ASC' } });
    if (!materials.length) throw new BadRequestException('订单无用料核算记录，无法生成合同');

    // 按供应商名分组
    const groups = new Map<string, OrderMaterial[]>();
    for (const m of materials) {
      const key = (m.supplier || '').trim() || '未指定供应商';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }

    // 分色/分码按订单尺码矩阵拆行（设计稿 合同 A4）；行交期默认=订单交期−45天
    const matrixRows = await this.getMatrixRows(orderId);
    const lineDelivery = minusDays(order.delivery_date as any, DELIVERY_OFFSET_DAYS[ContractType.MATERIAL]);

    const created: Contract[] = [];
    const unmatched: string[] = [];
    // 待定供应商占位(P3#41/CON C2):未匹配供应商也生成合同,挂「待定供应商」占位工厂,后续改绑
    let placeholder: Factory | null = null;
    const getPlaceholder = async (): Promise<Factory> => {
      if (placeholder) return placeholder;
      placeholder = await this.factoryRepo.findOne({ where: { name: '待定供应商', deleted: 0 } });
      if (!placeholder) {
        placeholder = await this.factoryRepo.save(this.factoryRepo.create({
          factory_no: 'S000', name: '待定供应商', type: 'OTHER', status: 1, deleted: 0,
          contact_name: '-', contact_phone: '-',
        } as any) as any) as Factory;
      }
      return placeholder;
    };
    for (const [supplier, mats] of groups) {
      // 供应商名匹配工厂库（供应商须落工厂库，设计稿 订单 B9）
      let factory = supplier === '未指定供应商'
        ? null
        : await this.factoryRepo.findOne({ where: { name: supplier, deleted: 0 } });
      if (!factory) {
        unmatched.push(supplier);
        factory = await getPlaceholder();
      }
      const isPlaceholder = factory.name === '待定供应商';
      const contract = await this.create(
        {
          type: ContractType.MATERIAL,
          factory_id: factory.id,
          order_id: orderId,
          currency: order.currency ?? 'CNY',
          remark: isPlaceholder ? `供应商待定（用料填写:${supplier}）——确定后在草稿改绑真实供应商` : undefined,
          materials: mats.flatMap((m) =>
            this.expandMaterialLines(m, matrixRows, order.style_no ?? null, lineDelivery)) as any,
        } as CreateContractDto,
        createdBy,
      );
      created.push(contract);
    }
    return { orderId, created: created.length, contracts: created, unmatched };
  }

  async create(dto: CreateContractDto, createdBy: number): Promise<Contract> {
    // 补料合同用「补料-原合同号-序号」独立标识，不占 HT 主序号（设计稿 合同 D1/Q23）
    let contract_no: string;
    if (dto.type === ContractType.SUPPLEMENT) {
      if (!dto.parent_id) throw new BadRequestException('补料合同必须指定原合同（parent_id）');
      const parent = await this.repo.findOne({ where: { id: dto.parent_id, deleted: 0 } });
      if (!parent) throw new NotFoundException(`原合同 #${dto.parent_id} 不存在`);
      const seq = await this.repo.count({ where: { parent_id: dto.parent_id, type: ContractType.SUPPLEMENT } });
      contract_no = `补料-${parent.contract_no}-${String(seq + 1).padStart(2, '0')}`;
    } else {
      contract_no = await this.numbering.next(NUM_PREFIX.CONTRACT);
    }

    const deposit_ratio = dto.deposit_ratio ?? 30;
    const mid_ratio = dto.mid_ratio ?? 40;
    const final_ratio = dto.final_ratio ?? 30;
    // 付款条款验证（系统开发手册·核心业务规则）：定金% + 中期% + 尾款% 必须 = 100%
    if (Math.abs(deposit_ratio + mid_ratio + final_ratio - 100) > 0.01) {
      throw new BadRequestException(
        `定金比例 + 中期比例 + 尾款比例必须等于 100%（当前为 ${deposit_ratio + mid_ratio + final_ratio}%）`,
      );
    }

    // 关联订单（编辑页默认值来源：款号/交期偏移；订单不存在不阻断——历史数据兼容）
    const order = dto.order_id
      ? await this.orderRepo.findOne({ where: { id: dto.order_id, deleted: 0 } })
      : null;
    // 交货期限默认（设计稿 合同 A7）：加工=订单交期−10天 / 材料·补料=−45天。
    // 偏移天数可在系统参数配置（sys_config: contract.delivery_offset_material / _process），逐单仍可改
    const offsetKey = dto.type === ContractType.PROCESS
      ? 'contract.delivery_offset_process' : 'contract.delivery_offset_material';
    const offsetDays = await this.config.getNumber(offsetKey, DELIVERY_OFFSET_DAYS[dto.type]);
    const deliveryDeadline = dto.delivery_deadline
      ?? minusDays(order?.delivery_date as any, offsetDays);

    // 快照机制（系统开发手册）：报价→合同时锁定费用明细/单价。材料合同若未手工提供
    // materials，自动从该订单已核算的用料清单（quote_item→order_material 链路，
    // total_purchase/unit_price 已按报价损耗率算好）带出，避免业务员凭空重新誊抄。
    let materialInputs: Array<Record<string, any>> = dto.materials ?? [];
    // 材料合同：从订单用料核算带出，数量=采购量(含损耗)（设计稿 合同 A5/C3）；
    // 分色/分码材料按订单尺码矩阵拆行（设计稿 合同 A4）
    if (materialInputs.length === 0 && dto.type === ContractType.MATERIAL) {
      const orderMaterials = await this.orderMaterialRepo.find({
        where: { order_id: dto.order_id },
        order: { sort_order: 'ASC' },
      });
      const matrixRows = await this.getMatrixRows(dto.order_id);
      materialInputs = orderMaterials.flatMap((om) =>
        this.expandMaterialLines(om, matrixRows, order?.style_no ?? null, deliveryDeadline));
    }
    // 加工合同：数量取订单大货数（设计稿 合同 A4）；单价由业务填写
    if (materialInputs.length === 0 && dto.type === ContractType.PROCESS) {
      if (order && +order.qty_total) {
        materialInputs = [{
          item_name: order.style_name || '加工费',
          style_no: order.style_no || undefined,
          delivery_date: deliveryDeadline || undefined,
          unit: '件',
          unit_price: 0,
          qty: +order.qty_total,
          qty_source: '大货数',
          sort_order: 0,
        }];
      }
    }
    if (materialInputs.length === 0) {
      throw new BadRequestException('材料明细不能为空（该订单无可带出的用料核算记录，请手动填写 materials）');
    }

    return this.dataSource.transaction(async (manager) => {
      const totalAmount = materialInputs.reduce((sum, m) => sum + m.unit_price * m.qty, 0);

      const contract = await manager.save(Contract, manager.create(Contract, {
        contract_no,
        type: dto.type,
        parent_id: dto.parent_id,
        factory_id: dto.factory_id,
        order_id: dto.order_id,
        total_amount: +totalAmount.toFixed(4),
        currency: dto.currency ?? 'CNY',
        deposit_ratio,
        mid_ratio,
        final_ratio,
        last_ship_date: dto.last_ship_date as any,
        ship_to_address: dto.ship_to_address,
        account_period_days: dto.account_period_days ?? DEFAULT_ACCOUNT_PERIOD_DAYS[dto.type],
        remark: dto.remark,
        // 编辑页扩展字段（设计稿 04 v1.3）
        sign_place: dto.sign_place,
        sign_date: (dto.sign_date ?? new Date().toISOString().slice(0, 10)) as any,
        company_id: dto.company_id,
        company_rep: dto.company_rep,
        guarantor: dto.guarantor,
        guarantor_id_photo: dto.guarantor_id_photo,
        delivery_deadline: deliveryDeadline as any,
        style_nos: dto.style_nos ?? order?.style_no ?? null,
        price_includes: dto.price_includes
          ?? (dto.type === ContractType.PROCESS ? DEFAULT_PRICE_INCLUDES : null),
        vat_rate: dto.vat_rate ?? (dto.type === ContractType.PROCESS ? 13 : null),
        price_other: dto.price_other,
        terms_json: dto.terms_json ?? null,
        created_by: createdBy,
        portal_status: ContractPortalStatus.DRAFT,
        status: ContractStatus.ACTIVE,
      }));

      const materials = materialInputs.map((m, idx) => manager.create(ContractMaterial, {
        contract_id: contract.id,
        sort_order: m.sort_order ?? idx,
        item_name: m.item_name,
        spec: m.spec,
        color: m.color ?? null,
        size: m.size ?? null,
        style_no: m.style_no ?? null,
        delivery_date: (m.delivery_date ?? null) as any,
        photo_url: m.photo_url ?? null,
        unit: m.unit,
        unit_price: m.unit_price,
        qty: m.qty,
        amount: +(m.unit_price * m.qty).toFixed(4),
        qty_source: m.qty_source ?? null,
        remark: m.remark,
      }));
      await manager.save(ContractMaterial, materials);

      // 最近交易日期回写（基础资料稿 §1.2：列表按最近交易超期标红——此前该字段无任何写入方，规则恒不触发）
      await manager.update(Factory, { id: dto.factory_id }, { last_trade_date: new Date().toISOString().slice(0, 10) as any });

      // 生成合同后订单自动置「已生成合同」（设计稿 合同 A9）：仅从「已下单」推进，补料合同不改订单态
      if (dto.order_id && dto.type !== ContractType.SUPPLEMENT) {
        const order = await manager.findOne(OrderMain, { where: { id: dto.order_id, deleted: 0 } });
        if (order && order.status === OrderStatus.CONFIRMED) {
          order.status = OrderStatus.CONTRACTED;
          await manager.save(OrderMain, order);
        }
      }

      return contract;
    });
  }

  // 加工价历史同款提示(P3#41/CON C3半):同款号+同品名最近一次合同单价
  async priceHint(styleNo: string, itemName?: string) {
    const qb = this.materialRepo.createQueryBuilder('m')
      .innerJoin(Contract, 'c', 'c.id = m.contract_id AND c.deleted = 0')
      .select(['m.item_name AS item_name', 'm.unit_price AS unit_price', 'c.contract_no AS contract_no', 'c.type AS type'])
      .where('(m.style_no = :styleNo OR c.style_nos LIKE :like)', { styleNo, like: `%${styleNo}%` })
      .orderBy('m.id', 'DESC')
      .limit(5);
    if (itemName) qb.andWhere('m.item_name = :itemName', { itemName });
    return qb.getRawMany();
  }

  // 按款号列出合同(对账/付款「搜款号→选合同」:选中后前端据此带出工厂/合同ID,免手填数字ID)。
  // 匹配口径同 priceHint:合同 style_nos 命中 或 任一材料行 style_no 命中(补料/加工皆可)。
  async contractsByStyle(styleNo: string) {
    const s = (styleNo ?? '').trim();
    if (!s) return [];
    return this.repo.createQueryBuilder('c')
      .leftJoin(Factory, 'f', 'f.id = c.factory_id')
      .leftJoin(ContractMaterial, 'm', 'm.contract_id = c.id')
      .select([
        'c.id AS id', 'c.contract_no AS contract_no', 'c.type AS type',
        'c.factory_id AS factory_id', 'f.name AS factory_name',
        'c.total_amount AS total_amount', 'c.style_nos AS style_nos',
      ])
      .distinct(true)
      .where('c.deleted = 0')
      .andWhere('(c.style_nos LIKE :like OR m.style_no = :s)', { like: `%${s}%`, s })
      .orderBy('c.id', 'DESC')
      .limit(50)
      .getRawMany();
  }

  async findAll(query: QueryContractDto) {
    const { page = 1, size = 20, keyword, type, portal_status, factory_id, order_id } = query;
    const base: FindOptionsWhere<Contract> = {
      deleted: 0,
      ...(type !== undefined && { type }),
      ...(portal_status !== undefined && { portal_status }),
      ...(factory_id !== undefined && { factory_id }),
      ...(order_id !== undefined && { order_id }),
    };
    const where: FindOptionsWhere<Contract> | FindOptionsWhere<Contract>[] = keyword
      ? [{ ...base, contract_no: Like(`%${keyword}%`) }]
      : base;

    const [items, total] = await this.repo.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });
    return { items, total, page, size };
  }

  async findOne(id: number) {
    const contract = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!contract) throw new NotFoundException(`合同 #${id} 不存在`);
    const materials = await this.materialRepo.find({
      where: { contract_id: id },
      order: { sort_order: 'ASC' },
    });
    const shipments = await this.shipmentRepo.find({ where: { contract_id: id }, order: { id: 'ASC' } });
    // 批次物料行(P3#30)
    if (shipments.length) {
      const lines = await this.dataSource.getRepository(ContractShipmentItem)
        .find({ where: { shipment_id: In(shipments.map((b) => b.id)) } });
      const byShip = new Map<number, ContractShipmentItem[]>();
      lines.forEach((it) => {
        const k = +it.shipment_id;
        if (!byShip.has(k)) byShip.set(k, []);
        byShip.get(k)!.push(it);
      });
      (shipments as any[]).forEach((b) => { (b as any).items = byShip.get(+b.id) ?? []; });
    }
    // 合同量 vs 累计实发 vs 差额（对账付款串流程 C12）
    const contractQty = +materials.reduce((s, m) => s + +m.qty, 0).toFixed(4);
    const shippedQty = +(+(contract.shipped_qty ?? 0)).toFixed(4);
    const qtyStats = { contractQty, shippedQty, diffQty: +(contractQty - shippedQty).toFixed(4) };
    // 变更标记(P2#20):源订单在合同生成后被内容级修改 → 提示核对材料明细
    let source_order_changed = false;
    if (contract.order_id) {
      const order = await this.orderRepo.findOne({ where: { id: contract.order_id } });
      if (order?.content_updated_at) {
        source_order_changed = new Date(order.content_updated_at) > new Date(contract.created_at);
      }
    }
    return { ...contract, materials, shipments, qtyStats, source_order_changed };
  }

  // 合同编辑（设计稿 04 v1.3 编辑页 + E5 锁定规则）：
  // 草稿可全改；推送/盖章后锁定关键字段，仅备注可改（要改需先撤销推送回草稿）
  async update(id: number, dto: UpdateContractDto): Promise<Contract> {
    const contract = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!contract) throw new NotFoundException(`合同 #${id} 不存在`);

    if (contract.portal_status !== ContractPortalStatus.DRAFT) {
      const locked = Object.keys(dto).filter(
        (k) => (dto as any)[k] !== undefined && k !== 'remark',
      );
      if (locked.length) {
        throw new BadRequestException(
          `合同已推送/盖章，仅可修改备注（修改其他字段请先撤销推送回草稿）；被锁定字段：${locked.join('、')}`,
        );
      }
      if (dto.remark !== undefined) contract.remark = dto.remark;
      return this.repo.save(contract);
    }

    // 付款比例校验（与 create 同规则）：合并后 定金+中期+尾款 = 100%
    const deposit = dto.deposit_ratio ?? +contract.deposit_ratio;
    const mid = dto.mid_ratio ?? +contract.mid_ratio;
    const fin = dto.final_ratio ?? +contract.final_ratio;
    if (Math.abs(deposit + mid + fin - 100) > 0.01) {
      throw new BadRequestException(
        `定金比例 + 中期比例 + 尾款比例必须等于 100%（当前为 ${deposit + mid + fin}%）`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const assignable: Array<keyof UpdateContractDto> = [
        'factory_id', 'currency', 'deposit_ratio', 'mid_ratio', 'final_ratio',
        'last_ship_date', 'ship_to_address', 'account_period_days', 'remark',
        'sign_place', 'sign_date', 'company_id', 'company_rep',
        'guarantor', 'guarantor_id_photo', 'delivery_deadline', 'style_nos',
        'price_includes', 'vat_rate', 'price_other', 'terms_json',
      ];
      for (const k of assignable) {
        if ((dto as any)[k] !== undefined) (contract as any)[k] = (dto as any)[k];
      }

      if (dto.materials) {
        if (!dto.materials.length) throw new BadRequestException('货物明细不能为空');
        // 数量微调留痕(P2#21/qc C6):记录总数量/总金额 原值→新值
        const oldRows = await manager.find(ContractMaterial, { where: { contract_id: id } });
        const oldQty = +oldRows.reduce((sum, r) => sum + +r.qty, 0).toFixed(4);
        const newQty = +dto.materials.reduce((sum, m) => sum + +m.qty, 0).toFixed(4);
        const oldAmount = +contract.total_amount;
        await manager.delete(ContractMaterial, { contract_id: id });
        const rows = dto.materials.map((m, idx) => manager.create(ContractMaterial, {
          contract_id: id,
          sort_order: m.sort_order ?? idx,
          item_name: m.item_name,
          spec: m.spec,
          color: m.color ?? null,
          size: m.size ?? null,
          style_no: m.style_no ?? null,
          delivery_date: (m.delivery_date ?? null) as any,
          photo_url: m.photo_url ?? null,
          unit: m.unit,
          unit_price: m.unit_price,
          qty: m.qty,
          amount: +(m.unit_price * m.qty).toFixed(4),
          qty_source: m.qty_source ?? null,
          remark: m.remark,
        }));
        await manager.save(ContractMaterial, rows);
        const newTotal = +rows.reduce((s, r) => s + +r.amount, 0).toFixed(4);
        // 金额变化则重置已通过的审批（防"审批后改金额"绕过阈值管控，同付款申请口径）
        if (Math.abs(newTotal - +contract.total_amount) > 0.0001
            && contract.approval_status === ApprovalStatus.APPROVED) {
          contract.approval_status = ApprovalStatus.NONE;
          contract.approved_by = null as any;
          contract.approved_at = null as any;
        }
        contract.total_amount = newTotal;
        await this.changeLog.record('CONTRACT', id, [
          { field: 'qty_total', old: oldQty, new: newQty },
          { field: 'total_amount', old: oldAmount, new: newTotal },
        ]);
      }

      return manager.save(Contract, contract);
    });
  }

  // 推送给供应商门户 (DRAFT → PUSHED)
  async push(id: number, operatorUsername: string): Promise<Contract> {
    const contract = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!contract) throw new NotFoundException(`合同 #${id} 不存在`);
    if (contract.portal_status !== ContractPortalStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态才可推送');
    }
    // 金额阈值审批：合同金额超阈值需主管审批后方可推送（设计稿 审批矩阵，阈值可配）
    if (contract.approval_status !== ApprovalStatus.APPROVED) {
      const threshold = await this.config.getNumber(APPROVAL_THRESHOLD_KEYS.CONTRACT);
      if (threshold > 0 && +contract.total_amount > threshold) {
        if (contract.approval_status !== ApprovalStatus.PENDING) {
          contract.approval_status = ApprovalStatus.PENDING;
          await this.repo.save(contract);
        }
        throw new BadRequestException(`合同金额 ${contract.total_amount} 超过审批阈值 ${threshold}，需主管审批后方可推送`);
      }
    }
    // 首次推送自动开通门户账号(P3#41/CON B3):无账号时按工厂编号自动建(默认密码 Factory@123,提示改密)
    let account = await this.supplierRepo.findOne({ where: { factory_id: contract.factory_id, status: 1 } });
    let autoOpened: string | null = null;
    if (!account) {
      const factory = await this.factoryRepo.findOne({ where: { id: contract.factory_id, deleted: 0 } });
      const base = (factory?.factory_no || `f${contract.factory_id}`).toLowerCase();
      let username = base;
      for (let i = 0; i < 5; i++) {
        const exists = await this.supplierRepo.findOne({ where: { account: username } });
        if (!exists) break;
        username = `${base}${i + 1}`;
      }
      const bcrypt = await import('bcryptjs');
      account = await this.supplierRepo.save(this.supplierRepo.create({
        account: username,
        password: await bcrypt.hash('Factory@123', 10),
        factory_id: contract.factory_id,
        status: 1,
      } as any) as any) as any;
      autoOpened = username;
    }
    contract.portal_status = ContractPortalStatus.PUSHED;
    contract.pushed_at = new Date();
    await this.repo.save(contract);

    await this.logRepo.save(this.logRepo.create({
      contract_id: id,
      action: 'PUSH',
      operator: operatorUsername,
      operator_type: PortalOperatorType.INTERNAL,
      remark: autoOpened ? `首次推送自动开通门户账号:${autoOpened}(初始密码 Factory@123,请通知供应商修改)` : undefined,
    }));

    return { ...(contract as any), auto_opened_account: autoOpened } as any;
  }

  // 撤销推送（PUSHED → DRAFT）：供应商尚未盖章前可撤回修改，修改后重推门户提示「合同已更新」
  async recall(id: number, operatorUsername: string): Promise<Contract> {
    const contract = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!contract) throw new NotFoundException(`合同 #${id} 不存在`);
    if (contract.portal_status !== ContractPortalStatus.PUSHED) {
      throw new BadRequestException('只有已推送（供应商未盖章）状态才可撤销推送');
    }
    contract.portal_status = ContractPortalStatus.DRAFT;
    contract.revised = 1; // 标记为已修订，重推后门户提示供应商合同已更新
    await this.repo.save(contract);

    await this.logRepo.save(this.logRepo.create({
      contract_id: id,
      action: 'RECALL',
      operator: operatorUsername,
      operator_type: PortalOperatorType.INTERNAL,
    }));

    return contract;
  }

  // 主管审批（超阈值合同）：待审批 → 已审批，放行推送
  async approveContract(id: number, approverId: number): Promise<Contract> {
    const contract = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!contract) throw new NotFoundException(`合同 #${id} 不存在`);
    if (contract.approval_status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('该合同无待审批项（未超阈值或已审批）');
    }
    contract.approval_status = ApprovalStatus.APPROVED;
    contract.approved_by = approverId;
    contract.approved_at = new Date();
    return this.repo.save(contract);
  }

  // 供应商盖章 — 创建快照快照锁定 (PUSHED → STAMPED)
  async stamp(id: number, supplierAccount: string): Promise<Contract> {
    const contract = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!contract) throw new NotFoundException(`合同 #${id} 不存在`);
    if (contract.portal_status !== ContractPortalStatus.PUSHED) {
      throw new ForbiddenException('合同状态不允许盖章');
    }

    // 获取当前材料明细，锁入快照
    const materials = await this.materialRepo.find({
      where: { contract_id: id },
      order: { sort_order: 'ASC' },
    });

    const snapshot = {
      contract_no: contract.contract_no,
      type: contract.type,
      factory_id: contract.factory_id,
      order_id: contract.order_id,
      total_amount: contract.total_amount,
      currency: contract.currency,
      deposit_ratio: contract.deposit_ratio,
      mid_ratio: contract.mid_ratio,
      final_ratio: contract.final_ratio,
      account_period_days: contract.account_period_days,
      materials: materials.map((m) => ({
        item_name: m.item_name,
        spec: m.spec,
        unit: m.unit,
        unit_price: m.unit_price,
        qty: m.qty,
        amount: m.amount,
      })),
      stamped_at: new Date().toISOString(),
    };

    contract.portal_status = ContractPortalStatus.STAMPED;
    contract.stamped_at = new Date();
    contract.stamped_by_supplier = supplierAccount;
    contract.snapshot_json = snapshot;
    await this.repo.save(contract);

    await this.logRepo.save(this.logRepo.create({
      contract_id: id,
      action: 'STAMP',
      operator: supplierAccount,
      operator_type: PortalOperatorType.SUPPLIER,
    }));

    return contract;
  }

  async updateStatus(id: number, status: ContractStatus): Promise<Contract> {
    const contract = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!contract) throw new NotFoundException(`合同 #${id} 不存在`);
    contract.status = status;
    return this.repo.save(contract);
  }

  async remove(id: number): Promise<void> {
    const contract = await this.repo.findOne({ where: { id, deleted: 0 } });
    if (!contract) throw new NotFoundException(`合同 #${id} 不存在`);
    if (contract.portal_status !== ContractPortalStatus.DRAFT) {
      throw new BadRequestException('只有草稿状态的合同可以删除');
    }
    contract.deleted = 1;
    await this.repo.save(contract);
  }

  // 发货批次业务审批（设计稿 门户 B2：每次发货提交走业务审批；对账只可勾选已审批批次）
  async approveShipment(contractId: number, shipmentId: number, approverId: number, approve: boolean): Promise<ContractShipment> {
    const shipment = await this.shipmentRepo.findOne({ where: { id: shipmentId, contract_id: contractId } });
    if (!shipment) throw new NotFoundException(`发货批次 #${shipmentId} 不存在`);
    if (shipment.reconcile_id) throw new BadRequestException('该批次已被对账单引用，不可改审批状态');
    shipment.approval_status = approve ? 'APPROVED' : 'REJECTED';
    shipment.approved_by = approverId;
    shipment.approved_at = new Date();
    const saved = await this.shipmentRepo.save(shipment);
    await this.logRepo.save(this.logRepo.create({
      contract_id: contractId,
      action: approve ? 'SHIP_APPROVE' : 'SHIP_REJECT',
      operator: String(approverId),
      operator_type: PortalOperatorType.INTERNAL,
      remark: `发货批次 ${shipment.ship_no ?? shipmentId} ${approve ? '审批通过' : '驳回'}`,
    }));
    return saved;
  }

  async getLogs(id: number): Promise<ContractPortalLog[]> {
    return this.logRepo.find({
      where: { contract_id: id },
      order: { created_at: 'ASC' },
    });
  }

  // 从快照获取单价（对账时使用，快照锁定后不允许变化）
  async getSnapshotUnitPrice(contractId: number, itemName: string): Promise<number | null> {
    const contract = await this.repo.findOne({ where: { id: contractId, deleted: 0 } });
    if (!contract?.snapshot_json) return null;
    const snap = contract.snapshot_json as any;
    const item = (snap.materials ?? []).find((m: any) => m.item_name === itemName);
    return item?.unit_price ?? null;
  }
}
