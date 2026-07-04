-- I9 服装制造管理系统 数据库 DDL
-- 字符集: utf8mb4  排序规则: utf8mb4_unicode_ci
-- 所有金额字段: DECIMAL(15,4)  时间字段: DATETIME

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 系统用户（内部员工）
-- ============================================================
CREATE TABLE IF NOT EXISTS `sys_user` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `username`     VARCHAR(50)  NOT NULL COMMENT '登录用户名',
  `password`     VARCHAR(255) NOT NULL COMMENT '密码(bcrypt)',
  `real_name`    VARCHAR(50)  NOT NULL COMMENT '真实姓名',
  `role`         ENUM('ADMIN','BUSINESS','FINANCE','PATTERNMAKER') NOT NULL DEFAULT 'BUSINESS',
  `status`       TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统用户';

-- 默认账号（密码均为 Admin@123，bcrypt）— admin 及各角色测试账号
INSERT IGNORE INTO `sys_user` (`id`,`username`,`password`,`real_name`,`role`) VALUES
(1,'admin','$2a$10$Y.NI2Bzr5gof2tpDSJsJ8exF2z2wuzkoqShu822RgpuJlrNC/GW5i','系统管理员','ADMIN'),
(2,'business_user','$2a$10$Y.NI2Bzr5gof2tpDSJsJ8exF2z2wuzkoqShu822RgpuJlrNC/GW5i','业务测试','BUSINESS'),
(3,'finance_user','$2a$10$Y.NI2Bzr5gof2tpDSJsJ8exF2z2wuzkoqShu822RgpuJlrNC/GW5i','财务测试','FINANCE'),
(4,'pm_user','$2a$10$Y.NI2Bzr5gof2tpDSJsJ8exF2z2wuzkoqShu822RgpuJlrNC/GW5i','版师测试','PATTERNMAKER');

