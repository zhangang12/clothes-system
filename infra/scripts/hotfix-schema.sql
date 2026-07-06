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

DELIMITER ;

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

-- ═══════════════ 配置 / 种子（INSERT IGNORE 幂等）═══════════════
INSERT IGNORE INTO `sys_config` (`cfg_key`,`cfg_value`,`remark`) VALUES
('approval.quote.threshold',    '0', '报价审批阈值(人民币合计,0=不启用)'),
('approval.order.threshold',    '0', '订单审批阈值(订单金额,0=不启用)'),
('approval.contract.threshold', '0', '合同审批阈值(合同金额,0=不启用)');

INSERT IGNORE INTO `company_profile` (`id`,`name`,`short_name`,`is_default`) VALUES
(1, 'I9 服装制造有限公司', 'I9', 1);

-- ── 清理助手 ─────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _i9_add_col;
DROP PROCEDURE IF EXISTS _i9_modify_col;
DROP PROCEDURE IF EXISTS _i9_add_index;

SELECT '✓ hotfix-schema 应用完成' AS status;
