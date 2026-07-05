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
  `sample_no`        VARCHAR(30)   NOT NULL COMMENT 'S-YYYYMMDD-001',
  `categories`       VARCHAR(100)  DEFAULT NULL COMMENT '样衣类别(7类多选,逗号分隔)',
  `customer_id`      BIGINT        NOT NULL COMMENT '中间商客户ID',
  `middleman_name`   VARCHAR(100)  DEFAULT NULL COMMENT '中间商名称(自动)',
  `style_no`         VARCHAR(100)  NOT NULL COMMENT '客户款号(必填)',
  `buyer_id`         BIGINT        DEFAULT NULL COMMENT '关联最终买家',
  `buyer_name`       VARCHAR(100)  DEFAULT NULL,
  `buyer_no`         VARCHAR(30)   DEFAULT NULL COMMENT '买家编号(自动)',
  `patternmaker_id`  BIGINT        DEFAULT NULL COMMENT '制版师',
  `patternmaker_name` VARCHAR(50)  DEFAULT NULL,
  `maker`            VARCHAR(50)   DEFAULT NULL COMMENT '制单人员',
  `make_date`        DATE          DEFAULT NULL COMMENT '制单日期',
  `ship_sample_date` DATE          DEFAULT NULL COMMENT '寄样日期',
  `recipient`        VARCHAR(50)   DEFAULT NULL COMMENT '收件人',
  `file_location`    VARCHAR(200)  DEFAULT NULL COMMENT '文件位置',
  `garment_remark`   TEXT          DEFAULT NULL COMMENT '成衣备注',
  `image1`           VARCHAR(255)  DEFAULT NULL,
  `image2`           VARCHAR(255)  DEFAULT NULL,
  `image3`           VARCHAR(255)  DEFAULT NULL,
  `material_ship_no`   VARCHAR(50)  DEFAULT NULL COMMENT '材料寄出单号(触发推送版师)',
  `material_ship_date` DATE         DEFAULT NULL COMMENT '材料寄出日期(自动)',
  `return_no`        VARCHAR(50)   DEFAULT NULL COMMENT '寄回快递单号(版师)',
  `return_date`      DATE          DEFAULT NULL COMMENT '寄回日期(自动)',
  `piece_count`      INT           DEFAULT NULL COMMENT '件数(版师)',
  `labor_unit_price` DECIMAL(12,2) DEFAULT NULL COMMENT '版师工时单价CNY',
  `labor_amount`     DECIMAL(14,2) DEFAULT NULL COMMENT '工时金额CNY=件数×单价',
  `status`           ENUM('PENDING','SAMPLING','SHIPPED','RETURNED','RECONCILED','DONE','ORDERED') NOT NULL DEFAULT 'PENDING',
  `version`          INT           NOT NULL DEFAULT 1,
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

-- 样衣·材料明细（17 字段）
CREATE TABLE IF NOT EXISTS `sample_material` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT,
  `sample_id`     BIGINT        NOT NULL,
  `sort_order`    INT           NOT NULL DEFAULT 0,
  `arrange_date`  DATE          DEFAULT NULL COMMENT '安排日期',
  `item_name`     VARCHAR(100)  DEFAULT NULL COMMENT '品名',
  `width`         VARCHAR(30)   DEFAULT NULL COMMENT '门幅',
  `colors`        VARCHAR(200)  DEFAULT NULL COMMENT '颜色(动态多列,逗号分隔)',
  `part`          VARCHAR(50)   DEFAULT NULL COMMENT '部位',
  `composition`   VARCHAR(100)  DEFAULT NULL COMMENT '成份',
  `code_band`     VARCHAR(50)   DEFAULT NULL COMMENT '码带',
  `zipper_length` VARCHAR(30)   DEFAULT NULL COMMENT '拉链长度(版师)',
  `puller`        VARCHAR(30)   DEFAULT NULL COMMENT '拉头',
  `qty`           DECIMAL(12,2) DEFAULT NULL COMMENT '数量',
  `size`          VARCHAR(50)   DEFAULT NULL COMMENT '尺寸(长×宽)',
  `ref_price`     DECIMAL(12,2) DEFAULT NULL COMMENT '参考价格',
  `actual_usage`  DECIMAL(12,4) DEFAULT NULL COMMENT '实际耗用(版师)',
  `supplier_id`   BIGINT        DEFAULT NULL COMMENT '供应商编号',
  `supplier_name` VARCHAR(100)  DEFAULT NULL COMMENT '供应商名称(自动)',
  `image`         VARCHAR(255)  DEFAULT NULL,
  `remark`        VARCHAR(200)  DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sample` (`sample_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='样衣材料明细';