-- ============================================================
-- 供应商门户账号
-- ============================================================
CREATE TABLE IF NOT EXISTS `supplier_account` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `account`       VARCHAR(50)  NOT NULL COMMENT '登录账号',
  `password`      VARCHAR(255) NOT NULL COMMENT '密码(bcrypt)',
  `factory_id`    BIGINT       NOT NULL COMMENT '关联工厂',
  `status`        TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=禁用',
  `last_login_at` DATETIME     DEFAULT NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_account` (`account`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供应商门户账号';

-- ============================================================
-- 工厂主档
-- ============================================================
CREATE TABLE IF NOT EXISTS `factory` (
  `id`             BIGINT        NOT NULL AUTO_INCREMENT,
  `factory_no`     VARCHAR(20)   NOT NULL COMMENT '厂商编号 S001（自动生成/大写/唯一）',
  `type`           ENUM('FABRIC','ACCESSORY','OUTSOURCE','FORWARDER','TESTING','EXPORT','OTHER') NOT NULL DEFAULT 'FABRIC' COMMENT '工厂类型',
  `can_invoice`    TINYINT       NOT NULL DEFAULT 1 COMMENT '能否开票 1=是 0=否',
  `name`           VARCHAR(100)  NOT NULL COMMENT '厂商名称（唯一）',
  `short_name`     VARCHAR(50)   DEFAULT NULL COMMENT '简称',
  `contact_name`   VARCHAR(50)   DEFAULT NULL COMMENT '主联系人（自动取子表首行）',
  `contact_phone`  VARCHAR(30)   DEFAULT NULL COMMENT '主联系电话（自动取子表首行）',
  `province`       VARCHAR(30)   DEFAULT NULL COMMENT '所在省份',
  `city`           VARCHAR(30)   DEFAULT NULL COMMENT '所在城市',
  `address`        VARCHAR(200)  DEFAULT NULL COMMENT '详细地址',
  `business_scope` VARCHAR(200)  DEFAULT NULL COMMENT '业务范围',
  `develop_date`   DATE          DEFAULT NULL COMMENT '开发时间',
  `bank_name`      VARCHAR(100)  DEFAULT NULL COMMENT '开户银行',
  `bank_account`   VARCHAR(40)   DEFAULT NULL COMMENT '银行帐号',
  `tax_no`         VARCHAR(30)   DEFAULT NULL COMMENT '公司税号',
  `invoice_phone`  VARCHAR(30)   DEFAULT NULL COMMENT '开票电话',
  `invoice_address` VARCHAR(200) DEFAULT NULL COMMENT '开票地址',
  `bank_name2`     VARCHAR(100)  DEFAULT NULL COMMENT '开户银行(2)',
  `bank_account2`  VARCHAR(40)   DEFAULT NULL COMMENT '银行帐号(2)',
  `tax_no2`        VARCHAR(30)   DEFAULT NULL COMMENT '公司税号(2)',
  `invoice_phone2` VARCHAR(30)   DEFAULT NULL COMMENT '开票电话(2)',
  `invoice_address2` VARCHAR(200) DEFAULT NULL COMMENT '开票地址(2)',
  `legal_rep`      VARCHAR(50)   DEFAULT NULL COMMENT '法人代表',
  `registered_capital` BIGINT    DEFAULT NULL COMMENT '注册资金',
  `established_date` DATE        DEFAULT NULL COMMENT '设立时间',
  `annual_sales`   DECIMAL(16,2) DEFAULT NULL COMMENT '年销售额',
  `representative_customers` VARCHAR(200) DEFAULT NULL COMMENT '代表客户',
  `quality_certs`  TEXT          DEFAULT NULL COMMENT '质量证书',
  `remark`         TEXT          DEFAULT NULL COMMENT '备注',
  `last_trade_date` DATE         DEFAULT NULL COMMENT '最后交易日期（列表超期标红）',
  `status`         TINYINT       NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
  `created_by`     BIGINT        DEFAULT NULL,
  `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted`        TINYINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_factory_no` (`factory_no`),
  KEY `idx_type` (`type`),
  KEY `idx_status` (`status`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工厂/厂商主档';

-- 工厂·联系人明细
CREATE TABLE IF NOT EXISTS `factory_contact` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `factory_id`  BIGINT       NOT NULL,
  `sort_order`  INT          NOT NULL DEFAULT 0,
  `name`        VARCHAR(50)  DEFAULT NULL COMMENT '姓名',
  `department`  VARCHAR(50)  DEFAULT NULL COMMENT '部门',
  `title`       VARCHAR(50)  DEFAULT NULL COMMENT '职务',
  `phone`       VARCHAR(30)  DEFAULT NULL COMMENT '电话号码',
  `mobile`      VARCHAR(30)  DEFAULT NULL COMMENT '手机号码',
  `email`       VARCHAR(100) DEFAULT NULL COMMENT '电子邮件',
  `remark`      VARCHAR(200) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`id`),
  KEY `idx_factory` (`factory_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工厂联系人明细';

-- 门户测试用：工厂 + 供应商门户账号（账号 supplier1 / 密码 Admin@123）
INSERT IGNORE INTO `factory` (`id`,`factory_no`,`name`,`type`,`status`,`contact_name`,`contact_phone`) VALUES
(1,'S001','门户测试工厂','FABRIC',1,'张建国','13901588888');
INSERT IGNORE INTO `factory_contact` (`id`,`factory_id`,`sort_order`,`name`,`department`,`title`,`mobile`) VALUES
(1,1,0,'张建国','销售部','销售经理','13901588888');
INSERT IGNORE INTO `supplier_account` (`id`,`account`,`password`,`factory_id`,`status`) VALUES
(1,'supplier1','$2a$10$Y.NI2Bzr5gof2tpDSJsJ8exF2z2wuzkoqShu822RgpuJlrNC/GW5i',1,1);

-- ============================================================
-- 客户主档
-- ============================================================
CREATE TABLE IF NOT EXISTS `customer` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `customer_no`     VARCHAR(20)   NOT NULL COMMENT '客户编号 CN001（自动生成/唯一）',
  `name`            VARCHAR(100)  NOT NULL COMMENT '客户名称（唯一）',
  `short_name`      VARCHAR(50)   DEFAULT NULL,
  `type`            ENUM('MIDDLEMAN','BUYER') NOT NULL DEFAULT 'MIDDLEMAN' COMMENT '客户类型 中间商/最终买家',
  `related_middleman` VARCHAR(200) DEFAULT NULL COMMENT '关联中间商（买家必填，中间商ID逗号串）',
  `trade_country`   VARCHAR(50)   DEFAULT NULL COMMENT '贸易国别',
  `country_region`  VARCHAR(50)   DEFAULT NULL COMMENT '国家区域（随贸易国别带出）',
  `city`            VARCHAR(50)   DEFAULT NULL COMMENT '所在城市',
  `homepage`        VARCHAR(200)  DEFAULT NULL COMMENT '公司主页',
  `address`         VARCHAR(200)  DEFAULT NULL COMMENT '详细地址',
  `price_terms`     VARCHAR(50)   DEFAULT NULL COMMENT '价格条款',
  `settlement_method` VARCHAR(50) DEFAULT NULL COMMENT '结汇方式',
  `grade`           ENUM('A','B','C') DEFAULT NULL COMMENT '信用等级',
  `cooperation_level` VARCHAR(20) DEFAULT NULL COMMENT '合作等级',
  `customer_source` VARCHAR(50)   DEFAULT NULL COMMENT '客户来源',
  `payment_days`    INT           DEFAULT NULL COMMENT '付款期限（天）',
  `business_scope`  VARCHAR(200)  DEFAULT NULL COMMENT '业务范围',
  `salesperson`     VARCHAR(50)   DEFAULT NULL COMMENT '外销员',
  `develop_date`    DATE          DEFAULT NULL COMMENT '开发时间',
  `spare1`          VARCHAR(100)  DEFAULT NULL COMMENT '备用字段1',
  `spare2`          VARCHAR(100)  DEFAULT NULL COMMENT '备用字段2',
  `spare3`          VARCHAR(100)  DEFAULT NULL COMMENT '备用字段3',
  `delivery_address` TEXT         DEFAULT NULL COMMENT '收货地址',
  `front_mark`      TEXT          DEFAULT NULL COMMENT '正面唛头',
  `side_mark`       TEXT          DEFAULT NULL COMMENT '侧面唛头',
  `inner_box_text`  TEXT          DEFAULT NULL COMMENT '内盒文字',
  `customer_remark` TEXT          DEFAULT NULL COMMENT '客户备注',
  `currency`        VARCHAR(5)    NOT NULL DEFAULT 'USD' COMMENT '主结算币种',
  `status`          TINYINT       NOT NULL DEFAULT 1,
  `remark`          TEXT          DEFAULT NULL,
  `created_by`      BIGINT        DEFAULT NULL,
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted`         TINYINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_customer_no` (`customer_no`),
  KEY `idx_type` (`type`),
  KEY `idx_grade` (`grade`),
  KEY `idx_status` (`status`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户主档（机密单据）';

-- 客户·联系人明细（10 列）
CREATE TABLE IF NOT EXISTS `customer_contact` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `customer_id` BIGINT       NOT NULL,
  `sort_order`  INT          NOT NULL DEFAULT 0,
  `name`        VARCHAR(50)  DEFAULT NULL,
  `department`  VARCHAR(50)  DEFAULT NULL,
  `gender`      VARCHAR(2)   DEFAULT NULL COMMENT 'M/F',
  `title`       VARCHAR(50)  DEFAULT NULL,
  `phone`       VARCHAR(30)  DEFAULT NULL,
  `mobile`      VARCHAR(30)  DEFAULT NULL,
  `mobile1`     VARCHAR(30)  DEFAULT NULL,
  `mobile2`     VARCHAR(30)  DEFAULT NULL,
  `email`       VARCHAR(100) DEFAULT NULL,
  `remark`      VARCHAR(200) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户联系人明细';

-- 客户·开户银行明细（7 列）
CREATE TABLE IF NOT EXISTS `customer_bank` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `customer_id`  BIGINT       NOT NULL,
  `sort_order`   INT          NOT NULL DEFAULT 0,
  `account_name` VARCHAR(100) DEFAULT NULL COMMENT '开户名称（自动=客户名称）',
  `bank_name`    VARCHAR(100) DEFAULT NULL,
  `bank_account` VARCHAR(40)  DEFAULT NULL,
  `bank_address` VARCHAR(200) DEFAULT NULL,
  `currency`     VARCHAR(20)  DEFAULT NULL,
  `swift_code`   VARCHAR(20)  DEFAULT NULL,
  `remark`       VARCHAR(200) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户开户银行明细';

-- 客户·快件帐号明细（4 列）
CREATE TABLE IF NOT EXISTS `customer_express` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `customer_id` BIGINT       NOT NULL,
  `sort_order`  INT          NOT NULL DEFAULT 0,
  `company`     VARCHAR(100) DEFAULT NULL COMMENT '快件公司（来自工厂资料）',
  `account`     VARCHAR(50)  DEFAULT NULL,
  `pay_method`  VARCHAR(10)  DEFAULT NULL COMMENT '到付/预付',
  `remark`      VARCHAR(200) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户快件帐号明细';

-- ============================================================
-- 样衣管理
-- ============================================================
CREATE TABLE IF NOT EXISTS `sample_garment` (
  `id`               BIGINT        NOT NULL AUTO_INCREMENT,
  `sample_no`        VARCHAR(20)   NOT NULL COMMENT 'S-YYYYMMDD-001',
  `customer_id`      BIGINT        NOT NULL,
  `style_name`       VARCHAR(100)  NOT NULL COMMENT '款式名称',
  `season`           VARCHAR(20)   DEFAULT NULL COMMENT '季节',
  `category`         VARCHAR(50)   DEFAULT NULL COMMENT '品类',
  `process_req`      TEXT          DEFAULT NULL COMMENT '工艺要求',
  `patternmaker_id`  BIGINT        DEFAULT NULL COMMENT '指派版师',
  `version`          INT           NOT NULL DEFAULT 1 COMMENT '当前版次',
  `status`           ENUM('PENDING','PATTERN','DONE','CONFIRMED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `reject_reason`    TEXT          DEFAULT NULL COMMENT '最近一次驳回原因',
  `confirmed_at`     DATETIME      DEFAULT NULL,
  `created_by`       BIGINT        NOT NULL,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted`          TINYINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sample_no` (`sample_no`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_patternmaker` (`patternmaker_id`),
  KEY `idx_status` (`status`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='样衣管理';

CREATE TABLE IF NOT EXISTS `sample_version` (
  `id`           BIGINT    NOT NULL AUTO_INCREMENT,
  `sample_id`    BIGINT    NOT NULL,
  `version`      INT       NOT NULL COMMENT '版次号',
  `action`       ENUM('SUBMIT','REJECT','CONFIRM') NOT NULL,
  `operator_id`  BIGINT    NOT NULL COMMENT '操作人',
  `remark`       TEXT      DEFAULT NULL COMMENT '驳回原因/备注',
  `attachments`  JSON      DEFAULT NULL COMMENT '附件路径列表',
  `created_at`   DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sample_version` (`sample_id`,`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='样衣版次历史';

-- ============================================================
-- 客户报价
-- ============================================================
CREATE TABLE IF NOT EXISTS `quotation` (
  `id`               BIGINT         NOT NULL AUTO_INCREMENT,
  `quote_no`         VARCHAR(20)    NOT NULL COMMENT 'Q-YYYYMMDD-001',
  `customer_id`      BIGINT         NOT NULL,
  `sample_id`        BIGINT         DEFAULT NULL COMMENT '关联样衣（可选）',
  `style_name`       VARCHAR(100)   DEFAULT NULL,
  `global_loss_rate` DECIMAL(5,2)   NOT NULL DEFAULT 0.00 COMMENT '全局损耗率%',
  `unit_price`       DECIMAL(15,4)  DEFAULT NULL COMMENT '最终单件报价',
  `currency`         VARCHAR(5)     NOT NULL DEFAULT 'USD',
  `gross_margin`     DECIMAL(5,2)   DEFAULT NULL COMMENT '目标毛利率%',
  `total_qty`        INT            DEFAULT NULL COMMENT '总件数',
  `total_amount`     DECIMAL(15,4)  DEFAULT NULL COMMENT '总金额',
  `status`           ENUM('DRAFT','SENT','CONFIRMED','TO_CONTRACT') NOT NULL DEFAULT 'DRAFT',
  `sent_at`          DATETIME       DEFAULT NULL,
  `confirmed_at`     DATETIME       DEFAULT NULL,
  `remark`           TEXT           DEFAULT NULL,
  `created_by`       BIGINT         NOT NULL,
  `created_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted`          TINYINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_quote_no` (`quote_no`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_status` (`status`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户报价';

CREATE TABLE IF NOT EXISTS `quotation_item` (
  `id`             BIGINT         NOT NULL AUTO_INCREMENT,
  `quote_id`       BIGINT         NOT NULL,
  `sort_order`     INT            NOT NULL DEFAULT 0,
  `item_name`      VARCHAR(100)   NOT NULL COMMENT '费用项目',
  `unit`           VARCHAR(20)    DEFAULT NULL COMMENT '单位',
  `usage_qty`      DECIMAL(15,4)  DEFAULT NULL COMMENT '净用量',
  `unit_price`     DECIMAL(15,4)  DEFAULT NULL COMMENT '原单价',
  `loss_rate`      DECIMAL(5,2)   NOT NULL DEFAULT 0.00 COMMENT '损耗率%',
  `loss_price`     DECIMAL(15,4)  DEFAULT NULL COMMENT '含损单价=原价÷(1-损耗率%)',
  `total_usage`    DECIMAL(15,4)  DEFAULT NULL COMMENT '含损总用量',
  `subtotal`       DECIMAL(15,4)  DEFAULT NULL COMMENT '小计',
  `created_at`     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_quote` (`quote_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='报价费用明细';

-- ============================================================
-- 订单管理
-- ============================================================
CREATE TABLE IF NOT EXISTS `order_main` (
  `id`             BIGINT        NOT NULL AUTO_INCREMENT,
  `order_no`       VARCHAR(20)   NOT NULL COMMENT 'O-YYYYMMDD-001',
  `customer_po`    VARCHAR(50)   DEFAULT NULL COMMENT '客户PO号',
  `customer_id`    BIGINT        NOT NULL,
  `quote_id`       BIGINT        DEFAULT NULL COMMENT '关联报价',
  `style_name`     VARCHAR(100)  DEFAULT NULL,
  `delivery_date`  DATE          DEFAULT NULL COMMENT '交货期',
  `qty_total`      INT           NOT NULL DEFAULT 0 COMMENT '总件数',
  `currency`       VARCHAR(5)    NOT NULL DEFAULT 'USD',
  `unit_price`     DECIMAL(15,4) DEFAULT NULL COMMENT '客户单价',
  `total_amount`   DECIMAL(15,4) DEFAULT NULL COMMENT '总金额',
  `status`         ENUM('DRAFT','CONFIRMED','PRODUCING','SHIPPED','DONE') NOT NULL DEFAULT 'DRAFT',
  `remark`         TEXT          DEFAULT NULL,
  `created_by`     BIGINT        NOT NULL,
  `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted`        TINYINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_status` (`status`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单主表';

CREATE TABLE IF NOT EXISTS `order_size_matrix` (
  `id`          BIGINT   NOT NULL AUTO_INCREMENT,
  `order_id`    BIGINT   NOT NULL,
  `matrix_data` JSON     NOT NULL COMMENT '颜色×尺码矩阵 {colors:[],sizes:[],cells:{}}',
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单尺码搭配矩阵';

CREATE TABLE IF NOT EXISTS `order_material` (
  `id`             BIGINT         NOT NULL AUTO_INCREMENT,
  `order_id`       BIGINT         NOT NULL,
  `quote_item_id`  BIGINT         DEFAULT NULL COMMENT '来源报价费用项',
  `item_name`      VARCHAR(100)   NOT NULL,
  `unit`           VARCHAR(20)    DEFAULT NULL,
  `net_usage`      DECIMAL(15,4)  DEFAULT NULL COMMENT '净用量/件',
  `loss_rate`      DECIMAL(5,2)   NOT NULL DEFAULT 0.00 COMMENT '损耗率%',
  `loss_usage`     DECIMAL(15,4)  DEFAULT NULL COMMENT '含损用量/件',
  `qty`            INT            DEFAULT NULL COMMENT '件数',
  `total_purchase` DECIMAL(15,4)  DEFAULT NULL COMMENT '总采购量',
  `unit_price`     DECIMAL(15,4)  DEFAULT NULL COMMENT '采购单价',
  `budget`         DECIMAL(15,4)  DEFAULT NULL COMMENT '预算金额',
  `sort_order`     INT            NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单用料核算';

CREATE TABLE IF NOT EXISTS `order_shipment` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `order_id`        BIGINT        NOT NULL,
  `shipment_date`   DATE          NOT NULL COMMENT '发货日期',
  `qty`             INT           NOT NULL COMMENT '发货件数',
  `cartons`         INT           DEFAULT NULL COMMENT '箱数',
  `tracking_no`     VARCHAR(100)  DEFAULT NULL COMMENT '快递/提单号',
  `remark`          TEXT          DEFAULT NULL,
  `created_by`      BIGINT        NOT NULL,
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单出货记录';

-- ============================================================
-- 合同管理
-- ============================================================
CREATE TABLE IF NOT EXISTS `contract` (
  `id`                  BIGINT         NOT NULL AUTO_INCREMENT,
  `contract_no`         VARCHAR(20)    NOT NULL COMMENT 'HT-YYYYMMDD-001',
  `type`                ENUM('MATERIAL','PROCESS','SUPPLEMENT') NOT NULL COMMENT '合同类型',
  `parent_id`           BIGINT         DEFAULT NULL COMMENT '补料合同的父合同',
  `factory_id`          BIGINT         NOT NULL,
  `order_id`            BIGINT         NOT NULL,
  `total_amount`        DECIMAL(15,4)  NOT NULL COMMENT '合同总金额',
  `currency`            VARCHAR(5)     NOT NULL DEFAULT 'CNY',
  `deposit_ratio`       DECIMAL(5,2)   NOT NULL DEFAULT 30.00 COMMENT '定金比例%',
  `mid_ratio`           DECIMAL(5,2)   NOT NULL DEFAULT 40.00 COMMENT '中期款比例%',
  `final_ratio`         DECIMAL(5,2)   NOT NULL DEFAULT 30.00 COMMENT '尾款比例%',
  `last_ship_date`      DATE           DEFAULT NULL COMMENT '最后发货日',
  `account_period_days` INT            NOT NULL DEFAULT 45 COMMENT '账期天数',
  `due_date`            DATE           DEFAULT NULL COMMENT '账期截止日',
  `portal_status`       ENUM('DRAFT','PUSHED','STAMPED','SHIPPING','RECONCILED') NOT NULL DEFAULT 'DRAFT',
  `pushed_at`           DATETIME       DEFAULT NULL COMMENT '推送门户时间',
  `stamped_at`          DATETIME       DEFAULT NULL COMMENT '供应商盖章时间',
  `stamped_by_supplier` VARCHAR(100)   DEFAULT NULL COMMENT '盖章供应商账号',
  `snapshot_json`       JSON           DEFAULT NULL COMMENT '盖章时快照数据',
  `status`              ENUM('ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  `remark`              TEXT           DEFAULT NULL,
  `created_by`          BIGINT         NOT NULL,
  `created_at`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted`             TINYINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_contract_no` (`contract_no`),
  KEY `idx_factory` (`factory_id`),
  KEY `idx_order` (`order_id`),
  KEY `idx_portal_status` (`portal_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同主表';

CREATE TABLE IF NOT EXISTS `contract_material` (
  `id`           BIGINT         NOT NULL AUTO_INCREMENT,
  `contract_id`  BIGINT         NOT NULL,
  `sort_order`   INT            NOT NULL DEFAULT 0,
  `item_name`    VARCHAR(100)   NOT NULL COMMENT '材料名称',
  `spec`         VARCHAR(100)   DEFAULT NULL COMMENT '规格型号',
  `unit`         VARCHAR(20)    DEFAULT NULL COMMENT '单位',
  `unit_price`   DECIMAL(15,4)  NOT NULL COMMENT '单价',
  `qty`          DECIMAL(15,4)  NOT NULL COMMENT '数量',
  `amount`       DECIMAL(15,4)  NOT NULL COMMENT '金额=单价×数量',
  `remark`       VARCHAR(200)   DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_contract` (`contract_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同材料明细（盖章前可改，盖章后冻结）';

CREATE TABLE IF NOT EXISTS `contract_portal_log` (
  `id`           BIGINT        NOT NULL AUTO_INCREMENT,
  `contract_id`  BIGINT        NOT NULL,
  `action`       VARCHAR(50)   NOT NULL COMMENT 'PUSH/STAMP/SHIP/RECONCILE/INVOICE',
  `operator`     VARCHAR(100)  NOT NULL COMMENT '操作人（账号）',
  `operator_type` ENUM('INTERNAL','SUPPLIER') NOT NULL DEFAULT 'INTERNAL',
  `remark`       TEXT          DEFAULT NULL,
  `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_contract` (`contract_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同门户操作日志';

-- ============================================================
-- 对账单
-- ============================================================
CREATE TABLE IF NOT EXISTS `reconciliation` (
  `id`               BIGINT         NOT NULL AUTO_INCREMENT,
  `reconcile_no`     VARCHAR(30)    NOT NULL COMMENT 'DZ-YYYYMMDD-001 或 DZ-NC-YYYYMMDD-001',
  `type`             ENUM('CONTRACT','NO_CONTRACT') NOT NULL DEFAULT 'CONTRACT',
  `contract_id`      BIGINT         DEFAULT NULL COMMENT '有合同时关联',
  `factory_id`       BIGINT         NOT NULL,
  `total_amount`     DECIMAL(15,4)  NOT NULL COMMENT '对账金额',
  `tax_rate`         DECIMAL(5,2)   DEFAULT NULL COMMENT '税率%',
  `tax_amount`       DECIMAL(15,4)  DEFAULT NULL COMMENT '税额',
  `invoice_no`       VARCHAR(100)   DEFAULT NULL COMMENT '发票号',
  `invoice_amount`   DECIMAL(15,4)  DEFAULT NULL COMMENT '发票金额',
  `invoice_diff`     DECIMAL(15,4)  DEFAULT NULL COMMENT '发票与对账差额',
  `invoice_url`      VARCHAR(500)   DEFAULT NULL COMMENT '发票文件路径',
  `has_invoice`      TINYINT        NOT NULL DEFAULT 0 COMMENT '1=有票 0=无票',
  `status`           ENUM('DRAFT','CONFIRMED','PAID') NOT NULL DEFAULT 'DRAFT',
  `confirmed_at`     DATETIME       DEFAULT NULL,
  `description`      TEXT           DEFAULT NULL COMMENT '无合同费用说明',
  `created_by`       BIGINT         NOT NULL,
  `created_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted`          TINYINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reconcile_no` (`reconcile_no`),
  KEY `idx_contract` (`contract_id`),
  KEY `idx_factory` (`factory_id`),
  KEY `idx_status` (`status`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='对账单';

CREATE TABLE IF NOT EXISTS `reconciliation_shipment` (
  `id`                 BIGINT         NOT NULL AUTO_INCREMENT,
  `reconcile_id`       BIGINT         NOT NULL,
  `shipment_id`        BIGINT         NOT NULL COMMENT '关联出货记录',
  `item_name`          VARCHAR(100)   NOT NULL COMMENT '材料名（快照）',
  `snapshot_unit_price` DECIMAL(15,4) NOT NULL COMMENT '盖章时快照单价',
  `qty`                DECIMAL(15,4)  NOT NULL,
  `amount`             DECIMAL(15,4)  NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_reconcile` (`reconcile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='对账单发货明细（含快照单价）';

-- ============================================================
-- 预付款
-- ============================================================
CREATE TABLE IF NOT EXISTS `prepayment` (
  `id`             BIGINT        NOT NULL AUTO_INCREMENT,
  `factory_id`     BIGINT        NOT NULL,
  `contract_id`    BIGINT        DEFAULT NULL,
  `amount`         DECIMAL(15,4) NOT NULL COMMENT '预付款金额',
  `used_amount`    DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '已冲抵金额',
  `balance`        DECIMAL(15,4) NOT NULL COMMENT '余额（冗余字段）',
  `pay_date`       DATE          NOT NULL,
  `remark`         TEXT          DEFAULT NULL,
  `created_by`     BIGINT        NOT NULL,
  `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_factory` (`factory_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预付款';

-- ============================================================
-- 付款申请
-- ============================================================
CREATE TABLE IF NOT EXISTS `payment_request` (
  `id`                BIGINT         NOT NULL AUTO_INCREMENT,
  `pr_no`             VARCHAR(30)    NOT NULL COMMENT 'PR-YYYYMMDD-001 或 PR-NC-YYYYMMDD-001',
  `type`              ENUM('CONTRACT','NO_CONTRACT') NOT NULL DEFAULT 'CONTRACT',
  `reconcile_id`      BIGINT         DEFAULT NULL COMMENT '有合同时关联对账单',
  `factory_id`        BIGINT         NOT NULL,
  `amount`            DECIMAL(15,4)  NOT NULL COMMENT '申请付款金额',
  `prepay_offset`     DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '预付款冲抵金额',
  `actual_pay`        DECIMAL(15,4)  DEFAULT NULL COMMENT '实付金额=amount-prepay_offset',
  `slip_url`          VARCHAR(500)   DEFAULT NULL COMMENT '水单文件路径',
  `paid_by`           BIGINT         DEFAULT NULL COMMENT '标记付款操作人',
  `slip_uploaded_at`  DATETIME       DEFAULT NULL,
  `approval_status`   ENUM('DRAFT','PENDING','APPROVED','REJECTED','PAID') NOT NULL DEFAULT 'DRAFT',
  `submitted_by`      BIGINT         DEFAULT NULL,
  `submitted_at`      DATETIME       DEFAULT NULL,
  `approved_by`       BIGINT         DEFAULT NULL,
  `approved_at`       DATETIME       DEFAULT NULL,
  `reject_reason`     TEXT           DEFAULT NULL,
  `description`       TEXT           DEFAULT NULL COMMENT '无合同费用说明',
  `created_by`        BIGINT         NOT NULL,
  `created_at`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted`           TINYINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pr_no` (`pr_no`),
  KEY `idx_reconcile` (`reconcile_id`),
  KEY `idx_factory` (`factory_id`),
  KEY `idx_approval_status` (`approval_status`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='付款申请';

-- ============================================================
-- 结算清单
-- ============================================================
CREATE TABLE IF NOT EXISTS `settlement` (
  `id`                   BIGINT         NOT NULL AUTO_INCREMENT,
  `settlement_no`        VARCHAR(30)    NOT NULL COMMENT '结算单号 JS-YYYYMMDD-001',
  `order_id`             BIGINT         NOT NULL,
  `shipped_qty`          INT            NOT NULL DEFAULT 0 COMMENT '出货件数(汇总自 order_shipment)',
  `currency`             VARCHAR(5)     NOT NULL DEFAULT 'CNY',
  `exchange_rate`        DECIMAL(10,4)  DEFAULT NULL COMMENT '汇率快照(外币结算时)',
  `status`               ENUM('DRAFT','CONFIRMED') NOT NULL DEFAULT 'DRAFT',
  `revenue`              DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '总货款',
  `total_cost`           DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '总成本',
  `cost_per_unit`        DECIMAL(15,4)  DEFAULT NULL COMMENT '成本单价=总成本÷出货件数',
  `gross_profit`         DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '毛利=货款-成本',
  `gross_margin`         DECIMAL(5,2)   DEFAULT NULL COMMENT '毛利率%',
  `tax_refund`           DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '退税金额',
  `net_profit`           DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '净利(含退税)=毛利+退税',
  `net_profit_ex_refund` DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '净利(不含退税)=毛利',
  `description`          VARCHAR(255)   DEFAULT NULL,
  `created_by`           BIGINT         DEFAULT NULL,
  `confirmed_at`         DATETIME       DEFAULT NULL,
  `deleted`              TINYINT        NOT NULL DEFAULT 0,
  `created_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_settlement_no` (`settlement_no`),
  UNIQUE KEY `uk_order` (`order_id`,`deleted`),
  KEY `idx_status` (`status`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='结算清单';

CREATE TABLE IF NOT EXISTS `settlement_cost` (
  `id`              BIGINT         NOT NULL AUTO_INCREMENT,
  `settlement_id`   BIGINT         NOT NULL,
  `cost_name`       VARCHAR(100)   NOT NULL COMMENT '成本项名称',
  `amount`          DECIMAL(15,4)  NOT NULL COMMENT '金额',
  `has_invoice`     TINYINT        NOT NULL DEFAULT 1 COMMENT '1=有票 0=无票',
  `created_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_settlement` (`settlement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='结算成本明细';

CREATE TABLE IF NOT EXISTS `settlement_receipt` (
  `id`             BIGINT        NOT NULL AUTO_INCREMENT,
  `settlement_id`  BIGINT        NOT NULL,
  `amount`         DECIMAL(15,4) NOT NULL COMMENT '收款金额',
  `receipt_date`   DATE          NOT NULL COMMENT '收款日期',
  `remark`         VARCHAR(255)  DEFAULT NULL,
  `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_settlement` (`settlement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='结算收汇记录';

-- ============================================================
-- 系统配置
-- ============================================================
CREATE TABLE IF NOT EXISTS `sys_config` (
  `id`         BIGINT       NOT NULL AUTO_INCREMENT,
  `cfg_key`    VARCHAR(50)  NOT NULL COMMENT '配置键',
  `cfg_value`  VARCHAR(200) NOT NULL COMMENT '配置值',
  `remark`     VARCHAR(200) DEFAULT NULL,
  `updated_by` BIGINT       DEFAULT NULL,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cfg_key` (`cfg_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统配置';

-- 初始配置
INSERT IGNORE INTO `sys_config` (`cfg_key`,`cfg_value`,`remark`) VALUES
('vat_rate',         '13',   '增值税率%（默认13%）'),
('export_refund_rate','13',  '出口退税率%'),
('vat_diff_rate',    '0',    '增值税率差%（用于退税计算）'),
('default_deposit_ratio', '30', '默认定金比例%'),
('default_mid_ratio',     '40', '默认中期款比例%'),
('default_final_ratio',   '30', '默认尾款比例%');

SET FOREIGN_KEY_CHECKS = 1;
