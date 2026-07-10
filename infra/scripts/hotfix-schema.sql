-- =============================================================================
-- I9 服装制造管理系统 — 存量库结构热修复（幂等，可反复执行）
-- -----------------------------------------------------------------------------
-- 背景：生产为 synchronize:false 且无 migration，init.sql 仅在「全新空库」执行；
--       本季度新增的表/列不会落到已有生产库 → 接口大面积
--       "Unknown column" / "Table doesn't exist"。
-- 作用：把已有生产库结构补齐到与当前应用实体一致。
-- 安全：所有语句幂等——已存在的表/列自动跳过；MODIFY 重复执行为等价无害操作。
--       不删除、不改窄任何既有列，不触碰业务数据。
-- 用法：见 upgrade-db.sh（会先自动备份再执行）；或手工：
--       docker exec -i i9_mysql mysql -uroot -p"$PW" i9_clothes < hotfix-schema.sql
-- =============================================================================

-- ── 幂等助手 ─────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _i9_add_col;
DROP PROCEDURE IF EXISTS _i9_modify_col;
DROP PROCEDURE IF EXISTS _i9_add_index;
DROP PROCEDURE IF EXISTS _i9_add_unique;
DROP PROCEDURE IF EXISTS _i9_sync_col;
DROP PROCEDURE IF EXISTS _i9_run_if_col;
DELIMITER $$

-- 仅当列不存在时 ADD COLUMN
CREATE PROCEDURE _i9_add_col(IN p_tbl VARCHAR(64), IN p_col VARCHAR(64), IN p_ddl TEXT)
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tbl AND COLUMN_NAME = p_col) = 0 THEN
    SET @sql = CONCAT('ALTER TABLE `', p_tbl, '` ADD COLUMN `', p_col, '` ', p_ddl);
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END $$

-- 仅当列存在时 MODIFY COLUMN（枚举扩值 / 放宽约束 / 加宽长度）
CREATE PROCEDURE _i9_modify_col(IN p_tbl VARCHAR(64), IN p_col VARCHAR(64), IN p_ddl TEXT)
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tbl AND COLUMN_NAME = p_col) = 1 THEN
    SET @sql = CONCAT('ALTER TABLE `', p_tbl, '` MODIFY COLUMN `', p_col, '` ', p_ddl);
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END $$

-- 仅当索引不存在时 ADD INDEX
CREATE PROCEDURE _i9_add_index(IN p_tbl VARCHAR(64), IN p_idx VARCHAR(64), IN p_cols VARCHAR(200))
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tbl AND INDEX_NAME = p_idx) = 0 THEN
    SET @sql = CONCAT('ALTER TABLE `', p_tbl, '` ADD INDEX `', p_idx, '` (', p_cols, ')');
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END $$

CREATE PROCEDURE _i9_add_unique(IN p_tbl VARCHAR(64), IN p_idx VARCHAR(64), IN p_cols VARCHAR(200))
BEGIN
  -- 若存量数据已有重复值(旧 bug 允许过),ADD UNIQUE 会失败;用 CONTINUE HANDLER 兜住,
  -- 仅告警不中断发版(应用层查重仍在;清理重复数据后可重跑本脚本补加索引)。
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
    SELECT CONCAT('WARN: 无法为 ', p_tbl, '.', p_idx, ' 加唯一索引,可能存在重复值,清理后重跑') AS _i9_warn;
  IF (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tbl AND INDEX_NAME = p_idx) = 0 THEN
    SET @sql = CONCAT('ALTER TABLE `', p_tbl, '` ADD UNIQUE INDEX `', p_idx, '` (', p_cols, ')');
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END $$


-- 仅当列存在且当前类型 ≠ 目标类型时 MODIFY(全量结构同步用;类型一致跳过,幂等)
CREATE PROCEDURE _i9_sync_col(IN p_tbl VARCHAR(64), IN p_col VARCHAR(64), IN p_type TEXT, IN p_ddl TEXT)
BEGIN
  DECLARE cur TEXT DEFAULT NULL;
  SELECT COLUMN_TYPE INTO cur FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tbl AND COLUMN_NAME = p_col LIMIT 1;
  IF cur IS NOT NULL AND LOWER(REPLACE(cur, ' ', '')) <> LOWER(REPLACE(p_type, ' ', '')) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_tbl, '` MODIFY COLUMN `', p_col, '` ', p_ddl);
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END $$

-- 仅当列存在时执行任意语句(枚举旧值映射/收窄前截断等数据迁移用)
CREATE PROCEDURE _i9_run_if_col(IN p_tbl VARCHAR(64), IN p_col VARCHAR(64), IN p_stmt TEXT)
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tbl AND COLUMN_NAME = p_col) = 1 THEN
    SET @sql = p_stmt;
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END $$

DELIMITER ;


-- ── 枚举语义迁移(极老基线,2026-07-09 生产事故根治)────────────────
-- 老枚举值 → 新枚举值:先把列扩为「旧∪新」并集,把旧值 UPDATE 成新值,
-- 随后 AUTO 段的 _i9_sync_col 会把类型收敛到 HEAD 定义。全部幂等(无旧值时 no-op)。
CALL _i9_modify_col('factory','type',"ENUM('MATERIAL','PROCESS','BOTH','FABRIC','ACCESSORY','OUTSOURCE','FORWARDER','TESTING','EXPORT','OTHER') NOT NULL DEFAULT 'FABRIC'");
-- BOTH(双身份)映射前先补 extra_types 列并记下「加工」身份,避免信息丢失
CALL _i9_add_col('factory','extra_types',"VARCHAR(100) DEFAULT NULL COMMENT '附加身份(逗号分隔,工厂双身份)'");
CALL _i9_run_if_col('factory','type',"UPDATE factory SET extra_types='OUTSOURCE' WHERE type='BOTH' AND (extra_types IS NULL OR extra_types='')");
CALL _i9_run_if_col('factory','type',"UPDATE factory SET type='FABRIC' WHERE type='MATERIAL'");
CALL _i9_run_if_col('factory','type',"UPDATE factory SET type='OUTSOURCE' WHERE type='PROCESS'");
CALL _i9_run_if_col('factory','type',"UPDATE factory SET type='FABRIC' WHERE type='BOTH'");

CALL _i9_modify_col('order_main','status',"ENUM('DRAFT','CONFIRMED','CONTRACTED','PRODUCING','SHIPPED','DONE') NOT NULL DEFAULT 'DRAFT'");
CALL _i9_run_if_col('order_main','status',"UPDATE order_main SET status='DONE' WHERE status='SHIPPED'");

CALL _i9_modify_col('quotation','status',"ENUM('DRAFT','SENT','CONFIRMED','TO_CONTRACT','QUOTED','ADJUSTING','ORDERED') NOT NULL DEFAULT 'DRAFT'");
CALL _i9_run_if_col('quotation','status',"UPDATE quotation SET status='QUOTED' WHERE status='SENT'");
CALL _i9_run_if_col('quotation','status',"UPDATE quotation SET status='ORDERED' WHERE status IN ('CONFIRMED','TO_CONTRACT')");

CALL _i9_modify_col('sample_garment','status',"ENUM('PENDING','PATTERN','CONFIRMED','REJECTED','SAMPLING','SHIPPED','RETURNED','RECONCILED','DONE','ORDERED') NOT NULL DEFAULT 'PENDING'");
CALL _i9_run_if_col('sample_garment','status',"UPDATE sample_garment SET status='SAMPLING' WHERE status='PATTERN'");
CALL _i9_run_if_col('sample_garment','status',"UPDATE sample_garment SET status='DONE' WHERE status='CONFIRMED'");
CALL _i9_run_if_col('sample_garment','status',"UPDATE sample_garment SET status='RETURNED' WHERE status='REJECTED'");

-- 收窄列先截断,防 MODIFY 因超长数据失败(text → varchar(255))
CALL _i9_run_if_col('settlement_receipt','remark',"UPDATE settlement_receipt SET remark=LEFT(remark,255) WHERE CHAR_LENGTH(remark)>255");

-- ▼▼ AUTO-GENERATED COLUMN SYNC(gen-column-sync.py 生成,勿手改)▼▼
-- 目的:任意历史版本存量库 → HEAD 结构。①缺整表补表 ②缺列按 HEAD 定义补列(均幂等)。
-- 注意:NOT NULL 无默认列由 MySQL DDL 隐式默认值填充存量行(数值0/字符串空),优于缺列 500。

CREATE TABLE IF NOT EXISTS `sys_user` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `username`     VARCHAR(50)  NOT NULL COMMENT '登录用户名',
  `password`     VARCHAR(255) NOT NULL COMMENT '密码(bcrypt)',
  `real_name`    VARCHAR(50)  NOT NULL COMMENT '真实姓名',
  `role`         ENUM('ADMIN','BUSINESS','FINANCE','PATTERNMAKER','SUPERVISOR','SAMPLE_MAKER') NOT NULL DEFAULT 'BUSINESS',
  `status`       TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统用户';

