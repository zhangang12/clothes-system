import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PortalService } from '../portal.service';
import { Contract } from '../../contract/contract.entity';
import { ContractMaterial } from '../../contract/contract-material.entity';
import { ContractPortalLog } from '../../contract/contract-portal-log.entity';
import { OrderMain } from '../../order/order-main.entity';
import { OrderMaterial } from '../../order/order-material.entity';
import { OrderSizeMatrix } from '../../order/order-size-matrix.entity';
import { ContractPortalStatus } from '@i9/types';

const makeContract = (overrides = {}) => ({
  id: 1,
  contract_no: 'HT-20240101-001',
  type: 'MATERIAL',
  factory_id: 10,
  order_id: 100,
  total_amount: 5000,
  currency: 'CNY',
  deposit_ratio: 30,
  mid_ratio: 40,
  final_ratio: 30,
  account_period_days: 45,
  portal_status: ContractPortalStatus.PUSHED,
  status: 'ACTIVE',
  deleted: 0,
  ...overrides,
});

const makeMaterial = () => ({
  id: 1,
  contract_id: 1,
  sort_order: 0,
  item_name: '面料A',
  spec: '100%棉',
  unit: '米',
  unit_price: 10,
  qty: 500,
  amount: 5000,
});

const makeRepo = () => ({
  findOne: jest.fn().mockResolvedValue(null),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
  create: jest.fn().mockImplementation((v) => v),
  find: jest.fn().mockResolvedValue([]),
});