CREATE TABLE IF NOT EXISTS `sample_version` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `sample_id`    BIGINT       NOT NULL,
  `version`      INT          NOT NULL COMMENT '版次号',
  `action`       VARCHAR(40)  NOT NULL COMMENT 'PUSH/PATTERNMAKER_SAVE/SHIP/COMPLETE/COPY',
  `operator_id`  BIGINT       NOT NULL COMMENT '操作人',
  `remark`       TEXT         DEFAULT NULL,
  `attachments`  JSON         DEFAULT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sample_version` (`sample_id`,`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='样衣变更记录';

-- ============================================================
-- 客户报价
-- ============================================================
CREATE TABLE IF NOT EXISTS `quotation` (
  `id`               BIGINT         NOT NULL AUTO_INCREMENT,
  `quote_no`         VARCHAR(20)    NOT NULL COMMENT 'Q-YYYYMMDD-001',
  `inquiry_date`     DATE           DEFAULT NULL COMMENT '询价日期',
  `sample_id`        BIGINT         DEFAULT NULL COMMENT '关联样衣',
  `sample_no`        VARCHAR(30)    DEFAULT NULL,
  `customer_id`      BIGINT         NOT NULL COMMENT '中间商客户ID',
  `middleman_name`   VARCHAR(100)   DEFAULT NULL COMMENT '中间商名称(自动)',
  `buyer_id`         BIGINT         DEFAULT NULL COMMENT '最终买家',
  `buyer_name`       VARCHAR(100)   DEFAULT NULL,
  `buyer_no`         VARCHAR(30)    DEFAULT NULL COMMENT '买家编号(自动)',
  `style_no`         VARCHAR(100)   DEFAULT NULL COMMENT '客户款号',
  `middleman_contact` VARCHAR(50)   DEFAULT NULL COMMENT '中间商联系人',
  `settlement_category` VARCHAR(30) DEFAULT NULL COMMENT '结算类别(自动)',
  `currency`         VARCHAR(5)     NOT NULL DEFAULT 'USD' COMMENT '外销币种',
  `exchange_rate`    DECIMAL(12,4)  NOT NULL DEFAULT 1 COMMENT '汇率',
  `trade_country`    VARCHAR(50)    DEFAULT NULL COMMENT '贸易国别',
  `settlement_method` VARCHAR(50)   DEFAULT NULL COMMENT '结汇方式',
  `price_terms`      VARCHAR(50)    DEFAULT NULL COMMENT '价格条款',
  `salesperson`      VARCHAR(50)    DEFAULT NULL COMMENT '外销员',
  `profit_rate`      DECIMAL(6,2)   NOT NULL DEFAULT 0 COMMENT '利润率%',
  `quote_qty`        INT            DEFAULT NULL COMMENT '报价数量',
  `image1`           VARCHAR(255)   DEFAULT NULL,
  `image2`           VARCHAR(255)   DEFAULT NULL,
  `rmb_total`        DECIMAL(16,2)  DEFAULT NULL COMMENT '报价人民币价格(含利润率)',
  `usd_total`        DECIMAL(16,2)  DEFAULT NULL COMMENT '报价美元价格',
  `total_remark`     TEXT           DEFAULT NULL COMMENT '备注说明',
  `status`           ENUM('DRAFT','QUOTED','ADJUSTING','ORDERED') NOT NULL DEFAULT 'DRAFT',
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

-- 报价明细（从样衣导入，12 字段）
CREATE TABLE IF NOT EXISTS `quotation_item` (
  `id`             BIGINT         NOT NULL AUTO_INCREMENT,
  `quote_id`       BIGINT         NOT NULL,
  `sort_order`     INT            NOT NULL DEFAULT 0,
  `part`           VARCHAR(50)    DEFAULT NULL COMMENT '部位',
  `item_name`      VARCHAR(100)   NOT NULL COMMENT '品名',
  `width`          VARCHAR(30)    DEFAULT NULL COMMENT '门幅',
  `color`          VARCHAR(50)    DEFAULT NULL COMMENT '颜色',
  `supplier`       VARCHAR(100)   DEFAULT NULL COMMENT '供应商(PDF隐藏)',
  `unit`           VARCHAR(20)    DEFAULT NULL COMMENT '计量单位',
  `quote_usage`    DECIMAL(15,4)  DEFAULT NULL COMMENT '报价耗用',
  `rmb_price`      DECIMAL(15,4)  DEFAULT NULL COMMENT '人民币单价',
  `usd_price`      DECIMAL(15,4)  DEFAULT NULL COMMENT '美金单价(自动)',
  `loss_rate`      DECIMAL(6,2)   NOT NULL DEFAULT 3 COMMENT '损耗%',
  `loss_amount`    DECIMAL(15,4)  DEFAULT NULL COMMENT '含损金额=单价×耗用×(1+损耗)',
  `remark`         VARCHAR(200)   DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_quote` (`quote_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='报价明细';

-- 费用明细（4 字段，新建自动带 6 行）
CREATE TABLE IF NOT EXISTS `quotation_fee` (
  `id`          BIGINT        NOT NULL AUTO_INCREMENT,
  `quote_id`    BIGINT        NOT NULL,
  `sort_order`  INT           NOT NULL DEFAULT 0,
  `fee_name`    VARCHAR(50)   NOT NULL COMMENT '费用名称',
  `rmb_price`   DECIMAL(15,4) DEFAULT NULL COMMENT '人民币单价',
  `usd_price`   DECIMAL(15,4) DEFAULT NULL COMMENT '美金单价(自动)',
  `quote_usage` DECIMAL(12,2) NOT NULL DEFAULT 1 COMMENT '报价耗用',
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
  `customer_id`    BIGINT        NOT NULL COMMENT '中间商客户ID',
  `quote_id`       BIGINT        DEFAULT NULL COMMENT '关联报价',
  `style_name`     VARCHAR(100)  DEFAULT NULL,
  `style_no`       VARCHAR(100)  DEFAULT NULL COMMENT '客户款号',
  `middleman_name` VARCHAR(100)  DEFAULT NULL COMMENT '中间商名称(报价带入)',
  `buyer_id`       BIGINT        DEFAULT NULL COMMENT '最终买家',
  `buyer_name`     VARCHAR(100)  DEFAULT NULL,
  `delivery_date`  DATE          DEFAULT NULL COMMENT '约定交期',
  `qty_total`      INT           NOT NULL DEFAULT 0 COMMENT '大货总数量',
  `currency`       VARCHAR(5)    NOT NULL DEFAULT 'USD',
  `unit_price`     DECIMAL(15,4) DEFAULT NULL COMMENT '单品单价',
  `total_amount`   DECIMAL(15,4) DEFAULT NULL COMMENT '总金额',
  `commission_rate` DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '佣金%',
  `factory_id`     BIGINT        DEFAULT NULL COMMENT '生产工厂(绑定订单)',
  `salesperson`    VARCHAR(50)   DEFAULT NULL COMMENT '外销员',
  `make_date`      DATE          DEFAULT NULL COMMENT '制单日期',
  `split_mode`     VARCHAR(10)   NOT NULL DEFAULT 'NONE' COMMENT '整单核算模式 NONE/BY_SIZE/BY_COLOR',
  `att_artwork`    TEXT          DEFAULT NULL COMMENT '附件·彩稿(多文件URL逗号分隔)',
  `att_sizechart`  TEXT          DEFAULT NULL COMMENT '附件·大货尺寸表',
  `att_board`      TEXT          DEFAULT NULL COMMENT '附件·大货纸板',
  `att_packing`    TEXT          DEFAULT NULL COMMENT '附件·包装资料',
  `att_filling`    TEXT          DEFAULT NULL COMMENT '附件·填充量',
  `status`         ENUM('DRAFT','CONFIRMED','CONTRACTED','PRODUCING','DONE') NOT NULL DEFAULT 'DRAFT',
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
  `quote_item_id`  BIGINT         DEFAULT NULL COMMENT '来源报价明细',
  `item_name`      VARCHAR(100)   NOT NULL COMMENT '品名(报价带入,可改)',
  `part`           VARCHAR(50)    DEFAULT NULL COMMENT '部位',
  `width`          VARCHAR(50)    DEFAULT NULL COMMENT '门幅/尺寸',
  `color`          VARCHAR(100)   DEFAULT NULL COMMENT '颜色',
  `composition`    VARCHAR(100)   DEFAULT NULL COMMENT '成份',
  `supplier`       VARCHAR(100)   DEFAULT NULL COMMENT '供应商',
  `split_mode`     VARCHAR(10)    NOT NULL DEFAULT 'NONE' COMMENT '拆分 NONE/BY_SIZE/BY_COLOR',
  `unit`           VARCHAR(20)    DEFAULT NULL,
  `net_usage`      DECIMAL(15,4)  DEFAULT NULL COMMENT '单件耗用',
  `loss_rate`      DECIMAL(6,2)   NOT NULL DEFAULT 3.00 COMMENT '损耗%默认3',
  `loss_usage`     DECIMAL(15,4)  DEFAULT NULL COMMENT '含损单件耗用=单件×(1+损耗)',
  `qty`            INT            DEFAULT NULL COMMENT '大货总数',
  `total_purchase` DECIMAL(15,4)  DEFAULT NULL COMMENT '系统采购量=大货总数×单件×(1+损耗);整数类进1',
  `final_purchase` DECIMAL(15,4)  DEFAULT NULL COMMENT '最终采购量(微调,超±10%确认)',
  `round_up`       TINYINT        DEFAULT NULL COMMENT '行内取整覆盖 1=强制取整/0=不取整/null=按单位自动',
  `unit_price`     DECIMAL(15,4)  DEFAULT NULL COMMENT '采购单价',
  `budget`         DECIMAL(15,4)  DEFAULT NULL COMMENT '预算=最终采购量×单价',
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
  `ship_to_address`     VARCHAR(200)   DEFAULT NULL COMMENT '收货地址(发货带入)',
  `shipped_qty`         DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '累计已发数量(批次累计)',
  `account_period_days` INT            NOT NULL DEFAULT 90 COMMENT '账期天数(材料90/加工45,发货日+账期=到期日)',
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
  `qty_source`   VARCHAR(20)    DEFAULT NULL COMMENT '数量来源:采购量含损耗/大货数',
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
  `style_no`         VARCHAR(60)    DEFAULT NULL COMMENT '款号(合同→订单带出,供检索)',
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
  KEY `idx_style_no` (`style_no`),
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
  `style_no`             VARCHAR(60)    DEFAULT NULL COMMENT '款号(核算口径,来自订单)',
  `shipped_qty`          INT            NOT NULL DEFAULT 0 COMMENT '出货件数(汇总自 order_shipment)',
  `currency`             VARCHAR(5)     NOT NULL DEFAULT 'CNY',
  `exchange_rate`        DECIMAL(10,4)  DEFAULT NULL COMMENT '结算汇率',
  `status`               ENUM('DRAFT','CONFIRMED') NOT NULL DEFAULT 'DRAFT',
  `goods_amount_tax`     DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '总货款(含税)',
  `goods_amount_extax`   DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '总货款(不含税)=含税÷1.13(无票行按含税全额)',
  `cost_per_unit_tax`    DECIMAL(15,4)  DEFAULT NULL COMMENT '成本单价(含税)=总货款含税÷出货件数',
  `cost_per_unit_extax`  DECIMAL(15,4)  DEFAULT NULL COMMENT '成本单价(不含税)',
  `invoice_amount_usd`   DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '发票金额(USD)',
  `receipt_usd`          DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '实际收汇金额(USD)',
  `usd_unit_price`       DECIMAL(15,4)  DEFAULT NULL COMMENT '美金单价=发票金额÷出货件数',
  `freight_fee`          DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '运杂费(进净利扣减)',
  `express_fee`          DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '快邮费(国际+国内)',
  `sample_fee`           DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '打样费',
  `other_fee`            DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '其它费用',
  `settle_amount`        DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '结算金额(RMB)=实际收汇×结算汇率',
  `finance_fee`          DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '财务及管理费=结算金额×7%',
  `gross_profit`         DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '毛利=结算金额−总货款不含税',
  `gross_margin`         DECIMAL(8,2)   DEFAULT NULL COMMENT '毛利率%',
  `breakeven_rate_tax`   DECIMAL(10,4)  DEFAULT NULL COMMENT '保本汇率(含税)=成本单价含税÷美金单价',
  `breakeven_rate_extax` DECIMAL(10,4)  DEFAULT NULL COMMENT '保本汇率(不含税)',
  `tax_refund`           DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '出口退税',
  `net_profit`           DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '净利(含退税)=净利+退税',
  `net_profit_ex_refund` DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '净利(不含退税)=毛利−期间费用−财务费7%',
  `revenue`              DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '兼容列=结算金额',
  `total_cost`           DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '兼容列=总货款含税',
  `cost_per_unit`        DECIMAL(15,4)  DEFAULT NULL COMMENT '兼容列=不含税成本单价',
  `description`          VARCHAR(255)   DEFAULT NULL,
  `created_by`           BIGINT         DEFAULT NULL,
  `confirmed_at`         DATETIME       DEFAULT NULL,
  `deleted`              TINYINT        NOT NULL DEFAULT 0,
  `created_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_settlement_no` (`settlement_no`),
  UNIQUE KEY `uk_order` (`order_id`,`deleted`),
  KEY `idx_status` (`status`,`deleted`),
  KEY `idx_style_no` (`style_no`)
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