CREATE TABLE IF NOT EXISTS `sys_sequence` (
  `name`       VARCHAR(64) NOT NULL COMMENT '计数器名(与 Redis seq:* key 同名)',
  `value`      BIGINT      NOT NULL DEFAULT 0 COMMENT '已发出的最大序号(影子计数,Redis 挂时行锁兜底发号)',
  `updated_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单号发号 DB 兜底(Redis 单点消除:挂了降速不阻断,恢复自动切回)';

CREATE TABLE IF NOT EXISTS `sys_dict` (
  `id`         BIGINT       NOT NULL AUTO_INCREMENT,
  `type`       VARCHAR(40)  NOT NULL COMMENT '字典类别',
  `label`      VARCHAR(100) NOT NULL COMMENT '显示值',
  `value`      VARCHAR(100) DEFAULT NULL COMMENT '附加值(币种字典存默认汇率)',
  `sort`       INT          NOT NULL DEFAULT 0,
  `status`     TINYINT      NOT NULL DEFAULT 1,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通用字典(下拉自填自动累积)';

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

CREATE TABLE IF NOT EXISTS `factory` (
  `id`             BIGINT        NOT NULL AUTO_INCREMENT,
  `factory_no`     VARCHAR(20)   NOT NULL COMMENT '厂商编号 S001（自动生成/大写/唯一）',
  `type`           ENUM('FABRIC','ACCESSORY','OUTSOURCE','FORWARDER','TESTING','EXPORT','OTHER') NOT NULL DEFAULT 'FABRIC' COMMENT '工厂主身份',
  `extra_types`    VARCHAR(100)   DEFAULT NULL COMMENT '附加身份(逗号分隔,工厂双身份)',
  `seal_url`        VARCHAR(500)  DEFAULT NULL COMMENT '供应商电子章图片(盖章后PDF落款贴章,A3)',
  `can_invoice`    TINYINT       NOT NULL DEFAULT 1 COMMENT '能否开票 1=是 0=否',
  `name`           VARCHAR(100)  NOT NULL COMMENT '厂商名称（唯一）',
  `short_name`     VARCHAR(50)   DEFAULT NULL COMMENT '简称',
  `contact_name`   VARCHAR(50)   DEFAULT NULL COMMENT '主联系人（自动取子表首行）',
  `contact_phone`  VARCHAR(30)   DEFAULT NULL COMMENT '主联系电话（自动取子表首行）',
  `province`       VARCHAR(30)   DEFAULT NULL COMMENT '所在省份',
  `city`           VARCHAR(30)   DEFAULT NULL COMMENT '所在城市',
  `address`        VARCHAR(200)  DEFAULT NULL COMMENT '详细地址',
  `business_scope` VARCHAR(200)  DEFAULT NULL COMMENT '业务范围',
  `grade`               VARCHAR(10)    DEFAULT NULL COMMENT '信用等级A/B/C',
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

CREATE TABLE IF NOT EXISTS `customer_grant` (
  `id`          BIGINT   NOT NULL AUTO_INCREMENT,
  `customer_id` BIGINT   NOT NULL,
  `user_id`     BIGINT   NOT NULL COMMENT '被授权用户',
  `can_edit`    TINYINT  NOT NULL DEFAULT 0 COMMENT '0=仅查看 1=可修改',
  `expire_at`   DATE     DEFAULT NULL COMMENT '有效期至(过期授权自动失效,空=永久)',
  `remark`      VARCHAR(200) DEFAULT NULL COMMENT '授权备注',
  `created_by`  BIGINT   DEFAULT NULL COMMENT '授权人(管理员)',
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cust_user` (`customer_id`,`user_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户机密授权(行级可见:创建人/被授权人/管理员)';

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
  `feedback_attachments` VARCHAR(500) DEFAULT NULL COMMENT '样衣意见附件(客户反馈图/PDF,多文件逗号分隔)',
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
  `approval_status`  ENUM('NONE','PENDING','APPROVED') NOT NULL DEFAULT 'NONE' COMMENT '金额阈值审批',
  `approved_by`      BIGINT       DEFAULT NULL,
  `approved_at`      DATETIME     DEFAULT NULL,
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
  `approval_status` ENUM('NONE','PENDING','APPROVED') NOT NULL DEFAULT 'NONE' COMMENT '金额阈值审批',
  `approved_by`    BIGINT        DEFAULT NULL,
  `approved_at`    DATETIME      DEFAULT NULL,
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

CREATE TABLE IF NOT EXISTS `contract` (
  `id`                  BIGINT         NOT NULL AUTO_INCREMENT,
  `contract_no`         VARCHAR(40)    NOT NULL COMMENT 'HT-YYYYMMDD-001；补料合同为「补料-母合同号-序号」故留 40',
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
  `ship_done_at`     DATETIME       DEFAULT NULL COMMENT '供应商宣布发货完成时间(门户C3;开票后闭环到已完成)',
  `stamp_mode`       VARCHAR(10)    DEFAULT NULL COMMENT '盖章方式 ESEAL/PAPER(A3)',
  `stamp_paper_url`  VARCHAR(500)   DEFAULT NULL COMMENT '纸质盖章照片(A3)',
  `ship_to_address`     VARCHAR(200)   DEFAULT NULL COMMENT '收货地址(发货带入)',
  `shipped_qty`         DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '累计已发数量(批次累计)',
  `account_period_days` INT            NOT NULL DEFAULT 90 COMMENT '账期天数(材料90/加工45,发货日+账期=到期日)',
  `due_date`            DATE           DEFAULT NULL COMMENT '账期截止日',
  `sign_place`          VARCHAR(100)   DEFAULT NULL COMMENT '签约地点(默认本司地址)',
  `sign_date`           DATE           DEFAULT NULL COMMENT '签约日期(默认今天)',
  `company_id`          BIGINT         DEFAULT NULL COMMENT '乙方/委托方=本司主体(company_profile)',
  `company_rep`         VARCHAR(50)    DEFAULT NULL COMMENT '乙方/委托方代表(默认登录业务员)',
  `guarantor`           VARCHAR(50)    DEFAULT NULL COMMENT '担保人(丙方,选填)',
  `guarantor_id_photo`  VARCHAR(500)   DEFAULT NULL COMMENT '担保人身份证照片URL(选填)',
  `delivery_deadline`   DATE           DEFAULT NULL COMMENT '交货期限(加工=订单交期-10天/材料=-45天)',
  `style_nos`           VARCHAR(500)   DEFAULT NULL COMMENT '关联款号(多选逗号分隔)',
  `price_includes`      JSON           DEFAULT NULL COMMENT '价格包含项勾选(加工合同,汇入PDF)',
  `vat_rate`            DECIMAL(5,2)   DEFAULT NULL COMMENT '增值税%(加工默认13,含税不另计)',
  `price_other`         VARCHAR(200)   DEFAULT NULL COMMENT '价格包含项·其他说明',
  `terms_json`          JSON           DEFAULT NULL COMMENT '合同条款模板填空(key→条款文本)',
  `portal_status`       ENUM('DRAFT','PUSHED','STAMPED','SHIPPING','RECONCILED','COMPLETED') NOT NULL DEFAULT 'DRAFT',
  `pushed_at`           DATETIME       DEFAULT NULL COMMENT '推送门户时间',
  `stamped_at`          DATETIME       DEFAULT NULL COMMENT '供应商盖章时间',
  `stamped_by_supplier` VARCHAR(100)   DEFAULT NULL COMMENT '盖章供应商账号',
  `snapshot_json`       JSON           DEFAULT NULL COMMENT '盖章时快照数据',
  `revised`             TINYINT        NOT NULL DEFAULT 0 COMMENT '撤销推送后修改重推标记(门户提示合同已更新;盖章后清零)',
  `status`              ENUM('ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  `approval_status`     ENUM('NONE','PENDING','APPROVED') NOT NULL DEFAULT 'NONE' COMMENT '金额阈值审批',
  `approved_by`         BIGINT       DEFAULT NULL,
  `approved_at`         DATETIME     DEFAULT NULL,
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
  `color`        VARCHAR(50)    DEFAULT NULL COMMENT '颜色(分色行)',
  `size`         VARCHAR(30)    DEFAULT NULL COMMENT '尺码/码(分码行)',
  `style_no`     VARCHAR(50)    DEFAULT NULL COMMENT '款号(多款号同表随行标注)',
  `delivery_date` DATE          DEFAULT NULL COMMENT '行交货期限(材料默认=款交期-45天)',
  `photo_url`    VARCHAR(500)   DEFAULT NULL COMMENT '材料照片URL',
  `remark`       VARCHAR(200)   DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_contract` (`contract_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同材料明细（盖章前可改，盖章后冻结）';

CREATE TABLE IF NOT EXISTS `contract_shipment` (
  `id`                 BIGINT         NOT NULL AUTO_INCREMENT,
  `contract_id`        BIGINT         NOT NULL,
  `ship_no`            VARCHAR(30)    DEFAULT NULL COMMENT '发货单号 FH-款号-序号',
  `qty`                DECIMAL(15,4)  NOT NULL COMMENT '本批发货数量',
  `snapshot_unit_price` DECIMAL(15,4) DEFAULT NULL COMMENT '逐批锁定单价(发货当时合同单价快照)',
  `amount`             DECIMAL(15,4)  DEFAULT NULL COMMENT '本批金额',
  `ship_date`          DATE           DEFAULT NULL,
  `operator`           VARCHAR(50)    DEFAULT NULL COMMENT '发货供应商账号',
  `approval_status`    ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING' COMMENT '发货业务审批(门户B2)',
  `approved_by`        BIGINT         DEFAULT NULL,
  `approved_at`        DATETIME       DEFAULT NULL,
  `reconcile_id`       BIGINT         DEFAULT NULL COMMENT '被哪张对账单占用(防重复对账,删单释放)',
  `express_company`    VARCHAR(50)    DEFAULT NULL COMMENT '快递公司',
  `express_no`         VARCHAR(50)    DEFAULT NULL COMMENT '快递单号',
  `attach_url`         VARCHAR(500)   DEFAULT NULL COMMENT '附件(装箱单/货物照片)',
  `created_at`         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_contract` (`contract_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同发货批次（逐批锁价）';

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

CREATE TABLE IF NOT EXISTS `reconciliation` (
  `id`               BIGINT         NOT NULL AUTO_INCREMENT,
  `reconcile_no`     VARCHAR(30)    NOT NULL COMMENT 'DZ-YYYYMMDD-001 或 DZ-NC-YYYYMMDD-001',
  `type`             ENUM('CONTRACT','NO_CONTRACT','LABOR') NOT NULL DEFAULT 'CONTRACT',
  `sub_type`         VARCHAR(20)    DEFAULT NULL COMMENT '无合同子类型:EXPENSE/CASH_NO_INVOICE/PREPAY',
  `contract_id`      BIGINT         DEFAULT NULL COMMENT '有合同时关联',
  `style_no`         VARCHAR(200)   DEFAULT NULL COMMENT '款号(合同→订单带出,供检索;工时对账为「款A 等N款」)',
  `factory_id`       BIGINT         DEFAULT NULL COMMENT '供应商对账=加工厂/供应商;工时对账为空',
  `patternmaker_id`  BIGINT         DEFAULT NULL COMMENT '工时对账受款方版师',
  `patternmaker_name` VARCHAR(50)   DEFAULT NULL,
  `currency`         VARCHAR(10)    NOT NULL DEFAULT 'CNY' COMMENT '工时单价币种,默认CNY',
  `period`           VARCHAR(20)    DEFAULT NULL COMMENT '归属账期(按月合并如2026-07)',
  `total_amount`     DECIMAL(15,4)  NOT NULL COMMENT '对账金额',
  `tax_rate`         DECIMAL(5,2)   DEFAULT NULL COMMENT '税率%',
  `tax_amount`       DECIMAL(15,4)  DEFAULT NULL COMMENT '税额',
  `invoice_no`       VARCHAR(100)   DEFAULT NULL COMMENT '发票号',
  `invoice_amount`   DECIMAL(15,4)  DEFAULT NULL COMMENT '发票金额',
  `invoice_diff`     DECIMAL(15,4)  DEFAULT NULL COMMENT '发票与对账差额',
  `invoice_url`      VARCHAR(500)   DEFAULT NULL COMMENT '发票文件路径',
  `has_invoice`      TINYINT        NOT NULL DEFAULT 0 COMMENT '1=有票 0=无票',
  `status`           ENUM('DRAFT','PENDING','CONFIRMED','PAID') NOT NULL DEFAULT 'DRAFT',
  `confirmed_at`     DATETIME       DEFAULT NULL,
  `review_remark`    VARCHAR(500)   DEFAULT NULL COMMENT '主管复核批注/整单退回原因',
  `description`      TEXT           DEFAULT NULL COMMENT '无合同费用说明',
  `created_by`       BIGINT         NOT NULL,
  `created_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted`          TINYINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reconcile_no` (`reconcile_no`),
  UNIQUE KEY `uk_invoice_no` (`invoice_no`),
  KEY `idx_contract` (`contract_id`),
  KEY `idx_factory` (`factory_id`),
  KEY `idx_style_no` (`style_no`),
  KEY `idx_patternmaker` (`patternmaker_id`),
  KEY `idx_status` (`status`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='对账单';

CREATE TABLE IF NOT EXISTS `reconciliation_shipment` (
  `id`                 BIGINT         NOT NULL AUTO_INCREMENT,
  `reconcile_id`       BIGINT         NOT NULL,
  `shipment_id`        BIGINT         NOT NULL COMMENT '关联出货记录',
  `contract_id`        BIGINT         DEFAULT NULL COMMENT '一单多合同:本批次来源合同',
  `style_no`           VARCHAR(60)    DEFAULT NULL COMMENT '一单多合同:本批次款号',
  `item_name`          VARCHAR(100)   NOT NULL COMMENT '材料名（快照）',
  `snapshot_unit_price` DECIMAL(15,4) NOT NULL COMMENT '盖章时快照单价',
  `qty`                DECIMAL(15,4)  NOT NULL,
  `amount`             DECIMAL(15,4)  NOT NULL,
  `remark`             VARCHAR(200)   DEFAULT NULL COMMENT '逐批批注',
  PRIMARY KEY (`id`),
  KEY `idx_reconcile` (`reconcile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='对账单发货明细（含快照单价）';

CREATE TABLE IF NOT EXISTS `reconciliation_expense_item` (
  `id`           BIGINT        NOT NULL AUTO_INCREMENT,
  `reconcile_id` BIGINT        NOT NULL,
  `expense_name` VARCHAR(200)  NOT NULL COMMENT '费用项目/事由',
  `amount`       DECIMAL(15,4) NOT NULL,
  `style_no`     VARCHAR(60)   DEFAULT NULL COMMENT '相关款号(可空)',
  `attach_url`   VARCHAR(500)  DEFAULT NULL COMMENT '附件(收据/无票说明)',
  PRIMARY KEY (`id`),
  KEY `idx_reconcile` (`reconcile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='无合同空白对账单·费用明细';

CREATE TABLE IF NOT EXISTS `reconciliation_labor_item` (
  `id`               BIGINT         NOT NULL AUTO_INCREMENT,
  `reconcile_id`     BIGINT         NOT NULL,
  `sample_id`        BIGINT         NOT NULL COMMENT '关联样衣',
  `sample_no`        VARCHAR(30)    DEFAULT NULL,
  `style_no`         VARCHAR(100)   DEFAULT NULL COMMENT '客户款号',
  `piece_count`      INT            DEFAULT NULL COMMENT '件数(快照)',
  `labor_unit_price` DECIMAL(12,2)  DEFAULT NULL COMMENT '工时单价(快照)',
  `labor_amount`     DECIMAL(14,2)  DEFAULT NULL COMMENT '工时金额(快照)',
  PRIMARY KEY (`id`),
  KEY `idx_reconcile` (`reconcile_id`),
  KEY `idx_sample` (`sample_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工时对账明细（多款合并·样衣工时快照）';

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

CREATE TABLE IF NOT EXISTS `payment_request` (
  `id`                BIGINT         NOT NULL AUTO_INCREMENT,
  `pr_no`             VARCHAR(30)    NOT NULL COMMENT 'PR-YYYYMMDD-001 或 PR-NC-YYYYMMDD-001',
  `type`              ENUM('CONTRACT','NO_CONTRACT') NOT NULL DEFAULT 'CONTRACT',
  `reconcile_id`      BIGINT         DEFAULT NULL COMMENT '有合同时关联对账单',
  `factory_id`        BIGINT         NOT NULL,
  `amount`            DECIMAL(15,4)  NOT NULL COMMENT '申请付款金额',
  `prepay_offset`     DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '预付款冲抵金额',
  `actual_pay`        DECIMAL(15,4)  DEFAULT NULL COMMENT '实付金额=amount-prepay_offset',
  `account_period_days` INT          DEFAULT NULL COMMENT '结算账期(合同带入,可人工改)',
  `due_date`           DATE           DEFAULT NULL COMMENT '到期日=出货日+账期(逾期高亮)',
  `paid_total`         DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '已付总额(分批付款累计)',
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

CREATE TABLE IF NOT EXISTS `payment_record` (
  `id`         BIGINT        NOT NULL AUTO_INCREMENT,
  `pr_id`      BIGINT        NOT NULL COMMENT '所属付款申请',
  `pay_method` ENUM('BANK','ACCEPTANCE','OTHER') NOT NULL DEFAULT 'BANK' COMMENT '付款方式:银行转账/承兑汇票/其他',
  `pay_date`   DATE          NOT NULL,
  `amount`     DECIMAL(15,4) NOT NULL COMMENT '本次付款金额',
  `slip_url`   VARCHAR(500)  DEFAULT NULL COMMENT '付款凭证(水单)',
  `remark`     VARCHAR(200)  DEFAULT NULL,
  `created_by` BIGINT        NOT NULL,
  `created_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pr` (`pr_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分批付款记录(v1.1:多次付款累计已付/未付,余额0转已付清)';

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
  `unpaid_goods_tax`     DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '已确认未付对账金额(含税)——不计入总货款,灰显「未付·不计入」',
  `unpaid_count`         INT            NOT NULL DEFAULT 0 COMMENT '已确认未付对账笔数',
  `profit_ready`         TINYINT        NOT NULL DEFAULT 0 COMMENT '1=收汇与汇率齐备,毛利/净利可信(缺值不出误导性负毛利)',
  `tax_refund`           DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '出口退税(可退税不含税采购额×退税率,自动测算)',
  `refund_status`        VARCHAR(20)    NOT NULL DEFAULT 'ESTIMATED' COMMENT '退税状态:ESTIMATED预估/RECEIVED到账',
  `customer_name`        VARCHAR(100)   DEFAULT NULL COMMENT '中间商客户(利润按客户维度汇总)',
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
  `tax_rate`        DECIMAL(5,2)   NOT NULL DEFAULT 13 COMMENT '该行税率%(有票按此换不含税)',
  `reconcile_no`    VARCHAR(30)    DEFAULT NULL COMMENT '来源对账单号(AUTO行)',
  `supplier_name`   VARCHAR(100)   DEFAULT NULL COMMENT '供应商(AUTO行)',
  `pay_status`      VARCHAR(20)    DEFAULT NULL COMMENT '付款状态 PAID=已付 CONFIRMED=已确认未付',
  `source`          VARCHAR(10)    NOT NULL DEFAULT 'MANUAL' COMMENT 'AUTO=对账汇总快照 MANUAL=手工行',
  `included`        TINYINT        NOT NULL DEFAULT 1 COMMENT '1=计入总货款 0=未付不计入(灰显)',
  `created_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_settlement` (`settlement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='结算成本明细';

CREATE TABLE IF NOT EXISTS `settlement_receipt` (
  `id`             BIGINT        NOT NULL AUTO_INCREMENT,
  `settlement_id`  BIGINT        NOT NULL,
  `amount`         DECIMAL(15,4) NOT NULL COMMENT '收款金额',
  `receipt_date`   DATE          NOT NULL COMMENT '收款日期',
  `exchange_rate`  DECIMAL(10,4) DEFAULT NULL COMMENT '该笔收汇汇率(银行水单带入,逐笔×汇率)',
  `slip_url`       VARCHAR(500)  DEFAULT NULL COMMENT '银行水单',
  `remark`         VARCHAR(255)  DEFAULT NULL,
  `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_settlement` (`settlement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='结算收汇记录';

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

CREATE TABLE IF NOT EXISTS `company_profile` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(100) NOT NULL COMMENT '公司全称(PDF抬头/合同甲方/开票抬头)',
  `short_name`   VARCHAR(50)  DEFAULT NULL,
  `address`      VARCHAR(200) DEFAULT NULL,
  `phone`        VARCHAR(30)  DEFAULT NULL,
  `tax_no`       VARCHAR(30)  DEFAULT NULL COMMENT '税号',
  `bank_name`    VARCHAR(100) DEFAULT NULL,
  `bank_account` VARCHAR(40)  DEFAULT NULL,
  `legal_rep`    VARCHAR(50)  DEFAULT NULL COMMENT '法定代表人',
  `logo_url`     VARCHAR(500) DEFAULT NULL,
  `seal_url`     VARCHAR(500) DEFAULT NULL COMMENT '本司电子章图片(PDF落款自动贴章,A3)',
  `is_default`   TINYINT      NOT NULL DEFAULT 0 COMMENT '1=默认主体',
  `remark`       VARCHAR(200) DEFAULT NULL,
  `deleted`      TINYINT      NOT NULL DEFAULT 0,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_default` (`is_default`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='本司主体';

CREATE TABLE IF NOT EXISTS `feedback` (
  `id`         BIGINT       NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT       NOT NULL COMMENT '提交用户',
  `username`   VARCHAR(50)  DEFAULT NULL COMMENT '提交人(快照)',
  `content`    TEXT         NOT NULL COMMENT '问题描述',
  `images`     TEXT         DEFAULT NULL COMMENT '图片URL(JSON数组)',
  `page_url`   VARCHAR(255) DEFAULT NULL COMMENT '提交页面',
  `status`     ENUM('PENDING','HANDLED') NOT NULL DEFAULT 'PENDING',
  `reply`      VARCHAR(500) DEFAULT NULL COMMENT '处理回复',
  `deleted`    TINYINT      NOT NULL DEFAULT 0,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户反馈';

CREATE TABLE IF NOT EXISTS `error_log` (
  `id`          BIGINT        NOT NULL AUTO_INCREMENT,
  `fingerprint` VARCHAR(40)   NOT NULL COMMENT '去重指纹',
  `method`      VARCHAR(10)   NOT NULL,
  `path`        VARCHAR(255)  NOT NULL,
  `status_code` INT           NOT NULL DEFAULT 500,
  `code`        INT           NOT NULL DEFAULT 5000 COMMENT '业务返回码',
  `error_type`  VARCHAR(100)  DEFAULT NULL COMMENT '异常类型',
  `message`     VARCHAR(1000) DEFAULT NULL,
  `stack`       TEXT          DEFAULT NULL COMMENT '堆栈(仅未捕获/500)',
  `req_input`   TEXT          DEFAULT NULL COMMENT '输入上下文(query/params/body脱敏)',
  `resp_output` TEXT          DEFAULT NULL COMMENT '输出(code/msg)',
  `user_id`     BIGINT        DEFAULT NULL,
  `username`    VARCHAR(50)   DEFAULT NULL,
  `ip`          VARCHAR(45)   DEFAULT NULL,
  `count`       INT           NOT NULL DEFAULT 1 COMMENT '同类累计次数',
  `status`      ENUM('OPEN','HANDLED') NOT NULL DEFAULT 'OPEN',
  `first_seen`  DATETIME      NOT NULL,
  `last_seen`   DATETIME      NOT NULL,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fingerprint` (`fingerprint`),
  KEY `idx_status` (`status`,`last_seen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统报错记录';

-- —— 逐列补齐 + 类型同步(缺列补列;列在但类型≠HEAD 则 MODIFY,含枚举扩值/列宽) ——
-- sys_user
CALL _i9_add_col('sys_user','username',"VARCHAR(50)  NOT NULL COMMENT '登录用户名'");
CALL _i9_sync_col('sys_user','username',"VARCHAR(50)","VARCHAR(50)  NOT NULL COMMENT '登录用户名'");
CALL _i9_add_col('sys_user','password',"VARCHAR(255) NOT NULL COMMENT '密码(bcrypt)'");
CALL _i9_sync_col('sys_user','password',"VARCHAR(255)","VARCHAR(255) NOT NULL COMMENT '密码(bcrypt)'");
CALL _i9_add_col('sys_user','real_name',"VARCHAR(50)  NOT NULL COMMENT '真实姓名'");
CALL _i9_sync_col('sys_user','real_name',"VARCHAR(50)","VARCHAR(50)  NOT NULL COMMENT '真实姓名'");
CALL _i9_add_col('sys_user','role',"ENUM('ADMIN','BUSINESS','FINANCE','PATTERNMAKER','SUPERVISOR','SAMPLE_MAKER') NOT NULL DEFAULT 'BUSINESS'");
CALL _i9_sync_col('sys_user','role',"ENUM('ADMIN','BUSINESS','FINANCE','PATTERNMAKER','SUPERVISOR','SAMPLE_MAKER')","ENUM('ADMIN','BUSINESS','FINANCE','PATTERNMAKER','SUPERVISOR','SAMPLE_MAKER') NOT NULL DEFAULT 'BUSINESS'");
CALL _i9_add_col('sys_user','status',"TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用'");
CALL _i9_sync_col('sys_user','status',"TINYINT","TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用'");
CALL _i9_add_col('sys_user','created_at',"DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('sys_user','created_at',"DATETIME","DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_add_col('sys_user','updated_at',"DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('sys_user','updated_at',"DATETIME","DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

-- sys_sequence
CALL _i9_add_col('sys_sequence','name',"VARCHAR(64) NOT NULL COMMENT '计数器名(与 Redis seq:* key 同名)'");
CALL _i9_sync_col('sys_sequence','name',"VARCHAR(64)","VARCHAR(64) NOT NULL COMMENT '计数器名(与 Redis seq:* key 同名)'");
CALL _i9_add_col('sys_sequence','value',"BIGINT      NOT NULL DEFAULT 0 COMMENT '已发出的最大序号(影子计数,Redis 挂时行锁兜底发号)'");
CALL _i9_sync_col('sys_sequence','value',"BIGINT","BIGINT      NOT NULL DEFAULT 0 COMMENT '已发出的最大序号(影子计数,Redis 挂时行锁兜底发号)'");
CALL _i9_add_col('sys_sequence','updated_at',"DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('sys_sequence','updated_at',"DATETIME","DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

-- sys_dict
CALL _i9_add_col('sys_dict','type',"VARCHAR(40)  NOT NULL COMMENT '字典类别'");
CALL _i9_sync_col('sys_dict','type',"VARCHAR(40)","VARCHAR(40)  NOT NULL COMMENT '字典类别'");
CALL _i9_add_col('sys_dict','label',"VARCHAR(100) NOT NULL COMMENT '显示值'");
CALL _i9_sync_col('sys_dict','label',"VARCHAR(100)","VARCHAR(100) NOT NULL COMMENT '显示值'");
CALL _i9_add_col('sys_dict','value',"VARCHAR(100) DEFAULT NULL COMMENT '附加值(币种字典存默认汇率)'");
CALL _i9_sync_col('sys_dict','value',"VARCHAR(100)","VARCHAR(100) DEFAULT NULL COMMENT '附加值(币种字典存默认汇率)'");
CALL _i9_add_col('sys_dict','sort',"INT          NOT NULL DEFAULT 0");
CALL _i9_sync_col('sys_dict','sort',"INT","INT          NOT NULL DEFAULT 0");
CALL _i9_add_col('sys_dict','status',"TINYINT      NOT NULL DEFAULT 1");
CALL _i9_sync_col('sys_dict','status',"TINYINT","TINYINT      NOT NULL DEFAULT 1");
CALL _i9_add_col('sys_dict','created_at',"DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('sys_dict','created_at',"DATETIME","DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP");

-- supplier_account
CALL _i9_add_col('supplier_account','account',"VARCHAR(50)  NOT NULL COMMENT '登录账号'");
CALL _i9_sync_col('supplier_account','account',"VARCHAR(50)","VARCHAR(50)  NOT NULL COMMENT '登录账号'");
CALL _i9_add_col('supplier_account','password',"VARCHAR(255) NOT NULL COMMENT '密码(bcrypt)'");
CALL _i9_sync_col('supplier_account','password',"VARCHAR(255)","VARCHAR(255) NOT NULL COMMENT '密码(bcrypt)'");
CALL _i9_add_col('supplier_account','factory_id',"BIGINT       NOT NULL COMMENT '关联工厂'");
CALL _i9_sync_col('supplier_account','factory_id',"BIGINT","BIGINT       NOT NULL COMMENT '关联工厂'");
CALL _i9_add_col('supplier_account','status',"TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=禁用'");
CALL _i9_sync_col('supplier_account','status',"TINYINT","TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=禁用'");
CALL _i9_add_col('supplier_account','last_login_at',"DATETIME     DEFAULT NULL");
CALL _i9_sync_col('supplier_account','last_login_at',"DATETIME","DATETIME     DEFAULT NULL");
CALL _i9_add_col('supplier_account','created_at',"DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('supplier_account','created_at',"DATETIME","DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_add_col('supplier_account','updated_at',"DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('supplier_account','updated_at',"DATETIME","DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

-- factory
CALL _i9_add_col('factory','factory_no',"VARCHAR(20)   NOT NULL COMMENT '厂商编号 S001（自动生成/大写/唯一）'");
CALL _i9_sync_col('factory','factory_no',"VARCHAR(20)","VARCHAR(20)   NOT NULL COMMENT '厂商编号 S001（自动生成/大写/唯一）'");
CALL _i9_add_col('factory','type',"ENUM('FABRIC','ACCESSORY','OUTSOURCE','FORWARDER','TESTING','EXPORT','OTHER') NOT NULL DEFAULT 'FABRIC' COMMENT '工厂主身份'");
CALL _i9_sync_col('factory','type',"ENUM('FABRIC','ACCESSORY','OUTSOURCE','FORWARDER','TESTING','EXPORT','OTHER')","ENUM('FABRIC','ACCESSORY','OUTSOURCE','FORWARDER','TESTING','EXPORT','OTHER') NOT NULL DEFAULT 'FABRIC' COMMENT '工厂主身份'");
CALL _i9_add_col('factory','extra_types',"VARCHAR(100)   DEFAULT NULL COMMENT '附加身份(逗号分隔,工厂双身份)'");
CALL _i9_sync_col('factory','extra_types',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL COMMENT '附加身份(逗号分隔,工厂双身份)'");
CALL _i9_add_col('factory','seal_url',"VARCHAR(500)  DEFAULT NULL COMMENT '供应商电子章图片(盖章后PDF落款贴章,A3)'");
CALL _i9_sync_col('factory','seal_url',"VARCHAR(500)","VARCHAR(500)  DEFAULT NULL COMMENT '供应商电子章图片(盖章后PDF落款贴章,A3)'");
CALL _i9_add_col('factory','can_invoice',"TINYINT       NOT NULL DEFAULT 1 COMMENT '能否开票 1=是 0=否'");
CALL _i9_sync_col('factory','can_invoice',"TINYINT","TINYINT       NOT NULL DEFAULT 1 COMMENT '能否开票 1=是 0=否'");
CALL _i9_add_col('factory','name',"VARCHAR(100)  NOT NULL COMMENT '厂商名称（唯一）'");
CALL _i9_sync_col('factory','name',"VARCHAR(100)","VARCHAR(100)  NOT NULL COMMENT '厂商名称（唯一）'");
CALL _i9_add_col('factory','short_name',"VARCHAR(50)   DEFAULT NULL COMMENT '简称'");
CALL _i9_sync_col('factory','short_name',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '简称'");
CALL _i9_add_col('factory','contact_name',"VARCHAR(50)   DEFAULT NULL COMMENT '主联系人（自动取子表首行）'");
CALL _i9_sync_col('factory','contact_name',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '主联系人（自动取子表首行）'");
CALL _i9_add_col('factory','contact_phone',"VARCHAR(30)   DEFAULT NULL COMMENT '主联系电话（自动取子表首行）'");
CALL _i9_sync_col('factory','contact_phone',"VARCHAR(30)","VARCHAR(30)   DEFAULT NULL COMMENT '主联系电话（自动取子表首行）'");
CALL _i9_add_col('factory','province',"VARCHAR(30)   DEFAULT NULL COMMENT '所在省份'");
CALL _i9_sync_col('factory','province',"VARCHAR(30)","VARCHAR(30)   DEFAULT NULL COMMENT '所在省份'");
CALL _i9_add_col('factory','city',"VARCHAR(30)   DEFAULT NULL COMMENT '所在城市'");
CALL _i9_sync_col('factory','city',"VARCHAR(30)","VARCHAR(30)   DEFAULT NULL COMMENT '所在城市'");
CALL _i9_add_col('factory','address',"VARCHAR(200)  DEFAULT NULL COMMENT '详细地址'");
CALL _i9_sync_col('factory','address',"VARCHAR(200)","VARCHAR(200)  DEFAULT NULL COMMENT '详细地址'");
CALL _i9_add_col('factory','business_scope',"VARCHAR(200)  DEFAULT NULL COMMENT '业务范围'");
CALL _i9_sync_col('factory','business_scope',"VARCHAR(200)","VARCHAR(200)  DEFAULT NULL COMMENT '业务范围'");
CALL _i9_add_col('factory','grade',"VARCHAR(10)    DEFAULT NULL COMMENT '信用等级A/B/C'");
CALL _i9_sync_col('factory','grade',"VARCHAR(10)","VARCHAR(10)    DEFAULT NULL COMMENT '信用等级A/B/C'");
CALL _i9_add_col('factory','develop_date',"DATE          DEFAULT NULL COMMENT '开发时间'");
CALL _i9_sync_col('factory','develop_date',"DATE","DATE          DEFAULT NULL COMMENT '开发时间'");
CALL _i9_add_col('factory','bank_name',"VARCHAR(100)  DEFAULT NULL COMMENT '开户银行'");
CALL _i9_sync_col('factory','bank_name',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL COMMENT '开户银行'");
CALL _i9_add_col('factory','bank_account',"VARCHAR(40)   DEFAULT NULL COMMENT '银行帐号'");
CALL _i9_sync_col('factory','bank_account',"VARCHAR(40)","VARCHAR(40)   DEFAULT NULL COMMENT '银行帐号'");
CALL _i9_add_col('factory','tax_no',"VARCHAR(30)   DEFAULT NULL COMMENT '公司税号'");
CALL _i9_sync_col('factory','tax_no',"VARCHAR(30)","VARCHAR(30)   DEFAULT NULL COMMENT '公司税号'");
CALL _i9_add_col('factory','invoice_phone',"VARCHAR(30)   DEFAULT NULL COMMENT '开票电话'");
CALL _i9_sync_col('factory','invoice_phone',"VARCHAR(30)","VARCHAR(30)   DEFAULT NULL COMMENT '开票电话'");
CALL _i9_add_col('factory','invoice_address',"VARCHAR(200) DEFAULT NULL COMMENT '开票地址'");
CALL _i9_sync_col('factory','invoice_address',"VARCHAR(200)","VARCHAR(200) DEFAULT NULL COMMENT '开票地址'");
CALL _i9_add_col('factory','bank_name2',"VARCHAR(100)  DEFAULT NULL COMMENT '开户银行(2)'");
CALL _i9_sync_col('factory','bank_name2',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL COMMENT '开户银行(2)'");
CALL _i9_add_col('factory','bank_account2',"VARCHAR(40)   DEFAULT NULL COMMENT '银行帐号(2)'");
CALL _i9_sync_col('factory','bank_account2',"VARCHAR(40)","VARCHAR(40)   DEFAULT NULL COMMENT '银行帐号(2)'");
CALL _i9_add_col('factory','tax_no2',"VARCHAR(30)   DEFAULT NULL COMMENT '公司税号(2)'");
CALL _i9_sync_col('factory','tax_no2',"VARCHAR(30)","VARCHAR(30)   DEFAULT NULL COMMENT '公司税号(2)'");
CALL _i9_add_col('factory','invoice_phone2',"VARCHAR(30)   DEFAULT NULL COMMENT '开票电话(2)'");
CALL _i9_sync_col('factory','invoice_phone2',"VARCHAR(30)","VARCHAR(30)   DEFAULT NULL COMMENT '开票电话(2)'");
CALL _i9_add_col('factory','invoice_address2',"VARCHAR(200) DEFAULT NULL COMMENT '开票地址(2)'");
CALL _i9_sync_col('factory','invoice_address2',"VARCHAR(200)","VARCHAR(200) DEFAULT NULL COMMENT '开票地址(2)'");
CALL _i9_add_col('factory','legal_rep',"VARCHAR(50)   DEFAULT NULL COMMENT '法人代表'");
CALL _i9_sync_col('factory','legal_rep',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '法人代表'");
CALL _i9_add_col('factory','registered_capital',"BIGINT    DEFAULT NULL COMMENT '注册资金'");
CALL _i9_sync_col('factory','registered_capital',"BIGINT","BIGINT    DEFAULT NULL COMMENT '注册资金'");
CALL _i9_add_col('factory','established_date',"DATE        DEFAULT NULL COMMENT '设立时间'");
CALL _i9_sync_col('factory','established_date',"DATE","DATE        DEFAULT NULL COMMENT '设立时间'");
CALL _i9_add_col('factory','annual_sales',"DECIMAL(16,2) DEFAULT NULL COMMENT '年销售额'");
CALL _i9_sync_col('factory','annual_sales',"DECIMAL(16,2)","DECIMAL(16,2) DEFAULT NULL COMMENT '年销售额'");
CALL _i9_add_col('factory','representative_customers',"VARCHAR(200) DEFAULT NULL COMMENT '代表客户'");
CALL _i9_sync_col('factory','representative_customers',"VARCHAR(200)","VARCHAR(200) DEFAULT NULL COMMENT '代表客户'");
CALL _i9_add_col('factory','quality_certs',"TEXT          DEFAULT NULL COMMENT '质量证书'");
CALL _i9_sync_col('factory','quality_certs',"TEXT","TEXT          DEFAULT NULL COMMENT '质量证书'");
CALL _i9_add_col('factory','remark',"TEXT          DEFAULT NULL COMMENT '备注'");
CALL _i9_sync_col('factory','remark',"TEXT","TEXT          DEFAULT NULL COMMENT '备注'");
CALL _i9_add_col('factory','last_trade_date',"DATE         DEFAULT NULL COMMENT '最后交易日期（列表超期标红）'");
CALL _i9_sync_col('factory','last_trade_date',"DATE","DATE         DEFAULT NULL COMMENT '最后交易日期（列表超期标红）'");
CALL _i9_add_col('factory','status',"TINYINT       NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用'");
CALL _i9_sync_col('factory','status',"TINYINT","TINYINT       NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用'");
CALL _i9_add_col('factory','created_by',"BIGINT        DEFAULT NULL");
CALL _i9_sync_col('factory','created_by',"BIGINT","BIGINT        DEFAULT NULL");
CALL _i9_add_col('factory','created_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('factory','created_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_add_col('factory','updated_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('factory','updated_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_add_col('factory','deleted',"TINYINT       NOT NULL DEFAULT 0");
CALL _i9_sync_col('factory','deleted',"TINYINT","TINYINT       NOT NULL DEFAULT 0");

-- factory_contact
CALL _i9_add_col('factory_contact','factory_id',"BIGINT       NOT NULL");
CALL _i9_sync_col('factory_contact','factory_id',"BIGINT","BIGINT       NOT NULL");
CALL _i9_add_col('factory_contact','sort_order',"INT          NOT NULL DEFAULT 0");
CALL _i9_sync_col('factory_contact','sort_order',"INT","INT          NOT NULL DEFAULT 0");
CALL _i9_add_col('factory_contact','name',"VARCHAR(50)  DEFAULT NULL COMMENT '姓名'");
CALL _i9_sync_col('factory_contact','name',"VARCHAR(50)","VARCHAR(50)  DEFAULT NULL COMMENT '姓名'");
CALL _i9_add_col('factory_contact','department',"VARCHAR(50)  DEFAULT NULL COMMENT '部门'");
CALL _i9_sync_col('factory_contact','department',"VARCHAR(50)","VARCHAR(50)  DEFAULT NULL COMMENT '部门'");
CALL _i9_add_col('factory_contact','title',"VARCHAR(50)  DEFAULT NULL COMMENT '职务'");
CALL _i9_sync_col('factory_contact','title',"VARCHAR(50)","VARCHAR(50)  DEFAULT NULL COMMENT '职务'");
CALL _i9_add_col('factory_contact','phone',"VARCHAR(30)  DEFAULT NULL COMMENT '电话号码'");
CALL _i9_sync_col('factory_contact','phone',"VARCHAR(30)","VARCHAR(30)  DEFAULT NULL COMMENT '电话号码'");
CALL _i9_add_col('factory_contact','mobile',"VARCHAR(30)  DEFAULT NULL COMMENT '手机号码'");
CALL _i9_sync_col('factory_contact','mobile',"VARCHAR(30)","VARCHAR(30)  DEFAULT NULL COMMENT '手机号码'");
CALL _i9_add_col('factory_contact','email',"VARCHAR(100) DEFAULT NULL COMMENT '电子邮件'");
CALL _i9_sync_col('factory_contact','email',"VARCHAR(100)","VARCHAR(100) DEFAULT NULL COMMENT '电子邮件'");
CALL _i9_add_col('factory_contact','remark',"VARCHAR(200) DEFAULT NULL COMMENT '备注'");
CALL _i9_sync_col('factory_contact','remark',"VARCHAR(200)","VARCHAR(200) DEFAULT NULL COMMENT '备注'");

-- customer
CALL _i9_add_col('customer','customer_no',"VARCHAR(20)   NOT NULL COMMENT '客户编号 CN001（自动生成/唯一）'");
CALL _i9_sync_col('customer','customer_no',"VARCHAR(20)","VARCHAR(20)   NOT NULL COMMENT '客户编号 CN001（自动生成/唯一）'");
CALL _i9_add_col('customer','name',"VARCHAR(100)  NOT NULL COMMENT '客户名称（唯一）'");
CALL _i9_sync_col('customer','name',"VARCHAR(100)","VARCHAR(100)  NOT NULL COMMENT '客户名称（唯一）'");
CALL _i9_add_col('customer','short_name',"VARCHAR(50)   DEFAULT NULL");
CALL _i9_sync_col('customer','short_name',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL");
CALL _i9_add_col('customer','type',"ENUM('MIDDLEMAN','BUYER') NOT NULL DEFAULT 'MIDDLEMAN' COMMENT '客户类型 中间商/最终买家'");
CALL _i9_sync_col('customer','type',"ENUM('MIDDLEMAN','BUYER')","ENUM('MIDDLEMAN','BUYER') NOT NULL DEFAULT 'MIDDLEMAN' COMMENT '客户类型 中间商/最终买家'");
CALL _i9_add_col('customer','related_middleman',"VARCHAR(200) DEFAULT NULL COMMENT '关联中间商（买家必填，中间商ID逗号串）'");
CALL _i9_sync_col('customer','related_middleman',"VARCHAR(200)","VARCHAR(200) DEFAULT NULL COMMENT '关联中间商（买家必填，中间商ID逗号串）'");
CALL _i9_add_col('customer','trade_country',"VARCHAR(50)   DEFAULT NULL COMMENT '贸易国别'");
CALL _i9_sync_col('customer','trade_country',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '贸易国别'");
CALL _i9_add_col('customer','country_region',"VARCHAR(50)   DEFAULT NULL COMMENT '国家区域（随贸易国别带出）'");
CALL _i9_sync_col('customer','country_region',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '国家区域（随贸易国别带出）'");
CALL _i9_add_col('customer','city',"VARCHAR(50)   DEFAULT NULL COMMENT '所在城市'");
CALL _i9_sync_col('customer','city',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '所在城市'");
CALL _i9_add_col('customer','homepage',"VARCHAR(200)  DEFAULT NULL COMMENT '公司主页'");
CALL _i9_sync_col('customer','homepage',"VARCHAR(200)","VARCHAR(200)  DEFAULT NULL COMMENT '公司主页'");
CALL _i9_add_col('customer','address',"VARCHAR(200)  DEFAULT NULL COMMENT '详细地址'");
CALL _i9_sync_col('customer','address',"VARCHAR(200)","VARCHAR(200)  DEFAULT NULL COMMENT '详细地址'");
CALL _i9_add_col('customer','price_terms',"VARCHAR(50)   DEFAULT NULL COMMENT '价格条款'");
CALL _i9_sync_col('customer','price_terms',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '价格条款'");
CALL _i9_add_col('customer','settlement_method',"VARCHAR(50) DEFAULT NULL COMMENT '结汇方式'");
CALL _i9_sync_col('customer','settlement_method',"VARCHAR(50)","VARCHAR(50) DEFAULT NULL COMMENT '结汇方式'");
CALL _i9_add_col('customer','grade',"ENUM('A','B','C') DEFAULT NULL COMMENT '信用等级'");
CALL _i9_sync_col('customer','grade',"ENUM('A','B','C')","ENUM('A','B','C') DEFAULT NULL COMMENT '信用等级'");
CALL _i9_add_col('customer','cooperation_level',"VARCHAR(20) DEFAULT NULL COMMENT '合作等级'");
CALL _i9_sync_col('customer','cooperation_level',"VARCHAR(20)","VARCHAR(20) DEFAULT NULL COMMENT '合作等级'");
CALL _i9_add_col('customer','customer_source',"VARCHAR(50)   DEFAULT NULL COMMENT '客户来源'");
CALL _i9_sync_col('customer','customer_source',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '客户来源'");
CALL _i9_add_col('customer','payment_days',"INT           DEFAULT NULL COMMENT '付款期限（天）'");
CALL _i9_sync_col('customer','payment_days',"INT","INT           DEFAULT NULL COMMENT '付款期限（天）'");
CALL _i9_add_col('customer','business_scope',"VARCHAR(200)  DEFAULT NULL COMMENT '业务范围'");
CALL _i9_sync_col('customer','business_scope',"VARCHAR(200)","VARCHAR(200)  DEFAULT NULL COMMENT '业务范围'");
CALL _i9_add_col('customer','salesperson',"VARCHAR(50)   DEFAULT NULL COMMENT '外销员'");
CALL _i9_sync_col('customer','salesperson',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '外销员'");
CALL _i9_add_col('customer','develop_date',"DATE          DEFAULT NULL COMMENT '开发时间'");
CALL _i9_sync_col('customer','develop_date',"DATE","DATE          DEFAULT NULL COMMENT '开发时间'");
CALL _i9_add_col('customer','spare1',"VARCHAR(100)  DEFAULT NULL COMMENT '备用字段1'");
CALL _i9_sync_col('customer','spare1',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL COMMENT '备用字段1'");
CALL _i9_add_col('customer','spare2',"VARCHAR(100)  DEFAULT NULL COMMENT '备用字段2'");
CALL _i9_sync_col('customer','spare2',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL COMMENT '备用字段2'");
CALL _i9_add_col('customer','spare3',"VARCHAR(100)  DEFAULT NULL COMMENT '备用字段3'");
CALL _i9_sync_col('customer','spare3',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL COMMENT '备用字段3'");
CALL _i9_add_col('customer','delivery_address',"TEXT         DEFAULT NULL COMMENT '收货地址'");
CALL _i9_sync_col('customer','delivery_address',"TEXT","TEXT         DEFAULT NULL COMMENT '收货地址'");
CALL _i9_add_col('customer','front_mark',"TEXT          DEFAULT NULL COMMENT '正面唛头'");
CALL _i9_sync_col('customer','front_mark',"TEXT","TEXT          DEFAULT NULL COMMENT '正面唛头'");
CALL _i9_add_col('customer','side_mark',"TEXT          DEFAULT NULL COMMENT '侧面唛头'");
CALL _i9_sync_col('customer','side_mark',"TEXT","TEXT          DEFAULT NULL COMMENT '侧面唛头'");
CALL _i9_add_col('customer','inner_box_text',"TEXT          DEFAULT NULL COMMENT '内盒文字'");
CALL _i9_sync_col('customer','inner_box_text',"TEXT","TEXT          DEFAULT NULL COMMENT '内盒文字'");
CALL _i9_add_col('customer','customer_remark',"TEXT          DEFAULT NULL COMMENT '客户备注'");
CALL _i9_sync_col('customer','customer_remark',"TEXT","TEXT          DEFAULT NULL COMMENT '客户备注'");
CALL _i9_add_col('customer','currency',"VARCHAR(5)    NOT NULL DEFAULT 'USD' COMMENT '主结算币种'");
CALL _i9_sync_col('customer','currency',"VARCHAR(5)","VARCHAR(5)    NOT NULL DEFAULT 'USD' COMMENT '主结算币种'");
CALL _i9_add_col('customer','status',"TINYINT       NOT NULL DEFAULT 1");
CALL _i9_sync_col('customer','status',"TINYINT","TINYINT       NOT NULL DEFAULT 1");
CALL _i9_add_col('customer','remark',"TEXT          DEFAULT NULL");
CALL _i9_sync_col('customer','remark',"TEXT","TEXT          DEFAULT NULL");
CALL _i9_add_col('customer','created_by',"BIGINT        DEFAULT NULL");
CALL _i9_sync_col('customer','created_by',"BIGINT","BIGINT        DEFAULT NULL");
CALL _i9_add_col('customer','created_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('customer','created_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_add_col('customer','updated_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('customer','updated_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_add_col('customer','deleted',"TINYINT       NOT NULL DEFAULT 0");
CALL _i9_sync_col('customer','deleted',"TINYINT","TINYINT       NOT NULL DEFAULT 0");

-- customer_contact
CALL _i9_add_col('customer_contact','customer_id',"BIGINT       NOT NULL");
CALL _i9_sync_col('customer_contact','customer_id',"BIGINT","BIGINT       NOT NULL");
CALL _i9_add_col('customer_contact','sort_order',"INT          NOT NULL DEFAULT 0");
CALL _i9_sync_col('customer_contact','sort_order',"INT","INT          NOT NULL DEFAULT 0");
CALL _i9_add_col('customer_contact','name',"VARCHAR(50)  DEFAULT NULL");
CALL _i9_sync_col('customer_contact','name',"VARCHAR(50)","VARCHAR(50)  DEFAULT NULL");
CALL _i9_add_col('customer_contact','department',"VARCHAR(50)  DEFAULT NULL");
CALL _i9_sync_col('customer_contact','department',"VARCHAR(50)","VARCHAR(50)  DEFAULT NULL");
CALL _i9_add_col('customer_contact','gender',"VARCHAR(2)   DEFAULT NULL COMMENT 'M/F'");
CALL _i9_sync_col('customer_contact','gender',"VARCHAR(2)","VARCHAR(2)   DEFAULT NULL COMMENT 'M/F'");
CALL _i9_add_col('customer_contact','title',"VARCHAR(50)  DEFAULT NULL");
CALL _i9_sync_col('customer_contact','title',"VARCHAR(50)","VARCHAR(50)  DEFAULT NULL");
CALL _i9_add_col('customer_contact','phone',"VARCHAR(30)  DEFAULT NULL");
CALL _i9_sync_col('customer_contact','phone',"VARCHAR(30)","VARCHAR(30)  DEFAULT NULL");
CALL _i9_add_col('customer_contact','mobile',"VARCHAR(30)  DEFAULT NULL");
CALL _i9_sync_col('customer_contact','mobile',"VARCHAR(30)","VARCHAR(30)  DEFAULT NULL");
CALL _i9_add_col('customer_contact','mobile1',"VARCHAR(30)  DEFAULT NULL");
CALL _i9_sync_col('customer_contact','mobile1',"VARCHAR(30)","VARCHAR(30)  DEFAULT NULL");
CALL _i9_add_col('customer_contact','mobile2',"VARCHAR(30)  DEFAULT NULL");
CALL _i9_sync_col('customer_contact','mobile2',"VARCHAR(30)","VARCHAR(30)  DEFAULT NULL");
CALL _i9_add_col('customer_contact','email',"VARCHAR(100) DEFAULT NULL");
CALL _i9_sync_col('customer_contact','email',"VARCHAR(100)","VARCHAR(100) DEFAULT NULL");
CALL _i9_add_col('customer_contact','remark',"VARCHAR(200) DEFAULT NULL");
CALL _i9_sync_col('customer_contact','remark',"VARCHAR(200)","VARCHAR(200) DEFAULT NULL");

-- customer_bank
CALL _i9_add_col('customer_bank','customer_id',"BIGINT       NOT NULL");
CALL _i9_sync_col('customer_bank','customer_id',"BIGINT","BIGINT       NOT NULL");
CALL _i9_add_col('customer_bank','sort_order',"INT          NOT NULL DEFAULT 0");
CALL _i9_sync_col('customer_bank','sort_order',"INT","INT          NOT NULL DEFAULT 0");
CALL _i9_add_col('customer_bank','account_name',"VARCHAR(100) DEFAULT NULL COMMENT '开户名称（自动=客户名称）'");
CALL _i9_sync_col('customer_bank','account_name',"VARCHAR(100)","VARCHAR(100) DEFAULT NULL COMMENT '开户名称（自动=客户名称）'");
CALL _i9_add_col('customer_bank','bank_name',"VARCHAR(100) DEFAULT NULL");
CALL _i9_sync_col('customer_bank','bank_name',"VARCHAR(100)","VARCHAR(100) DEFAULT NULL");
CALL _i9_add_col('customer_bank','bank_account',"VARCHAR(40)  DEFAULT NULL");
CALL _i9_sync_col('customer_bank','bank_account',"VARCHAR(40)","VARCHAR(40)  DEFAULT NULL");
CALL _i9_add_col('customer_bank','bank_address',"VARCHAR(200) DEFAULT NULL");
CALL _i9_sync_col('customer_bank','bank_address',"VARCHAR(200)","VARCHAR(200) DEFAULT NULL");
CALL _i9_add_col('customer_bank','currency',"VARCHAR(20)  DEFAULT NULL");
CALL _i9_sync_col('customer_bank','currency',"VARCHAR(20)","VARCHAR(20)  DEFAULT NULL");
CALL _i9_add_col('customer_bank','swift_code',"VARCHAR(20)  DEFAULT NULL");
CALL _i9_sync_col('customer_bank','swift_code',"VARCHAR(20)","VARCHAR(20)  DEFAULT NULL");
CALL _i9_add_col('customer_bank','remark',"VARCHAR(200) DEFAULT NULL");
CALL _i9_sync_col('customer_bank','remark',"VARCHAR(200)","VARCHAR(200) DEFAULT NULL");

-- customer_express
CALL _i9_add_col('customer_express','customer_id',"BIGINT       NOT NULL");
CALL _i9_sync_col('customer_express','customer_id',"BIGINT","BIGINT       NOT NULL");
CALL _i9_add_col('customer_express','sort_order',"INT          NOT NULL DEFAULT 0");
CALL _i9_sync_col('customer_express','sort_order',"INT","INT          NOT NULL DEFAULT 0");
CALL _i9_add_col('customer_express','company',"VARCHAR(100) DEFAULT NULL COMMENT '快件公司（来自工厂资料）'");
CALL _i9_sync_col('customer_express','company',"VARCHAR(100)","VARCHAR(100) DEFAULT NULL COMMENT '快件公司（来自工厂资料）'");
CALL _i9_add_col('customer_express','account',"VARCHAR(50)  DEFAULT NULL");
CALL _i9_sync_col('customer_express','account',"VARCHAR(50)","VARCHAR(50)  DEFAULT NULL");
CALL _i9_add_col('customer_express','pay_method',"VARCHAR(10)  DEFAULT NULL COMMENT '到付/预付'");
CALL _i9_sync_col('customer_express','pay_method',"VARCHAR(10)","VARCHAR(10)  DEFAULT NULL COMMENT '到付/预付'");
CALL _i9_add_col('customer_express','remark',"VARCHAR(200) DEFAULT NULL");
CALL _i9_sync_col('customer_express','remark',"VARCHAR(200)","VARCHAR(200) DEFAULT NULL");

-- customer_grant
CALL _i9_add_col('customer_grant','customer_id',"BIGINT   NOT NULL");
CALL _i9_sync_col('customer_grant','customer_id',"BIGINT","BIGINT   NOT NULL");
CALL _i9_add_col('customer_grant','user_id',"BIGINT   NOT NULL COMMENT '被授权用户'");
CALL _i9_sync_col('customer_grant','user_id',"BIGINT","BIGINT   NOT NULL COMMENT '被授权用户'");
CALL _i9_add_col('customer_grant','can_edit',"TINYINT  NOT NULL DEFAULT 0 COMMENT '0=仅查看 1=可修改'");
CALL _i9_sync_col('customer_grant','can_edit',"TINYINT","TINYINT  NOT NULL DEFAULT 0 COMMENT '0=仅查看 1=可修改'");
CALL _i9_add_col('customer_grant','expire_at',"DATE     DEFAULT NULL COMMENT '有效期至(过期授权自动失效,空=永久)'");
CALL _i9_sync_col('customer_grant','expire_at',"DATE","DATE     DEFAULT NULL COMMENT '有效期至(过期授权自动失效,空=永久)'");
CALL _i9_add_col('customer_grant','remark',"VARCHAR(200) DEFAULT NULL COMMENT '授权备注'");
CALL _i9_sync_col('customer_grant','remark',"VARCHAR(200)","VARCHAR(200) DEFAULT NULL COMMENT '授权备注'");
CALL _i9_add_col('customer_grant','created_by',"BIGINT   DEFAULT NULL COMMENT '授权人(管理员)'");
CALL _i9_sync_col('customer_grant','created_by',"BIGINT","BIGINT   DEFAULT NULL COMMENT '授权人(管理员)'");
CALL _i9_add_col('customer_grant','created_at',"DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('customer_grant','created_at',"DATETIME","DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");

-- sample_garment
CALL _i9_add_col('sample_garment','sample_no',"VARCHAR(30)   NOT NULL COMMENT 'S-YYYYMMDD-001'");
CALL _i9_sync_col('sample_garment','sample_no',"VARCHAR(30)","VARCHAR(30)   NOT NULL COMMENT 'S-YYYYMMDD-001'");
CALL _i9_add_col('sample_garment','categories',"VARCHAR(100)  DEFAULT NULL COMMENT '样衣类别(7类多选,逗号分隔)'");
CALL _i9_sync_col('sample_garment','categories',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL COMMENT '样衣类别(7类多选,逗号分隔)'");
CALL _i9_add_col('sample_garment','customer_id',"BIGINT        NOT NULL COMMENT '中间商客户ID'");
CALL _i9_sync_col('sample_garment','customer_id',"BIGINT","BIGINT        NOT NULL COMMENT '中间商客户ID'");
CALL _i9_add_col('sample_garment','middleman_name',"VARCHAR(100)  DEFAULT NULL COMMENT '中间商名称(自动)'");
CALL _i9_sync_col('sample_garment','middleman_name',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL COMMENT '中间商名称(自动)'");
CALL _i9_add_col('sample_garment','style_no',"VARCHAR(100)  NOT NULL COMMENT '客户款号(必填)'");
CALL _i9_sync_col('sample_garment','style_no',"VARCHAR(100)","VARCHAR(100)  NOT NULL COMMENT '客户款号(必填)'");
CALL _i9_add_col('sample_garment','buyer_id',"BIGINT        DEFAULT NULL COMMENT '关联最终买家'");
CALL _i9_sync_col('sample_garment','buyer_id',"BIGINT","BIGINT        DEFAULT NULL COMMENT '关联最终买家'");
CALL _i9_add_col('sample_garment','buyer_name',"VARCHAR(100)  DEFAULT NULL");
CALL _i9_sync_col('sample_garment','buyer_name',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL");
CALL _i9_add_col('sample_garment','buyer_no',"VARCHAR(30)   DEFAULT NULL COMMENT '买家编号(自动)'");
CALL _i9_sync_col('sample_garment','buyer_no',"VARCHAR(30)","VARCHAR(30)   DEFAULT NULL COMMENT '买家编号(自动)'");
CALL _i9_add_col('sample_garment','patternmaker_id',"BIGINT        DEFAULT NULL COMMENT '制版师'");
CALL _i9_sync_col('sample_garment','patternmaker_id',"BIGINT","BIGINT        DEFAULT NULL COMMENT '制版师'");
CALL _i9_add_col('sample_garment','patternmaker_name',"VARCHAR(50)  DEFAULT NULL");
CALL _i9_sync_col('sample_garment','patternmaker_name',"VARCHAR(50)","VARCHAR(50)  DEFAULT NULL");
CALL _i9_add_col('sample_garment','maker',"VARCHAR(50)   DEFAULT NULL COMMENT '制单人员'");
CALL _i9_sync_col('sample_garment','maker',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '制单人员'");
CALL _i9_add_col('sample_garment','make_date',"DATE          DEFAULT NULL COMMENT '制单日期'");
CALL _i9_sync_col('sample_garment','make_date',"DATE","DATE          DEFAULT NULL COMMENT '制单日期'");
CALL _i9_add_col('sample_garment','ship_sample_date',"DATE          DEFAULT NULL COMMENT '寄样日期'");
CALL _i9_sync_col('sample_garment','ship_sample_date',"DATE","DATE          DEFAULT NULL COMMENT '寄样日期'");
CALL _i9_add_col('sample_garment','recipient',"VARCHAR(50)   DEFAULT NULL COMMENT '收件人'");
CALL _i9_sync_col('sample_garment','recipient',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '收件人'");
CALL _i9_add_col('sample_garment','file_location',"VARCHAR(200)  DEFAULT NULL COMMENT '文件位置'");
CALL _i9_sync_col('sample_garment','file_location',"VARCHAR(200)","VARCHAR(200)  DEFAULT NULL COMMENT '文件位置'");
CALL _i9_add_col('sample_garment','garment_remark',"TEXT          DEFAULT NULL COMMENT '成衣备注'");
CALL _i9_sync_col('sample_garment','garment_remark',"TEXT","TEXT          DEFAULT NULL COMMENT '成衣备注'");
CALL _i9_add_col('sample_garment','image1',"VARCHAR(255)  DEFAULT NULL");
CALL _i9_sync_col('sample_garment','image1',"VARCHAR(255)","VARCHAR(255)  DEFAULT NULL");
CALL _i9_add_col('sample_garment','image2',"VARCHAR(255)  DEFAULT NULL");
CALL _i9_sync_col('sample_garment','image2',"VARCHAR(255)","VARCHAR(255)  DEFAULT NULL");
CALL _i9_add_col('sample_garment','image3',"VARCHAR(255)  DEFAULT NULL");
CALL _i9_sync_col('sample_garment','image3',"VARCHAR(255)","VARCHAR(255)  DEFAULT NULL");
CALL _i9_add_col('sample_garment','material_ship_no',"VARCHAR(50)  DEFAULT NULL COMMENT '材料寄出单号(触发推送版师)'");
CALL _i9_sync_col('sample_garment','material_ship_no',"VARCHAR(50)","VARCHAR(50)  DEFAULT NULL COMMENT '材料寄出单号(触发推送版师)'");
CALL _i9_add_col('sample_garment','material_ship_date',"DATE         DEFAULT NULL COMMENT '材料寄出日期(自动)'");
CALL _i9_sync_col('sample_garment','material_ship_date',"DATE","DATE         DEFAULT NULL COMMENT '材料寄出日期(自动)'");
CALL _i9_add_col('sample_garment','return_no',"VARCHAR(50)   DEFAULT NULL COMMENT '寄回快递单号(版师)'");
CALL _i9_sync_col('sample_garment','return_no',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '寄回快递单号(版师)'");
CALL _i9_add_col('sample_garment','return_date',"DATE          DEFAULT NULL COMMENT '寄回日期(自动)'");
CALL _i9_sync_col('sample_garment','return_date',"DATE","DATE          DEFAULT NULL COMMENT '寄回日期(自动)'");
CALL _i9_add_col('sample_garment','feedback_attachments',"VARCHAR(500) DEFAULT NULL COMMENT '样衣意见附件(客户反馈图/PDF,多文件逗号分隔)'");
CALL _i9_sync_col('sample_garment','feedback_attachments',"VARCHAR(500)","VARCHAR(500) DEFAULT NULL COMMENT '样衣意见附件(客户反馈图/PDF,多文件逗号分隔)'");
CALL _i9_add_col('sample_garment','piece_count',"INT           DEFAULT NULL COMMENT '件数(版师)'");
CALL _i9_sync_col('sample_garment','piece_count',"INT","INT           DEFAULT NULL COMMENT '件数(版师)'");
CALL _i9_add_col('sample_garment','labor_unit_price',"DECIMAL(12,2) DEFAULT NULL COMMENT '版师工时单价CNY'");
CALL _i9_sync_col('sample_garment','labor_unit_price',"DECIMAL(12,2)","DECIMAL(12,2) DEFAULT NULL COMMENT '版师工时单价CNY'");
CALL _i9_add_col('sample_garment','labor_amount',"DECIMAL(14,2) DEFAULT NULL COMMENT '工时金额CNY=件数×单价'");
CALL _i9_sync_col('sample_garment','labor_amount',"DECIMAL(14,2)","DECIMAL(14,2) DEFAULT NULL COMMENT '工时金额CNY=件数×单价'");
CALL _i9_add_col('sample_garment','status',"ENUM('PENDING','SAMPLING','SHIPPED','RETURNED','RECONCILED','DONE','ORDERED') NOT NULL DEFAULT 'PENDING'");
CALL _i9_sync_col('sample_garment','status',"ENUM('PENDING','SAMPLING','SHIPPED','RETURNED','RECONCILED','DONE','ORDERED')","ENUM('PENDING','SAMPLING','SHIPPED','RETURNED','RECONCILED','DONE','ORDERED') NOT NULL DEFAULT 'PENDING'");
CALL _i9_add_col('sample_garment','version',"INT           NOT NULL DEFAULT 1");
CALL _i9_sync_col('sample_garment','version',"INT","INT           NOT NULL DEFAULT 1");
CALL _i9_add_col('sample_garment','created_by',"BIGINT        NOT NULL");
CALL _i9_sync_col('sample_garment','created_by',"BIGINT","BIGINT        NOT NULL");
CALL _i9_add_col('sample_garment','created_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('sample_garment','created_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_add_col('sample_garment','updated_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('sample_garment','updated_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_add_col('sample_garment','deleted',"TINYINT       NOT NULL DEFAULT 0");
CALL _i9_sync_col('sample_garment','deleted',"TINYINT","TINYINT       NOT NULL DEFAULT 0");

-- sample_material
CALL _i9_add_col('sample_material','sample_id',"BIGINT        NOT NULL");
CALL _i9_sync_col('sample_material','sample_id',"BIGINT","BIGINT        NOT NULL");
CALL _i9_add_col('sample_material','sort_order',"INT           NOT NULL DEFAULT 0");
CALL _i9_sync_col('sample_material','sort_order',"INT","INT           NOT NULL DEFAULT 0");
CALL _i9_add_col('sample_material','arrange_date',"DATE          DEFAULT NULL COMMENT '安排日期'");
CALL _i9_sync_col('sample_material','arrange_date',"DATE","DATE          DEFAULT NULL COMMENT '安排日期'");
CALL _i9_add_col('sample_material','item_name',"VARCHAR(100)  DEFAULT NULL COMMENT '品名'");
CALL _i9_sync_col('sample_material','item_name',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL COMMENT '品名'");
CALL _i9_add_col('sample_material','width',"VARCHAR(30)   DEFAULT NULL COMMENT '门幅'");
CALL _i9_sync_col('sample_material','width',"VARCHAR(30)","VARCHAR(30)   DEFAULT NULL COMMENT '门幅'");
CALL _i9_add_col('sample_material','colors',"VARCHAR(200)  DEFAULT NULL COMMENT '颜色(动态多列,逗号分隔)'");
CALL _i9_sync_col('sample_material','colors',"VARCHAR(200)","VARCHAR(200)  DEFAULT NULL COMMENT '颜色(动态多列,逗号分隔)'");
CALL _i9_add_col('sample_material','part',"VARCHAR(50)   DEFAULT NULL COMMENT '部位'");
CALL _i9_sync_col('sample_material','part',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '部位'");
CALL _i9_add_col('sample_material','composition',"VARCHAR(100)  DEFAULT NULL COMMENT '成份'");
CALL _i9_sync_col('sample_material','composition',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL COMMENT '成份'");
CALL _i9_add_col('sample_material','code_band',"VARCHAR(50)   DEFAULT NULL COMMENT '码带'");
CALL _i9_sync_col('sample_material','code_band',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '码带'");
CALL _i9_add_col('sample_material','zipper_length',"VARCHAR(30)   DEFAULT NULL COMMENT '拉链长度(版师)'");
CALL _i9_sync_col('sample_material','zipper_length',"VARCHAR(30)","VARCHAR(30)   DEFAULT NULL COMMENT '拉链长度(版师)'");
CALL _i9_add_col('sample_material','puller',"VARCHAR(30)   DEFAULT NULL COMMENT '拉头'");
CALL _i9_sync_col('sample_material','puller',"VARCHAR(30)","VARCHAR(30)   DEFAULT NULL COMMENT '拉头'");
CALL _i9_add_col('sample_material','qty',"DECIMAL(12,2) DEFAULT NULL COMMENT '数量'");
CALL _i9_sync_col('sample_material','qty',"DECIMAL(12,2)","DECIMAL(12,2) DEFAULT NULL COMMENT '数量'");
CALL _i9_add_col('sample_material','size',"VARCHAR(50)   DEFAULT NULL COMMENT '尺寸(长×宽)'");
CALL _i9_sync_col('sample_material','size',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '尺寸(长×宽)'");
CALL _i9_add_col('sample_material','ref_price',"DECIMAL(12,2) DEFAULT NULL COMMENT '参考价格'");
CALL _i9_sync_col('sample_material','ref_price',"DECIMAL(12,2)","DECIMAL(12,2) DEFAULT NULL COMMENT '参考价格'");
CALL _i9_add_col('sample_material','actual_usage',"DECIMAL(12,4) DEFAULT NULL COMMENT '实际耗用(版师)'");
CALL _i9_sync_col('sample_material','actual_usage',"DECIMAL(12,4)","DECIMAL(12,4) DEFAULT NULL COMMENT '实际耗用(版师)'");
CALL _i9_add_col('sample_material','supplier_id',"BIGINT        DEFAULT NULL COMMENT '供应商编号'");
CALL _i9_sync_col('sample_material','supplier_id',"BIGINT","BIGINT        DEFAULT NULL COMMENT '供应商编号'");
CALL _i9_add_col('sample_material','supplier_name',"VARCHAR(100)  DEFAULT NULL COMMENT '供应商名称(自动)'");
CALL _i9_sync_col('sample_material','supplier_name',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL COMMENT '供应商名称(自动)'");
CALL _i9_add_col('sample_material','image',"VARCHAR(255)  DEFAULT NULL");
CALL _i9_sync_col('sample_material','image',"VARCHAR(255)","VARCHAR(255)  DEFAULT NULL");
CALL _i9_add_col('sample_material','remark',"VARCHAR(200)  DEFAULT NULL");
CALL _i9_sync_col('sample_material','remark',"VARCHAR(200)","VARCHAR(200)  DEFAULT NULL");

-- sample_version
CALL _i9_add_col('sample_version','sample_id',"BIGINT       NOT NULL");
CALL _i9_sync_col('sample_version','sample_id',"BIGINT","BIGINT       NOT NULL");
CALL _i9_add_col('sample_version','version',"INT          NOT NULL COMMENT '版次号'");
CALL _i9_sync_col('sample_version','version',"INT","INT          NOT NULL COMMENT '版次号'");
CALL _i9_add_col('sample_version','action',"VARCHAR(40)  NOT NULL COMMENT 'PUSH/PATTERNMAKER_SAVE/SHIP/COMPLETE/COPY'");
CALL _i9_sync_col('sample_version','action',"VARCHAR(40)","VARCHAR(40)  NOT NULL COMMENT 'PUSH/PATTERNMAKER_SAVE/SHIP/COMPLETE/COPY'");
CALL _i9_add_col('sample_version','operator_id',"BIGINT       NOT NULL COMMENT '操作人'");
CALL _i9_sync_col('sample_version','operator_id',"BIGINT","BIGINT       NOT NULL COMMENT '操作人'");
CALL _i9_add_col('sample_version','remark',"TEXT         DEFAULT NULL");
CALL _i9_sync_col('sample_version','remark',"TEXT","TEXT         DEFAULT NULL");
CALL _i9_add_col('sample_version','attachments',"JSON         DEFAULT NULL");
CALL _i9_sync_col('sample_version','attachments',"JSON","JSON         DEFAULT NULL");
CALL _i9_add_col('sample_version','created_at',"DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('sample_version','created_at',"DATETIME","DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP");

-- quotation
CALL _i9_add_col('quotation','quote_no',"VARCHAR(20)    NOT NULL COMMENT 'Q-YYYYMMDD-001'");
CALL _i9_sync_col('quotation','quote_no',"VARCHAR(20)","VARCHAR(20)    NOT NULL COMMENT 'Q-YYYYMMDD-001'");
CALL _i9_add_col('quotation','inquiry_date',"DATE           DEFAULT NULL COMMENT '询价日期'");
CALL _i9_sync_col('quotation','inquiry_date',"DATE","DATE           DEFAULT NULL COMMENT '询价日期'");
CALL _i9_add_col('quotation','sample_id',"BIGINT         DEFAULT NULL COMMENT '关联样衣'");
CALL _i9_sync_col('quotation','sample_id',"BIGINT","BIGINT         DEFAULT NULL COMMENT '关联样衣'");
CALL _i9_add_col('quotation','sample_no',"VARCHAR(30)    DEFAULT NULL");
CALL _i9_sync_col('quotation','sample_no',"VARCHAR(30)","VARCHAR(30)    DEFAULT NULL");
CALL _i9_add_col('quotation','customer_id',"BIGINT         NOT NULL COMMENT '中间商客户ID'");
CALL _i9_sync_col('quotation','customer_id',"BIGINT","BIGINT         NOT NULL COMMENT '中间商客户ID'");
CALL _i9_add_col('quotation','middleman_name',"VARCHAR(100)   DEFAULT NULL COMMENT '中间商名称(自动)'");
CALL _i9_sync_col('quotation','middleman_name',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL COMMENT '中间商名称(自动)'");
CALL _i9_add_col('quotation','buyer_id',"BIGINT         DEFAULT NULL COMMENT '最终买家'");
CALL _i9_sync_col('quotation','buyer_id',"BIGINT","BIGINT         DEFAULT NULL COMMENT '最终买家'");
CALL _i9_add_col('quotation','buyer_name',"VARCHAR(100)   DEFAULT NULL");
CALL _i9_sync_col('quotation','buyer_name',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL");
CALL _i9_add_col('quotation','buyer_no',"VARCHAR(30)    DEFAULT NULL COMMENT '买家编号(自动)'");
CALL _i9_sync_col('quotation','buyer_no',"VARCHAR(30)","VARCHAR(30)    DEFAULT NULL COMMENT '买家编号(自动)'");
CALL _i9_add_col('quotation','style_no',"VARCHAR(100)   DEFAULT NULL COMMENT '客户款号'");
CALL _i9_sync_col('quotation','style_no',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL COMMENT '客户款号'");
CALL _i9_add_col('quotation','middleman_contact',"VARCHAR(50)   DEFAULT NULL COMMENT '中间商联系人'");
CALL _i9_sync_col('quotation','middleman_contact',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '中间商联系人'");
CALL _i9_add_col('quotation','settlement_category',"VARCHAR(30) DEFAULT NULL COMMENT '结算类别(自动)'");
CALL _i9_sync_col('quotation','settlement_category',"VARCHAR(30)","VARCHAR(30) DEFAULT NULL COMMENT '结算类别(自动)'");
CALL _i9_add_col('quotation','currency',"VARCHAR(5)     NOT NULL DEFAULT 'USD' COMMENT '外销币种'");
CALL _i9_sync_col('quotation','currency',"VARCHAR(5)","VARCHAR(5)     NOT NULL DEFAULT 'USD' COMMENT '外销币种'");
CALL _i9_add_col('quotation','exchange_rate',"DECIMAL(12,4)  NOT NULL DEFAULT 1 COMMENT '汇率'");
CALL _i9_sync_col('quotation','exchange_rate',"DECIMAL(12,4)","DECIMAL(12,4)  NOT NULL DEFAULT 1 COMMENT '汇率'");
CALL _i9_add_col('quotation','trade_country',"VARCHAR(50)    DEFAULT NULL COMMENT '贸易国别'");
CALL _i9_sync_col('quotation','trade_country',"VARCHAR(50)","VARCHAR(50)    DEFAULT NULL COMMENT '贸易国别'");
CALL _i9_add_col('quotation','settlement_method',"VARCHAR(50)   DEFAULT NULL COMMENT '结汇方式'");
CALL _i9_sync_col('quotation','settlement_method',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '结汇方式'");
CALL _i9_add_col('quotation','price_terms',"VARCHAR(50)    DEFAULT NULL COMMENT '价格条款'");
CALL _i9_sync_col('quotation','price_terms',"VARCHAR(50)","VARCHAR(50)    DEFAULT NULL COMMENT '价格条款'");
CALL _i9_add_col('quotation','salesperson',"VARCHAR(50)    DEFAULT NULL COMMENT '外销员'");
CALL _i9_sync_col('quotation','salesperson',"VARCHAR(50)","VARCHAR(50)    DEFAULT NULL COMMENT '外销员'");
CALL _i9_add_col('quotation','profit_rate',"DECIMAL(6,2)   NOT NULL DEFAULT 0 COMMENT '利润率%'");
CALL _i9_sync_col('quotation','profit_rate',"DECIMAL(6,2)","DECIMAL(6,2)   NOT NULL DEFAULT 0 COMMENT '利润率%'");
CALL _i9_add_col('quotation','quote_qty',"INT            DEFAULT NULL COMMENT '报价数量'");
CALL _i9_sync_col('quotation','quote_qty',"INT","INT            DEFAULT NULL COMMENT '报价数量'");
CALL _i9_add_col('quotation','image1',"VARCHAR(255)   DEFAULT NULL");
CALL _i9_sync_col('quotation','image1',"VARCHAR(255)","VARCHAR(255)   DEFAULT NULL");
CALL _i9_add_col('quotation','image2',"VARCHAR(255)   DEFAULT NULL");
CALL _i9_sync_col('quotation','image2',"VARCHAR(255)","VARCHAR(255)   DEFAULT NULL");
CALL _i9_add_col('quotation','rmb_total',"DECIMAL(16,2)  DEFAULT NULL COMMENT '报价人民币价格(含利润率)'");
CALL _i9_sync_col('quotation','rmb_total',"DECIMAL(16,2)","DECIMAL(16,2)  DEFAULT NULL COMMENT '报价人民币价格(含利润率)'");
CALL _i9_add_col('quotation','usd_total',"DECIMAL(16,2)  DEFAULT NULL COMMENT '报价美元价格'");
CALL _i9_sync_col('quotation','usd_total',"DECIMAL(16,2)","DECIMAL(16,2)  DEFAULT NULL COMMENT '报价美元价格'");
CALL _i9_add_col('quotation','total_remark',"TEXT           DEFAULT NULL COMMENT '备注说明'");
CALL _i9_sync_col('quotation','total_remark',"TEXT","TEXT           DEFAULT NULL COMMENT '备注说明'");
CALL _i9_add_col('quotation','status',"ENUM('DRAFT','QUOTED','ADJUSTING','ORDERED') NOT NULL DEFAULT 'DRAFT'");
CALL _i9_sync_col('quotation','status',"ENUM('DRAFT','QUOTED','ADJUSTING','ORDERED')","ENUM('DRAFT','QUOTED','ADJUSTING','ORDERED') NOT NULL DEFAULT 'DRAFT'");
CALL _i9_add_col('quotation','approval_status',"ENUM('NONE','PENDING','APPROVED') NOT NULL DEFAULT 'NONE' COMMENT '金额阈值审批'");
CALL _i9_sync_col('quotation','approval_status',"ENUM('NONE','PENDING','APPROVED')","ENUM('NONE','PENDING','APPROVED') NOT NULL DEFAULT 'NONE' COMMENT '金额阈值审批'");
CALL _i9_add_col('quotation','approved_by',"BIGINT       DEFAULT NULL");
CALL _i9_sync_col('quotation','approved_by',"BIGINT","BIGINT       DEFAULT NULL");
CALL _i9_add_col('quotation','approved_at',"DATETIME     DEFAULT NULL");
CALL _i9_sync_col('quotation','approved_at',"DATETIME","DATETIME     DEFAULT NULL");
CALL _i9_add_col('quotation','remark',"TEXT           DEFAULT NULL");
CALL _i9_sync_col('quotation','remark',"TEXT","TEXT           DEFAULT NULL");
CALL _i9_add_col('quotation','created_by',"BIGINT         NOT NULL");
CALL _i9_sync_col('quotation','created_by',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('quotation','created_at',"DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('quotation','created_at',"DATETIME","DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_add_col('quotation','updated_at',"DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('quotation','updated_at',"DATETIME","DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_add_col('quotation','deleted',"TINYINT        NOT NULL DEFAULT 0");
CALL _i9_sync_col('quotation','deleted',"TINYINT","TINYINT        NOT NULL DEFAULT 0");

-- quotation_item
CALL _i9_add_col('quotation_item','quote_id',"BIGINT         NOT NULL");
CALL _i9_sync_col('quotation_item','quote_id',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('quotation_item','sort_order',"INT            NOT NULL DEFAULT 0");
CALL _i9_sync_col('quotation_item','sort_order',"INT","INT            NOT NULL DEFAULT 0");
CALL _i9_add_col('quotation_item','part',"VARCHAR(50)    DEFAULT NULL COMMENT '部位'");
CALL _i9_sync_col('quotation_item','part',"VARCHAR(50)","VARCHAR(50)    DEFAULT NULL COMMENT '部位'");
CALL _i9_add_col('quotation_item','item_name',"VARCHAR(100)   NOT NULL COMMENT '品名'");
CALL _i9_sync_col('quotation_item','item_name',"VARCHAR(100)","VARCHAR(100)   NOT NULL COMMENT '品名'");
CALL _i9_add_col('quotation_item','width',"VARCHAR(30)    DEFAULT NULL COMMENT '门幅'");
CALL _i9_sync_col('quotation_item','width',"VARCHAR(30)","VARCHAR(30)    DEFAULT NULL COMMENT '门幅'");
CALL _i9_add_col('quotation_item','color',"VARCHAR(50)    DEFAULT NULL COMMENT '颜色'");
CALL _i9_sync_col('quotation_item','color',"VARCHAR(50)","VARCHAR(50)    DEFAULT NULL COMMENT '颜色'");
CALL _i9_add_col('quotation_item','supplier',"VARCHAR(100)   DEFAULT NULL COMMENT '供应商(PDF隐藏)'");
CALL _i9_sync_col('quotation_item','supplier',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL COMMENT '供应商(PDF隐藏)'");
CALL _i9_add_col('quotation_item','unit',"VARCHAR(20)    DEFAULT NULL COMMENT '计量单位'");
CALL _i9_sync_col('quotation_item','unit',"VARCHAR(20)","VARCHAR(20)    DEFAULT NULL COMMENT '计量单位'");
CALL _i9_add_col('quotation_item','quote_usage',"DECIMAL(15,4)  DEFAULT NULL COMMENT '报价耗用'");
CALL _i9_sync_col('quotation_item','quote_usage',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '报价耗用'");
CALL _i9_add_col('quotation_item','rmb_price',"DECIMAL(15,4)  DEFAULT NULL COMMENT '人民币单价'");
CALL _i9_sync_col('quotation_item','rmb_price',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '人民币单价'");
CALL _i9_add_col('quotation_item','usd_price',"DECIMAL(15,4)  DEFAULT NULL COMMENT '美金单价(自动)'");
CALL _i9_sync_col('quotation_item','usd_price',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '美金单价(自动)'");
CALL _i9_add_col('quotation_item','loss_rate',"DECIMAL(6,2)   NOT NULL DEFAULT 3 COMMENT '损耗%'");
CALL _i9_sync_col('quotation_item','loss_rate',"DECIMAL(6,2)","DECIMAL(6,2)   NOT NULL DEFAULT 3 COMMENT '损耗%'");
CALL _i9_add_col('quotation_item','loss_amount',"DECIMAL(15,4)  DEFAULT NULL COMMENT '含损金额=单价×耗用×(1+损耗)'");
CALL _i9_sync_col('quotation_item','loss_amount',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '含损金额=单价×耗用×(1+损耗)'");
CALL _i9_add_col('quotation_item','remark',"VARCHAR(200)   DEFAULT NULL");
CALL _i9_sync_col('quotation_item','remark',"VARCHAR(200)","VARCHAR(200)   DEFAULT NULL");

-- quotation_fee
CALL _i9_add_col('quotation_fee','quote_id',"BIGINT        NOT NULL");
CALL _i9_sync_col('quotation_fee','quote_id',"BIGINT","BIGINT        NOT NULL");
CALL _i9_add_col('quotation_fee','sort_order',"INT           NOT NULL DEFAULT 0");
CALL _i9_sync_col('quotation_fee','sort_order',"INT","INT           NOT NULL DEFAULT 0");
CALL _i9_add_col('quotation_fee','fee_name',"VARCHAR(50)   NOT NULL COMMENT '费用名称'");
CALL _i9_sync_col('quotation_fee','fee_name',"VARCHAR(50)","VARCHAR(50)   NOT NULL COMMENT '费用名称'");
CALL _i9_add_col('quotation_fee','rmb_price',"DECIMAL(15,4) DEFAULT NULL COMMENT '人民币单价'");
CALL _i9_sync_col('quotation_fee','rmb_price',"DECIMAL(15,4)","DECIMAL(15,4) DEFAULT NULL COMMENT '人民币单价'");
CALL _i9_add_col('quotation_fee','usd_price',"DECIMAL(15,4) DEFAULT NULL COMMENT '美金单价(自动)'");
CALL _i9_sync_col('quotation_fee','usd_price',"DECIMAL(15,4)","DECIMAL(15,4) DEFAULT NULL COMMENT '美金单价(自动)'");
CALL _i9_add_col('quotation_fee','quote_usage',"DECIMAL(12,2) NOT NULL DEFAULT 1 COMMENT '报价耗用'");
CALL _i9_sync_col('quotation_fee','quote_usage',"DECIMAL(12,2)","DECIMAL(12,2) NOT NULL DEFAULT 1 COMMENT '报价耗用'");

-- order_main
CALL _i9_add_col('order_main','order_no',"VARCHAR(20)   NOT NULL COMMENT 'O-YYYYMMDD-001'");
CALL _i9_sync_col('order_main','order_no',"VARCHAR(20)","VARCHAR(20)   NOT NULL COMMENT 'O-YYYYMMDD-001'");
CALL _i9_add_col('order_main','customer_po',"VARCHAR(50)   DEFAULT NULL COMMENT '客户PO号'");
CALL _i9_sync_col('order_main','customer_po',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '客户PO号'");
CALL _i9_add_col('order_main','customer_id',"BIGINT        NOT NULL COMMENT '中间商客户ID'");
CALL _i9_sync_col('order_main','customer_id',"BIGINT","BIGINT        NOT NULL COMMENT '中间商客户ID'");
CALL _i9_add_col('order_main','quote_id',"BIGINT        DEFAULT NULL COMMENT '关联报价'");
CALL _i9_sync_col('order_main','quote_id',"BIGINT","BIGINT        DEFAULT NULL COMMENT '关联报价'");
CALL _i9_add_col('order_main','style_name',"VARCHAR(100)  DEFAULT NULL");
CALL _i9_sync_col('order_main','style_name',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL");
CALL _i9_add_col('order_main','style_no',"VARCHAR(100)  DEFAULT NULL COMMENT '客户款号'");
CALL _i9_sync_col('order_main','style_no',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL COMMENT '客户款号'");
CALL _i9_add_col('order_main','middleman_name',"VARCHAR(100)  DEFAULT NULL COMMENT '中间商名称(报价带入)'");
CALL _i9_sync_col('order_main','middleman_name',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL COMMENT '中间商名称(报价带入)'");
CALL _i9_add_col('order_main','buyer_id',"BIGINT        DEFAULT NULL COMMENT '最终买家'");
CALL _i9_sync_col('order_main','buyer_id',"BIGINT","BIGINT        DEFAULT NULL COMMENT '最终买家'");
CALL _i9_add_col('order_main','buyer_name',"VARCHAR(100)  DEFAULT NULL");
CALL _i9_sync_col('order_main','buyer_name',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL");
CALL _i9_add_col('order_main','delivery_date',"DATE          DEFAULT NULL COMMENT '约定交期'");
CALL _i9_sync_col('order_main','delivery_date',"DATE","DATE          DEFAULT NULL COMMENT '约定交期'");
CALL _i9_add_col('order_main','qty_total',"INT           NOT NULL DEFAULT 0 COMMENT '大货总数量'");
CALL _i9_sync_col('order_main','qty_total',"INT","INT           NOT NULL DEFAULT 0 COMMENT '大货总数量'");
CALL _i9_add_col('order_main','currency',"VARCHAR(5)    NOT NULL DEFAULT 'USD'");
CALL _i9_sync_col('order_main','currency',"VARCHAR(5)","VARCHAR(5)    NOT NULL DEFAULT 'USD'");
CALL _i9_add_col('order_main','unit_price',"DECIMAL(15,4) DEFAULT NULL COMMENT '单品单价'");
CALL _i9_sync_col('order_main','unit_price',"DECIMAL(15,4)","DECIMAL(15,4) DEFAULT NULL COMMENT '单品单价'");
CALL _i9_add_col('order_main','total_amount',"DECIMAL(15,4) DEFAULT NULL COMMENT '总金额'");
CALL _i9_sync_col('order_main','total_amount',"DECIMAL(15,4)","DECIMAL(15,4) DEFAULT NULL COMMENT '总金额'");
CALL _i9_add_col('order_main','commission_rate',"DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '佣金%'");
CALL _i9_sync_col('order_main','commission_rate',"DECIMAL(6,2)","DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '佣金%'");
CALL _i9_add_col('order_main','factory_id',"BIGINT        DEFAULT NULL COMMENT '生产工厂(绑定订单)'");
CALL _i9_sync_col('order_main','factory_id',"BIGINT","BIGINT        DEFAULT NULL COMMENT '生产工厂(绑定订单)'");
CALL _i9_add_col('order_main','salesperson',"VARCHAR(50)   DEFAULT NULL COMMENT '外销员'");
CALL _i9_sync_col('order_main','salesperson',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL COMMENT '外销员'");
CALL _i9_add_col('order_main','make_date',"DATE          DEFAULT NULL COMMENT '制单日期'");
CALL _i9_sync_col('order_main','make_date',"DATE","DATE          DEFAULT NULL COMMENT '制单日期'");
CALL _i9_add_col('order_main','split_mode',"VARCHAR(10)   NOT NULL DEFAULT 'NONE' COMMENT '整单核算模式 NONE/BY_SIZE/BY_COLOR'");
CALL _i9_sync_col('order_main','split_mode',"VARCHAR(10)","VARCHAR(10)   NOT NULL DEFAULT 'NONE' COMMENT '整单核算模式 NONE/BY_SIZE/BY_COLOR'");
CALL _i9_add_col('order_main','att_artwork',"TEXT          DEFAULT NULL COMMENT '附件·彩稿(多文件URL逗号分隔)'");
CALL _i9_sync_col('order_main','att_artwork',"TEXT","TEXT          DEFAULT NULL COMMENT '附件·彩稿(多文件URL逗号分隔)'");
CALL _i9_add_col('order_main','att_sizechart',"TEXT          DEFAULT NULL COMMENT '附件·大货尺寸表'");
CALL _i9_sync_col('order_main','att_sizechart',"TEXT","TEXT          DEFAULT NULL COMMENT '附件·大货尺寸表'");
CALL _i9_add_col('order_main','att_board',"TEXT          DEFAULT NULL COMMENT '附件·大货纸板'");
CALL _i9_sync_col('order_main','att_board',"TEXT","TEXT          DEFAULT NULL COMMENT '附件·大货纸板'");
CALL _i9_add_col('order_main','att_packing',"TEXT          DEFAULT NULL COMMENT '附件·包装资料'");
CALL _i9_sync_col('order_main','att_packing',"TEXT","TEXT          DEFAULT NULL COMMENT '附件·包装资料'");
CALL _i9_add_col('order_main','att_filling',"TEXT          DEFAULT NULL COMMENT '附件·填充量'");
CALL _i9_sync_col('order_main','att_filling',"TEXT","TEXT          DEFAULT NULL COMMENT '附件·填充量'");
CALL _i9_add_col('order_main','status',"ENUM('DRAFT','CONFIRMED','CONTRACTED','PRODUCING','DONE') NOT NULL DEFAULT 'DRAFT'");
CALL _i9_sync_col('order_main','status',"ENUM('DRAFT','CONFIRMED','CONTRACTED','PRODUCING','DONE')","ENUM('DRAFT','CONFIRMED','CONTRACTED','PRODUCING','DONE') NOT NULL DEFAULT 'DRAFT'");
CALL _i9_add_col('order_main','approval_status',"ENUM('NONE','PENDING','APPROVED') NOT NULL DEFAULT 'NONE' COMMENT '金额阈值审批'");
CALL _i9_sync_col('order_main','approval_status',"ENUM('NONE','PENDING','APPROVED')","ENUM('NONE','PENDING','APPROVED') NOT NULL DEFAULT 'NONE' COMMENT '金额阈值审批'");
CALL _i9_add_col('order_main','approved_by',"BIGINT        DEFAULT NULL");
CALL _i9_sync_col('order_main','approved_by',"BIGINT","BIGINT        DEFAULT NULL");
CALL _i9_add_col('order_main','approved_at',"DATETIME      DEFAULT NULL");
CALL _i9_sync_col('order_main','approved_at',"DATETIME","DATETIME      DEFAULT NULL");
CALL _i9_add_col('order_main','remark',"TEXT          DEFAULT NULL");
CALL _i9_sync_col('order_main','remark',"TEXT","TEXT          DEFAULT NULL");
CALL _i9_add_col('order_main','created_by',"BIGINT        NOT NULL");
CALL _i9_sync_col('order_main','created_by',"BIGINT","BIGINT        NOT NULL");
CALL _i9_add_col('order_main','created_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('order_main','created_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_add_col('order_main','updated_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('order_main','updated_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_add_col('order_main','deleted',"TINYINT       NOT NULL DEFAULT 0");
CALL _i9_sync_col('order_main','deleted',"TINYINT","TINYINT       NOT NULL DEFAULT 0");

-- order_size_matrix
CALL _i9_add_col('order_size_matrix','order_id',"BIGINT   NOT NULL");
CALL _i9_sync_col('order_size_matrix','order_id',"BIGINT","BIGINT   NOT NULL");
CALL _i9_add_col('order_size_matrix','matrix_data',"JSON     NOT NULL COMMENT '颜色×尺码矩阵 {colors:[],sizes:[],cells:{}}'");
CALL _i9_sync_col('order_size_matrix','matrix_data',"JSON","JSON     NOT NULL COMMENT '颜色×尺码矩阵 {colors:[],sizes:[],cells:{}}'");
CALL _i9_add_col('order_size_matrix','updated_at',"DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('order_size_matrix','updated_at',"DATETIME","DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

-- order_material
CALL _i9_add_col('order_material','order_id',"BIGINT         NOT NULL");
CALL _i9_sync_col('order_material','order_id',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('order_material','quote_item_id',"BIGINT         DEFAULT NULL COMMENT '来源报价明细'");
CALL _i9_sync_col('order_material','quote_item_id',"BIGINT","BIGINT         DEFAULT NULL COMMENT '来源报价明细'");
CALL _i9_add_col('order_material','item_name',"VARCHAR(100)   NOT NULL COMMENT '品名(报价带入,可改)'");
CALL _i9_sync_col('order_material','item_name',"VARCHAR(100)","VARCHAR(100)   NOT NULL COMMENT '品名(报价带入,可改)'");
CALL _i9_add_col('order_material','part',"VARCHAR(50)    DEFAULT NULL COMMENT '部位'");
CALL _i9_sync_col('order_material','part',"VARCHAR(50)","VARCHAR(50)    DEFAULT NULL COMMENT '部位'");
CALL _i9_add_col('order_material','width',"VARCHAR(50)    DEFAULT NULL COMMENT '门幅/尺寸'");
CALL _i9_sync_col('order_material','width',"VARCHAR(50)","VARCHAR(50)    DEFAULT NULL COMMENT '门幅/尺寸'");
CALL _i9_add_col('order_material','color',"VARCHAR(100)   DEFAULT NULL COMMENT '颜色'");
CALL _i9_sync_col('order_material','color',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL COMMENT '颜色'");
CALL _i9_add_col('order_material','composition',"VARCHAR(100)   DEFAULT NULL COMMENT '成份'");
CALL _i9_sync_col('order_material','composition',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL COMMENT '成份'");
CALL _i9_add_col('order_material','supplier',"VARCHAR(100)   DEFAULT NULL COMMENT '供应商'");
CALL _i9_sync_col('order_material','supplier',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL COMMENT '供应商'");
CALL _i9_add_col('order_material','split_mode',"VARCHAR(10)    NOT NULL DEFAULT 'NONE' COMMENT '拆分 NONE/BY_SIZE/BY_COLOR'");
CALL _i9_sync_col('order_material','split_mode',"VARCHAR(10)","VARCHAR(10)    NOT NULL DEFAULT 'NONE' COMMENT '拆分 NONE/BY_SIZE/BY_COLOR'");
CALL _i9_add_col('order_material','unit',"VARCHAR(20)    DEFAULT NULL");
CALL _i9_sync_col('order_material','unit',"VARCHAR(20)","VARCHAR(20)    DEFAULT NULL");
CALL _i9_add_col('order_material','net_usage',"DECIMAL(15,4)  DEFAULT NULL COMMENT '单件耗用'");
CALL _i9_sync_col('order_material','net_usage',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '单件耗用'");
CALL _i9_add_col('order_material','loss_rate',"DECIMAL(6,2)   NOT NULL DEFAULT 3.00 COMMENT '损耗%默认3'");
CALL _i9_sync_col('order_material','loss_rate',"DECIMAL(6,2)","DECIMAL(6,2)   NOT NULL DEFAULT 3.00 COMMENT '损耗%默认3'");
CALL _i9_add_col('order_material','loss_usage',"DECIMAL(15,4)  DEFAULT NULL COMMENT '含损单件耗用=单件×(1+损耗)'");
CALL _i9_sync_col('order_material','loss_usage',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '含损单件耗用=单件×(1+损耗)'");
CALL _i9_add_col('order_material','qty',"INT            DEFAULT NULL COMMENT '大货总数'");
CALL _i9_sync_col('order_material','qty',"INT","INT            DEFAULT NULL COMMENT '大货总数'");
CALL _i9_add_col('order_material','total_purchase',"DECIMAL(15,4)  DEFAULT NULL COMMENT '系统采购量=大货总数×单件×(1+损耗);整数类进1'");
CALL _i9_sync_col('order_material','total_purchase',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '系统采购量=大货总数×单件×(1+损耗);整数类进1'");
CALL _i9_add_col('order_material','final_purchase',"DECIMAL(15,4)  DEFAULT NULL COMMENT '最终采购量(微调,超±10%确认)'");
CALL _i9_sync_col('order_material','final_purchase',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '最终采购量(微调,超±10%确认)'");
CALL _i9_add_col('order_material','round_up',"TINYINT        DEFAULT NULL COMMENT '行内取整覆盖 1=强制取整/0=不取整/null=按单位自动'");
CALL _i9_sync_col('order_material','round_up',"TINYINT","TINYINT        DEFAULT NULL COMMENT '行内取整覆盖 1=强制取整/0=不取整/null=按单位自动'");
CALL _i9_add_col('order_material','unit_price',"DECIMAL(15,4)  DEFAULT NULL COMMENT '采购单价'");
CALL _i9_sync_col('order_material','unit_price',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '采购单价'");
CALL _i9_add_col('order_material','budget',"DECIMAL(15,4)  DEFAULT NULL COMMENT '预算=最终采购量×单价'");
CALL _i9_sync_col('order_material','budget',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '预算=最终采购量×单价'");
CALL _i9_add_col('order_material','sort_order',"INT            NOT NULL DEFAULT 0");
CALL _i9_sync_col('order_material','sort_order',"INT","INT            NOT NULL DEFAULT 0");

-- order_shipment
CALL _i9_add_col('order_shipment','order_id',"BIGINT        NOT NULL");
CALL _i9_sync_col('order_shipment','order_id',"BIGINT","BIGINT        NOT NULL");
CALL _i9_add_col('order_shipment','shipment_date',"DATE          NOT NULL COMMENT '发货日期'");
CALL _i9_sync_col('order_shipment','shipment_date',"DATE","DATE          NOT NULL COMMENT '发货日期'");
CALL _i9_add_col('order_shipment','qty',"INT           NOT NULL COMMENT '发货件数'");
CALL _i9_sync_col('order_shipment','qty',"INT","INT           NOT NULL COMMENT '发货件数'");
CALL _i9_add_col('order_shipment','cartons',"INT           DEFAULT NULL COMMENT '箱数'");
CALL _i9_sync_col('order_shipment','cartons',"INT","INT           DEFAULT NULL COMMENT '箱数'");
CALL _i9_add_col('order_shipment','tracking_no',"VARCHAR(100)  DEFAULT NULL COMMENT '快递/提单号'");
CALL _i9_sync_col('order_shipment','tracking_no',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL COMMENT '快递/提单号'");
CALL _i9_add_col('order_shipment','remark',"TEXT          DEFAULT NULL");
CALL _i9_sync_col('order_shipment','remark',"TEXT","TEXT          DEFAULT NULL");
CALL _i9_add_col('order_shipment','created_by',"BIGINT        NOT NULL");
CALL _i9_sync_col('order_shipment','created_by',"BIGINT","BIGINT        NOT NULL");
CALL _i9_add_col('order_shipment','created_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('order_shipment','created_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");

-- contract
CALL _i9_add_col('contract','contract_no',"VARCHAR(40)    NOT NULL COMMENT 'HT-YYYYMMDD-001；补料合同为「补料-母合同号-序号」故留 40'");
CALL _i9_sync_col('contract','contract_no',"VARCHAR(40)","VARCHAR(40)    NOT NULL COMMENT 'HT-YYYYMMDD-001；补料合同为「补料-母合同号-序号」故留 40'");
CALL _i9_add_col('contract','type',"ENUM('MATERIAL','PROCESS','SUPPLEMENT') NOT NULL COMMENT '合同类型'");
CALL _i9_sync_col('contract','type',"ENUM('MATERIAL','PROCESS','SUPPLEMENT')","ENUM('MATERIAL','PROCESS','SUPPLEMENT') NOT NULL COMMENT '合同类型'");
CALL _i9_add_col('contract','parent_id',"BIGINT         DEFAULT NULL COMMENT '补料合同的父合同'");
CALL _i9_sync_col('contract','parent_id',"BIGINT","BIGINT         DEFAULT NULL COMMENT '补料合同的父合同'");
CALL _i9_add_col('contract','factory_id',"BIGINT         NOT NULL");
CALL _i9_sync_col('contract','factory_id',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('contract','order_id',"BIGINT         NOT NULL");
CALL _i9_sync_col('contract','order_id',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('contract','total_amount',"DECIMAL(15,4)  NOT NULL COMMENT '合同总金额'");
CALL _i9_sync_col('contract','total_amount',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL COMMENT '合同总金额'");
CALL _i9_add_col('contract','currency',"VARCHAR(5)     NOT NULL DEFAULT 'CNY'");
CALL _i9_sync_col('contract','currency',"VARCHAR(5)","VARCHAR(5)     NOT NULL DEFAULT 'CNY'");
CALL _i9_add_col('contract','deposit_ratio',"DECIMAL(5,2)   NOT NULL DEFAULT 30.00 COMMENT '定金比例%'");
CALL _i9_sync_col('contract','deposit_ratio',"DECIMAL(5,2)","DECIMAL(5,2)   NOT NULL DEFAULT 30.00 COMMENT '定金比例%'");
CALL _i9_add_col('contract','mid_ratio',"DECIMAL(5,2)   NOT NULL DEFAULT 40.00 COMMENT '中期款比例%'");
CALL _i9_sync_col('contract','mid_ratio',"DECIMAL(5,2)","DECIMAL(5,2)   NOT NULL DEFAULT 40.00 COMMENT '中期款比例%'");
CALL _i9_add_col('contract','final_ratio',"DECIMAL(5,2)   NOT NULL DEFAULT 30.00 COMMENT '尾款比例%'");
CALL _i9_sync_col('contract','final_ratio',"DECIMAL(5,2)","DECIMAL(5,2)   NOT NULL DEFAULT 30.00 COMMENT '尾款比例%'");
CALL _i9_add_col('contract','last_ship_date',"DATE           DEFAULT NULL COMMENT '最后发货日'");
CALL _i9_sync_col('contract','last_ship_date',"DATE","DATE           DEFAULT NULL COMMENT '最后发货日'");
CALL _i9_add_col('contract','ship_done_at',"DATETIME       DEFAULT NULL COMMENT '供应商宣布发货完成时间(门户C3;开票后闭环到已完成)'");
CALL _i9_sync_col('contract','ship_done_at',"DATETIME","DATETIME       DEFAULT NULL COMMENT '供应商宣布发货完成时间(门户C3;开票后闭环到已完成)'");
CALL _i9_add_col('contract','stamp_mode',"VARCHAR(10)    DEFAULT NULL COMMENT '盖章方式 ESEAL/PAPER(A3)'");
CALL _i9_sync_col('contract','stamp_mode',"VARCHAR(10)","VARCHAR(10)    DEFAULT NULL COMMENT '盖章方式 ESEAL/PAPER(A3)'");
CALL _i9_add_col('contract','stamp_paper_url',"VARCHAR(500)   DEFAULT NULL COMMENT '纸质盖章照片(A3)'");
CALL _i9_sync_col('contract','stamp_paper_url',"VARCHAR(500)","VARCHAR(500)   DEFAULT NULL COMMENT '纸质盖章照片(A3)'");
CALL _i9_add_col('contract','ship_to_address',"VARCHAR(200)   DEFAULT NULL COMMENT '收货地址(发货带入)'");
CALL _i9_sync_col('contract','ship_to_address',"VARCHAR(200)","VARCHAR(200)   DEFAULT NULL COMMENT '收货地址(发货带入)'");
CALL _i9_add_col('contract','shipped_qty',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '累计已发数量(批次累计)'");
CALL _i9_sync_col('contract','shipped_qty',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '累计已发数量(批次累计)'");
CALL _i9_add_col('contract','account_period_days',"INT            NOT NULL DEFAULT 90 COMMENT '账期天数(材料90/加工45,发货日+账期=到期日)'");
CALL _i9_sync_col('contract','account_period_days',"INT","INT            NOT NULL DEFAULT 90 COMMENT '账期天数(材料90/加工45,发货日+账期=到期日)'");
CALL _i9_add_col('contract','due_date',"DATE           DEFAULT NULL COMMENT '账期截止日'");
CALL _i9_sync_col('contract','due_date',"DATE","DATE           DEFAULT NULL COMMENT '账期截止日'");
CALL _i9_add_col('contract','sign_place',"VARCHAR(100)   DEFAULT NULL COMMENT '签约地点(默认本司地址)'");
CALL _i9_sync_col('contract','sign_place',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL COMMENT '签约地点(默认本司地址)'");
CALL _i9_add_col('contract','sign_date',"DATE           DEFAULT NULL COMMENT '签约日期(默认今天)'");
CALL _i9_sync_col('contract','sign_date',"DATE","DATE           DEFAULT NULL COMMENT '签约日期(默认今天)'");
CALL _i9_add_col('contract','company_id',"BIGINT         DEFAULT NULL COMMENT '乙方/委托方=本司主体(company_profile)'");
CALL _i9_sync_col('contract','company_id',"BIGINT","BIGINT         DEFAULT NULL COMMENT '乙方/委托方=本司主体(company_profile)'");
CALL _i9_add_col('contract','company_rep',"VARCHAR(50)    DEFAULT NULL COMMENT '乙方/委托方代表(默认登录业务员)'");
CALL _i9_sync_col('contract','company_rep',"VARCHAR(50)","VARCHAR(50)    DEFAULT NULL COMMENT '乙方/委托方代表(默认登录业务员)'");
CALL _i9_add_col('contract','guarantor',"VARCHAR(50)    DEFAULT NULL COMMENT '担保人(丙方,选填)'");
CALL _i9_sync_col('contract','guarantor',"VARCHAR(50)","VARCHAR(50)    DEFAULT NULL COMMENT '担保人(丙方,选填)'");
CALL _i9_add_col('contract','guarantor_id_photo',"VARCHAR(500)   DEFAULT NULL COMMENT '担保人身份证照片URL(选填)'");
CALL _i9_sync_col('contract','guarantor_id_photo',"VARCHAR(500)","VARCHAR(500)   DEFAULT NULL COMMENT '担保人身份证照片URL(选填)'");
CALL _i9_add_col('contract','delivery_deadline',"DATE           DEFAULT NULL COMMENT '交货期限(加工=订单交期-10天/材料=-45天)'");
CALL _i9_sync_col('contract','delivery_deadline',"DATE","DATE           DEFAULT NULL COMMENT '交货期限(加工=订单交期-10天/材料=-45天)'");
CALL _i9_add_col('contract','style_nos',"VARCHAR(500)   DEFAULT NULL COMMENT '关联款号(多选逗号分隔)'");
CALL _i9_sync_col('contract','style_nos',"VARCHAR(500)","VARCHAR(500)   DEFAULT NULL COMMENT '关联款号(多选逗号分隔)'");
CALL _i9_add_col('contract','price_includes',"JSON           DEFAULT NULL COMMENT '价格包含项勾选(加工合同,汇入PDF)'");
CALL _i9_sync_col('contract','price_includes',"JSON","JSON           DEFAULT NULL COMMENT '价格包含项勾选(加工合同,汇入PDF)'");
CALL _i9_add_col('contract','vat_rate',"DECIMAL(5,2)   DEFAULT NULL COMMENT '增值税%(加工默认13,含税不另计)'");
CALL _i9_sync_col('contract','vat_rate',"DECIMAL(5,2)","DECIMAL(5,2)   DEFAULT NULL COMMENT '增值税%(加工默认13,含税不另计)'");
CALL _i9_add_col('contract','price_other',"VARCHAR(200)   DEFAULT NULL COMMENT '价格包含项·其他说明'");
CALL _i9_sync_col('contract','price_other',"VARCHAR(200)","VARCHAR(200)   DEFAULT NULL COMMENT '价格包含项·其他说明'");
CALL _i9_add_col('contract','terms_json',"JSON           DEFAULT NULL COMMENT '合同条款模板填空(key→条款文本)'");
CALL _i9_sync_col('contract','terms_json',"JSON","JSON           DEFAULT NULL COMMENT '合同条款模板填空(key→条款文本)'");
CALL _i9_add_col('contract','portal_status',"ENUM('DRAFT','PUSHED','STAMPED','SHIPPING','RECONCILED','COMPLETED') NOT NULL DEFAULT 'DRAFT'");
CALL _i9_sync_col('contract','portal_status',"ENUM('DRAFT','PUSHED','STAMPED','SHIPPING','RECONCILED','COMPLETED')","ENUM('DRAFT','PUSHED','STAMPED','SHIPPING','RECONCILED','COMPLETED') NOT NULL DEFAULT 'DRAFT'");
CALL _i9_add_col('contract','pushed_at',"DATETIME       DEFAULT NULL COMMENT '推送门户时间'");
CALL _i9_sync_col('contract','pushed_at',"DATETIME","DATETIME       DEFAULT NULL COMMENT '推送门户时间'");
CALL _i9_add_col('contract','stamped_at',"DATETIME       DEFAULT NULL COMMENT '供应商盖章时间'");
CALL _i9_sync_col('contract','stamped_at',"DATETIME","DATETIME       DEFAULT NULL COMMENT '供应商盖章时间'");
CALL _i9_add_col('contract','stamped_by_supplier',"VARCHAR(100)   DEFAULT NULL COMMENT '盖章供应商账号'");
CALL _i9_sync_col('contract','stamped_by_supplier',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL COMMENT '盖章供应商账号'");
CALL _i9_add_col('contract','snapshot_json',"JSON           DEFAULT NULL COMMENT '盖章时快照数据'");
CALL _i9_sync_col('contract','snapshot_json',"JSON","JSON           DEFAULT NULL COMMENT '盖章时快照数据'");
CALL _i9_add_col('contract','revised',"TINYINT        NOT NULL DEFAULT 0 COMMENT '撤销推送后修改重推标记(门户提示合同已更新;盖章后清零)'");
CALL _i9_sync_col('contract','revised',"TINYINT","TINYINT        NOT NULL DEFAULT 0 COMMENT '撤销推送后修改重推标记(门户提示合同已更新;盖章后清零)'");
CALL _i9_add_col('contract','status',"ENUM('ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACTIVE'");
CALL _i9_sync_col('contract','status',"ENUM('ACTIVE','COMPLETED','CANCELLED')","ENUM('ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACTIVE'");
CALL _i9_add_col('contract','approval_status',"ENUM('NONE','PENDING','APPROVED') NOT NULL DEFAULT 'NONE' COMMENT '金额阈值审批'");
CALL _i9_sync_col('contract','approval_status',"ENUM('NONE','PENDING','APPROVED')","ENUM('NONE','PENDING','APPROVED') NOT NULL DEFAULT 'NONE' COMMENT '金额阈值审批'");
CALL _i9_add_col('contract','approved_by',"BIGINT       DEFAULT NULL");
CALL _i9_sync_col('contract','approved_by',"BIGINT","BIGINT       DEFAULT NULL");
CALL _i9_add_col('contract','approved_at',"DATETIME     DEFAULT NULL");
CALL _i9_sync_col('contract','approved_at',"DATETIME","DATETIME     DEFAULT NULL");
CALL _i9_add_col('contract','remark',"TEXT           DEFAULT NULL");
CALL _i9_sync_col('contract','remark',"TEXT","TEXT           DEFAULT NULL");
CALL _i9_add_col('contract','created_by',"BIGINT         NOT NULL");
CALL _i9_sync_col('contract','created_by',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('contract','created_at',"DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('contract','created_at',"DATETIME","DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_add_col('contract','updated_at',"DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('contract','updated_at',"DATETIME","DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_add_col('contract','deleted',"TINYINT        NOT NULL DEFAULT 0");
CALL _i9_sync_col('contract','deleted',"TINYINT","TINYINT        NOT NULL DEFAULT 0");

-- contract_material
CALL _i9_add_col('contract_material','contract_id',"BIGINT         NOT NULL");
CALL _i9_sync_col('contract_material','contract_id',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('contract_material','sort_order',"INT            NOT NULL DEFAULT 0");
CALL _i9_sync_col('contract_material','sort_order',"INT","INT            NOT NULL DEFAULT 0");
CALL _i9_add_col('contract_material','item_name',"VARCHAR(100)   NOT NULL COMMENT '材料名称'");
CALL _i9_sync_col('contract_material','item_name',"VARCHAR(100)","VARCHAR(100)   NOT NULL COMMENT '材料名称'");
CALL _i9_add_col('contract_material','spec',"VARCHAR(100)   DEFAULT NULL COMMENT '规格型号'");
CALL _i9_sync_col('contract_material','spec',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL COMMENT '规格型号'");
CALL _i9_add_col('contract_material','unit',"VARCHAR(20)    DEFAULT NULL COMMENT '单位'");
CALL _i9_sync_col('contract_material','unit',"VARCHAR(20)","VARCHAR(20)    DEFAULT NULL COMMENT '单位'");
CALL _i9_add_col('contract_material','unit_price',"DECIMAL(15,4)  NOT NULL COMMENT '单价'");
CALL _i9_sync_col('contract_material','unit_price',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL COMMENT '单价'");
CALL _i9_add_col('contract_material','qty',"DECIMAL(15,4)  NOT NULL COMMENT '数量'");
CALL _i9_sync_col('contract_material','qty',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL COMMENT '数量'");
CALL _i9_add_col('contract_material','amount',"DECIMAL(15,4)  NOT NULL COMMENT '金额=单价×数量'");
CALL _i9_sync_col('contract_material','amount',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL COMMENT '金额=单价×数量'");
CALL _i9_add_col('contract_material','qty_source',"VARCHAR(20)    DEFAULT NULL COMMENT '数量来源:采购量含损耗/大货数'");
CALL _i9_sync_col('contract_material','qty_source',"VARCHAR(20)","VARCHAR(20)    DEFAULT NULL COMMENT '数量来源:采购量含损耗/大货数'");
CALL _i9_add_col('contract_material','color',"VARCHAR(50)    DEFAULT NULL COMMENT '颜色(分色行)'");
CALL _i9_sync_col('contract_material','color',"VARCHAR(50)","VARCHAR(50)    DEFAULT NULL COMMENT '颜色(分色行)'");
CALL _i9_add_col('contract_material','size',"VARCHAR(30)    DEFAULT NULL COMMENT '尺码/码(分码行)'");
CALL _i9_sync_col('contract_material','size',"VARCHAR(30)","VARCHAR(30)    DEFAULT NULL COMMENT '尺码/码(分码行)'");
CALL _i9_add_col('contract_material','style_no',"VARCHAR(50)    DEFAULT NULL COMMENT '款号(多款号同表随行标注)'");
CALL _i9_sync_col('contract_material','style_no',"VARCHAR(50)","VARCHAR(50)    DEFAULT NULL COMMENT '款号(多款号同表随行标注)'");
CALL _i9_add_col('contract_material','delivery_date',"DATE          DEFAULT NULL COMMENT '行交货期限(材料默认=款交期-45天)'");
CALL _i9_sync_col('contract_material','delivery_date',"DATE","DATE          DEFAULT NULL COMMENT '行交货期限(材料默认=款交期-45天)'");
CALL _i9_add_col('contract_material','photo_url',"VARCHAR(500)   DEFAULT NULL COMMENT '材料照片URL'");
CALL _i9_sync_col('contract_material','photo_url',"VARCHAR(500)","VARCHAR(500)   DEFAULT NULL COMMENT '材料照片URL'");
CALL _i9_add_col('contract_material','remark',"VARCHAR(200)   DEFAULT NULL");
CALL _i9_sync_col('contract_material','remark',"VARCHAR(200)","VARCHAR(200)   DEFAULT NULL");

-- contract_shipment
CALL _i9_add_col('contract_shipment','contract_id',"BIGINT         NOT NULL");
CALL _i9_sync_col('contract_shipment','contract_id',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('contract_shipment','ship_no',"VARCHAR(30)    DEFAULT NULL COMMENT '发货单号 FH-款号-序号'");
CALL _i9_sync_col('contract_shipment','ship_no',"VARCHAR(30)","VARCHAR(30)    DEFAULT NULL COMMENT '发货单号 FH-款号-序号'");
CALL _i9_add_col('contract_shipment','qty',"DECIMAL(15,4)  NOT NULL COMMENT '本批发货数量'");
CALL _i9_sync_col('contract_shipment','qty',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL COMMENT '本批发货数量'");
CALL _i9_add_col('contract_shipment','snapshot_unit_price',"DECIMAL(15,4) DEFAULT NULL COMMENT '逐批锁定单价(发货当时合同单价快照)'");
CALL _i9_sync_col('contract_shipment','snapshot_unit_price',"DECIMAL(15,4)","DECIMAL(15,4) DEFAULT NULL COMMENT '逐批锁定单价(发货当时合同单价快照)'");
CALL _i9_add_col('contract_shipment','amount',"DECIMAL(15,4)  DEFAULT NULL COMMENT '本批金额'");
CALL _i9_sync_col('contract_shipment','amount',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '本批金额'");
CALL _i9_add_col('contract_shipment','ship_date',"DATE           DEFAULT NULL");
CALL _i9_sync_col('contract_shipment','ship_date',"DATE","DATE           DEFAULT NULL");
CALL _i9_add_col('contract_shipment','operator',"VARCHAR(50)    DEFAULT NULL COMMENT '发货供应商账号'");
CALL _i9_sync_col('contract_shipment','operator',"VARCHAR(50)","VARCHAR(50)    DEFAULT NULL COMMENT '发货供应商账号'");
CALL _i9_add_col('contract_shipment','approval_status',"ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING' COMMENT '发货业务审批(门户B2)'");
CALL _i9_sync_col('contract_shipment','approval_status',"ENUM('PENDING','APPROVED','REJECTED')","ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING' COMMENT '发货业务审批(门户B2)'");
CALL _i9_add_col('contract_shipment','approved_by',"BIGINT         DEFAULT NULL");
CALL _i9_sync_col('contract_shipment','approved_by',"BIGINT","BIGINT         DEFAULT NULL");
CALL _i9_add_col('contract_shipment','approved_at',"DATETIME       DEFAULT NULL");
CALL _i9_sync_col('contract_shipment','approved_at',"DATETIME","DATETIME       DEFAULT NULL");
CALL _i9_add_col('contract_shipment','reconcile_id',"BIGINT         DEFAULT NULL COMMENT '被哪张对账单占用(防重复对账,删单释放)'");
CALL _i9_sync_col('contract_shipment','reconcile_id',"BIGINT","BIGINT         DEFAULT NULL COMMENT '被哪张对账单占用(防重复对账,删单释放)'");
CALL _i9_add_col('contract_shipment','express_company',"VARCHAR(50)    DEFAULT NULL COMMENT '快递公司'");
CALL _i9_sync_col('contract_shipment','express_company',"VARCHAR(50)","VARCHAR(50)    DEFAULT NULL COMMENT '快递公司'");
CALL _i9_add_col('contract_shipment','express_no',"VARCHAR(50)    DEFAULT NULL COMMENT '快递单号'");
CALL _i9_sync_col('contract_shipment','express_no',"VARCHAR(50)","VARCHAR(50)    DEFAULT NULL COMMENT '快递单号'");
CALL _i9_add_col('contract_shipment','attach_url',"VARCHAR(500)   DEFAULT NULL COMMENT '附件(装箱单/货物照片)'");
CALL _i9_sync_col('contract_shipment','attach_url',"VARCHAR(500)","VARCHAR(500)   DEFAULT NULL COMMENT '附件(装箱单/货物照片)'");
CALL _i9_add_col('contract_shipment','created_at',"DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('contract_shipment','created_at',"DATETIME","DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP");

-- contract_portal_log
CALL _i9_add_col('contract_portal_log','contract_id',"BIGINT        NOT NULL");
CALL _i9_sync_col('contract_portal_log','contract_id',"BIGINT","BIGINT        NOT NULL");
CALL _i9_add_col('contract_portal_log','action',"VARCHAR(50)   NOT NULL COMMENT 'PUSH/STAMP/SHIP/RECONCILE/INVOICE'");
CALL _i9_sync_col('contract_portal_log','action',"VARCHAR(50)","VARCHAR(50)   NOT NULL COMMENT 'PUSH/STAMP/SHIP/RECONCILE/INVOICE'");
CALL _i9_add_col('contract_portal_log','operator',"VARCHAR(100)  NOT NULL COMMENT '操作人（账号）'");
CALL _i9_sync_col('contract_portal_log','operator',"VARCHAR(100)","VARCHAR(100)  NOT NULL COMMENT '操作人（账号）'");
CALL _i9_add_col('contract_portal_log','operator_type',"ENUM('INTERNAL','SUPPLIER') NOT NULL DEFAULT 'INTERNAL'");
CALL _i9_sync_col('contract_portal_log','operator_type',"ENUM('INTERNAL','SUPPLIER')","ENUM('INTERNAL','SUPPLIER') NOT NULL DEFAULT 'INTERNAL'");
CALL _i9_add_col('contract_portal_log','remark',"TEXT          DEFAULT NULL");
CALL _i9_sync_col('contract_portal_log','remark',"TEXT","TEXT          DEFAULT NULL");
CALL _i9_add_col('contract_portal_log','created_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('contract_portal_log','created_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");

-- reconciliation
CALL _i9_add_col('reconciliation','reconcile_no',"VARCHAR(30)    NOT NULL COMMENT 'DZ-YYYYMMDD-001 或 DZ-NC-YYYYMMDD-001'");
CALL _i9_sync_col('reconciliation','reconcile_no',"VARCHAR(30)","VARCHAR(30)    NOT NULL COMMENT 'DZ-YYYYMMDD-001 或 DZ-NC-YYYYMMDD-001'");
CALL _i9_add_col('reconciliation','type',"ENUM('CONTRACT','NO_CONTRACT','LABOR') NOT NULL DEFAULT 'CONTRACT'");
CALL _i9_sync_col('reconciliation','type',"ENUM('CONTRACT','NO_CONTRACT','LABOR')","ENUM('CONTRACT','NO_CONTRACT','LABOR') NOT NULL DEFAULT 'CONTRACT'");
CALL _i9_add_col('reconciliation','sub_type',"VARCHAR(20)    DEFAULT NULL COMMENT '无合同子类型:EXPENSE/CASH_NO_INVOICE/PREPAY'");
CALL _i9_sync_col('reconciliation','sub_type',"VARCHAR(20)","VARCHAR(20)    DEFAULT NULL COMMENT '无合同子类型:EXPENSE/CASH_NO_INVOICE/PREPAY'");
CALL _i9_add_col('reconciliation','contract_id',"BIGINT         DEFAULT NULL COMMENT '有合同时关联'");
CALL _i9_sync_col('reconciliation','contract_id',"BIGINT","BIGINT         DEFAULT NULL COMMENT '有合同时关联'");
CALL _i9_add_col('reconciliation','style_no',"VARCHAR(200)   DEFAULT NULL COMMENT '款号(合同→订单带出,供检索;工时对账为「款A 等N款」)'");
CALL _i9_sync_col('reconciliation','style_no',"VARCHAR(200)","VARCHAR(200)   DEFAULT NULL COMMENT '款号(合同→订单带出,供检索;工时对账为「款A 等N款」)'");
CALL _i9_add_col('reconciliation','factory_id',"BIGINT         DEFAULT NULL COMMENT '供应商对账=加工厂/供应商;工时对账为空'");
CALL _i9_sync_col('reconciliation','factory_id',"BIGINT","BIGINT         DEFAULT NULL COMMENT '供应商对账=加工厂/供应商;工时对账为空'");
CALL _i9_add_col('reconciliation','patternmaker_id',"BIGINT         DEFAULT NULL COMMENT '工时对账受款方版师'");
CALL _i9_sync_col('reconciliation','patternmaker_id',"BIGINT","BIGINT         DEFAULT NULL COMMENT '工时对账受款方版师'");
CALL _i9_add_col('reconciliation','patternmaker_name',"VARCHAR(50)   DEFAULT NULL");
CALL _i9_sync_col('reconciliation','patternmaker_name',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL");
CALL _i9_add_col('reconciliation','currency',"VARCHAR(10)    NOT NULL DEFAULT 'CNY' COMMENT '工时单价币种,默认CNY'");
CALL _i9_sync_col('reconciliation','currency',"VARCHAR(10)","VARCHAR(10)    NOT NULL DEFAULT 'CNY' COMMENT '工时单价币种,默认CNY'");
CALL _i9_add_col('reconciliation','period',"VARCHAR(20)    DEFAULT NULL COMMENT '归属账期(按月合并如2026-07)'");
CALL _i9_sync_col('reconciliation','period',"VARCHAR(20)","VARCHAR(20)    DEFAULT NULL COMMENT '归属账期(按月合并如2026-07)'");
CALL _i9_add_col('reconciliation','total_amount',"DECIMAL(15,4)  NOT NULL COMMENT '对账金额'");
CALL _i9_sync_col('reconciliation','total_amount',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL COMMENT '对账金额'");
CALL _i9_add_col('reconciliation','tax_rate',"DECIMAL(5,2)   DEFAULT NULL COMMENT '税率%'");
CALL _i9_sync_col('reconciliation','tax_rate',"DECIMAL(5,2)","DECIMAL(5,2)   DEFAULT NULL COMMENT '税率%'");
CALL _i9_add_col('reconciliation','tax_amount',"DECIMAL(15,4)  DEFAULT NULL COMMENT '税额'");
CALL _i9_sync_col('reconciliation','tax_amount',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '税额'");
CALL _i9_add_col('reconciliation','invoice_no',"VARCHAR(100)   DEFAULT NULL COMMENT '发票号'");
CALL _i9_sync_col('reconciliation','invoice_no',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL COMMENT '发票号'");
CALL _i9_add_col('reconciliation','invoice_amount',"DECIMAL(15,4)  DEFAULT NULL COMMENT '发票金额'");
CALL _i9_sync_col('reconciliation','invoice_amount',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '发票金额'");
CALL _i9_add_col('reconciliation','invoice_diff',"DECIMAL(15,4)  DEFAULT NULL COMMENT '发票与对账差额'");
CALL _i9_sync_col('reconciliation','invoice_diff',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '发票与对账差额'");
CALL _i9_add_col('reconciliation','invoice_url',"VARCHAR(500)   DEFAULT NULL COMMENT '发票文件路径'");
CALL _i9_sync_col('reconciliation','invoice_url',"VARCHAR(500)","VARCHAR(500)   DEFAULT NULL COMMENT '发票文件路径'");
CALL _i9_add_col('reconciliation','has_invoice',"TINYINT        NOT NULL DEFAULT 0 COMMENT '1=有票 0=无票'");
CALL _i9_sync_col('reconciliation','has_invoice',"TINYINT","TINYINT        NOT NULL DEFAULT 0 COMMENT '1=有票 0=无票'");
CALL _i9_add_col('reconciliation','status',"ENUM('DRAFT','PENDING','CONFIRMED','PAID') NOT NULL DEFAULT 'DRAFT'");
CALL _i9_sync_col('reconciliation','status',"ENUM('DRAFT','PENDING','CONFIRMED','PAID')","ENUM('DRAFT','PENDING','CONFIRMED','PAID') NOT NULL DEFAULT 'DRAFT'");
CALL _i9_add_col('reconciliation','confirmed_at',"DATETIME       DEFAULT NULL");
CALL _i9_sync_col('reconciliation','confirmed_at',"DATETIME","DATETIME       DEFAULT NULL");
CALL _i9_add_col('reconciliation','review_remark',"VARCHAR(500)   DEFAULT NULL COMMENT '主管复核批注/整单退回原因'");
CALL _i9_sync_col('reconciliation','review_remark',"VARCHAR(500)","VARCHAR(500)   DEFAULT NULL COMMENT '主管复核批注/整单退回原因'");
CALL _i9_add_col('reconciliation','description',"TEXT           DEFAULT NULL COMMENT '无合同费用说明'");
CALL _i9_sync_col('reconciliation','description',"TEXT","TEXT           DEFAULT NULL COMMENT '无合同费用说明'");
CALL _i9_add_col('reconciliation','created_by',"BIGINT         NOT NULL");
CALL _i9_sync_col('reconciliation','created_by',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('reconciliation','created_at',"DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('reconciliation','created_at',"DATETIME","DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_add_col('reconciliation','updated_at',"DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('reconciliation','updated_at',"DATETIME","DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_add_col('reconciliation','deleted',"TINYINT        NOT NULL DEFAULT 0");
CALL _i9_sync_col('reconciliation','deleted',"TINYINT","TINYINT        NOT NULL DEFAULT 0");

-- reconciliation_shipment
CALL _i9_add_col('reconciliation_shipment','reconcile_id',"BIGINT         NOT NULL");
CALL _i9_sync_col('reconciliation_shipment','reconcile_id',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('reconciliation_shipment','shipment_id',"BIGINT         NOT NULL COMMENT '关联出货记录'");
CALL _i9_sync_col('reconciliation_shipment','shipment_id',"BIGINT","BIGINT         NOT NULL COMMENT '关联出货记录'");
CALL _i9_add_col('reconciliation_shipment','contract_id',"BIGINT         DEFAULT NULL COMMENT '一单多合同:本批次来源合同'");
CALL _i9_sync_col('reconciliation_shipment','contract_id',"BIGINT","BIGINT         DEFAULT NULL COMMENT '一单多合同:本批次来源合同'");
CALL _i9_add_col('reconciliation_shipment','style_no',"VARCHAR(60)    DEFAULT NULL COMMENT '一单多合同:本批次款号'");
CALL _i9_sync_col('reconciliation_shipment','style_no',"VARCHAR(60)","VARCHAR(60)    DEFAULT NULL COMMENT '一单多合同:本批次款号'");
CALL _i9_add_col('reconciliation_shipment','item_name',"VARCHAR(100)   NOT NULL COMMENT '材料名（快照）'");
CALL _i9_sync_col('reconciliation_shipment','item_name',"VARCHAR(100)","VARCHAR(100)   NOT NULL COMMENT '材料名（快照）'");
CALL _i9_add_col('reconciliation_shipment','snapshot_unit_price',"DECIMAL(15,4) NOT NULL COMMENT '盖章时快照单价'");
CALL _i9_sync_col('reconciliation_shipment','snapshot_unit_price',"DECIMAL(15,4)","DECIMAL(15,4) NOT NULL COMMENT '盖章时快照单价'");
CALL _i9_add_col('reconciliation_shipment','qty',"DECIMAL(15,4)  NOT NULL");
CALL _i9_sync_col('reconciliation_shipment','qty',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL");
CALL _i9_add_col('reconciliation_shipment','amount',"DECIMAL(15,4)  NOT NULL");
CALL _i9_sync_col('reconciliation_shipment','amount',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL");
CALL _i9_add_col('reconciliation_shipment','remark',"VARCHAR(200)   DEFAULT NULL COMMENT '逐批批注'");
CALL _i9_sync_col('reconciliation_shipment','remark',"VARCHAR(200)","VARCHAR(200)   DEFAULT NULL COMMENT '逐批批注'");

-- reconciliation_expense_item
CALL _i9_add_col('reconciliation_expense_item','reconcile_id',"BIGINT        NOT NULL");
CALL _i9_sync_col('reconciliation_expense_item','reconcile_id',"BIGINT","BIGINT        NOT NULL");
CALL _i9_add_col('reconciliation_expense_item','expense_name',"VARCHAR(200)  NOT NULL COMMENT '费用项目/事由'");
CALL _i9_sync_col('reconciliation_expense_item','expense_name',"VARCHAR(200)","VARCHAR(200)  NOT NULL COMMENT '费用项目/事由'");
CALL _i9_add_col('reconciliation_expense_item','amount',"DECIMAL(15,4) NOT NULL");
CALL _i9_sync_col('reconciliation_expense_item','amount',"DECIMAL(15,4)","DECIMAL(15,4) NOT NULL");
CALL _i9_add_col('reconciliation_expense_item','style_no',"VARCHAR(60)   DEFAULT NULL COMMENT '相关款号(可空)'");
CALL _i9_sync_col('reconciliation_expense_item','style_no',"VARCHAR(60)","VARCHAR(60)   DEFAULT NULL COMMENT '相关款号(可空)'");
CALL _i9_add_col('reconciliation_expense_item','attach_url',"VARCHAR(500)  DEFAULT NULL COMMENT '附件(收据/无票说明)'");
CALL _i9_sync_col('reconciliation_expense_item','attach_url',"VARCHAR(500)","VARCHAR(500)  DEFAULT NULL COMMENT '附件(收据/无票说明)'");

-- reconciliation_labor_item
CALL _i9_add_col('reconciliation_labor_item','reconcile_id',"BIGINT         NOT NULL");
CALL _i9_sync_col('reconciliation_labor_item','reconcile_id',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('reconciliation_labor_item','sample_id',"BIGINT         NOT NULL COMMENT '关联样衣'");
CALL _i9_sync_col('reconciliation_labor_item','sample_id',"BIGINT","BIGINT         NOT NULL COMMENT '关联样衣'");
CALL _i9_add_col('reconciliation_labor_item','sample_no',"VARCHAR(30)    DEFAULT NULL");
CALL _i9_sync_col('reconciliation_labor_item','sample_no',"VARCHAR(30)","VARCHAR(30)    DEFAULT NULL");
CALL _i9_add_col('reconciliation_labor_item','style_no',"VARCHAR(100)   DEFAULT NULL COMMENT '客户款号'");
CALL _i9_sync_col('reconciliation_labor_item','style_no',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL COMMENT '客户款号'");
CALL _i9_add_col('reconciliation_labor_item','piece_count',"INT            DEFAULT NULL COMMENT '件数(快照)'");
CALL _i9_sync_col('reconciliation_labor_item','piece_count',"INT","INT            DEFAULT NULL COMMENT '件数(快照)'");
CALL _i9_add_col('reconciliation_labor_item','labor_unit_price',"DECIMAL(12,2)  DEFAULT NULL COMMENT '工时单价(快照)'");
CALL _i9_sync_col('reconciliation_labor_item','labor_unit_price',"DECIMAL(12,2)","DECIMAL(12,2)  DEFAULT NULL COMMENT '工时单价(快照)'");
CALL _i9_add_col('reconciliation_labor_item','labor_amount',"DECIMAL(14,2)  DEFAULT NULL COMMENT '工时金额(快照)'");
CALL _i9_sync_col('reconciliation_labor_item','labor_amount',"DECIMAL(14,2)","DECIMAL(14,2)  DEFAULT NULL COMMENT '工时金额(快照)'");

-- prepayment
CALL _i9_add_col('prepayment','factory_id',"BIGINT        NOT NULL");
CALL _i9_sync_col('prepayment','factory_id',"BIGINT","BIGINT        NOT NULL");
CALL _i9_add_col('prepayment','contract_id',"BIGINT        DEFAULT NULL");
CALL _i9_sync_col('prepayment','contract_id',"BIGINT","BIGINT        DEFAULT NULL");
CALL _i9_add_col('prepayment','amount',"DECIMAL(15,4) NOT NULL COMMENT '预付款金额'");
CALL _i9_sync_col('prepayment','amount',"DECIMAL(15,4)","DECIMAL(15,4) NOT NULL COMMENT '预付款金额'");
CALL _i9_add_col('prepayment','used_amount',"DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '已冲抵金额'");
CALL _i9_sync_col('prepayment','used_amount',"DECIMAL(15,4)","DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '已冲抵金额'");
CALL _i9_add_col('prepayment','balance',"DECIMAL(15,4) NOT NULL COMMENT '余额（冗余字段）'");
CALL _i9_sync_col('prepayment','balance',"DECIMAL(15,4)","DECIMAL(15,4) NOT NULL COMMENT '余额（冗余字段）'");
CALL _i9_add_col('prepayment','pay_date',"DATE          NOT NULL");
CALL _i9_sync_col('prepayment','pay_date',"DATE","DATE          NOT NULL");
CALL _i9_add_col('prepayment','remark',"TEXT          DEFAULT NULL");
CALL _i9_sync_col('prepayment','remark',"TEXT","TEXT          DEFAULT NULL");
CALL _i9_add_col('prepayment','created_by',"BIGINT        NOT NULL");
CALL _i9_sync_col('prepayment','created_by',"BIGINT","BIGINT        NOT NULL");
CALL _i9_add_col('prepayment','created_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('prepayment','created_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_add_col('prepayment','updated_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('prepayment','updated_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

-- payment_request
CALL _i9_add_col('payment_request','pr_no',"VARCHAR(30)    NOT NULL COMMENT 'PR-YYYYMMDD-001 或 PR-NC-YYYYMMDD-001'");
CALL _i9_sync_col('payment_request','pr_no',"VARCHAR(30)","VARCHAR(30)    NOT NULL COMMENT 'PR-YYYYMMDD-001 或 PR-NC-YYYYMMDD-001'");
CALL _i9_add_col('payment_request','type',"ENUM('CONTRACT','NO_CONTRACT') NOT NULL DEFAULT 'CONTRACT'");
CALL _i9_sync_col('payment_request','type',"ENUM('CONTRACT','NO_CONTRACT')","ENUM('CONTRACT','NO_CONTRACT') NOT NULL DEFAULT 'CONTRACT'");
CALL _i9_add_col('payment_request','reconcile_id',"BIGINT         DEFAULT NULL COMMENT '有合同时关联对账单'");
CALL _i9_sync_col('payment_request','reconcile_id',"BIGINT","BIGINT         DEFAULT NULL COMMENT '有合同时关联对账单'");
CALL _i9_add_col('payment_request','factory_id',"BIGINT         NOT NULL");
CALL _i9_sync_col('payment_request','factory_id',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('payment_request','amount',"DECIMAL(15,4)  NOT NULL COMMENT '申请付款金额'");
CALL _i9_sync_col('payment_request','amount',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL COMMENT '申请付款金额'");
CALL _i9_add_col('payment_request','prepay_offset',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '预付款冲抵金额'");
CALL _i9_sync_col('payment_request','prepay_offset',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '预付款冲抵金额'");
CALL _i9_add_col('payment_request','actual_pay',"DECIMAL(15,4)  DEFAULT NULL COMMENT '实付金额=amount-prepay_offset'");
CALL _i9_sync_col('payment_request','actual_pay',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '实付金额=amount-prepay_offset'");
CALL _i9_add_col('payment_request','account_period_days',"INT          DEFAULT NULL COMMENT '结算账期(合同带入,可人工改)'");
CALL _i9_sync_col('payment_request','account_period_days',"INT","INT          DEFAULT NULL COMMENT '结算账期(合同带入,可人工改)'");
CALL _i9_add_col('payment_request','due_date',"DATE           DEFAULT NULL COMMENT '到期日=出货日+账期(逾期高亮)'");
CALL _i9_sync_col('payment_request','due_date',"DATE","DATE           DEFAULT NULL COMMENT '到期日=出货日+账期(逾期高亮)'");
CALL _i9_add_col('payment_request','paid_total',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '已付总额(分批付款累计)'");
CALL _i9_sync_col('payment_request','paid_total',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '已付总额(分批付款累计)'");
CALL _i9_add_col('payment_request','slip_url',"VARCHAR(500)   DEFAULT NULL COMMENT '水单文件路径'");
CALL _i9_sync_col('payment_request','slip_url',"VARCHAR(500)","VARCHAR(500)   DEFAULT NULL COMMENT '水单文件路径'");
CALL _i9_add_col('payment_request','paid_by',"BIGINT         DEFAULT NULL COMMENT '标记付款操作人'");
CALL _i9_sync_col('payment_request','paid_by',"BIGINT","BIGINT         DEFAULT NULL COMMENT '标记付款操作人'");
CALL _i9_add_col('payment_request','slip_uploaded_at',"DATETIME       DEFAULT NULL");
CALL _i9_sync_col('payment_request','slip_uploaded_at',"DATETIME","DATETIME       DEFAULT NULL");
CALL _i9_add_col('payment_request','approval_status',"ENUM('DRAFT','PENDING','APPROVED','REJECTED','PAID') NOT NULL DEFAULT 'DRAFT'");
CALL _i9_sync_col('payment_request','approval_status',"ENUM('DRAFT','PENDING','APPROVED','REJECTED','PAID')","ENUM('DRAFT','PENDING','APPROVED','REJECTED','PAID') NOT NULL DEFAULT 'DRAFT'");
CALL _i9_add_col('payment_request','submitted_by',"BIGINT         DEFAULT NULL");
CALL _i9_sync_col('payment_request','submitted_by',"BIGINT","BIGINT         DEFAULT NULL");
CALL _i9_add_col('payment_request','submitted_at',"DATETIME       DEFAULT NULL");
CALL _i9_sync_col('payment_request','submitted_at',"DATETIME","DATETIME       DEFAULT NULL");
CALL _i9_add_col('payment_request','approved_by',"BIGINT         DEFAULT NULL");
CALL _i9_sync_col('payment_request','approved_by',"BIGINT","BIGINT         DEFAULT NULL");
CALL _i9_add_col('payment_request','approved_at',"DATETIME       DEFAULT NULL");
CALL _i9_sync_col('payment_request','approved_at',"DATETIME","DATETIME       DEFAULT NULL");
CALL _i9_add_col('payment_request','reject_reason',"TEXT           DEFAULT NULL");
CALL _i9_sync_col('payment_request','reject_reason',"TEXT","TEXT           DEFAULT NULL");
CALL _i9_add_col('payment_request','description',"TEXT           DEFAULT NULL COMMENT '无合同费用说明'");
CALL _i9_sync_col('payment_request','description',"TEXT","TEXT           DEFAULT NULL COMMENT '无合同费用说明'");
CALL _i9_add_col('payment_request','created_by',"BIGINT         NOT NULL");
CALL _i9_sync_col('payment_request','created_by',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('payment_request','created_at',"DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('payment_request','created_at',"DATETIME","DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_add_col('payment_request','updated_at',"DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('payment_request','updated_at',"DATETIME","DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_add_col('payment_request','deleted',"TINYINT        NOT NULL DEFAULT 0");
CALL _i9_sync_col('payment_request','deleted',"TINYINT","TINYINT        NOT NULL DEFAULT 0");

-- payment_record
CALL _i9_add_col('payment_record','pr_id',"BIGINT        NOT NULL COMMENT '所属付款申请'");
CALL _i9_sync_col('payment_record','pr_id',"BIGINT","BIGINT        NOT NULL COMMENT '所属付款申请'");
CALL _i9_add_col('payment_record','pay_method',"ENUM('BANK','ACCEPTANCE','OTHER') NOT NULL DEFAULT 'BANK' COMMENT '付款方式:银行转账/承兑汇票/其他'");
CALL _i9_sync_col('payment_record','pay_method',"ENUM('BANK','ACCEPTANCE','OTHER')","ENUM('BANK','ACCEPTANCE','OTHER') NOT NULL DEFAULT 'BANK' COMMENT '付款方式:银行转账/承兑汇票/其他'");
CALL _i9_add_col('payment_record','pay_date',"DATE          NOT NULL");
CALL _i9_sync_col('payment_record','pay_date',"DATE","DATE          NOT NULL");
CALL _i9_add_col('payment_record','amount',"DECIMAL(15,4) NOT NULL COMMENT '本次付款金额'");
CALL _i9_sync_col('payment_record','amount',"DECIMAL(15,4)","DECIMAL(15,4) NOT NULL COMMENT '本次付款金额'");
CALL _i9_add_col('payment_record','slip_url',"VARCHAR(500)  DEFAULT NULL COMMENT '付款凭证(水单)'");
CALL _i9_sync_col('payment_record','slip_url',"VARCHAR(500)","VARCHAR(500)  DEFAULT NULL COMMENT '付款凭证(水单)'");
CALL _i9_add_col('payment_record','remark',"VARCHAR(200)  DEFAULT NULL");
CALL _i9_sync_col('payment_record','remark',"VARCHAR(200)","VARCHAR(200)  DEFAULT NULL");
CALL _i9_add_col('payment_record','created_by',"BIGINT        NOT NULL");
CALL _i9_sync_col('payment_record','created_by',"BIGINT","BIGINT        NOT NULL");
CALL _i9_add_col('payment_record','created_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('payment_record','created_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");

-- settlement
CALL _i9_add_col('settlement','settlement_no',"VARCHAR(30)    NOT NULL COMMENT '结算单号 JS-YYYYMMDD-001'");
CALL _i9_sync_col('settlement','settlement_no',"VARCHAR(30)","VARCHAR(30)    NOT NULL COMMENT '结算单号 JS-YYYYMMDD-001'");
CALL _i9_add_col('settlement','order_id',"BIGINT         NOT NULL");
CALL _i9_sync_col('settlement','order_id',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('settlement','style_no',"VARCHAR(60)    DEFAULT NULL COMMENT '款号(核算口径,来自订单)'");
CALL _i9_sync_col('settlement','style_no',"VARCHAR(60)","VARCHAR(60)    DEFAULT NULL COMMENT '款号(核算口径,来自订单)'");
CALL _i9_add_col('settlement','shipped_qty',"INT            NOT NULL DEFAULT 0 COMMENT '出货件数(汇总自 order_shipment)'");
CALL _i9_sync_col('settlement','shipped_qty',"INT","INT            NOT NULL DEFAULT 0 COMMENT '出货件数(汇总自 order_shipment)'");
CALL _i9_add_col('settlement','currency',"VARCHAR(5)     NOT NULL DEFAULT 'CNY'");
CALL _i9_sync_col('settlement','currency',"VARCHAR(5)","VARCHAR(5)     NOT NULL DEFAULT 'CNY'");
CALL _i9_add_col('settlement','exchange_rate',"DECIMAL(10,4)  DEFAULT NULL COMMENT '结算汇率'");
CALL _i9_sync_col('settlement','exchange_rate',"DECIMAL(10,4)","DECIMAL(10,4)  DEFAULT NULL COMMENT '结算汇率'");
CALL _i9_add_col('settlement','status',"ENUM('DRAFT','CONFIRMED') NOT NULL DEFAULT 'DRAFT'");
CALL _i9_sync_col('settlement','status',"ENUM('DRAFT','CONFIRMED')","ENUM('DRAFT','CONFIRMED') NOT NULL DEFAULT 'DRAFT'");
CALL _i9_add_col('settlement','goods_amount_tax',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '总货款(含税)'");
CALL _i9_sync_col('settlement','goods_amount_tax',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '总货款(含税)'");
CALL _i9_add_col('settlement','goods_amount_extax',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '总货款(不含税)=含税÷1.13(无票行按含税全额)'");
CALL _i9_sync_col('settlement','goods_amount_extax',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '总货款(不含税)=含税÷1.13(无票行按含税全额)'");
CALL _i9_add_col('settlement','cost_per_unit_tax',"DECIMAL(15,4)  DEFAULT NULL COMMENT '成本单价(含税)=总货款含税÷出货件数'");
CALL _i9_sync_col('settlement','cost_per_unit_tax',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '成本单价(含税)=总货款含税÷出货件数'");
CALL _i9_add_col('settlement','cost_per_unit_extax',"DECIMAL(15,4)  DEFAULT NULL COMMENT '成本单价(不含税)'");
CALL _i9_sync_col('settlement','cost_per_unit_extax',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '成本单价(不含税)'");
CALL _i9_add_col('settlement','invoice_amount_usd',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '发票金额(USD)'");
CALL _i9_sync_col('settlement','invoice_amount_usd',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '发票金额(USD)'");
CALL _i9_add_col('settlement','receipt_usd',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '实际收汇金额(USD)'");
CALL _i9_sync_col('settlement','receipt_usd',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '实际收汇金额(USD)'");
CALL _i9_add_col('settlement','usd_unit_price',"DECIMAL(15,4)  DEFAULT NULL COMMENT '美金单价=发票金额÷出货件数'");
CALL _i9_sync_col('settlement','usd_unit_price',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '美金单价=发票金额÷出货件数'");
CALL _i9_add_col('settlement','freight_fee',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '运杂费(进净利扣减)'");
CALL _i9_sync_col('settlement','freight_fee',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '运杂费(进净利扣减)'");
CALL _i9_add_col('settlement','express_fee',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '快邮费(国际+国内)'");
CALL _i9_sync_col('settlement','express_fee',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '快邮费(国际+国内)'");
CALL _i9_add_col('settlement','sample_fee',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '打样费'");
CALL _i9_sync_col('settlement','sample_fee',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '打样费'");
CALL _i9_add_col('settlement','other_fee',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '其它费用'");
CALL _i9_sync_col('settlement','other_fee',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '其它费用'");
CALL _i9_add_col('settlement','settle_amount',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '结算金额(RMB)=实际收汇×结算汇率'");
CALL _i9_sync_col('settlement','settle_amount',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '结算金额(RMB)=实际收汇×结算汇率'");
CALL _i9_add_col('settlement','finance_fee',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '财务及管理费=结算金额×7%'");
CALL _i9_sync_col('settlement','finance_fee',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '财务及管理费=结算金额×7%'");
CALL _i9_add_col('settlement','gross_profit',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '毛利=结算金额−总货款不含税'");
CALL _i9_sync_col('settlement','gross_profit',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '毛利=结算金额−总货款不含税'");
CALL _i9_add_col('settlement','gross_margin',"DECIMAL(8,2)   DEFAULT NULL COMMENT '毛利率%'");
CALL _i9_sync_col('settlement','gross_margin',"DECIMAL(8,2)","DECIMAL(8,2)   DEFAULT NULL COMMENT '毛利率%'");
CALL _i9_add_col('settlement','breakeven_rate_tax',"DECIMAL(10,4)  DEFAULT NULL COMMENT '保本汇率(含税)=成本单价含税÷美金单价'");
CALL _i9_sync_col('settlement','breakeven_rate_tax',"DECIMAL(10,4)","DECIMAL(10,4)  DEFAULT NULL COMMENT '保本汇率(含税)=成本单价含税÷美金单价'");
CALL _i9_add_col('settlement','breakeven_rate_extax',"DECIMAL(10,4)  DEFAULT NULL COMMENT '保本汇率(不含税)'");
CALL _i9_sync_col('settlement','breakeven_rate_extax',"DECIMAL(10,4)","DECIMAL(10,4)  DEFAULT NULL COMMENT '保本汇率(不含税)'");
CALL _i9_add_col('settlement','unpaid_goods_tax',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '已确认未付对账金额(含税)——不计入总货款,灰显「未付·不计入」'");
CALL _i9_sync_col('settlement','unpaid_goods_tax',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '已确认未付对账金额(含税)——不计入总货款,灰显「未付·不计入」'");
CALL _i9_add_col('settlement','unpaid_count',"INT            NOT NULL DEFAULT 0 COMMENT '已确认未付对账笔数'");
CALL _i9_sync_col('settlement','unpaid_count',"INT","INT            NOT NULL DEFAULT 0 COMMENT '已确认未付对账笔数'");
CALL _i9_add_col('settlement','profit_ready',"TINYINT        NOT NULL DEFAULT 0 COMMENT '1=收汇与汇率齐备,毛利/净利可信(缺值不出误导性负毛利)'");
CALL _i9_sync_col('settlement','profit_ready',"TINYINT","TINYINT        NOT NULL DEFAULT 0 COMMENT '1=收汇与汇率齐备,毛利/净利可信(缺值不出误导性负毛利)'");
CALL _i9_add_col('settlement','tax_refund',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '出口退税(可退税不含税采购额×退税率,自动测算)'");
CALL _i9_sync_col('settlement','tax_refund',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '出口退税(可退税不含税采购额×退税率,自动测算)'");
CALL _i9_add_col('settlement','refund_status',"VARCHAR(20)    NOT NULL DEFAULT 'ESTIMATED' COMMENT '退税状态:ESTIMATED预估/RECEIVED到账'");
CALL _i9_sync_col('settlement','refund_status',"VARCHAR(20)","VARCHAR(20)    NOT NULL DEFAULT 'ESTIMATED' COMMENT '退税状态:ESTIMATED预估/RECEIVED到账'");
CALL _i9_add_col('settlement','customer_name',"VARCHAR(100)   DEFAULT NULL COMMENT '中间商客户(利润按客户维度汇总)'");
CALL _i9_sync_col('settlement','customer_name',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL COMMENT '中间商客户(利润按客户维度汇总)'");
CALL _i9_add_col('settlement','net_profit',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '净利(含退税)=净利+退税'");
CALL _i9_sync_col('settlement','net_profit',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '净利(含退税)=净利+退税'");
CALL _i9_add_col('settlement','net_profit_ex_refund',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '净利(不含退税)=毛利−期间费用−财务费7%'");
CALL _i9_sync_col('settlement','net_profit_ex_refund',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '净利(不含退税)=毛利−期间费用−财务费7%'");
CALL _i9_add_col('settlement','revenue',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '兼容列=结算金额'");
CALL _i9_sync_col('settlement','revenue',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '兼容列=结算金额'");
CALL _i9_add_col('settlement','total_cost',"DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '兼容列=总货款含税'");
CALL _i9_sync_col('settlement','total_cost',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL DEFAULT 0 COMMENT '兼容列=总货款含税'");
CALL _i9_add_col('settlement','cost_per_unit',"DECIMAL(15,4)  DEFAULT NULL COMMENT '兼容列=不含税成本单价'");
CALL _i9_sync_col('settlement','cost_per_unit',"DECIMAL(15,4)","DECIMAL(15,4)  DEFAULT NULL COMMENT '兼容列=不含税成本单价'");
CALL _i9_add_col('settlement','description',"VARCHAR(255)   DEFAULT NULL");
CALL _i9_sync_col('settlement','description',"VARCHAR(255)","VARCHAR(255)   DEFAULT NULL");
CALL _i9_add_col('settlement','created_by',"BIGINT         DEFAULT NULL");
CALL _i9_sync_col('settlement','created_by',"BIGINT","BIGINT         DEFAULT NULL");
CALL _i9_add_col('settlement','confirmed_at',"DATETIME       DEFAULT NULL");
CALL _i9_sync_col('settlement','confirmed_at',"DATETIME","DATETIME       DEFAULT NULL");
CALL _i9_add_col('settlement','deleted',"TINYINT        NOT NULL DEFAULT 0");
CALL _i9_sync_col('settlement','deleted',"TINYINT","TINYINT        NOT NULL DEFAULT 0");
CALL _i9_add_col('settlement','created_at',"DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('settlement','created_at',"DATETIME","DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_add_col('settlement','updated_at',"DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('settlement','updated_at',"DATETIME","DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

-- settlement_cost
CALL _i9_add_col('settlement_cost','settlement_id',"BIGINT         NOT NULL");
CALL _i9_sync_col('settlement_cost','settlement_id',"BIGINT","BIGINT         NOT NULL");
CALL _i9_add_col('settlement_cost','cost_name',"VARCHAR(100)   NOT NULL COMMENT '成本项名称'");
CALL _i9_sync_col('settlement_cost','cost_name',"VARCHAR(100)","VARCHAR(100)   NOT NULL COMMENT '成本项名称'");
CALL _i9_add_col('settlement_cost','amount',"DECIMAL(15,4)  NOT NULL COMMENT '金额'");
CALL _i9_sync_col('settlement_cost','amount',"DECIMAL(15,4)","DECIMAL(15,4)  NOT NULL COMMENT '金额'");
CALL _i9_add_col('settlement_cost','has_invoice',"TINYINT        NOT NULL DEFAULT 1 COMMENT '1=有票 0=无票'");
CALL _i9_sync_col('settlement_cost','has_invoice',"TINYINT","TINYINT        NOT NULL DEFAULT 1 COMMENT '1=有票 0=无票'");
CALL _i9_add_col('settlement_cost','tax_rate',"DECIMAL(5,2)   NOT NULL DEFAULT 13 COMMENT '该行税率%(有票按此换不含税)'");
CALL _i9_sync_col('settlement_cost','tax_rate',"DECIMAL(5,2)","DECIMAL(5,2)   NOT NULL DEFAULT 13 COMMENT '该行税率%(有票按此换不含税)'");
CALL _i9_add_col('settlement_cost','reconcile_no',"VARCHAR(30)    DEFAULT NULL COMMENT '来源对账单号(AUTO行)'");
CALL _i9_sync_col('settlement_cost','reconcile_no',"VARCHAR(30)","VARCHAR(30)    DEFAULT NULL COMMENT '来源对账单号(AUTO行)'");
CALL _i9_add_col('settlement_cost','supplier_name',"VARCHAR(100)   DEFAULT NULL COMMENT '供应商(AUTO行)'");
CALL _i9_sync_col('settlement_cost','supplier_name',"VARCHAR(100)","VARCHAR(100)   DEFAULT NULL COMMENT '供应商(AUTO行)'");
CALL _i9_add_col('settlement_cost','pay_status',"VARCHAR(20)    DEFAULT NULL COMMENT '付款状态 PAID=已付 CONFIRMED=已确认未付'");
CALL _i9_sync_col('settlement_cost','pay_status',"VARCHAR(20)","VARCHAR(20)    DEFAULT NULL COMMENT '付款状态 PAID=已付 CONFIRMED=已确认未付'");
CALL _i9_add_col('settlement_cost','source',"VARCHAR(10)    NOT NULL DEFAULT 'MANUAL' COMMENT 'AUTO=对账汇总快照 MANUAL=手工行'");
CALL _i9_sync_col('settlement_cost','source',"VARCHAR(10)","VARCHAR(10)    NOT NULL DEFAULT 'MANUAL' COMMENT 'AUTO=对账汇总快照 MANUAL=手工行'");
CALL _i9_add_col('settlement_cost','included',"TINYINT        NOT NULL DEFAULT 1 COMMENT '1=计入总货款 0=未付不计入(灰显)'");
CALL _i9_sync_col('settlement_cost','included',"TINYINT","TINYINT        NOT NULL DEFAULT 1 COMMENT '1=计入总货款 0=未付不计入(灰显)'");
CALL _i9_add_col('settlement_cost','created_at',"DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('settlement_cost','created_at',"DATETIME","DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP");

-- settlement_receipt
CALL _i9_add_col('settlement_receipt','settlement_id',"BIGINT        NOT NULL");
CALL _i9_sync_col('settlement_receipt','settlement_id',"BIGINT","BIGINT        NOT NULL");
CALL _i9_add_col('settlement_receipt','amount',"DECIMAL(15,4) NOT NULL COMMENT '收款金额'");
CALL _i9_sync_col('settlement_receipt','amount',"DECIMAL(15,4)","DECIMAL(15,4) NOT NULL COMMENT '收款金额'");
CALL _i9_add_col('settlement_receipt','receipt_date',"DATE          NOT NULL COMMENT '收款日期'");
CALL _i9_sync_col('settlement_receipt','receipt_date',"DATE","DATE          NOT NULL COMMENT '收款日期'");
CALL _i9_add_col('settlement_receipt','exchange_rate',"DECIMAL(10,4) DEFAULT NULL COMMENT '该笔收汇汇率(银行水单带入,逐笔×汇率)'");
CALL _i9_sync_col('settlement_receipt','exchange_rate',"DECIMAL(10,4)","DECIMAL(10,4) DEFAULT NULL COMMENT '该笔收汇汇率(银行水单带入,逐笔×汇率)'");
CALL _i9_add_col('settlement_receipt','slip_url',"VARCHAR(500)  DEFAULT NULL COMMENT '银行水单'");
CALL _i9_sync_col('settlement_receipt','slip_url',"VARCHAR(500)","VARCHAR(500)  DEFAULT NULL COMMENT '银行水单'");
CALL _i9_add_col('settlement_receipt','remark',"VARCHAR(255)  DEFAULT NULL");
CALL _i9_sync_col('settlement_receipt','remark',"VARCHAR(255)","VARCHAR(255)  DEFAULT NULL");
CALL _i9_add_col('settlement_receipt','created_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('settlement_receipt','created_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");

-- sys_config
CALL _i9_add_col('sys_config','cfg_key',"VARCHAR(50)  NOT NULL COMMENT '配置键'");
CALL _i9_sync_col('sys_config','cfg_key',"VARCHAR(50)","VARCHAR(50)  NOT NULL COMMENT '配置键'");
CALL _i9_add_col('sys_config','cfg_value',"VARCHAR(200) NOT NULL COMMENT '配置值'");
CALL _i9_sync_col('sys_config','cfg_value',"VARCHAR(200)","VARCHAR(200) NOT NULL COMMENT '配置值'");
CALL _i9_add_col('sys_config','remark',"VARCHAR(200) DEFAULT NULL");
CALL _i9_sync_col('sys_config','remark',"VARCHAR(200)","VARCHAR(200) DEFAULT NULL");
CALL _i9_add_col('sys_config','updated_by',"BIGINT       DEFAULT NULL");
CALL _i9_sync_col('sys_config','updated_by',"BIGINT","BIGINT       DEFAULT NULL");
CALL _i9_add_col('sys_config','updated_at',"DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('sys_config','updated_at',"DATETIME","DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

-- company_profile
CALL _i9_add_col('company_profile','name',"VARCHAR(100) NOT NULL COMMENT '公司全称(PDF抬头/合同甲方/开票抬头)'");
CALL _i9_sync_col('company_profile','name',"VARCHAR(100)","VARCHAR(100) NOT NULL COMMENT '公司全称(PDF抬头/合同甲方/开票抬头)'");
CALL _i9_add_col('company_profile','short_name',"VARCHAR(50)  DEFAULT NULL");
CALL _i9_sync_col('company_profile','short_name',"VARCHAR(50)","VARCHAR(50)  DEFAULT NULL");
CALL _i9_add_col('company_profile','address',"VARCHAR(200) DEFAULT NULL");
CALL _i9_sync_col('company_profile','address',"VARCHAR(200)","VARCHAR(200) DEFAULT NULL");
CALL _i9_add_col('company_profile','phone',"VARCHAR(30)  DEFAULT NULL");
CALL _i9_sync_col('company_profile','phone',"VARCHAR(30)","VARCHAR(30)  DEFAULT NULL");
CALL _i9_add_col('company_profile','tax_no',"VARCHAR(30)  DEFAULT NULL COMMENT '税号'");
CALL _i9_sync_col('company_profile','tax_no',"VARCHAR(30)","VARCHAR(30)  DEFAULT NULL COMMENT '税号'");
CALL _i9_add_col('company_profile','bank_name',"VARCHAR(100) DEFAULT NULL");
CALL _i9_sync_col('company_profile','bank_name',"VARCHAR(100)","VARCHAR(100) DEFAULT NULL");
CALL _i9_add_col('company_profile','bank_account',"VARCHAR(40)  DEFAULT NULL");
CALL _i9_sync_col('company_profile','bank_account',"VARCHAR(40)","VARCHAR(40)  DEFAULT NULL");
CALL _i9_add_col('company_profile','legal_rep',"VARCHAR(50)  DEFAULT NULL COMMENT '法定代表人'");
CALL _i9_sync_col('company_profile','legal_rep',"VARCHAR(50)","VARCHAR(50)  DEFAULT NULL COMMENT '法定代表人'");
CALL _i9_add_col('company_profile','logo_url',"VARCHAR(500) DEFAULT NULL");
CALL _i9_sync_col('company_profile','logo_url',"VARCHAR(500)","VARCHAR(500) DEFAULT NULL");
CALL _i9_add_col('company_profile','seal_url',"VARCHAR(500) DEFAULT NULL COMMENT '本司电子章图片(PDF落款自动贴章,A3)'");
CALL _i9_sync_col('company_profile','seal_url',"VARCHAR(500)","VARCHAR(500) DEFAULT NULL COMMENT '本司电子章图片(PDF落款自动贴章,A3)'");
CALL _i9_add_col('company_profile','is_default',"TINYINT      NOT NULL DEFAULT 0 COMMENT '1=默认主体'");
CALL _i9_sync_col('company_profile','is_default',"TINYINT","TINYINT      NOT NULL DEFAULT 0 COMMENT '1=默认主体'");
CALL _i9_add_col('company_profile','remark',"VARCHAR(200) DEFAULT NULL");
CALL _i9_sync_col('company_profile','remark',"VARCHAR(200)","VARCHAR(200) DEFAULT NULL");
CALL _i9_add_col('company_profile','deleted',"TINYINT      NOT NULL DEFAULT 0");
CALL _i9_sync_col('company_profile','deleted',"TINYINT","TINYINT      NOT NULL DEFAULT 0");
CALL _i9_add_col('company_profile','created_at',"DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('company_profile','created_at',"DATETIME","DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_add_col('company_profile','updated_at',"DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('company_profile','updated_at',"DATETIME","DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

-- feedback
CALL _i9_add_col('feedback','user_id',"BIGINT       NOT NULL COMMENT '提交用户'");
CALL _i9_sync_col('feedback','user_id',"BIGINT","BIGINT       NOT NULL COMMENT '提交用户'");
CALL _i9_add_col('feedback','username',"VARCHAR(50)  DEFAULT NULL COMMENT '提交人(快照)'");
CALL _i9_sync_col('feedback','username',"VARCHAR(50)","VARCHAR(50)  DEFAULT NULL COMMENT '提交人(快照)'");
CALL _i9_add_col('feedback','content',"TEXT         NOT NULL COMMENT '问题描述'");
CALL _i9_sync_col('feedback','content',"TEXT","TEXT         NOT NULL COMMENT '问题描述'");
CALL _i9_add_col('feedback','images',"TEXT         DEFAULT NULL COMMENT '图片URL(JSON数组)'");
CALL _i9_sync_col('feedback','images',"TEXT","TEXT         DEFAULT NULL COMMENT '图片URL(JSON数组)'");
CALL _i9_add_col('feedback','page_url',"VARCHAR(255) DEFAULT NULL COMMENT '提交页面'");
CALL _i9_sync_col('feedback','page_url',"VARCHAR(255)","VARCHAR(255) DEFAULT NULL COMMENT '提交页面'");
CALL _i9_add_col('feedback','status',"ENUM('PENDING','HANDLED') NOT NULL DEFAULT 'PENDING'");
CALL _i9_sync_col('feedback','status',"ENUM('PENDING','HANDLED')","ENUM('PENDING','HANDLED') NOT NULL DEFAULT 'PENDING'");
CALL _i9_add_col('feedback','reply',"VARCHAR(500) DEFAULT NULL COMMENT '处理回复'");
CALL _i9_sync_col('feedback','reply',"VARCHAR(500)","VARCHAR(500) DEFAULT NULL COMMENT '处理回复'");
CALL _i9_add_col('feedback','deleted',"TINYINT      NOT NULL DEFAULT 0");
CALL _i9_sync_col('feedback','deleted',"TINYINT","TINYINT      NOT NULL DEFAULT 0");
CALL _i9_add_col('feedback','created_at',"DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('feedback','created_at',"DATETIME","DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP");

-- error_log
CALL _i9_add_col('error_log','fingerprint',"VARCHAR(40)   NOT NULL COMMENT '去重指纹'");
CALL _i9_sync_col('error_log','fingerprint',"VARCHAR(40)","VARCHAR(40)   NOT NULL COMMENT '去重指纹'");
CALL _i9_add_col('error_log','method',"VARCHAR(10)   NOT NULL");
CALL _i9_sync_col('error_log','method',"VARCHAR(10)","VARCHAR(10)   NOT NULL");
CALL _i9_add_col('error_log','path',"VARCHAR(255)  NOT NULL");
CALL _i9_sync_col('error_log','path',"VARCHAR(255)","VARCHAR(255)  NOT NULL");
CALL _i9_add_col('error_log','status_code',"INT           NOT NULL DEFAULT 500");
CALL _i9_sync_col('error_log','status_code',"INT","INT           NOT NULL DEFAULT 500");
CALL _i9_add_col('error_log','code',"INT           NOT NULL DEFAULT 5000 COMMENT '业务返回码'");
CALL _i9_sync_col('error_log','code',"INT","INT           NOT NULL DEFAULT 5000 COMMENT '业务返回码'");
CALL _i9_add_col('error_log','error_type',"VARCHAR(100)  DEFAULT NULL COMMENT '异常类型'");
CALL _i9_sync_col('error_log','error_type',"VARCHAR(100)","VARCHAR(100)  DEFAULT NULL COMMENT '异常类型'");
CALL _i9_add_col('error_log','message',"VARCHAR(1000) DEFAULT NULL");
CALL _i9_sync_col('error_log','message',"VARCHAR(1000)","VARCHAR(1000) DEFAULT NULL");
CALL _i9_add_col('error_log','stack',"TEXT          DEFAULT NULL COMMENT '堆栈(仅未捕获/500)'");
CALL _i9_sync_col('error_log','stack',"TEXT","TEXT          DEFAULT NULL COMMENT '堆栈(仅未捕获/500)'");
CALL _i9_add_col('error_log','req_input',"TEXT          DEFAULT NULL COMMENT '输入上下文(query/params/body脱敏)'");
CALL _i9_sync_col('error_log','req_input',"TEXT","TEXT          DEFAULT NULL COMMENT '输入上下文(query/params/body脱敏)'");
CALL _i9_add_col('error_log','resp_output',"TEXT          DEFAULT NULL COMMENT '输出(code/msg)'");
CALL _i9_sync_col('error_log','resp_output',"TEXT","TEXT          DEFAULT NULL COMMENT '输出(code/msg)'");
CALL _i9_add_col('error_log','user_id',"BIGINT        DEFAULT NULL");
CALL _i9_sync_col('error_log','user_id',"BIGINT","BIGINT        DEFAULT NULL");
CALL _i9_add_col('error_log','username',"VARCHAR(50)   DEFAULT NULL");
CALL _i9_sync_col('error_log','username',"VARCHAR(50)","VARCHAR(50)   DEFAULT NULL");
CALL _i9_add_col('error_log','ip',"VARCHAR(45)   DEFAULT NULL");
CALL _i9_sync_col('error_log','ip',"VARCHAR(45)","VARCHAR(45)   DEFAULT NULL");
CALL _i9_add_col('error_log','count',"INT           NOT NULL DEFAULT 1 COMMENT '同类累计次数'");
CALL _i9_sync_col('error_log','count',"INT","INT           NOT NULL DEFAULT 1 COMMENT '同类累计次数'");
CALL _i9_add_col('error_log','status',"ENUM('OPEN','HANDLED') NOT NULL DEFAULT 'OPEN'");
CALL _i9_sync_col('error_log','status',"ENUM('OPEN','HANDLED')","ENUM('OPEN','HANDLED') NOT NULL DEFAULT 'OPEN'");
CALL _i9_add_col('error_log','first_seen',"DATETIME      NOT NULL");
CALL _i9_sync_col('error_log','first_seen',"DATETIME","DATETIME      NOT NULL");
CALL _i9_add_col('error_log','last_seen',"DATETIME      NOT NULL");
CALL _i9_sync_col('error_log','last_seen',"DATETIME","DATETIME      NOT NULL");
CALL _i9_add_col('error_log','created_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_sync_col('error_log','created_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP");
CALL _i9_add_col('error_log','updated_at',"DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
CALL _i9_sync_col('error_log','updated_at',"DATETIME","DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

-- ▲▲ AUTO-GENERATED COLUMN SYNC ▲▲

-- ═══════════════ 新增表（CREATE TABLE IF NOT EXISTS 原生幂等）═══════════════

-- 合同发货批次（逐批锁价）
CREATE TABLE IF NOT EXISTS `contract_shipment` (
  `id`                  BIGINT        NOT NULL AUTO_INCREMENT,
  `contract_id`         BIGINT        NOT NULL,
  `ship_no`             VARCHAR(30)   DEFAULT NULL COMMENT '发货单号 FH-款号-序号',
  `qty`                 DECIMAL(15,4) NOT NULL COMMENT '本批发货数量',
  `snapshot_unit_price` DECIMAL(15,4) DEFAULT NULL COMMENT '逐批锁定单价(发货当时合同单价快照)',
  `amount`              DECIMAL(15,4) DEFAULT NULL COMMENT '本批金额',
  `ship_date`           DATE          DEFAULT NULL,
  `operator`            VARCHAR(50)   DEFAULT NULL COMMENT '发货供应商账号',
  `created_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_contract` (`contract_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合同发货批次（逐批锁价）';

-- 无合同空白对账单·费用明细
CREATE TABLE IF NOT EXISTS `reconciliation_expense_item` (
  `id`           BIGINT        NOT NULL AUTO_INCREMENT,
  `reconcile_id` BIGINT        NOT NULL,
  `expense_name` VARCHAR(200)  NOT NULL COMMENT '费用项目/事由',
  `amount`       DECIMAL(15,4) NOT NULL,
  `style_no`     VARCHAR(60)   DEFAULT NULL COMMENT '相关款号(可空)',
  `attach_url`   VARCHAR(500)  DEFAULT NULL COMMENT '附件(收据/无票说明)',
  PRIMARY KEY (`id`),
  KEY `idx_reconcile` (`reconcile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='无合同空白对账单·费用明细';

-- 工时对账明细（多款合并·样衣工时快照）
CREATE TABLE IF NOT EXISTS `reconciliation_labor_item` (
  `id`               BIGINT        NOT NULL AUTO_INCREMENT,
  `reconcile_id`     BIGINT        NOT NULL,
  `sample_id`        BIGINT        NOT NULL COMMENT '关联样衣',
  `sample_no`        VARCHAR(30)   DEFAULT NULL,
  `style_no`         VARCHAR(100)  DEFAULT NULL COMMENT '客户款号',
  `piece_count`      INT           DEFAULT NULL COMMENT '件数(快照)',
  `labor_unit_price` DECIMAL(12,2) DEFAULT NULL COMMENT '工时单价(快照)',
  `labor_amount`     DECIMAL(14,2) DEFAULT NULL COMMENT '工时金额(快照)',
  PRIMARY KEY (`id`),
  KEY `idx_reconcile` (`reconcile_id`),
  KEY `idx_sample` (`sample_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工时对账明细（多款合并·样衣工时快照）';

-- 本司主体（PDF抬头/合同甲方/开票抬头取数）
CREATE TABLE IF NOT EXISTS `company_profile` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(100) NOT NULL COMMENT '公司全称(PDF抬头/合同甲方/开票抬头)',
  `short_name`   VARCHAR(50)  DEFAULT NULL,
  `address`      VARCHAR(200) DEFAULT NULL,
  `phone`        VARCHAR(30)  DEFAULT NULL,
  `tax_no`       VARCHAR(30)  DEFAULT NULL COMMENT '税号',
  `bank_name`    VARCHAR(100) DEFAULT NULL,
  `bank_account` VARCHAR(40)  DEFAULT NULL,
  `legal_rep`    VARCHAR(50)  DEFAULT NULL COMMENT '法定代表人',
  `logo_url`     VARCHAR(500) DEFAULT NULL,
  `is_default`   TINYINT      NOT NULL DEFAULT 0 COMMENT '1=默认主体',
  `remark`       VARCHAR(200) DEFAULT NULL,
  `deleted`      TINYINT      NOT NULL DEFAULT 0,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_default` (`is_default`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='本司主体';

-- ═══════════════ 新增列 ═══════════════

-- 工厂：附加身份（工厂双身份）
CALL _i9_add_col('factory','extra_types',"VARCHAR(100) DEFAULT NULL COMMENT '附加身份(逗号分隔,工厂双身份)'");

-- 金额阈值审批（报价 / 订单 / 合同 三处同构）
CALL _i9_add_col('quotation','approval_status',"ENUM('NONE','PENDING','APPROVED') NOT NULL DEFAULT 'NONE' COMMENT '金额阈值审批'");
CALL _i9_add_col('quotation','approved_by',"BIGINT DEFAULT NULL");
CALL _i9_add_col('quotation','approved_at',"DATETIME DEFAULT NULL");
CALL _i9_add_col('order_main','approval_status',"ENUM('NONE','PENDING','APPROVED') NOT NULL DEFAULT 'NONE' COMMENT '金额阈值审批'");
CALL _i9_add_col('order_main','approved_by',"BIGINT DEFAULT NULL");
CALL _i9_add_col('order_main','approved_at',"DATETIME DEFAULT NULL");
CALL _i9_add_col('contract','approval_status',"ENUM('NONE','PENDING','APPROVED') NOT NULL DEFAULT 'NONE' COMMENT '金额阈值审批'");
CALL _i9_add_col('contract','approved_by',"BIGINT DEFAULT NULL");
CALL _i9_add_col('contract','approved_at',"DATETIME DEFAULT NULL");

-- 合同：撤销推送后修改重推标记
CALL _i9_add_col('contract','revised',"TINYINT NOT NULL DEFAULT 0 COMMENT '撤销推送后修改重推标记(盖章后清零)'");

-- 合同：两类编辑页扩展字段（设计稿 04-合同 v1.3）
CALL _i9_add_col('contract','sign_place',"VARCHAR(100) DEFAULT NULL COMMENT '签约地点(默认本司地址)'");
CALL _i9_add_col('contract','sign_date',"DATE DEFAULT NULL COMMENT '签约日期(默认今天)'");
CALL _i9_add_col('contract','company_id',"BIGINT DEFAULT NULL COMMENT '乙方/委托方=本司主体(company_profile)'");
CALL _i9_add_col('contract','company_rep',"VARCHAR(50) DEFAULT NULL COMMENT '乙方/委托方代表(默认登录业务员)'");
CALL _i9_add_col('contract','guarantor',"VARCHAR(50) DEFAULT NULL COMMENT '担保人(丙方,选填)'");
CALL _i9_add_col('contract','guarantor_id_photo',"VARCHAR(500) DEFAULT NULL COMMENT '担保人身份证照片URL(选填)'");
CALL _i9_add_col('contract','delivery_deadline',"DATE DEFAULT NULL COMMENT '交货期限(加工=订单交期-10天/材料=-45天)'");
CALL _i9_add_col('contract','style_nos',"VARCHAR(500) DEFAULT NULL COMMENT '关联款号(多选逗号分隔)'");
CALL _i9_add_col('contract','price_includes',"JSON DEFAULT NULL COMMENT '价格包含项勾选(加工合同,汇入PDF)'");
CALL _i9_add_col('contract','vat_rate',"DECIMAL(5,2) DEFAULT NULL COMMENT '增值税%(加工默认13,含税不另计)'");
CALL _i9_add_col('contract','price_other',"VARCHAR(200) DEFAULT NULL COMMENT '价格包含项·其他说明'");
CALL _i9_add_col('contract','terms_json',"JSON DEFAULT NULL COMMENT '合同条款模板填空(key→条款文本)'");

-- 合同材料明细：编辑页扩展列（分色/分码/款号/行交期/照片）
CALL _i9_add_col('contract_material','color',"VARCHAR(50) DEFAULT NULL COMMENT '颜色(分色行)'");
CALL _i9_add_col('contract_material','size',"VARCHAR(30) DEFAULT NULL COMMENT '尺码/码(分码行)'");
CALL _i9_add_col('contract_material','style_no',"VARCHAR(50) DEFAULT NULL COMMENT '款号(多款号同表随行标注)'");
CALL _i9_add_col('contract_material','delivery_date',"DATE DEFAULT NULL COMMENT '行交货期限(材料默认=款交期-45天)'");
CALL _i9_add_col('contract_material','photo_url',"VARCHAR(500) DEFAULT NULL COMMENT '材料照片URL'");

-- 对账单：工时对账 / 整单退回相关
CALL _i9_add_col('reconciliation','sub_type',"VARCHAR(20) DEFAULT NULL COMMENT '无合同子类型:EXPENSE/CASH_NO_INVOICE/PREPAY'");
CALL _i9_add_col('reconciliation','patternmaker_id',"BIGINT DEFAULT NULL COMMENT '工时对账受款方版师'");
CALL _i9_add_col('reconciliation','patternmaker_name',"VARCHAR(50) DEFAULT NULL");
CALL _i9_add_col('reconciliation','currency',"VARCHAR(10) NOT NULL DEFAULT 'CNY' COMMENT '工时单价币种'");
CALL _i9_add_col('reconciliation','period',"VARCHAR(20) DEFAULT NULL COMMENT '归属账期(按月合并如2026-07)'");
CALL _i9_add_col('reconciliation','review_remark',"VARCHAR(500) DEFAULT NULL COMMENT '主管复核批注/整单退回原因'");

-- 对账明细批次：一单多合同 / 逐批批注
CALL _i9_add_col('reconciliation_shipment','contract_id',"BIGINT DEFAULT NULL COMMENT '一单多合同:本批次来源合同'");
CALL _i9_add_col('reconciliation_shipment','style_no',"VARCHAR(60) DEFAULT NULL COMMENT '一单多合同:本批次款号'");
CALL _i9_add_col('reconciliation_shipment','remark',"VARCHAR(200) DEFAULT NULL COMMENT '逐批批注'");

-- 结算：退税测算 / 客户维度
CALL _i9_add_col('settlement','refund_status',"VARCHAR(20) NOT NULL DEFAULT 'ESTIMATED' COMMENT '退税状态:ESTIMATED预估/RECEIVED到账'");
CALL _i9_add_col('settlement','customer_name',"VARCHAR(100) DEFAULT NULL COMMENT '中间商客户(利润按客户维度汇总)'");

-- 结算成本明细：各行税率
CALL _i9_add_col('settlement_cost','tax_rate',"DECIMAL(5,2) NOT NULL DEFAULT 13 COMMENT '该行税率%(有票按此换不含税)'");

-- ═══════════════ 修改既有列（枚举扩值 / 放宽约束 / 加宽长度）═══════════════

-- 对账类型新增 LABOR（工时对账）
CALL _i9_modify_col('reconciliation','type',"ENUM('CONTRACT','NO_CONTRACT','LABOR') NOT NULL DEFAULT 'CONTRACT'");
-- 款号加宽到 200（工时对账「款A 等N款」）
CALL _i9_modify_col('reconciliation','style_no',"VARCHAR(200) DEFAULT NULL COMMENT '款号(合同→订单带出,供检索;工时对账为「款A 等N款」)'");
-- 工厂放宽为可空（工时对账受款方为版师，无工厂）
CALL _i9_modify_col('reconciliation','factory_id',"BIGINT DEFAULT NULL COMMENT '供应商对账=加工厂/供应商;工时对账为空'");
-- 合同号加宽到 40：补料合同号「补料-母合同号-序号」超过 VARCHAR(20) 会插入失败(500)
CALL _i9_modify_col('contract','contract_no',"VARCHAR(40) NOT NULL COMMENT 'HT-日期-序号；补料为 补料-母合同号-序号'");

-- ═══════════════ 索引 ═══════════════
CALL _i9_add_index('reconciliation','idx_patternmaker','`patternmaker_id`');

-- 发票号唯一(防重复报销/重复付款);无发票为 NULL,可多张并存
CALL _i9_add_unique('reconciliation','uk_invoice_no','`invoice_no`');

-- ═══════════════ 配置 / 种子（INSERT IGNORE 幂等）═══════════════
INSERT IGNORE INTO `sys_config` (`cfg_key`,`cfg_value`,`remark`) VALUES
('approval.quote.threshold',    '0', '报价审批阈值(人民币合计,0=不启用)'),
('approval.order.threshold',    '0', '订单审批阈值(订单金额,0=不启用)'),
('approval.contract.threshold', '0', '合同审批阈值(合同金额,0=不启用)');

INSERT IGNORE INTO `company_profile` (`id`,`name`,`short_name`,`is_default`) VALUES
(1, 'I9 服装制造有限公司', 'I9', 1);

-- ── 用户反馈 / 系统报错记录(CREATE TABLE IF NOT EXISTS 原生幂等)──
CREATE TABLE IF NOT EXISTS `feedback` (
  `id`         BIGINT       NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT       NOT NULL COMMENT '提交用户',
  `username`   VARCHAR(50)  DEFAULT NULL COMMENT '提交人(快照)',
  `content`    TEXT         NOT NULL COMMENT '问题描述',
  `images`     TEXT         DEFAULT NULL COMMENT '图片URL(JSON数组)',
  `page_url`   VARCHAR(255) DEFAULT NULL COMMENT '提交页面',
  `status`     ENUM('PENDING','HANDLED') NOT NULL DEFAULT 'PENDING',
  `reply`      VARCHAR(500) DEFAULT NULL COMMENT '处理回复',
  `deleted`    TINYINT      NOT NULL DEFAULT 0,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`,`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户反馈';

CREATE TABLE IF NOT EXISTS `error_log` (
  `id`          BIGINT        NOT NULL AUTO_INCREMENT,
  `fingerprint` VARCHAR(40)   NOT NULL COMMENT '去重指纹',
  `method`      VARCHAR(10)   NOT NULL,
  `path`        VARCHAR(255)  NOT NULL,
  `status_code` INT           NOT NULL DEFAULT 500,
  `code`        INT           NOT NULL DEFAULT 5000 COMMENT '业务返回码',
  `error_type`  VARCHAR(100)  DEFAULT NULL COMMENT '异常类型',
  `message`     VARCHAR(1000) DEFAULT NULL,
  `stack`       TEXT          DEFAULT NULL COMMENT '堆栈(仅未捕获/500)',
  `req_input`   TEXT          DEFAULT NULL COMMENT '输入上下文(query/params/body脱敏)',
  `resp_output` TEXT          DEFAULT NULL COMMENT '输出(code/msg)',
  `user_id`     BIGINT        DEFAULT NULL,
  `username`    VARCHAR(50)   DEFAULT NULL,
  `ip`          VARCHAR(45)   DEFAULT NULL,
  `count`       INT           NOT NULL DEFAULT 1 COMMENT '同类累计次数',
  `status`      ENUM('OPEN','HANDLED') NOT NULL DEFAULT 'OPEN',
  `first_seen`  DATETIME      NOT NULL,
  `last_seen`   DATETIME      NOT NULL,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fingerprint` (`fingerprint`),
  KEY `idx_status` (`status`,`last_seen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统报错记录';

-- ── 字典种子(存量库幂等:仅当该类别为空时插入,避免覆盖用户自建) ──
INSERT INTO sys_dict (type,label,value,sort)
SELECT * FROM (SELECT 'currency' t,'USD' l,'7.10' v,1 s UNION SELECT 'currency','EUR','7.80',2 UNION SELECT 'currency','GBP','9.00',3 UNION SELECT 'currency','JPY','0.048',4 UNION SELECT 'currency','CNY','1',5) x
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE type='currency');
INSERT INTO sys_dict (type,label,sort)
SELECT * FROM (SELECT 'trade_country' t,'美国' l,1 s UNION SELECT 'trade_country','英国',2 UNION SELECT 'trade_country','德国',3 UNION SELECT 'trade_country','日本',4 UNION SELECT 'trade_country','法国',5) x
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE type='trade_country');
INSERT INTO sys_dict (type,label,sort)
SELECT * FROM (SELECT 'price_terms' t,'FOB 上海' l,1 s UNION SELECT 'price_terms','FOB 宁波',2 UNION SELECT 'price_terms','CIF',3 UNION SELECT 'price_terms','CFR',4) x
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE type='price_terms');
INSERT INTO sys_dict (type,label,sort)
SELECT * FROM (SELECT 'settlement_method' t,'T/T 30天' l,1 s UNION SELECT 'settlement_method','T/T 45天',2 UNION SELECT 'settlement_method','T/T 60天',3 UNION SELECT 'settlement_method','L/C at sight',4) x
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE type='settlement_method');
INSERT INTO sys_dict (type,label,sort)
SELECT * FROM (SELECT 'customer_source' t,'展会' l,1 s UNION SELECT 'customer_source','老客户介绍',2 UNION SELECT 'customer_source','网络开发',3 UNION SELECT 'customer_source','主动来询',4) x
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE type='customer_source');
INSERT INTO sys_dict (type,label,sort)
SELECT * FROM (SELECT 'cooperation_level' t,'战略客户' l,1 s UNION SELECT 'cooperation_level','重点客户',2 UNION SELECT 'cooperation_level','普通客户',3 UNION SELECT 'cooperation_level','新客户',4) x
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE type='cooperation_level');
INSERT INTO sys_dict (type,label,sort)
SELECT * FROM (SELECT 'department' t,'外贸部' l,1 s UNION SELECT 'department','采购部',2 UNION SELECT 'department','财务部',3 UNION SELECT 'department','生产部',4) x
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE type='department');
INSERT INTO sys_dict (type,label,sort)
SELECT * FROM (SELECT 'title' t,'经理' l,1 s UNION SELECT 'title','主管',2 UNION SELECT 'title','跟单员',3 UNION SELECT 'title','业务员',4) x
WHERE NOT EXISTS (SELECT 1 FROM sys_dict WHERE type='title');

-- ── 清理助手 ─────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _i9_add_col;
DROP PROCEDURE IF EXISTS _i9_modify_col;
DROP PROCEDURE IF EXISTS _i9_add_index;
DROP PROCEDURE IF EXISTS _i9_add_unique;
DROP PROCEDURE IF EXISTS _i9_sync_col;
DROP PROCEDURE IF EXISTS _i9_run_if_col;

SELECT '✓ hotfix-schema 应用完成' AS status;