describe('PortalService', () => {
  let service: PortalService;
  let contractRepo: any;
  let materialRepo: any;
  let logRepo: any;

  beforeEach(async () => {
    contractRepo = makeRepo();
    materialRepo = makeRepo();
    logRepo = makeRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalService,
        { provide: getRepositoryToken(Contract), useValue: contractRepo },
        { provide: getRepositoryToken(ContractMaterial), useValue: materialRepo },
        { provide: getRepositoryToken(ContractPortalLog), useValue: logRepo },
        { provide: getRepositoryToken(OrderMain), useValue: makeRepo() },
        { provide: getRepositoryToken(OrderMaterial), useValue: makeRepo() },
        { provide: getRepositoryToken(OrderSizeMatrix), useValue: makeRepo() },
      ],
    }).compile();

    service = module.get<PortalService>(PortalService);
  });

  // UT-PORTAL-01: getContracts returns paginated list for supplier factory
  it('UT-PORTAL-01 getContracts returns list for supplier factory', async () => {
    const contracts = [makeContract()];
    contractRepo.findAndCount.mockResolvedValue([contracts, 1]);
    const result = await service.getContracts(10, 1, 20);
    expect(result.total).toBe(1);
    expect(result.items).toEqual(contracts);
  });

  // UT-PORTAL-02: getContracts filters by portal_status when provided
  it('UT-PORTAL-02 getContracts filters by portal_status', async () => {
    contractRepo.findAndCount.mockResolvedValue([[], 0]);
    await service.getContracts(10, 1, 20, 'STAMPED');
    const call = contractRepo.findAndCount.mock.calls[0][0];
    expect(call.where).toMatchObject({ portal_status: 'STAMPED' });
  });

  // UT-PORTAL-03: getContract returns contract with materials and logs
  it('UT-PORTAL-03 getContract returns contract with materials and logs', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.PUSHED });
    const material = makeMaterial();
    contractRepo.findOne.mockResolvedValue(contract);
    materialRepo.find.mockResolvedValue([material]);
    logRepo.find.mockResolvedValue([]);

    const result = await service.getContract(1, 10);
    expect(result.contract_no).toBe('HT-20240101-001');
    expect(result.materials).toHaveLength(1);
    expect(result.logs).toHaveLength(0);
  });

  // UT-PORTAL-04: getContract throws NotFoundException for wrong factory
  it('UT-PORTAL-04 getContract throws NotFoundException for wrong factory', async () => {
    contractRepo.findOne.mockResolvedValue(null);
    await expect(service.getContract(1, 99)).rejects.toThrow(NotFoundException);
  });

  // UT-PORTAL-05: getContract throws NotFoundException for DRAFT contract
  it('UT-PORTAL-05 getContract hides DRAFT contracts from supplier', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.DRAFT });
    contractRepo.findOne.mockResolvedValue(contract);
    await expect(service.getContract(1, 10)).rejects.toThrow(NotFoundException);
  });

  // UT-PORTAL-06: stamp transitions PUSHED → STAMPED and locks snapshot
  it('UT-PORTAL-06 stamp transitions PUSHED→STAMPED and creates snapshot', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.PUSHED });
    const material = makeMaterial();
    contractRepo.findOne.mockResolvedValue(contract);
    materialRepo.find.mockResolvedValue([material]);
    contractRepo.save.mockResolvedValue({ ...contract, portal_status: ContractPortalStatus.STAMPED });

    const result = await service.stamp(1, 'supplier_A', 10);
    expect(result.portal_status).toBe(ContractPortalStatus.STAMPED);
    expect((contract as any).snapshot_json).toMatchObject({
      contract_no: 'HT-20240101-001',
      materials: [expect.objectContaining({ item_name: '面料A' })],
    });
    expect(logRepo.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'STAMP' }));
  });

  // UT-PORTAL-07: stamp throws if contract is not PUSHED
  it('UT-PORTAL-07 stamp throws BadRequestException if status is not PUSHED', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.STAMPED });
    contractRepo.findOne.mockResolvedValue(contract);
    await expect(service.stamp(1, 'supplier_A', 10)).rejects.toThrow(BadRequestException);
  });

  // UT-PORTAL-08: stamp throws NotFoundException for wrong factory
  it('UT-PORTAL-08 stamp throws NotFoundException for wrong factory_id', async () => {
    contractRepo.findOne.mockResolvedValue(null);
    await expect(service.stamp(1, 'supplier_A', 99)).rejects.toThrow(NotFoundException);
  });

  // UT-PORTAL-09: confirmShipping transitions STAMPED → SHIPPING
  it('UT-PORTAL-09 confirmShipping transitions STAMPED→SHIPPING', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.STAMPED });
    contractRepo.findOne.mockResolvedValue(contract);
    contractRepo.save.mockResolvedValue({ ...contract, portal_status: ContractPortalStatus.SHIPPING });

    const result = await service.confirmShipping(1, 'supplier_A', 10);
    expect(result.portal_status).toBe(ContractPortalStatus.SHIPPING);
    expect(logRepo.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'SHIP' }));
  });

  // UT-PORTAL-10: confirmShipping throws if not STAMPED
  it('UT-PORTAL-10 confirmShipping throws BadRequestException if not STAMPED', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.PUSHED });
    contractRepo.findOne.mockResolvedValue(contract);
    await expect(service.confirmShipping(1, 'supplier_A', 10)).rejects.toThrow(BadRequestException);
  });

  // UT-PORTAL-11: uploadInvoice logs INVOICE action only after 对账（RECONCILED）
  it('UT-PORTAL-11 uploadInvoice logs INVOICE action during RECONCILED', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.RECONCILED });
    contractRepo.findOne.mockResolvedValue(contract);

    await service.uploadInvoice(1, 'supplier_A', 10, { invoice_no: 'INV-001', invoice_amount: 5000 });
    expect(logRepo.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'INVOICE' }));
  });

  // UT-PORTAL-12: uploadInvoice throws before 对账（开票须对账后）—— SHIPPING 尚不可开票
  it('UT-PORTAL-12 uploadInvoice throws BadRequestException before 对账 (SHIPPING)', async () => {
    const contract = makeContract({ portal_status: ContractPortalStatus.SHIPPING });
    contractRepo.findOne.mockResolvedValue(contract);
    await expect(service.uploadInvoice(1, 'supplier_A', 10, {})).rejects.toThrow(BadRequestException);
  });
});
