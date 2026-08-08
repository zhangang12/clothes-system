<template>
  <div class="page-container">
    <!-- 步骤条：让人始终知道走到哪一步、每步做了什么 -->
    <el-card v-if="scans.length" class="flow-card" body-style="padding:14px 20px">
      <div class="flow">
        <div v-for="(s, i) in flow" :key="s.key" class="flow-step" :class="s.state">
          <span class="dot">{{ s.state === 'bad' ? '!' : i + 1 }}</span>
          <div class="flow-txt">
            <b>{{ s.title }}</b>
            <span>{{ s.detail }}</span>
          </div>
          <el-icon v-if="i < flow.length - 1" class="arrow"><ArrowRight /></el-icon>
        </div>
      </div>
    </el-card>

    <!-- ① 上传源文件 -->
    <el-card>
      <template #header>
        <div class="card-header">
          <span>① 上传 PO 源文件</span>
          <el-button link type="primary" @click="$router.push('/ai-tools')">← 回 AI 工具集</el-button>
        </div>
      </template>
      <el-upload drag :auto-upload="false" :show-file-list="false" accept=".xlsx" :on-change="onPick">
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">把工厂的<b>采购合同 PO</b>拖到这里，或 <em>点击选择</em></div>
        <template #tip>
          <div class="el-upload__tip">
            只认 .xlsx。文件只在浏览器里解析，不上传服务器、不落库。一次出齐<b>箱单 / 发票 / 装柜计划</b>三份。
          </div>
        </template>
      </el-upload>
      <el-alert v-if="parseErr" type="error" :closable="false" show-icon style="margin-top:12px" :title="parseErr" />
    </el-card>

    <!-- ② 选工作表 -->
    <el-card v-if="scans.length">
      <template #header>
        <div class="card-header">
          <span>② 选本次出运的定单（工作表）</span>
          <span class="hint">默认只勾「表名 = 表内唯一定单号」的表；像 Sheet1 那种把所有 PO 平铺一遍的汇总表勾上会重复计数</span>
        </div>
      </template>
      <el-table ref="sheetTable" :data="scans" border stripe size="small" @selection-change="onSheetSel">
        <el-table-column type="selection" width="46" />
        <el-table-column prop="name" label="工作表" min-width="150" />
        <el-table-column label="定单号" min-width="200">
          <template #default="{ row }">{{ row.poNos.join('、') || '（无定单号列）' }}</template>
        </el-table-column>
        <el-table-column label="表头行" width="86" align="center">
          <template #default="{ row }">第 {{ row.headerRow + 1 }} 行</template>
        </el-table-column>
        <el-table-column label="读到明细" width="94" align="right">
          <template #default="{ row }">{{ row.lines.length }} 行</template>
        </el-table-column>
        <el-table-column label="跳过" width="90" align="right">
          <template #default="{ row }">
            <el-button v-if="skipTotal(row)" link type="warning" @click="openSheet(row)">{{ skipTotal(row) }} 行</el-button>
            <span v-else class="mute">0</span>
          </template>
        </el-table-column>
        <el-table-column label="件数" width="96" align="right">
          <template #default="{ row }">{{ row.totalQty.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="结构" width="96">
          <template #default="{ row }">
            <el-tag v-if="row.isPerPo" type="success" size="small">一表一单</el-tag>
            <el-tag v-else type="warning" size="small">汇总表</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="列识别" width="120" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="openSheet(row)">
              {{ mappedCount(row) }}/{{ COL_ORDER.length }} 列 · 核对
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-alert type="warning" :closable="false" show-icon style="margin-top:12px"
        title="列是靠表头关键词认出来的——认歪了整列数据都会错，而且不报错。点每行的「核对」看认到了哪一列、示例值对不对，不对可以手改。" />
    </el-card>

    <!-- ③ 源数据体检 -->
    <el-card v-if="rawLines.length">
      <template #header>
        <div class="card-header">
          <span>③ 源数据体检</span>
          <span class="hint">{{ issues.length ? `发现 ${issues.length} 类问题` : '没发现问题' }}</span>
        </div>
      </template>

      <!-- 跨定单补 HS：真实 PO 里多数定单表压根没有 HS 列，不补的话装柜计划整片空白 -->
      <div class="fixup">
        <div class="fixup-head">
          <el-switch v-model="autoFillHs" />
          <b>按同款号跨定单补 HS CODE</b>
          <span class="hint">同一款号在别的定单表里有 HS 就拿过来用</span>
        </div>
        <div v-if="autoFillHs" class="fixup-body">
          <span v-if="hsFill.filled" class="ok">已补 {{ hsFill.filled }} 行</span>
          <span v-else class="mute">没有需要补的行</span>
          <span v-if="hsFill.filled" class="mute">（涉及 {{ hsFill.filledStyles.length }} 个款号）</span>
          <template v-if="hsFill.unresolved.length">
            <span class="sep">|</span>
            <span class="danger">{{ hsFill.unresolved.length }} 个款号补不上：{{ hsFill.unresolved.join('、') }}</span>
          </template>
        </div>
        <el-alert v-if="hsFill.conflicts.length" type="error" :closable="false" show-icon style="margin-top:10px"
          title="有款号在不同定单里写了不同的 HS 章号——这种一律不自动补，请人工确认后回源文件改"
          :description="hsFill.conflicts.map((c) => `${c.style}：${c.codes.join(' / ')}`).join('； ')" />
      </div>

      <el-result v-if="!issues.length" icon="success" sub-title="解析出来的明细在必填项上都没缺" style="padding:12px 0" />
      <el-table v-else :data="issues" border size="small">
        <el-table-column label="" width="60" align="center">
          <template #default="{ row }">
            <el-tag :type="row.level === 'error' ? 'danger' : 'warning'" size="small" effect="dark">
              {{ row.level === 'error' ? '重' : '轻' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="label" label="问题" min-width="230" />
        <el-table-column prop="count" label="行数" width="80" align="right" />
        <el-table-column prop="affects" label="会影响什么" min-width="230" />
        <el-table-column label="举例（源文件行号）" min-width="260">
          <template #default="{ row }">
            <div v-for="s in row.samples" :key="s" class="sample">{{ s }}</div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- ④ 装箱参数 -->
    <el-card v-if="poLines.length">
      <template #header><div class="card-header"><span>④ 装箱参数</span><span class="hint">箱单与装柜计划都吃这组参数</span></div></template>
      <el-form inline label-width="96px">
        <el-form-item label="每箱件数">
          <el-input-number v-model="pack.perCarton" :min="1" :max="500" :controls="false" style="width:90px" />
        </el-form-item>
        <el-form-item label="箱规 L×W×H">
          <el-input-number v-model="pack.cartonL" :min="1" :precision="1" :controls="false" style="width:74px" />
          <span class="x">×</span>
          <el-input-number v-model="pack.cartonW" :min="1" :precision="1" :controls="false" style="width:74px" />
          <span class="x">×</span>
          <el-input-number v-model="pack.cartonH" :min="1" :precision="1" :controls="false" style="width:74px" />
          <span class="unit">cm ＝ {{ cbmPerCarton }} m³/箱</span>
        </el-form-item>
        <el-form-item label="尾数处理">
          <el-radio-group v-model="pack.mergeRemainder">
            <el-radio-button :value="false">各自成箱</el-radio-button>
            <el-radio-button :value="true">同款拼箱</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="计重口径">
          <el-radio-group v-model="pack.netBasis">
            <el-radio-button value="piece">按件</el-radio-button>
            <el-radio-button value="carton">按箱固定</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="pack.netBasis === 'carton' ? '每箱净重' : '单件净重'">
          <el-input-number v-if="pack.netBasis === 'carton'" v-model="pack.netPerCartonFixed"
            :min="0" :precision="3" :step="0.5" :controls="false" style="width:90px" />
          <el-input-number v-else v-model="pack.netPerPiece"
            :min="0" :precision="3" :step="0.1" :controls="false" style="width:90px" />
          <span class="unit">kg</span>
        </el-form-item>
        <el-form-item label="每箱皮重">
          <el-input-number v-model="pack.tarePerCarton" :min="0" :precision="3" :step="0.1" :controls="false" style="width:90px" />
          <span class="unit">kg（毛重 = 净重 + 皮重）</span>
        </el-form-item>
      </el-form>

      <!-- 拿源文件里的真实一行当场演算，参数一改数就跟着变 -->
      <div v-if="demo" class="demo">
        <div class="demo-t">拿源文件里的一行当场算给你看</div>
        <div class="demo-b">
          <code>{{ demo.style }} / {{ demo.color }} / {{ demo.size }}</code>
          <span class="demo-arrow">→</span>
          <span>{{ demo.text }}</span>
        </div>
        <div class="demo-b">
          <span class="mute">重量：</span>
          <span>整箱 {{ demo.fullNet }} kg 净 ＋ 皮 {{ pack.tarePerCarton }} ＝ {{ demo.fullGross }} kg 毛</span>
          <template v-if="demo.tailNet !== null">
            <span class="demo-sep">|</span>
            <span>尾箱 {{ demo.tailNet }} kg 净 → {{ demo.tailGross }} kg 毛</span>
          </template>
        </div>
      </div>

      <!-- 款号装箱预设：全局参数对不上真实箱单，逐款设才行 -->
      <el-collapse v-model="specOpen" style="margin-top:12px">
        <el-collapse-item name="spec">
          <template #title>
            <span class="spec-title">
              按款号设装箱规格
              <el-tag v-if="specCount" type="success" size="small" effect="plain">{{ specCount }} / {{ styleRows.length }} 款已设</el-tag>
              <span v-else class="hint">　没设的款一律走上面的全局参数</span>
            </span>
          </template>

          <div class="spec-bar">
            <el-alert type="info" :closable="false" show-icon
              title="羽绒服和裤子不可能同一个箱规——客户真实箱单里每箱 1~34 件不等、每箱净重在 6.8~12kg 之间按款跳。这张表存在浏览器本地，下次打开还在；可导出一份给同事，或导入别人维护好的。" />
            <div class="spec-btns">
              <el-button size="small" :icon="Download" :disabled="!specCount" @click="exportSpecs">导出预设</el-button>
              <el-button size="small" :icon="Upload" @click="specFile?.click()">导入预设</el-button>
              <el-button size="small" type="danger" plain :disabled="!specCount" @click="clearSpecs">清空</el-button>
              <input ref="specFile" type="file" accept=".json" style="display:none" @change="importSpecs" />
            </div>
          </div>

          <el-table :data="styleRows" border stripe size="small" max-height="380" :row-class-name="specRowCls">
            <el-table-column prop="style" label="款号" min-width="140" fixed />
            <el-table-column prop="styleName" label="款名" min-width="160" />
            <el-table-column prop="color" label="颜色" width="110" />
            <el-table-column prop="qty" label="件数" width="80" align="right" />
            <el-table-column label="每箱件数" width="110">
              <template #default="{ row }">
                <el-input-number v-model="specDraft[row.style].perCarton" :min="1" :max="500" :step="1"
                  :controls="false" :placeholder="String(pack.perCarton)" size="small" style="width:88px" />
              </template>
            </el-table-column>
            <el-table-column label="箱规 L×W×H cm" width="230">
              <template #default="{ row }">
                <el-input-number v-model="specDraft[row.style].cartonL" :min="1" :precision="1" :controls="false"
                  :placeholder="String(pack.cartonL)" size="small" style="width:66px" />
                <span class="x">×</span>
                <el-input-number v-model="specDraft[row.style].cartonW" :min="1" :precision="1" :controls="false"
                  :placeholder="String(pack.cartonW)" size="small" style="width:66px" />
                <span class="x">×</span>
                <el-input-number v-model="specDraft[row.style].cartonH" :min="1" :precision="1" :controls="false"
                  :placeholder="String(pack.cartonH)" size="small" style="width:66px" />
              </template>
            </el-table-column>
            <el-table-column :label="pack.netBasis === 'carton' ? '每箱净重 kg' : '单件净重 kg'" width="130">
              <template #default="{ row }">
                <el-input-number v-model="specDraft[row.style].net" :min="0" :precision="3" :step="0.1"
                  :controls="false" :placeholder="String(defaultNet)" size="small" style="width:100px" />
              </template>
            </el-table-column>
            <el-table-column label="按当前设置会装成" min-width="180">
              <template #default="{ row }">
                <span :class="{ mute: !hasSpec(row.style) }">{{ styleOutcome(row.style) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <!-- ⑤ 单据抬头 -->
    <el-card v-if="poLines.length">
      <template #header><div class="card-header"><span>⑤ 单据抬头</span><span class="hint">PO 上没有这些信息，按本次出运填</span></div></template>
      <el-tabs>
        <el-tab-pane label="通用">
          <el-form label-width="128px">
            <div class="head-grid">
              <el-form-item label="INVOICE NO"><el-input v-model="common.invoiceNo" /></el-form-item>
              <el-form-item label="单据日期"><el-date-picker v-model="common.docDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
              <el-form-item label="ETD / 最迟装运"><el-date-picker v-model="common.etd" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
              <el-form-item label="ETA"><el-date-picker v-model="common.eta" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
              <el-form-item label="DELIVERY PORT"><el-input v-model="common.deliveryPort" /></el-form-item>
              <el-form-item label="CONSIGNEE"><el-input v-model="common.consignee" /></el-form-item>
              <el-form-item label="国家/地区"><el-input v-model="common.consigneeCountry" /></el-form-item>
            </div>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="箱单">
          <el-form label-width="128px">
            <div class="head-grid">
              <el-form-item label="PACK LIST NO"><el-input v-model="plHead.packListNo" /></el-form-item>
              <el-form-item label="MADE IN"><el-input v-model="plHead.madeIn" /></el-form-item>
              <el-form-item label="SHIPPER"><el-input v-model="plHead.shipper" /></el-form-item>
              <el-form-item label="SHIPPER 税号"><el-input v-model="plHead.shipperTaxNo" /></el-form-item>
            </div>
            <el-form-item label="ISSUED TO"><el-input v-model="plHead.issuedTo" type="textarea" :rows="2" /></el-form-item>
            <el-form-item label="SHIPPER 地址"><el-input v-model="plHead.shipperAddress" /></el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="发票">
          <el-form label-width="140px">
            <div class="head-grid">
              <el-form-item label="INCOTERMS"><el-input v-model="invHead.incoterms" /></el-form-item>
              <el-form-item label="DELIVERY DATE"><el-input v-model="invHead.deliveryDate" placeholder="24/06/2026" /></el-form-item>
              <el-form-item label="SHIPMENT FROM"><el-input v-model="invHead.shipmentFrom" /></el-form-item>
              <el-form-item label="受票方简称"><el-input v-model="invHead.issuedToShort" /></el-form-item>
            </div>
            <el-form-item label="ISSUED TO"><el-input v-model="invHead.issuedTo" /></el-form-item>
            <el-form-item label="受益人 / 地址">
              <el-input v-model="invHead.beneficiaryName" style="margin-bottom:6px" />
              <el-input v-model="invHead.beneficiaryAddress" />
            </el-form-item>
            <el-form-item label="开票资料">
              <el-input v-model="bankText" type="textarea" :rows="4" placeholder="一行一条：名称 / 税号 / 帐号 / 开户行" />
            </el-form-item>
            <el-form-item label="PAYMENT TERMS"><el-input v-model="invHead.paymentTerms" type="textarea" :rows="2" /></el-form-item>
            <el-form-item label="正本单证交付"><el-input v-model="invHead.originalDocDelivery" /></el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="装柜计划">
          <el-form label-width="128px">
            <div class="head-grid">
              <el-form-item label="装柜日"><el-date-picker v-model="lpHead.cargoReadyDay" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
              <el-form-item label="PORT OF LOADING"><el-input v-model="lpHead.portOfLoading" /></el-form-item>
              <el-form-item label="出口方"><el-input v-model="lpHead.exporter" /></el-form-item>
              <el-form-item label="加工厂"><el-input v-model="lpHead.maker" placeholder="PO 上没有，可留空" /></el-form-item>
            </div>
          </el-form>

          <h4 class="sub">每个定单的收货国<span class="hint">　PO 上没有收货国，按单号里的目的地代号预填，逐单可改；空着会归到「未指定」一组</span></h4>
          <el-table :data="poRows" border stripe size="small" max-height="240">
            <el-table-column prop="poNo" label="定单号" min-width="180" />
            <el-table-column prop="qty" label="件数" width="100" align="right" />
            <el-table-column label="收货国 CONSIGNEE" min-width="200">
              <template #default="{ row }">
                <el-input v-model="consigneeByPo[row.poNo]" size="small" placeholder="如 SERBIA" />
              </template>
            </el-table-column>
          </el-table>

          <h4 class="sub">每个收货国的柜号与卸货港<span class="hint">　真实件里这两列就是按收货国整块合并的</span></h4>
          <el-table :data="consigneeRows" border stripe size="small">
            <el-table-column prop="name" label="收货国" width="160">
              <template #default="{ row }">{{ row.name || '（未指定）' }}</template>
            </el-table-column>
            <el-table-column label="柜号 CONTAINER" min-width="240">
              <template #default="{ row }">
                <el-input v-model="lpHead.containerByConsignee[row.name]" size="small" placeholder="如 5x40HQ 271568354" />
              </template>
            </el-table-column>
            <el-table-column label="卸货港 PORT OF DISCHARGE" min-width="240">
              <template #default="{ row }">
                <el-input v-model="lpHead.dischargePortByConsignee[row.name]" size="small" placeholder="如 RIJEKA PORT - BELGRADE" />
              </template>
            </el-table-column>
          </el-table>

          <h4 class="sub">报关归类<span class="hint">　按 PO 上的 HS 4 位章号推中文品名与 10 位商编（默认值取自本司真实装柜计划），可改</span></h4>
          <el-table :data="hsRows" border stripe size="small">
            <el-table-column prop="hs4" label="HS 4 位" width="110" />
            <el-table-column prop="count" label="涉及款号" width="110" align="right" />
            <el-table-column label="中文品名" min-width="180">
              <template #default="{ row }"><el-input v-model="hsMap[row.hs4].nameCn" size="small" /></template>
            </el-table-column>
            <el-table-column label="10 位商编" min-width="200">
              <template #default="{ row }"><el-input v-model="hsMap[row.hs4].hs10" size="small" /></template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- ⑥ 结果 -->
    <el-card v-if="cartonRows.length">
      <template #header>
        <div class="card-header">
          <span>⑥ 生成结果</span>
          <el-button type="primary" :icon="Download" :loading="exporting" @click="exportAll">一键导出三份</el-button>
        </div>
      </template>

      <div class="stats">
        <div class="stat"><span class="k">总件数</span><b>{{ totals.pieces.toLocaleString() }}</b></div>
        <div class="stat"><span class="k">总箱数</span><b>{{ totals.cartons.toLocaleString() }}</b></div>
        <div class="stat"><span class="k">总体积</span><b>{{ totals.cbm }} m³</b></div>
        <div class="stat"><span class="k">总净重</span><b>{{ totals.net }} kg</b></div>
        <div class="stat"><span class="k">总毛重</span><b>{{ totals.gross }} kg</b></div>
        <div class="stat" :class="{ bad: !sanity.ok }">
          <span class="k">平均单件净重</span><b>{{ sanity.perPiece }} kg</b>
        </div>
        <div class="stat"><span class="k">发票金额</span><b>{{ invAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</b></div>
        <div class="stat" :class="recon.badCount ? 'bad' : 'good'">
          <span class="k">三份逐款对账</span>
          <b>{{ recon.badCount ? `${recon.badCount} 个款号对不上` : '全部一致 ✓' }}</b>
        </div>
      </div>

      <el-alert v-if="!sanity.ok" type="error" :closable="false" show-icon style="margin-bottom:12px"
        :title="`平均每件 ${sanity.perPiece} kg——一件服装不该是这个重量，多半是「计重口径」跟净重数字对不上`"
        description="按件口径下净重那一栏填的是「单件净重」，按箱口径下填的是「每箱净重」，两者差着一整箱的件数。去「④ 装箱参数 → 计重口径」切一下，或检查款号预设里的净重。" />
      <el-alert v-if="unclassified.length" type="warning" :closable="false" show-icon style="margin-bottom:12px"
        :title="`有 ${unclassified.length} 个 HS 章号没有报关归类，装柜计划的中文品名/10 位商编会留空`"
        :description="unclassified.join('、')" />
      <el-alert v-if="noConsignee" type="warning" :closable="false" show-icon style="margin-bottom:12px"
        title="有定单还没填收货国，装柜计划里会归到「未指定」一组——在「⑤ 单据抬头 → 装柜计划」里补" />

      <el-tabs v-model="tab">
        <!-- 对账：放第一个，先看数对不对，再看单据内容 -->
        <el-tab-pane name="recon">
          <template #label>
            <span :class="{ danger: recon.badCount }">对账 {{ recon.badCount ? `⚠ ${recon.badCount}` : '✓' }}</span>
          </template>
          <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px"
            title="三个口径摆一起逐款核对：PO 件数（＝发票件数，发票不经装箱）／箱单件数（装箱后各行合计）／装柜计划件数（按款号汇总）。任一列对不上就标红——总数一致不代表每个款号都一致。" />
          <el-radio-group v-model="reconLevel" size="small" style="margin-bottom:10px">
            <el-radio-button value="po">按定单号（{{ recon.byPo.length }}）</el-radio-button>
            <el-radio-button value="style">按款号（{{ recon.byStyle.length }}）</el-radio-button>
          </el-radio-group>
          <el-checkbox v-model="onlyBad" style="margin-left:12px">只看对不上的</el-checkbox>
          <el-table :data="paged(reconList)" border stripe size="small" :row-class-name="reconCls" max-height="460">
            <el-table-column prop="poNo" label="定单号" min-width="150" />
            <el-table-column v-if="reconLevel === 'style'" prop="style" label="款号" min-width="140" />
            <el-table-column prop="poQty" label="PO / 发票件数" width="130" align="right" />
            <el-table-column prop="plQty" label="箱单件数" width="110" align="right" />
            <el-table-column prop="lpQty" label="装柜计划件数" width="130" align="right" />
            <el-table-column prop="cartons" label="箱数" width="90" align="right" />
            <el-table-column label="核对" width="120" align="center">
              <template #default="{ row }">
                <span v-if="row.ok" class="ok">一致 ✓</span>
                <span v-else class="danger">差 {{ row.plQty - row.poQty }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 箱单 -->
        <el-tab-pane name="pl">
          <template #label>箱单 <span class="cnt">{{ cartonRows.length }} 行</span></template>
          <div class="pane-bar">
            <el-alert type="success" :closable="false" show-icon
              :title="`每箱 ${pack.perCarton} 件；箱号在「同一定单号的同一款号」内从 1 重排（与装柜计划按款号统计箱数对齐）；${pack.mergeRemainder ? '同款尾数按源顺序拼箱，续行不重复计箱' : '每个尾数单独成箱'}`" />
            <el-button :icon="Download" @click="exportOne('pl')">导出箱单</el-button>
          </div>
          <el-table :data="paged(cartonRows)" border stripe size="small" :row-class-name="rowCls" max-height="460">
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="trace">
                  <div><b>怎么来的</b>{{ explainRow(row) }}</div>
                  <div><b>源文件</b>第 {{ row.srcRow }} 行 · {{ row.poNo }} / {{ row.style }} / {{ row.color }} / {{ row.size }} · 共 {{ row.srcQty }} 件</div>
                  <div><b>体积</b>{{ row.cartons }} 箱 × {{ row.cartonL }}×{{ row.cartonW }}×{{ row.cartonH }}cm ＝ {{ row.cbm }} m³</div>
                  <div><b>重量</b>每箱净 {{ row.netPerCarton }} ＋ 皮 {{ pack.tarePerCarton }} ＝ 毛 {{ row.grossPerCarton }} kg；本行合计 净 {{ row.netTotal }} / 毛 {{ row.grossTotal }} kg</div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="poNo" label="定单号" min-width="128" />
            <el-table-column prop="style" label="款号" min-width="128" />
            <el-table-column prop="color" label="颜色" min-width="96" />
            <el-table-column prop="size" label="尺码" width="66" />
            <el-table-column prop="barcode" label="条码" min-width="126" />
            <el-table-column label="源件数" width="84" align="right">
              <template #default="{ row }"><span class="mute">{{ row.srcQty }}</span></template>
            </el-table-column>
            <el-table-column label="段" width="72" align="center">
              <template #default="{ row }">
                <el-tag :type="row.seg === 'full' ? 'success' : 'info'" size="small" effect="plain">
                  {{ row.seg === 'full' ? '整箱' : (row.continuation ? '并箱' : '尾箱') }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="inCtn" label="每箱" width="66" align="right" />
            <el-table-column prop="totalPcs" label="件数" width="76" align="right" />
            <el-table-column label="箱号" width="106" align="center">
              <template #default="{ row }">
                <span v-if="row.cartonFrom === null" class="mute">并入上一箱</span>
                <span v-else>{{ row.cartonFrom }}<template v-if="row.cartonTo !== row.cartonFrom">–{{ row.cartonTo }}</template></span>
              </template>
            </el-table-column>
            <el-table-column label="箱数" width="66" align="right">
              <template #default="{ row }">{{ row.cartons || '' }}</template>
            </el-table-column>
            <el-table-column label="体积 m³" width="94" align="right">
              <template #default="{ row }">{{ row.cbm || '' }}</template>
            </el-table-column>
            <el-table-column label="净重 kg" width="92" align="right">
              <template #default="{ row }">{{ row.netTotal || '' }}</template>
            </el-table-column>
            <el-table-column label="毛重 kg" width="92" align="right">
              <template #default="{ row }">{{ row.grossTotal || '' }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 发票 -->
        <el-tab-pane name="inv">
          <template #label>发票 <span class="cnt">{{ poLines.length }} 行</span></template>
          <div class="pane-bar">
            <el-alert type="success" :closable="false" show-icon
              title="发票不经装箱，行粒度与 PO 明细一一对应；单价/金额直接取 PO。末两列「订单数/差额」是真实件里的核对列，本工具由 PO 生成故差额恒为 0——真短装时改 QTY，差额立刻露出来。" />
            <el-button :icon="Download" @click="exportOne('inv')">导出发票</el-button>
          </div>
          <el-table :data="paged(poLines)" border stripe size="small" max-height="460">
            <el-table-column label="源行" width="72" align="right">
              <template #default="{ row }"><span class="mute">{{ row.srcRow }}</span></template>
            </el-table-column>
            <el-table-column prop="poNo" label="定单号" min-width="130" />
            <el-table-column prop="style" label="款号" min-width="130" />
            <el-table-column prop="styleName" label="款名" min-width="170" />
            <el-table-column prop="color" label="颜色" min-width="100" />
            <el-table-column prop="hsCode" label="HS" width="70" />
            <el-table-column prop="size" label="尺码" width="70" />
            <el-table-column prop="qty" label="件数" width="80" align="right" />
            <el-table-column prop="price" label="单价" width="90" align="right" />
            <el-table-column label="金额 = 单价 × 件数" width="150" align="right">
              <template #default="{ row }">{{ (row.qty * row.price).toFixed(2) }}</template>
            </el-table-column>
            <el-table-column prop="barcode" label="条码" min-width="130" />
          </el-table>
        </el-tab-pane>

        <!-- 装柜计划 -->
        <el-tab-pane name="lp">
          <template #label>装柜计划 <span class="cnt">{{ styleAggs.length }} 行</span></template>
          <div class="pane-bar">
            <el-alert type="success" :closable="false" show-icon
              title="按「定单号 + 款号」汇总装箱结果，再按收货国分块；每个定单后一行小计、每个收货国后一行合计，最后总计。单证/柜号/卸货港在国家块内合并成一格。" />
            <el-button :icon="Download" @click="exportOne('lp')">导出装柜计划</el-button>
          </div>
          <el-table :data="paged(styleAggs)" border stripe size="small" max-height="460">
            <el-table-column prop="poNo" label="定单号" min-width="130" />
            <el-table-column prop="style" label="款号" min-width="130" />
            <el-table-column label="中文品名" width="100">
              <template #default="{ row }">
                <span :class="{ danger: !row.nameCn }">{{ row.nameCn || '未归类' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="10 位商编" width="120">
              <template #default="{ row }">
                <span :class="{ danger: !row.hs10 }">{{ row.hs10 || '未归类' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="收货国" width="120">
              <template #default="{ row }">
                <span :class="{ danger: !row.consignee }">{{ row.consignee || '未指定' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="qty" label="件数" width="90" align="right" />
            <el-table-column prop="cartons" label="箱数" width="80" align="right" />
            <el-table-column prop="cbm" label="体积 m³" width="110" align="right" />
            <el-table-column prop="gross" label="毛重 kg" width="100" align="right" />
            <el-table-column prop="net" label="净重 kg" width="100" align="right" />
          </el-table>
        </el-tab-pane>
      </el-tabs>

      <el-pagination v-model:current-page="page" :page-size="PAGE" :total="curTotal"
        layout="total, prev, pager, next, jumper" style="margin-top:12px; justify-content:flex-end" />
    </el-card>

    <!-- 列识别核对 / 跳过行 抽屉 -->
    <el-drawer v-model="drawer" :title="`「${cur?.name}」怎么读的`" size="72%">
      <template v-if="cur">
        <h4 class="sub" style="margin-top:0">列识别<span class="hint">　认错的列在这里改；改完这张表会按新映射重算</span></h4>
        <el-table :data="colRows" border stripe size="small">
          <el-table-column prop="label" label="字段" width="100">
            <template #default="{ row }">
              {{ row.label }}<span v-if="row.required" class="req">*</span>
            </template>
          </el-table-column>
          <el-table-column label="认到第几列" width="180">
            <template #default="{ row }">
              <el-select v-model="colOverride[row.key]" size="small" clearable placeholder="（未认到）"
                style="width:150px" @change="reparse">
                <el-option v-for="c in colChoices" :key="c.value" :label="c.label" :value="c.value" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="表头原文" min-width="150">
            <template #default="{ row }">
              <code v-if="row.headText" class="hd">{{ row.headText }}</code>
              <span v-else class="mute">（该列表头是空的，按位置推的）</span>
            </template>
          </el-table-column>
          <el-table-column label="前 3 行示例值" min-width="230">
            <template #default="{ row }">
              <span v-if="row.samples.length" class="samples">
                <code v-for="(s, i) in row.samples" :key="i">{{ s }}</code>
              </span>
              <span v-else class="mute">—</span>
            </template>
          </el-table-column>
          <el-table-column label="认错了会毁哪份" min-width="170">
            <template #default="{ row }">
              <span v-if="row.usedBy" class="mute">{{ row.usedBy }}</span>
            </template>
          </el-table-column>
        </el-table>

        <h4 class="sub">
          跳过的行
          <span class="hint">　共 {{ skipTotal(cur) }} 行。若「款号为空 / 尺码为空」多得离谱，多半是上面的列认错了</span>
        </h4>
        <el-result v-if="!cur.skipped.length" icon="success" sub-title="表头行以下没有被跳过的行" style="padding:8px 0" />
        <el-table v-else :data="cur.skipped" border stripe size="small">
          <el-table-column prop="reason" label="原因" width="150" />
          <el-table-column prop="count" label="行数" width="90" align="right" />
          <el-table-column label="举例" min-width="320">
            <template #default="{ row }">
              <div v-for="s in row.samples" :key="s" class="sample">{{ s }}</div>
            </template>
          </el-table-column>
        </el-table>

        <h4 class="sub">源文件原文<span class="hint">　表头行高亮；已识别的列标了字段名</span></h4>
        <div class="raw-wrap">
          <table class="raw">
            <tr v-for="(r, ri) in rawPreview" :key="ri" :class="{ head: ri + rawFrom === cur.headerRow }">
              <td class="rn">{{ ri + rawFrom + 1 }}</td>
              <td v-for="(c, ci) in r" :key="ci" :class="{ mapped: mappedCols.has(ci) }">
                <span v-if="ri + rawFrom === cur.headerRow && mappedCols.has(ci)" class="cn">{{ mappedCols.get(ci) }}</span>
                {{ c }}
              </td>
            </tr>
          </table>
        </div>
        <el-pagination v-model:current-page="rawPage" :page-size="RAW" :total="cur.rows.length"
          layout="total, prev, pager, next, jumper" small style="margin-top:10px; justify-content:flex-end" />
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
// 【AI工具集·场景1】清关单据生成 —— 上传 PO → 一次出齐 箱单 / 发票 / 装柜计划。
// 纯前端：文件在浏览器里解析、结果在浏览器里生成，不经后端、不落库。
//
// 【这一版的重点是「过程可见」】用户的话：「要用户看的清楚过程才行，不然数据哪里搞错了都不知道」。
// 本工具最容易出错、且**出错还不报错**的地方是「列靠表头关键词猜」——猜歪一列，整列数据全错。
// 所以界面按「每一步都把自己的活摊开」来做：
//   ② 每张表显示表头行在第几行、认到几列、跳过多少行，点开能逐列核对示例值并手改映射；
//   ③ 源数据体检：把「没条码 / 没 HS / 单价为 0 / 件数非整」这类缺陷按严重度列出来，并说明会毁哪份单；
//   ④ 参数区拿源文件里的真实一行当场演算，参数一改数就变；
//   ⑥ 对账页签放在最前：PO/箱单/装柜三个口径逐款比，对不上标红——总数一致不代表每个款号都一致；
//      箱单每行可展开看「源 50 件 ÷ 每箱 6 ＝ 8 整箱余 2，本行是哪一段」。
import { computed, markRaw, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowRight, Download, Upload, UploadFilled } from '@element-plus/icons-vue';
import {
  scanPoWorkbook, rowsToPoLines, packLines, packTotals, aggregateByStyle, consigneesOf,
  guessConsignee, inspectLines, reconcile, explainRow, fillHsByStyle,
  exportPackingList, exportInvoice, exportLoadingPlan, safeName,
  loadStyleSpecs, saveStyleSpecs, normalizeSpecs, toSpecFile, parseSpecFile,
  DEFAULT_PACK, DEFAULT_PL_HEADER, DEFAULT_INV_HEADER, DEFAULT_LP_HEADER, DEFAULT_HS_MAP,
  COL_LABELS, COL_ORDER, COL_USED_BY, REQUIRED_COLS,
  type SheetScan, type PoLine, type PackParams, type PlHeader, type InvHeader, type LpHeader,
  type HsClass, type ColKey, type StyleSpec, type StyleSpecMap,
} from '../../utils/customsDocs';

const PAGE = 100;
const RAW = 30;

const scans = ref<SheetScan[]>([]);
const picked = ref<SheetScan[]>([]);
const parseErr = ref('');
const exporting = ref(false);
const page = ref(1);
const tab = ref('recon');
const reconLevel = ref<'po' | 'style'>('po');
const onlyBad = ref(false);
const autoFillHs = ref(true);
const sheetTable = ref();

// 列识别抽屉
const drawer = ref(false);
const cur = ref<SheetScan | null>(null);
// 键用 string 而不是 ColKey：模板里下拉的 v-model 走的是插槽 row.key（any），
// 收窄成 ColKey 会让 vue-tsc 在模板里报索引错
const colOverride = reactive<Record<string, number | undefined>>({});
const rawPage = ref(1);

const pack = reactive<PackParams>({ ...DEFAULT_PACK });
const specOpen = ref<string[]>([]);
const specFile = ref<HTMLInputElement>();
/** 款号预设的编辑态：每个款号一行（含没设过的空行），存盘时才滤掉空行 */
const specDraft = reactive<Record<string, StyleSpec>>({});
const hsMap = reactive<Record<string, HsClass>>(JSON.parse(JSON.stringify(DEFAULT_HS_MAP)));
const consigneeByPo = reactive<Record<string, string>>({});

const common = reactive({
  invoiceNo: '', docDate: '', etd: '', eta: '',
  deliveryPort: 'Rijeka, Croatia',
  consignee: 'SPORT VISION D.O.O. SERBIA',
  consigneeCountry: 'Serbia',
});
const plHead = reactive<PlHeader>({ ...DEFAULT_PL_HEADER });
const invHead = reactive<InvHeader>({ ...DEFAULT_INV_HEADER });
const lpHead = reactive<LpHeader>({ ...DEFAULT_LP_HEADER, containerByConsignee: {}, dischargePortByConsignee: {} });
const bankText = ref(DEFAULT_INV_HEADER.bankLines.join('\n'));

async function onPick(file: any) {
  const raw: File = file.raw ?? file;
  parseErr.value = '';
  scans.value = [];
  picked.value = [];
  try {
    if (/\.xls$/i.test(raw.name)) throw new Error('.xls 是老格式（BIFF），解析不了——请用 Excel/WPS 另存为 .xlsx 再上传');
    const buf = await raw.arrayBuffer();
    // markRaw 是必须的，不是优化：SheetScan 里带着整表原文（真实 PO 有一张 1894×12 的表），
    // 交给 ref() 会被深度代理成几万个 reactive 数组，页面直接卡死不动、还不报错。
    // 这些对象我们只整体替换、不做细粒度响应式更新（改列映射后显式重赋值 scans/picked 触发重算）。
    const list = (await scanPoWorkbook(buf)).map((s) => markRaw(s));
    scans.value = list;
    const def = list.some((s) => s.isPerPo) ? list.filter((s) => s.isPerPo) : list;
    picked.value = def;
    // el-table 的勾选状态要在下一帧回填，否则表格刚渲染、toggleRowSelection 落空
    setTimeout(() => def.forEach((r) => sheetTable.value?.toggleRowSelection(r, true)), 0);
    if (!common.invoiceNo) common.invoiceNo = def[0]?.poNos[0] ?? '';
    ElMessage.success(`解析到 ${list.length} 张明细表，默认勾选 ${def.length} 张`);
  } catch (e: any) {
    parseErr.value = e?.message || '解析失败';
  }
}

function onSheetSel(rows: SheetScan[]) { picked.value = rows; }

const skipTotal = (s: SheetScan) => s.skipped.reduce((n, x) => n + x.count, 0);
const mappedCount = (s: SheetScan) => Object.values(s.cols).filter((v) => v !== undefined).length;

// ---- 列识别抽屉 ----
function openSheet(s: SheetScan) {
  cur.value = s;
  rawPage.value = 1;
  for (const k of COL_ORDER) colOverride[k] = s.cols[k];
  drawer.value = true;
}

/** 改了列映射就地重算这张表；件数/明细行数会立刻变，用户能马上看出改对没改对 */
function reparse() {
  const s = cur.value;
  if (!s) return;
  const cols: Partial<Record<ColKey, number>> = {};
  for (const k of COL_ORDER) if (colOverride[k] !== undefined && colOverride[k] !== null) cols[k] = colOverride[k]!;
  if (REQUIRED_COLS.some((k) => cols[k] === undefined)) {
    ElMessage.warning(`必填列还缺：${REQUIRED_COLS.filter((k) => cols[k] === undefined).map((k) => COL_LABELS[k]).join('、')}`);
    return;
  }
  const { lines, skipped } = rowsToPoLines(s.rows, { headerRow: s.headerRow, cols });
  s.cols = cols;
  s.lines = lines;
  s.skipped = skipped;
  s.poNos = [...new Set(lines.map((l) => l.poNo).filter(Boolean))];
  s.totalQty = lines.reduce((n, l) => n + l.qty, 0);
  s.isPerPo = s.poNos.length === 1 && s.poNos[0] === s.name.trim();
  // 触发依赖 picked 的重算（scans 里对象被就地改了，引用没变）
  picked.value = [...picked.value];
  scans.value = [...scans.value];
  ElMessage.success(`已按新列映射重算：${lines.length} 行 / ${s.totalQty} 件`);
}

const colChoices = computed(() => {
  const s = cur.value;
  if (!s) return [];
  const width = Math.max(...s.rows.slice(0, 50).map((r) => r.length), 0);
  const head = s.rows[s.headerRow] ?? [];
  return Array.from({ length: width }, (_, i) => ({
    value: i,
    label: `第 ${i + 1} 列${head[i] ? `　${String(head[i]).trim().slice(0, 12)}` : ''}`,
  }));
});

const colRows = computed(() => {
  const s = cur.value;
  if (!s) return [];
  const head = s.rows[s.headerRow] ?? [];
  const body = s.rows.slice(s.headerRow + 1).filter((r) => r.some((c) => String(c ?? '').trim()));
  return COL_ORDER.map((key) => {
    const idx = colOverride[key];
    return {
      key,
      label: COL_LABELS[key],
      required: REQUIRED_COLS.includes(key),
      headText: idx === undefined ? '' : String(head[idx] ?? '').trim(),
      samples: idx === undefined ? []
        : body.slice(0, 3).map((r) => String(r[idx] ?? '').trim()).filter(Boolean),
      usedBy: (COL_USED_BY[key] ?? []).join(' / '),
    };
  });
});

const mappedCols = computed(() => {
  const m = new Map<number, string>();
  for (const k of COL_ORDER) {
    const i = colOverride[k];
    if (i !== undefined && i !== null) m.set(i, COL_LABELS[k]);
  }
  return m;
});

const rawFrom = computed(() => (rawPage.value - 1) * RAW);
const rawPreview = computed(() => {
  const s = cur.value;
  if (!s) return [];
  const width = Math.max(...s.rows.slice(0, 50).map((r) => r.length), 0);
  return s.rows.slice(rawFrom.value, rawFrom.value + RAW).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
});

// ---- 主数据流 ----
/** 勾选表合并后的原始明细（未经任何修补） */
const rawLines = computed<PoLine[]>(() => picked.value.flatMap((s) => s.lines));
const hsFill = computed(() => fillHsByStyle(rawLines.value));
/** 下游一律用这一份：开了「跨定单补 HS」就是补过的 */
const poLines = computed<PoLine[]>(() => (autoFillHs.value ? hsFill.value.lines : rawLines.value));
const issues = computed(() => inspectLines(poLines.value));

const cbmPerCarton = computed(() => +((pack.cartonL * pack.cartonW * pack.cartonH) / 1_000_000).toFixed(8));
const defaultNet = computed(() => (pack.netBasis === 'carton' ? pack.netPerCartonFixed : pack.netPerPiece));

/** 参数区的当场演算：挑一条「有尾数」的真实明细，最能说明装箱怎么算 */
const demo = computed(() => {
  const src = poLines.value.find((l) => l.qty % pack.perCarton !== 0) ?? poLines.value[0];
  if (!src) return null;
  const rows = packLines([src], { ...pack, specByStyle: specs.value });
  const full = rows.find((r) => r.seg === 'full');
  const tail = rows.find((r) => r.seg === 'tail');
  return {
    style: src.style, color: src.color, size: src.size,
    text: explainRow(rows[0]).split('；')[0]
      + `　→　共 ${rows.reduce((n, r) => n + r.cartons, 0)} 箱`,
    fullNet: full?.netPerCarton ?? tail?.netPerCarton ?? 0,
    fullGross: full?.grossPerCarton ?? tail?.grossPerCarton ?? 0,
    tailNet: tail && full ? tail.netPerCarton : null,
    tailGross: tail && full ? tail.grossPerCarton : null,
  };
});

const styleRows = computed(() => {
  const m = new Map<string, { style: string; styleName: string; color: string; qty: number }>();
  for (const l of poLines.value) {
    const cur2 = m.get(l.style);
    if (cur2) cur2.qty += l.qty;
    else m.set(l.style, { style: l.style, styleName: l.styleName, color: l.color, qty: l.qty });
  }
  return [...m.values()];
});

const poRows = computed(() => {
  const m = new Map<string, { poNo: string; qty: number }>();
  for (const l of poLines.value) {
    const c = m.get(l.poNo);
    if (c) c.qty += l.qty;
    else m.set(l.poNo, { poNo: l.poNo, qty: l.qty });
  }
  return [...m.values()];
});
watch(poRows, (rows) => {
  for (const r of rows) {
    if (consigneeByPo[r.poNo] === undefined) consigneeByPo[r.poNo] = guessConsignee(r.poNo);
  }
}, { immediate: true });

const hsRows = computed(() => {
  const m = new Map<string, number>();
  for (const s of styleRows.value) {
    const hs = String(poLines.value.find((l) => l.style === s.style)?.hsCode ?? '').trim();
    if (hs) m.set(hs, (m.get(hs) ?? 0) + 1);
  }
  for (const hs of m.keys()) if (!hsMap[hs]) hsMap[hs] = { nameCn: '', hs10: '' };
  return [...m.entries()].map(([hs4, count]) => ({ hs4, count }));
});
const unclassified = computed(() => hsRows.value.filter((h) => !hsMap[h.hs4]?.hs10).map((h) => h.hs4));

// ---- 款号装箱预设 ----
/** 只有真正填了值的才算预设（el-input-number 清空会给 undefined/null） */
const specs = computed<StyleSpecMap>(() => normalizeSpecs(specDraft));
const specCount = computed(() => Object.keys(specs.value).length);
const hasSpec = (style: string) => !!specs.value[style];
const specRowCls = ({ row }: { row: any }) => (hasSpec(row.style) ? 'spec-row' : '');

// 每出现一个新款号就给它铺一行空的编辑态（不然表格里 v-model 指向 undefined）
watch(styleRows, (rows) => {
  const saved = loadStyleSpecs();
  for (const r of rows) {
    if (!specDraft[r.style]) specDraft[r.style] = { ...(saved[r.style] ?? {}) };
  }
}, { immediate: true });

// 编辑态一变就落本地：业务维护一次，下次打开还在
watch([specs, () => pack.netBasis], () => saveStyleSpecs(specs.value, pack.netBasis), { deep: true });

/** 这一款按当前设置会装成什么样——就地看见效果，不用翻到结果区 */
function styleOutcome(style: string): string {
  const lines = poLines.value.filter((l) => l.style === style);
  if (!lines.length) return '';
  const rows = packLines(lines, { ...pack, specByStyle: specs.value });
  const t = packTotals(rows);
  const per = rows[0]?.perCarton ?? pack.perCarton;
  return `每箱 ${per} 件 → ${t.cartons} 箱 / ${t.pieces} 件，${t.cbm} m³，毛 ${t.gross} kg`;
}

function exportSpecs() {
  const blob = new Blob([JSON.stringify(toSpecFile(specs.value, new Date().toISOString().slice(0, 10), pack.netBasis), null, 2)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '款号装箱预设.json';
  a.click();
  URL.revokeObjectURL(a.href);
  ElMessage.success(`已导出 ${specCount.value} 个款号的预设`);
}

async function importSpecs(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = ''; // 允许连续导入同一个文件
  if (!f) return;
  try {
    const { specs: map, netBasis } = parseSpecFile(await f.text());
    let hit = 0;
    for (const [style, s] of Object.entries(map)) {
      specDraft[style] = { ...s };
      if (styleRows.value.some((r) => r.style === style)) hit++;
    }
    const miss = Object.keys(map).length - hit;
    ElMessage.success(`导入 ${Object.keys(map).length} 条预设，其中 ${hit} 条对上了本次的款号${miss ? `，${miss} 条本次用不上（先留着）` : ''}`);
    // 预设里的净重一列，按件口径下是「单件净重」、按箱口径下是「每箱净重」，两者差着一个箱的件数。
    // 口径搞错重量会静默虚高近一个数量级（实测过：8.5 当成单件净重 → 总净重从 2.8 万变 58 万公斤）。
    const hasNet = Object.values(map).some((s) => s.net !== undefined);
    if (netBasis && netBasis !== pack.netBasis) {
      pack.netBasis = netBasis;
      ElMessage.warning(`这份预设是按「${netBasis === 'carton' ? '每箱净重' : '单件净重'}」维护的，已把计重口径切过去——否则重量会差好几倍`);
    } else if (!netBasis && hasNet) {
      // 文件没记口径（手写的 / 老版本导出的）：**不猜**，问清楚
      const pick = await ElMessageBox.confirm(
        '这份预设带了净重，但文件里没写清是「每箱净重」还是「单件净重」。两者差着一整箱的件数，选错重量会差好几倍。',
        '这份预设的净重是按什么记的？',
        { confirmButtonText: '每箱净重', cancelButtonText: '单件净重', distinguishCancelAndClose: true, type: 'warning' },
      ).then(() => 'carton' as const).catch((a) => (a === 'cancel' ? 'piece' as const : null));
      if (pick) {
        pack.netBasis = pick;
        ElMessage.success(`计重口径已设为「${pick === 'carton' ? '按箱固定' : '按件'}」`);
      }
    }
  } catch (err: any) {
    ElMessage.error(err?.message || '导入失败');
  }
}

function clearSpecs() {
  for (const k of Object.keys(specDraft)) specDraft[k] = {};
  ElMessage.success('已清空，全部款号回到全局参数');
}

const cartonRows = computed(() => {
  if (!poLines.value.length) return [];
  return packLines(poLines.value, { ...pack, specByStyle: specs.value });
});

const styleAggs = computed(() => aggregateByStyle(cartonRows.value, hsMap, consigneeByPo));
const consigneeRows = computed(() => consigneesOf(styleAggs.value).map((name) => ({ name })));
const noConsignee = computed(() => styleAggs.value.some((a) => !a.consignee));

const totals = computed(() => packTotals(cartonRows.value));

/** 重量合理性哨兵：一件服装 0.05~5kg 之外基本可以断定是「计重口径」跟净重数字对不上。
 *  实测过这个坑——把「每箱净重 8.5」当成「单件净重 8.5」用，总净重从 2.8 万变 58 万公斤，
 *  而在加这条之前界面上一个字都不提示。 */
const sanity = computed(() => {
  const t = totals.value;
  const perPiece = t.pieces ? +(t.net / t.pieces).toFixed(3) : 0;
  return { perPiece, ok: !t.pieces || (perPiece >= 0.05 && perPiece <= 5) };
});
const invAmount = computed(() => +poLines.value.reduce((s, l) => s + l.qty * l.price, 0).toFixed(2));
const recon = computed(() => reconcile(poLines.value, cartonRows.value, styleAggs.value));
const reconList = computed(() => {
  const list = reconLevel.value === 'po' ? recon.value.byPo : recon.value.byStyle;
  return onlyBad.value ? list.filter((x) => !x.ok) : list;
});

const curList = computed<any[]>(() => (
  tab.value === 'inv' ? poLines.value
    : tab.value === 'lp' ? styleAggs.value
      : tab.value === 'recon' ? reconList.value
        : cartonRows.value));
const curTotal = computed(() => curList.value.length);
const paged = (list: any[]) => list.slice((page.value - 1) * PAGE, page.value * PAGE);
watch([cartonRows, tab, reconLevel, onlyBad], () => { page.value = 1; });

const rowCls = ({ row }: { row: any }) => (row.continuation ? 'cont-row' : '');
const reconCls = ({ row }: { row: any }) => (row.ok ? '' : 'bad-row');

/** 顶部步骤条：每一步一句话交代「这步做了什么、结果如何」 */
const flow = computed(() => {
  const errIssues = issues.value.filter((i) => i.level === 'error').length;
  const skipped = picked.value.reduce((n, s) => n + skipTotal(s), 0);
  return [
    { key: 'read', title: '读源文件', detail: `${scans.value.length} 张明细表`, state: 'ok' },
    {
      key: 'pick',
      title: '选定单',
      detail: `勾了 ${picked.value.length} 张 · ${poLines.value.length} 行明细 · 跳过 ${skipped} 行`,
      state: picked.value.length ? 'ok' : 'bad',
    },
    {
      key: 'check',
      title: '体检',
      detail: errIssues ? `${errIssues} 类严重问题` : (issues.value.length ? `${issues.value.length} 类轻微问题` : '无异常'),
      state: errIssues ? 'bad' : 'ok',
    },
    {
      key: 'pack',
      title: '装箱',
      detail: `每箱 ${pack.perCarton} 件 → ${totals.value.cartons} 箱 / ${totals.value.pieces} 件`,
      state: 'ok',
    },
    {
      key: 'recon',
      title: '对账',
      detail: recon.value.badCount ? `${recon.value.badCount} 个款号对不上` : '三份逐款一致',
      state: recon.value.badCount ? 'bad' : 'ok',
    },
  ];
});

function resolved() {
  const pos = [...new Set(poLines.value.map((l) => l.poNo).filter(Boolean))];
  const tag = common.invoiceNo || pos.join('-') || '清关单据';
  return {
    tag,
    pl: {
      ...plHead,
      invoiceNo: common.invoiceNo,
      packListDate: common.docDate,
      packListNo: plHead.packListNo || `${common.invoiceNo}- PL`,
      etd: common.etd, eta: common.eta,
      deliveryPort: common.deliveryPort,
      consignee: common.consignee, consigneeCountry: common.consigneeCountry,
    } as PlHeader,
    inv: {
      ...invHead,
      invoiceNo: common.invoiceNo,
      invoiceDate: common.docDate,
      latestShipmentDate: common.etd,
      deliveryPort: common.deliveryPort,
      consignee: common.consignee, consigneeCountry: common.consigneeCountry,
      bankLines: bankText.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    } as InvHeader,
    lp: { ...lpHead } as LpHeader,
  };
}

async function exportOne(which: 'pl' | 'inv' | 'lp') {
  const r = resolved();
  if (which === 'pl') await exportPackingList(cartonRows.value, r.pl, safeName(`PL-${r.tag}.xlsx`));
  if (which === 'inv') await exportInvoice(poLines.value, r.inv, safeName(`INV-${r.tag}.xlsx`));
  if (which === 'lp') await exportLoadingPlan(styleAggs.value, r.lp, safeName(`LOADING PLAN-${r.tag}.xlsx`));
  ElMessage.success('已导出');
}

async function exportAll() {
  if (!cartonRows.value.length) return;
  exporting.value = true;
  try {
    // 顺序落盘：浏览器对「同一次点击连开多个下载」有节流，串行最稳
    for (const w of ['pl', 'inv', 'lp'] as const) await exportOne(w);
    ElMessage.success('箱单 / 发票 / 装柜计划 三份已导出');
  } catch (e: any) {
    ElMessage.error(e?.message || '导出失败');
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.page-container > .el-card { margin-bottom: 16px; }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.hint { font-size: 12px; font-weight: 400; color: var(--gray-5); }
.mute { color: var(--gray-3); }
.danger { color: var(--vermilion); font-weight: 600; }
.ok { color: var(--teal); }
.x { margin: 0 4px; color: var(--gray-3); }
.unit { margin-left: 8px; font-size: 12px; color: var(--gray-5); }
.sub { margin: 18px 0 8px; font-size: 14px; color: var(--gray-9); font-weight: 600; }
.sub .hint { font-weight: 400; }
.req { color: var(--vermilion); margin-left: 2px; }
.sample { font-size: 12px; color: var(--gray-5); line-height: 1.7; }

/* 步骤条 */
.flow-card { background: var(--canvas); }
.flow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.flow-step { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.flow-step .dot {
  flex: none; width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #fff; background: var(--teal);
}
.flow-step.bad .dot { background: var(--vermilion); }
.flow-txt { display: flex; flex-direction: column; line-height: 1.35; }
.flow-txt b { font-size: 13px; color: var(--gray-9); }
.flow-txt span { font-size: 12px; color: var(--gray-5); }
.flow-step.bad .flow-txt span { color: var(--vermilion); }
.arrow { margin: 0 10px; color: var(--gray-3); }

/* 款号装箱预设 */
.spec-title { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.spec-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.spec-bar .el-alert { flex: 1; }
.spec-btns { display: flex; gap: 6px; flex: none; }
:deep(.spec-row) { background: #F3FAF7 !important; }

/* 跨定单补 HS */
.fixup { margin-bottom: 14px; padding: 12px 14px; border: 1px dashed var(--gray-1); border-radius: var(--r-md); background: var(--canvas); }
.fixup-head { display: flex; align-items: center; gap: 10px; }
.fixup-head b { font-size: 13px; color: var(--gray-9); }
.fixup-body { margin-top: 8px; font-size: 13px; line-height: 1.9; }
.sep { margin: 0 10px; color: var(--gray-3); }

/* 参数区当场演算 */
.demo {
  margin-top: 4px; padding: 12px 14px; border-radius: var(--r-md);
  background: var(--canvas); border: 1px dashed var(--gray-1);
}
.demo-t { font-size: 12px; color: var(--gray-5); margin-bottom: 6px; }
.demo-b { font-size: 13px; color: var(--gray-9); line-height: 1.9; }
.demo-b code { background: #fff; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--gray-1); }
.demo-arrow { margin: 0 8px; color: var(--gray-3); }
.demo-sep { margin: 0 10px; color: var(--gray-3); }

.head-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); column-gap: 12px; }

.stats { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.stat {
  flex: 1 1 130px; padding: 10px 14px; background: var(--canvas);
  border: 1px solid var(--gray-1); border-radius: var(--r-md);
}
.stat .k { display: block; font-size: 12px; color: var(--gray-5); margin-bottom: 4px; }
.stat b { font-size: 18px; color: var(--indigo); }
.stat.good b { color: var(--teal); }
.stat.bad { border-color: var(--vermilion); }
.stat.bad b { color: var(--vermilion); }

.pane-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.pane-bar .el-alert { flex: 1; }
.cnt { margin-left: 4px; font-size: 12px; color: var(--gray-5); }
:deep(.cont-row) { background: var(--gray-0) !important; }
:deep(.bad-row) { background: #FDEDED !important; }

/* 单行溯源 */
.trace { padding: 6px 12px; font-size: 13px; line-height: 2; color: var(--gray-7); }
.trace b {
  display: inline-block; width: 68px; color: var(--gray-5); font-weight: 600; font-size: 12px;
}

/* 源文件原文预览 */
.raw-wrap { max-height: 340px; overflow: auto; border: 1px solid var(--gray-1); border-radius: var(--r); }
.raw { border-collapse: collapse; font-size: 12px; white-space: nowrap; }
.raw td { border: 1px solid var(--gray-1); padding: 3px 8px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.raw td.rn { position: sticky; left: 0; background: var(--gray-0); color: var(--gray-3); text-align: right; }
.raw tr.head td { background: #EDF1F7; font-weight: 700; }
.raw td.mapped { background: #F3FAF7; }
.raw tr.head td.mapped { background: #DDEEE8; }
.cn { display: block; font-size: 10px; color: var(--teal); font-weight: 600; }
.hd { background: var(--gray-0); padding: 1px 6px; border-radius: 4px; }
.samples { display: flex; flex-wrap: wrap; gap: 4px; }
.samples code { background: var(--gray-0); padding: 1px 6px; border-radius: 4px; font-size: 12px; }
</style>
