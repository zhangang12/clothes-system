# -*- coding: utf-8 -*-
"""构建「样衣制造管理系统 · UI设计稿与需求·问题清单 总览」单一自包含 HTML。
- 5 份模块设计稿(基础资料/客户报价/样衣管理/订单/合同) + 订单&合同可填写问题清单 + 三模块修订说明 → base64 内嵌(iframe blob 隔离)
- 订单/合同问题清单的 QUESTIONS 数组从现成文件提取;三模块问题清单从 docx 解析
- 门户原生渲染问题清单,自动按文本生成「UI 出处」超链接(跳转并滚动到设计稿具体分节)
"""
import base64, re, os, json, zipfile

BASE = r"D:\opencode-project\样衣制造管理系统\02_新系统原型"
UIDIR = os.path.join(BASE, "UI设计稿汇总【已五个模块串流程】")
OUT = os.path.join(BASE, "样衣系统_UI与问题清单_总览_v1.0.html")

DOC_FILES = {
    'jc':  os.path.join(UIDIR, '01-基础资料设计稿_v1.3.html'),
    'bj':  os.path.join(UIDIR, '02-客户报价设计稿_v1.3.html'),
    'yg':  os.path.join(UIDIR, '02-样衣管理设计稿_v1.3.html'),
    'dd':  os.path.join(UIDIR, '03-订单设计稿_v1.0.html'),
    'hc':  os.path.join(UIDIR, '04-合同设计稿_v1.3.html'),
    'ddq': os.path.join(UIDIR, '订单串流程问题清单_v1.0.html'),
    'hcq': os.path.join(UIDIR, '合同串流程问题清单_v1.0.html'),
    'rev': os.path.join(UIDIR, '三模块串流程_修订说明.html'),
    'mn':  os.path.join(BASE, '05-供应商门户设计稿_v2.2.html'),
    'dz':  os.path.join(BASE, '06-对账付款设计稿_v1.4.html'),
    'js':  os.path.join(BASE, '07-结算清单设计稿_v1.0.html'),
    'mnq': os.path.join(BASE, '门户串流程问题清单_v1.0.html'),
    'dzq': os.path.join(BASE, '对账付款串流程问题清单_v1.0.html'),
    'jsq': os.path.join(BASE, '结算清单串流程问题清单_v1.0.html'),
    'qc':  os.path.join(BASE, '样衣系统全流程问题确认清单_v1.0.html'),
    'dzq2':os.path.join(BASE, '对账付款_补充确认清单_v1.0.html'),
    'rev2':os.path.join(BASE, '下游模块_业务反馈修订说明_v2.html'),
}

def b64file(p):
    with open(p, 'rb') as f:
        return base64.b64encode(f.read()).decode('ascii')

b64docs = {}
for k, p in DOC_FILES.items():
    assert os.path.exists(p), "缺文件: " + p
    b64docs[k] = b64file(p)

# ---- 提取订单/合同 QUESTIONS 数组 ----
def extract_questions(path, varname):
    txt = open(path, encoding='utf-8').read()
    m = txt.find('var QUESTIONS=')
    e = txt.find('\n];', m)
    assert m >= 0 and e > m, "未找到 QUESTIONS 数组: " + path
    return txt[m:e+3].replace('var QUESTIONS=', 'var %s=' % varname, 1)

qorder_js = extract_questions(DOC_FILES['ddq'], 'Q_ORDER')
qcontract_js = extract_questions(DOC_FILES['hcq'], 'Q_CONTRACT')

# ---- 解析三模块问题清单 docx ----
def docx_paras(p):
    z = zipfile.ZipFile(p)
    xml = z.read('word/document.xml').decode('utf-8', 'ignore')
    paras = re.findall(r'<w:p[ >].*?</w:p>', xml, re.S)
    out = []
    for par in paras:
        s = ''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', par, re.S))
        for a, b in [('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>'), ('&quot;', '"')]:
            s = s.replace(a, b)
        out.append(s)
    return out

paras = docx_paras(os.path.join(UIDIR, '三模块串流程_问题清单.docx'))
sec_re = re.compile(r'^([A-K])[\.、]\s*(.+)$')
q_re   = re.compile(r'^([A-K]\d+)[\.、]\s*(.+)$')
sections = []
cur = None
curq = None
for line in paras:
    t = line.strip()
    if not t:
        continue
    if t.startswith('📝') or t.startswith('优先级建议') or t.startswith('附：') or t.startswith('附:'):
        break
    mq = q_re.match(t)
    ms = sec_re.match(t)
    if mq:
        curq = {'qid': mq.group(1), 'title': mq.group(2), 'scenario': '', 'options': []}
        if cur is None:
            cur = {'sec': '?', 'name': '', 'desc': '', 'qs': []}
            sections.append(cur)
        cur['qs'].append(curq)
        continue
    if ms:
        cur = {'sec': ms.group(1), 'name': ms.group(2), 'desc': '', 'qs': []}
        sections.append(cur)
        curq = None
        continue
    if t.startswith('☐'):
        opt = t.lstrip('☐').strip()
        ans = False
        if opt.startswith('其他'):
            body = re.sub(r'^其他[：:]*', '', opt).strip().strip('_').strip()
            ans = len(body) > 0
        if curq is not None:
            curq['options'].append({'l': opt, 'rec': ('推荐' in opt), 'ans': ans})
        continue
    if curq is not None:
        curq['scenario'] = (curq['scenario'] + ' ' + t).strip()
    elif cur is not None:
        cur['desc'] = (cur['desc'] + ' ' + t).strip()

tri_json = json.dumps(sections, ensure_ascii=False)

# ---- 组装门户 ----
TPL = r'''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>样衣制造管理系统 · UI设计稿与需求·问题清单 总览</title>
<style>
:root{--indigo:#1E3A5F;--indigo-d:#152A45;--indigo-l:#2C5180;--linen:#F5EDDC;--linen-d:#E8DCC0;--canvas:#FBF8F2;--rust:#D17A40;--rust-d:#B86530;--vermilion:#C04042;--teal:#3E8E7E;--amber:#C8901E;--gray-9:#1F1F22;--gray-7:#37383C;--gray-5:#6F7178;--gray-3:#B5B7BD;--gray-1:#E5E2DA;--gray-0:#F4F1EA;--font:"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif;}
*{box-sizing:border-box;margin:0;padding:0}
body{font:13px/1.55 var(--font);color:var(--gray-9);background:#EEEAE0;height:100vh;overflow:hidden}
a{color:var(--indigo)}
.pf-top{position:fixed;top:0;left:0;right:0;height:50px;background:var(--indigo);color:#fff;display:flex;align-items:center;padding:0 20px;z-index:100;border-bottom:3px solid var(--rust);box-shadow:0 2px 8px rgba(0,0,0,.15)}
.pf-top .logo{font-size:15px;font-weight:600}
.pf-top .logo small{font-size:11px;color:#C9D6E5;margin-left:8px;font-weight:400}
.pf-top .sp{margin-left:auto;font-size:11.5px;color:#C9D6E5}
.pf-side{position:fixed;top:50px;left:0;bottom:0;width:268px;background:#fff;border-right:1px solid var(--gray-1);overflow-y:auto;padding:10px 0 40px}
.pf-side .home-link{display:flex;align-items:center;gap:8px;margin:6px 12px 10px;padding:9px 12px;border-radius:7px;background:linear-gradient(135deg,var(--indigo),var(--indigo-l));color:#fff;font-weight:600;cursor:pointer}
.pf-side .home-link:hover{filter:brightness(1.08)}
.pf-side .grp{margin:2px 0}
.pf-side .grp-h{display:flex;align-items:center;gap:7px;padding:9px 16px;color:var(--rust-d);font-size:12px;font-weight:700;letter-spacing:.4px;cursor:pointer;user-select:none;border-top:1px solid var(--gray-1)}
.pf-side .grp-h .ar{margin-left:auto;transition:transform .15s;color:var(--gray-3);font-size:10px}
.pf-side .grp.collapsed .ar{transform:rotate(-90deg)}
.pf-side .grp.collapsed .items{display:none}
.pf-side .it{display:flex;align-items:flex-start;gap:8px;padding:8px 16px 8px 28px;color:var(--gray-7);font-size:12.8px;cursor:pointer;border-left:3px solid transparent;line-height:1.4}
.pf-side .it:hover{background:var(--canvas);color:var(--indigo)}
.pf-side .it.on{background:var(--linen);color:var(--indigo);font-weight:600;border-left-color:var(--rust)}
.pf-side .it .ic{flex-shrink:0}
.pf-side .it small{display:block;color:var(--gray-5);font-weight:400;font-size:11px;margin-top:1px}
.pf-side .tag-ok{display:inline-block;font-size:9.5px;background:#E8F4F0;color:#1F6F5C;border:1px solid #C8E2D9;border-radius:7px;padding:0 5px;margin-left:4px;font-weight:600}
.pf-main{position:fixed;top:50px;left:268px;right:0;bottom:0;overflow:hidden}
.frameWrap{position:absolute;inset:0;display:none;flex-direction:column}
.frameWrap.show{display:flex}
.fbar{display:flex;align-items:center;gap:10px;padding:7px 16px;background:var(--canvas);border-bottom:1px solid var(--gray-1);font-size:12.5px;color:var(--gray-7);flex-wrap:wrap}
.fbar .crumb b{color:var(--indigo)}
.btn{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:5px;font-size:12px;cursor:pointer;border:1px solid var(--gray-1);background:#fff;color:var(--gray-7);font-family:inherit}
.btn:hover{border-color:var(--rust);color:var(--rust)}
.btn-p{background:var(--indigo);color:#fff;border-color:var(--indigo)}.btn-p:hover{color:#fff;filter:brightness(1.1)}
iframe#doc{flex:1;width:100%;border:none;background:#fff}
.scroll{position:absolute;inset:0;overflow-y:auto;display:none}
.scroll.show{display:block}
.home{max-width:1080px;margin:0 auto;padding:26px 30px 70px}
.hero{padding:26px 30px;background:linear-gradient(135deg,var(--indigo),var(--indigo-l));color:#fff;border-radius:10px}
.hero h1{font-size:21px;margin-bottom:8px}
.hero p{color:#D5DDE8;font-size:13px;line-height:1.75}
.flow{font-family:"SF Mono",Consolas,monospace;white-space:pre;overflow-x:auto;background:var(--indigo-d);color:#e8eef5;padding:14px 16px;border-radius:8px;font-size:12px;line-height:1.7;margin:18px 0}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(228px,1fr));gap:14px;margin-top:8px}
.card{background:#fff;border:1px solid var(--gray-1);border-radius:9px;padding:16px;cursor:pointer;box-shadow:0 1px 3px rgba(30,58,95,.06);transition:.15s}
.card:hover{border-color:var(--rust);box-shadow:0 4px 14px rgba(30,58,95,.12);transform:translateY(-2px)}
.card .ct{font-size:14px;font-weight:600;color:var(--indigo);margin-bottom:5px}
.card .cd{font-size:12px;color:var(--gray-5);line-height:1.6}
.sec-title{font-size:15px;color:var(--indigo);font-weight:700;margin:26px 0 10px;display:flex;align-items:center;gap:8px}
.sec-title:before{content:"";width:4px;height:18px;background:var(--rust);border-radius:2px}
.qwrap{max-width:1000px;margin:0 auto;padding:22px 28px 80px}
.qhead{padding:20px 26px;background:linear-gradient(135deg,var(--rust),#A85423);color:#fff;border-radius:9px;margin-bottom:8px}
.qhead.indigo{background:linear-gradient(135deg,var(--indigo),var(--indigo-l))}
.qhead.teal{background:linear-gradient(135deg,var(--teal),#2E6E60)}
.qhead h2{font-size:18px;margin-bottom:6px}
.qhead p{font-size:12.5px;opacity:.94;line-height:1.7}
.qsec{margin:22px 0 8px}
.qsec .qsb{display:flex;gap:11px;align-items:flex-start;background:linear-gradient(135deg,var(--linen),var(--canvas));border:1px solid var(--linen-d);border-left:4px solid var(--rust);border-radius:7px;padding:11px 15px}
.qsec .ql{flex-shrink:0;min-width:28px;height:28px;padding:0 6px;background:var(--rust);color:#fff;border-radius:6px;font-weight:700;display:flex;align-items:center;justify-content:center}
.qsec .qn{font-size:14px;font-weight:600;color:var(--indigo)}
.qsec .qd{font-size:12px;color:var(--gray-7);margin-top:2px;line-height:1.6}
.qb{background:#fff;border:1px solid var(--gray-1);border-radius:7px;padding:12px 15px;margin:9px 0;box-shadow:0 1px 2px rgba(30,58,95,.05)}
.qb .qt{display:flex;gap:8px;align-items:flex-start;margin-bottom:4px}
.qb .qno{flex-shrink:0;background:var(--indigo);color:#fff;font-weight:700;font-size:11.5px;padding:1px 7px;border-radius:4px;font-family:"SF Mono",monospace}
.qpri{flex-shrink:0;font-size:10px;font-weight:600;padding:1px 6px;border-radius:8px}
.qpri.h{background:#FBEAEA;color:var(--vermilion)}.qpri.m{background:#FBF1DA;color:#7A5810}.qpri.l{background:#E8F4F0;color:var(--teal)}
.qb .qtt{font-size:13px;font-weight:600;line-height:1.5}
.qb .qsc{font-size:12px;color:var(--gray-7);background:var(--gray-0);border-radius:5px;padding:6px 10px;margin:6px 0;line-height:1.6}
.qb .qsc b{color:var(--indigo)}
.qb .opt{font-size:12.3px;color:var(--gray-9);padding:4px 11px;border:1px solid var(--gray-1);border-radius:5px;margin:3px 0;background:var(--canvas);line-height:1.5}
.qb .opt.rec{border-color:#C8E2D9;background:#F1FAF7}
.qb .opt .recb{background:var(--teal);color:#fff;font-size:9.5px;padding:0 6px;border-radius:8px;margin-left:5px}
.qb .opt.ans{border-color:var(--rust);background:#FFF7EA}
.qb .opt .ansb{background:var(--rust);color:#fff;font-size:9.5px;padding:0 6px;border-radius:8px;margin-left:5px}
.qb .chips{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;border-top:1px dashed var(--gray-1);padding-top:8px}
.qb .chips .lbl{font-size:11px;color:var(--gray-5)}
.chip{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--indigo);background:#EDF1F7;border:1px solid #D5DDE8;border-radius:14px;padding:2px 10px;cursor:pointer}
.chip:hover{background:var(--indigo);color:#fff;border-color:var(--indigo)}
.qb .qref{font-size:11px;color:var(--gray-5);margin-top:7px;line-height:1.5}
.note{background:#FFF7EA;border:1px solid #EDD8A8;border-left:3px solid var(--amber);border-radius:6px;padding:10px 14px;margin:10px 0;font-size:12.5px;color:#5C4307;line-height:1.7}
.note b{color:#7A5810}
.note.ok{background:#F1FAF7;border-color:#C8E2D9;border-left-color:var(--teal);color:#1F5C4E}
.note.ok b{color:#1F6F5C}
</style></head><body>
<div class="pf-top"><div class="logo">🪡 样衣制造管理系统 · UI 设计稿与需求 · 问题清单<small>总览 · 5 模块串流程</small></div><div class="sp">单一自包含 · 5 模块设计稿 + 串流程问题澄清</div></div>
<aside class="pf-side">
  <div class="home-link" onclick="showHome()">🏠 总览首页</div>
  <div class="grp" id="grp-ui"><div class="grp-h" onclick="toggleGrp('grp-ui')">📐 UI 设计稿<span class="ar">▾</span></div><div class="items">
    <div class="it" data-doc="jc" onclick="showDoc('jc')"><span class="ic">📄</span><div>基础资料<small>工厂资料 · 客户资料</small></div></div>
    <div class="it" data-doc="bj" onclick="showDoc('bj')"><span class="ic">📄</span><div>客户报价<small>从样衣导入 · 报价合计</small></div></div>
    <div class="it" data-doc="yg" onclick="showDoc('yg')"><span class="ic">📄</span><div>样衣管理<small>业务/版师 · 材料耗用</small></div></div>
    <div class="it" data-doc="dd" onclick="showDoc('dd')"><span class="ic">📦</span><div>订单 v1.0<span class="tag-ok">已定版</span><small>报价导入 · PO/用料核算</small></div></div>
    <div class="it" data-doc="hc" onclick="showDoc('hc')"><span class="ic">📄</span><div>合同 v1.3<span class="tag-ok">已定稿</span><small>材料合同 · 加工合同 · 列表</small></div></div>
    <div class="it" data-doc="mn" onclick="showDoc('mn')"><span class="ic">📱</span><div>供应商门户 v2.2<span class="tag-ok">已定稿</span><small>盖章→发货→对账→开票</small></div></div>
    <div class="it" data-doc="dz" onclick="showDoc('dz')"><span class="ic">🧾</span><div>对账付款 v1.4<span class="tag-ok">已定稿</span><small>对账单 · 付款申请</small></div></div>
    <div class="it" data-doc="js" onclick="showDoc('js')"><span class="ic">📊</span><div>结算清单 v1.0<span class="tag-ok">新增</span><small>成本单价 · 毛利对比</small></div></div>
  </div></div>
  <div class="grp" id="grp-q"><div class="grp-h" onclick="toggleGrp('grp-q')">❓ 全流程串接问题澄清<span class="ar">▾</span></div><div class="items">
    <div class="it" data-q="tri" onclick="showQ('tri')"><span class="ic">✅</span><div>三模块·已澄清问题清单<small>样衣→报价→基础资料</small></div></div>
    <div class="it" data-doc="rev" onclick="showDoc('rev')"><span class="ic">📝</span><div>三模块·串流程修订说明<small>业务反馈落地记录</small></div></div>
    <div class="it" data-q="order" onclick="showQ('order')"><span class="ic">📋</span><div>订单串流程问题清单 v1.0<span class="tag-ok">已定稿</span><small>46 题 · 按推荐项确认</small></div></div>
    <div class="it" data-q="contract" onclick="showQ('contract')"><span class="ic">📋</span><div>合同串流程问题清单 v1.0<span class="tag-ok">已定稿</span><small>按推荐项确认</small></div></div>
    <div class="it" data-doc="mnq" onclick="showDoc('mnq')"><span class="ic">📋</span><div>门户串流程问题清单 v1.0<span class="tag-ok">已定稿</span><small>18 题 · 业务回填</small></div></div>
    <div class="it" data-doc="dzq" onclick="showDoc('dzq')"><span class="ic">📋</span><div>对账付款串流程问题清单 v1.0<span class="tag-ok">已定稿</span><small>21 题</small></div></div>
    <div class="it" data-doc="jsq" onclick="showDoc('jsq')"><span class="ic">📋</span><div>结算清单串流程问题清单 v1.0<span class="tag-ok">新增</span><small>21 题·6接缝</small></div></div>
    <div class="it" data-doc="qc" onclick="showDoc('qc')"><span class="ic">🗂️</span><div>全流程问题确认清单 v1.0<span class="tag-ok">总纲</span><small>56题·9主题归并</small></div></div>
    <div class="it" data-doc="dzq2" onclick="showDoc('dzq2')"><span class="ic">📋</span><div>对账付款·补充确认清单 v1.0<span class="tag-ok">已定稿</span><small>9 题 · 编号/账期等</small></div></div>
    <div class="it" data-doc="rev2" onclick="showDoc('rev2')"><span class="ic">📝</span><div>下游模块·业务反馈修订说明 v2<small>04/05/06 改动记录</small></div></div>
  </div></div>
</aside>
<div class="pf-main">
  <div class="scroll show" id="homeView"><div class="home">
    <div class="hero"><h1>📚 UI 设计稿与需求 · 问题清单 总览（8 模块全链路:基础→样衣→报价→订单→合同→门户→对账付款→结算）</h1>
    <p>把分散的 8 份模块设计稿(①基础资料 ②样衣 ③报价 ④订单 ⑤合同 ⑥供应商门户 ⑦对账付款 ⑧结算清单)(含各稿内置需求说明)与全流程串接问题澄清整合到这一个文件,方便连贯阅读。左侧两组导航:<b>📐 UI 设计稿</b> 按模块看界面与需求;<b>❓ 全流程串接问题澄清</b> 看各阶段串接的待确认问题。问题清单里每条都带 <span style="background:#EDF1F7;border:1px solid #D5DDE8;border-radius:12px;padding:1px 8px">🔗 UI 出处</span> 链接,点一下即跳到对应设计稿的具体分节。当前:订单 03 设计稿<b>已定版</b>(订单串流程问题清单<b>已按推荐项定稿</b>)、合同 04 <b>v1.3 已定稿</b>(合同串流程问题清单全部按推荐项确认、并已落地业务追加反馈)。</p>
    <div class="flow">①基础资料 ─┐ (工厂/供应商·客户/中间商/最终买家)
②样衣管理 ─┤
           ▼
③客户报价 Q- ─【一键导入】▶ ④订单 O-（已定版）─┬─▶ ⑤ 材料合同 HT-（v1.3 定稿）─▶ ⑥供应商门户 ─▶ ⑦对账/付款 ─▶ ⑧结算(成本利润)
   (材料/耗用从样衣带入)        (补 PO/尺码/币种/佣金)   └─▶ ⑤′加工合同 HT-（v1.3 定稿）─▶ 生产工厂</div>
    </div>
    <div class="sec-title">📐 UI 设计稿(分模块 · 内含各模块需求说明)</div>
    <div class="cards">
      <div class="card" onclick="showDoc('jc')"><div class="ct">📄 基础资料</div><div class="cd">工厂资料 + 客户资料(中间商/最终买家),含编辑页/列表页/导入向导/批量授权。下游单据的主数据来源。</div></div>
      <div class="card" onclick="showDoc('bj')"><div class="ct">📄 客户报价</div><div class="cd">从样衣导入材料明细,填单价/利润率/损耗,系统算合计;状态 草稿→已报价→客户调整→已成单。</div></div>
      <div class="card" onclick="showDoc('yg')"><div class="ct">📄 样衣管理</div><div class="cd">业务/版师/打样间协同,材料明细+实际耗用+4 附件;耗用是报价、订单的源头。</div></div>
      <div class="card" onclick="showDoc('dd')"><div class="ct">📦 订单 v1.0 <span style="color:var(--teal);font-size:11px">已定版</span></div><div class="cd">从报价一键导入,补 PO/尺码数量搭配、币种/佣金/生产工厂,按用料定额算采购量,向下生成合同。</div></div>
      <div class="card" onclick="showDoc('hc')"><div class="ct">📄 合同 v1.3 <span style="color:var(--teal);font-size:11px">已定稿</span></div><div class="cd">材料合同(原料/辅料购销)+ 生产加工合同(委托加工)+ 列表;含门户进度、审批、补料、电子章 PDF;按合同串流程推荐项定稿。</div></div>
      <div class="card" onclick="showDoc('mn')"><div class="ct">📱 供应商门户 v2.2 <span style="color:var(--teal);font-size:11px">已定稿</span></div><div class="cd">对外端(首期 H5):登录看自己合同 → 🔖盖章→📦发货→🧾对账→💵开票 顺序锁定;发货带合同收货地址、加工厂可见订单明细。</div></div>
      <div class="card" onclick="showDoc('dz')"><div class="ct">🧾 对账付款 v1.4 <span style="color:var(--teal);font-size:11px">已定稿</span></div><div class="cd">对账单(款号检索·一单多合同·批次锁价·主管二级审批)+ 付款申请(分批付款·水单·账期90/45)+ 无合同费用走空白对账单(费用明细 数量×单价=小计)、双入口并行、预付冲抵。</div></div>
      <div class="card" onclick="showDoc('js')"><div class="ct">📊 结算清单 v1.0 <span style="color:var(--rust);font-size:11px">新增</span></div><div class="cd">按款号汇总对账付款总货款(含税/不含税)+ 船务出货件数 → 自动算成本单价;财务填收汇金额+汇率 → 自动出结算金额/毛利/财务费7%/净利/保本汇率。</div></div>
    </div>
    <div class="sec-title">❓ 全流程串接问题澄清</div>
    <div class="cards">
      <div class="card" onclick="showQ('tri')"><div class="ct">✅ 三模块·已澄清问题清单</div><div class="cd">样衣↔报价↔基础资料 串接时的待确认问题(业务已逐条澄清,部分含业务答复)。每题带 UI 出处链接。</div></div>
      <div class="card" onclick="showDoc('rev')"><div class="ct">📝 三模块·串流程修订说明</div><div class="cd">三模块按业务反馈所做修订的落地记录(原文嵌入)。</div></div>
      <div class="card" onclick="showQ('order')"><div class="ct">📋 订单串流程问题清单 v1.0 <span style="color:var(--teal);font-size:11px">已定稿</span></div><div class="cd">订单接入三模块的 46 个待确认问题,全部按推荐项经业务确认(订单设计稿已定版),每题带推荐项与 UI 出处链接;可打开可填写版查看。</div></div>
      <div class="card" onclick="showQ('contract')"><div class="ct">📋 合同串流程问题清单 v1.0 <span style="color:var(--teal);font-size:11px">已定稿</span></div><div class="cd">合同接入订单/基础资料/样衣报价的问题(全部按推荐项经业务确认、已落盘进合同 v1.3),每题带 UI 出处链接。</div></div>
      <div class="card" onclick="showDoc('mnq')"><div class="ct">📋 门户串流程问题清单 v1.0 <span style="color:var(--teal);font-size:11px">已定稿</span></div><div class="cd">门户接入合同/订单的 18 题(账号·盖章·发货·对账·权限),业务已回填;每题带 📍出处直链 05/04 设计稿。</div></div>
      <div class="card" onclick="showDoc('dzq')"><div class="ct">📋 对账付款串流程问题清单 v1.0 <span style="color:var(--teal);font-size:11px">已定稿</span></div><div class="cd">对账付款接入门户/合同的 21 题(编号/对账组织/审批/发票账期/付款),业务已逐题答复。</div></div>
      <div class="card" onclick="showDoc('jsq')"><div class="ct">📋 结算清单串流程问题清单 v1.0 <span style="color:var(--rust);font-size:11px">新增</span></div><div class="cd">结算清单接入对账付款/船务/出口收入侧的 21 题,按 6 个跨模块接缝梳理(结算主键·数量错配分摊·无票计税·出口退税·收汇多汇率·结算锁定),待业务/财务拍板。</div></div>
      <div class="card" onclick="showDoc('qc')"><div class="ct">🗂️ 全流程问题确认清单 v1.0 <span style="color:var(--rust);font-size:11px">总纲·新增</span></div><div class="cd">把散落在 6 份模块清单的约170条业务规则,按 9 条全流程主题(编号体系/引用一致性/耗用损耗/价格成本/状态流转/审批权限/门户闭环/结算/迁移报表)归并为 56 题,弥补 UI 设计稿跨模块接缝的缺口,交业务一次确认。</div></div>
      <div class="card" onclick="showDoc('dzq2')"><div class="ct">📋 对账付款·补充确认清单 v1.0 <span style="color:var(--teal);font-size:11px">已定稿</span></div><div class="cd">收口编号统一(DZ-/FH-/PR-款号-序号)、账期90/45、二级审批等 9 题,业务已确认,06 已落地 v1.3。</div></div>
    </div>
  </div></div>
  <div class="scroll" id="qView"></div>
  <div class="frameWrap" id="frameWrap">
    <div class="fbar"><span class="crumb" id="fcrumb"></span>
      <button class="btn" id="backBtn" style="display:none;margin-left:auto" onclick="backToQ()">← 返回问题清单</button>
      <button class="btn btn-p" id="fsBtn" onclick="fullscreenDoc()">⤢ 新标签全屏打开</button>
    </div>
    <iframe id="doc" title="设计稿"></iframe>
  </div>
</div>
<script>
var DOCB64={};/*__DOCB64__*/
/*__QORDER__*/
/*__QCONTRACT__*/
var Q_TRI=/*__TRIJSON__*/;
var DOCMETA={jc:{name:'基础资料设计稿 v1.3'},bj:{name:'客户报价设计稿 v1.3'},yg:{name:'样衣管理设计稿 v1.3'},dd:{name:'订单设计稿 v1.0（已定版）'},hc:{name:'合同设计稿 v1.3（已定稿）'},rev:{name:'三模块·串流程修订说明'},ddq:{name:'订单串流程问题清单 v1.0(可填写版)'},hcq:{name:'合同串流程问题清单 v1.0(可填写版)'},mn:{name:'供应商门户设计稿 v2.2（已定稿）'},dz:{name:'对账付款设计稿 v1.4（已定稿）'},js:{name:'结算清单设计稿 v1.0'},mnq:{name:'门户串流程问题清单 v1.0(可填写版·已定稿)'},dzq:{name:'对账付款串流程问题清单 v1.0(可填写版·已定稿)'},jsq:{name:'结算清单串流程问题清单 v1.0(可填写版)'},qc:{name:'样衣系统·全流程问题确认清单 v1.0(总纲·可填写)'},dzq2:{name:'对账付款·补充确认清单 v1.0(可填写版·已定稿)'},rev2:{name:'下游模块·业务反馈修订说明 v2'}};
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
var blobCache={};
function blobUrl(key){if(blobCache[key])return blobCache[key];var b=DOCB64[key];if(!b)return '';var bin=atob(b);var bytes=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);var blob=new Blob([bytes],{type:'text/html'});var u=URL.createObjectURL(blob);blobCache[key]=u;return u;}
function clearActive(){var es=document.querySelectorAll('.pf-side .it');for(var i=0;i<es.length;i++)es[i].classList.remove('on');}
function setActive(sel){clearActive();var e=document.querySelector(sel);if(e)e.classList.add('on');}
function hideAll(){document.getElementById('homeView').classList.remove('show');document.getElementById('qView').classList.remove('show');document.getElementById('frameWrap').classList.remove('show');}
function showHome(){hideAll();document.getElementById('homeView').classList.add('show');clearActive();}
function toggleGrp(id){document.getElementById(id).classList.toggle('collapsed');}
var pendingScroll=null,backTarget=null,curDocKey=null;
function showDoc(key,scrollSel,fromQ){hideAll();document.getElementById('frameWrap').classList.add('show');
  if(document.querySelector('.it[data-doc="'+key+'"]'))setActive('.it[data-doc="'+key+'"]');else if(fromQ)setActive('.it[data-q="'+fromQ+'"]');else clearActive();
  document.getElementById('fcrumb').innerHTML='正在查看：<b>'+esc(DOCMETA[key]?DOCMETA[key].name:key)+'</b>'+(scrollSel?'　·　已定位到相关分节(高亮)':'');
  var bb=document.getElementById('backBtn');if(fromQ){bb.style.display='';backTarget=fromQ;}else{bb.style.display='none';backTarget=null;}
  curDocKey=key;pendingScroll=scrollSel||null;
  var f=document.getElementById('doc');var url=blobUrl(key);
  if(f.getAttribute('data-key')===key){doScroll();}
  else{f.setAttribute('data-key',key);f.onload=function(){doScroll();};f.src=url;}
}
function doScroll(){if(!pendingScroll)return;var sel=pendingScroll;pendingScroll=null;
  setTimeout(function(){try{var d=document.getElementById('doc').contentWindow.document;var t=d.querySelector(sel);if(!t)return;t.scrollIntoView({behavior:'smooth',block:'center'});
    var ob=t.style.background,oo=t.style.outline,ot=t.style.transition;t.style.transition='background .3s,outline .3s';t.style.background='#FFE9C7';t.style.outline='2px solid #D17A40';t.style.outlineOffset='3px';
    setTimeout(function(){t.style.background=ob;t.style.outline=oo;t.style.transition=ot;},1700);}catch(e){}},420);}
function backToQ(){if(backTarget)showQ(backTarget);else showHome();}
function fullscreenDoc(){if(curDocKey)window.open(blobUrl(curDocKey),'_blank');}

/* ---- 自动「UI 出处」超链接 ---- */
function uiChips(text){var t=text||'';var chips=[];var seen={};
  function add(mod,sel,label){var k=mod+sel;if(seen[k])return;seen[k]=1;chips.push({mod:mod,sel:sel,label:label});}
  if(/订单|大货总数|尺码数量搭配|生产工厂|采购量|用料核算|单件耗用|从报价导入|本订单|PO\s*[号合]/.test(t)){
    var s='#editor',l='订单·编辑页';
    if(/Excel|导入向导|弹窗|导入模板/.test(t)){s='#dlg';l='订单·Excel导入';}
    else if(/列表/.test(t)){s='#list';l='订单·列表页';}
    else if(/材料明细|品名|部位|附件列/.test(t)){s='[data-anno-label="分组·材料明细"]';l='订单·材料明细';}
    else if(/用料核算|采购量|损耗|整数进|拆分|分色|分码/.test(t)){s='[data-anno-label="分组·用料核算"]';l='订单·用料核算';}
    else if(/尺码|搭配|TOTAL|总搭配/.test(t)||/PO/.test(t)){s='[data-anno-label="分组·尺码数量搭配"]';l='订单·尺码搭配';}
    else if(/币种|佣金|生产工厂|关联报价|基础信息|交期|客户款号/.test(t)){s='[data-anno-label="分组·基础信息"]';l='订单·基础信息';}
    add('dd',s,l);
  }
  if(/合同|材料合同|加工合同|HT-|受托方|委托方|甲方|乙方|担保人|价格包含项|补料|落款|盖章|电子章|条款模板|合同条款|生成材料合同|生成加工合同|推送供应商|推送工厂|门户进度/.test(t)){
    var sc='#editor-mat',lc='合同·材料合同编辑';
    if(/补料/.test(t)){sc='#grp-hc-mtb';lc='合同·补料(材料合同)';}
    else if(/审批|引用禁删|已被.{0,3}引用|已被发货|禁删|禁改|快照|源订单|已生成合同|状态机|金额.{0,3}阈值/.test(t)){sc='#grp-hc-rule';lc='合同·业务规则';}
    else if(/门户|对账|发货|开票|推送|进度|状态回显|单据编号|时间戳|存证/.test(t)){sc='#grp-hc-flow';lc='合同·业务流/门户';}
    else if(/价格包含项|工缴|增值税|胶袋|纸箱/.test(t)){sc='#grp-hc-pprice';lc='合同·加工·价格包含项';}
    else if(/加工.{0,4}货物|加工单价|每件加工费/.test(t)){sc='#grp-hc-pgoods';lc='合同·加工·货物明细';}
    else if(/受托方|委托方代表|委托方/.test(t)){sc='#grp-hc-pbase';lc='合同·加工·基础信息';}
    else if(/落款|盖章|电子章|脱敏|生成\s*PDF/.test(t)){sc='#grp-hc-msign';lc='合同·落款盖章/PDF';}
    else if(/条款模板|合同条款|质量标准|账期|违约|模板|丙方担保|担保.{0,3}条款/.test(t)){sc='#grp-hc-mterms';lc='合同·条款模板';}
    else if(/关联款号|多选款号/.test(t)){sc='#grp-hc-mstyle';lc='合同·关联款号';}
    else if(/货物明细|分色|分码|照片列|数量.{0,3}来源|采购量.{0,3}合同/.test(t)){sc='#grp-hc-mgoods';lc='合同·材料·货物明细';}
    else if(/甲方|供方|乙方|担保人|身份证|材料合同.{0,3}基础/.test(t)){sc='#grp-hc-mbase';lc='合同·材料·基础信息';}
    else if(/列表|台账/.test(t)){sc='#grp-hc-list';lc='合同·列表页';}
    add('hc',sc,lc);
  }
  if(/客户报价|报价·|报价明细|报价单|报价耗用|含损金额|利润率|报价数量|报价件数|美金总计|转销售合同|导出\s*PDF|PDF报价/.test(t)){
    var s2='#editor',l2='客户报价·编辑页';
    if(/列表|美金总计|数量列/.test(t)){s2='#list';l2='客户报价·列表页';}
    else if(/概览|流程|下游|销售合同/.test(t)){s2='#overview';l2='客户报价·概览';}
    add('bj',s2,l2);
  }
  if(/样衣|实际耗用|版师|打样|样衣图稿|纸板|尺寸表|上轮/.test(t)){
    var s3='#editor-biz',l3='样衣·编辑(业务)';
    if(/列表/.test(t)){s3='#list';l3='样衣·列表页';}
    else if(/版师|纸板|制版|实际耗用/.test(t)){s3='#editor-pat';l3='样衣·编辑(版师)';}
    add('yg',s3,l3);
  }
  if(/基础资料|工厂资料|客户资料|工厂库|供应商库|加工厂|中间商|最终买家|客户编号|币种.*字典|汇率|结汇|本司主体/.test(t)){
    if(/工厂|供应商|加工厂|货代/.test(t)){add('jc','#dj-1-editor','基础资料·工厂资料');}
    if(/客户|中间商|最终买家|佣金|结汇|付款期限|收货/.test(t)){add('jc','#dj-2-editor','基础资料·客户资料');}
    if(/Excel|导入/.test(t)){add('jc','#dialog-import','基础资料·导入向导');}
    if(!seen['jc#dj-1-editor']&&!seen['jc#dj-2-editor']&&!seen['jc#dialog-import'])add('jc','#dj-1','基础资料');
  }
  return chips;
}
function chipHtml(chips,fromQ){if(!chips.length)return '';var h='<div class="chips"><span class="lbl">🔗 UI 出处:</span>';
  for(var i=0;i<chips.length;i++){var c=chips[i];h+='<span class="chip" data-mod="'+esc(c.mod)+'" data-sel="'+esc(c.sel)+'" data-from="'+esc(fromQ)+'">📍 '+esc(c.label)+'</span>';}
  return h+'</div>';}

function priClass(p){return p==='高'?'h':p==='中'?'m':'l';}
function renderQL(ARR,fromKey,headHtml,recBadge){var h='<div class="qwrap">'+headHtml;
  for(var si=0;si<ARR.length;si++){var S=ARR[si];
    h+='<div class="qsec"><div class="qsb"><span class="ql">'+esc(S.sec)+'</span><div><div class="qn">'+esc(S.name)+'</div>'+(S.summary?'<div class="qd">'+esc(S.summary)+'</div>':'')+'</div></div></div>';
    for(var qi=0;qi<S.qs.length;qi++){var q=S.qs[qi];var qid=S.sec+(qi+1);
      h+='<div class="qb"><div class="qt"><span class="qno">'+qid+'</span><span class="qpri '+priClass(q.pri)+'">'+esc(q.pri)+'</span><span class="qtt">'+esc(q.t)+'</span></div>';
      h+='<div class="qsc"><b>场景</b> '+esc(q.s)+'</div>';
      for(var oi=0;oi<q.o.length;oi++){var rec=(oi===q.rec);h+='<div class="opt'+(rec?' rec':'')+'">'+esc(q.o[oi])+(rec?'<span class="recb">'+(recBadge||'推荐')+'</span>':'')+'</div>';}
      if(q.ref)h+='<div class="qref">🔗 关联:'+esc(q.ref)+'</div>';
      h+=chipHtml(uiChips((q.ref||'')+' '+q.t+' '+(q.s||'')),fromKey);
      h+='</div>';
    }
  }
  return h+'</div>';}
var ORDER_HEAD='<div class="qhead teal"><h2>📋 订单串流程问题清单 v1.0 · 已定稿</h2><p>订单(03)接入前三模块的 46 个待确认问题,按衔接面分 5 段;<b>全部按推荐项经业务确认</b>。标 <span style="background:#fff;color:var(--teal);padding:1px 6px;border-radius:8px">推荐·已确认</span> 为采纳项。每题下方 🔗 UI 出处可跳到对应设计稿分节。</p></div><div class="note ok"><b>✅ 订单串流程问题清单 v1.0 全部按推荐项定稿</b>;订单 03 设计稿已业务认可、定版。点 <button class="btn" onclick="showDoc(\'ddq\',null,\'order\')">✍ 打开可填写版</button> 查看可作答/批注版。</div>';
var CONTRACT_HEAD='<div class="qhead teal"><h2>📋 合同串流程问题清单 v1.0 · 已定稿</h2><p>合同接入订单/基础资料/样衣报价的待确认问题,分 5 段;<b>全部按推荐项经业务确认</b>,已落盘进合同设计稿 v1.2。标 <span style="background:#fff;color:var(--teal);padding:1px 6px;border-radius:8px">推荐·已确认</span> 为采纳项。每题下方 🔗 UI 出处可跳到合同/订单/基础资料等设计稿分节。</p></div><div class="note ok"><b>✅ 合同串流程问题清单 v1.0 全部按推荐项定稿</b>,对应改动已写入 <span style="cursor:pointer;text-decoration:underline" onclick="showDoc(\'hc\',\'#grp-hc-decided\',\'contract\')">合同设计稿 v1.2 → ✅ 已确认决策</span>。点 <button class="btn" onclick="showDoc(\'hcq\',null,\'contract\')">✍ 打开可填写版</button> 查看可作答/批注版。</div>';
function renderTri(){var h='<div class="qwrap"><div class="qhead indigo"><h2>✅ 三模块·已澄清问题清单</h2><p>样衣管理 ↔ 客户报价 ↔ 基础资料 串接时的待确认问题。标 <span style="background:var(--teal);color:#fff;padding:1px 6px;border-radius:8px">推荐</span> 为我方建议,标 <span style="background:var(--rust);color:#fff;padding:1px 6px;border-radius:8px">业务答复</span> 为业务已填写的回复。每题带 🔗 UI 出处链接。</p></div>';
  for(var si=0;si<Q_TRI.length;si++){var S=Q_TRI[si];
    h+='<div class="qsec"><div class="qsb"><span class="ql">'+esc(S.sec)+'</span><div><div class="qn">'+esc(S.name)+'</div>'+(S.desc?'<div class="qd">'+esc(S.desc)+'</div>':'')+'</div></div></div>';
    for(var qi=0;qi<S.qs.length;qi++){var q=S.qs[qi];
      h+='<div class="qb"><div class="qt"><span class="qno">'+esc(q.qid)+'</span><span class="qtt">'+esc(q.title)+'</span></div>';
      if(q.scenario)h+='<div class="qsc">'+esc(q.scenario)+'</div>';
      for(var oi=0;oi<q.options.length;oi++){var o=q.options[oi];var cls=o.ans?' ans':(o.rec?' rec':'');var bdg=o.ans?'<span class="ansb">业务答复</span>':(o.rec?'<span class="recb">推荐</span>':'');h+='<div class="opt'+cls+'">'+esc(o.l)+bdg+'</div>';}
      var ct=q.title+' '+(q.scenario||'');for(var k=0;k<q.options.length;k++)ct+=' '+q.options[k].l;
      h+=chipHtml(uiChips(ct),'tri');
      h+='</div>';
    }
  }
  return h+'</div>';}
function showQ(which){hideAll();var v=document.getElementById('qView');v.classList.add('show');v.scrollTop=0;
  setActive('.it[data-q="'+which+'"]');
  if(which==='order')v.innerHTML=renderQL(Q_ORDER,'order',ORDER_HEAD,'推荐 · 已确认');
  else if(which==='contract')v.innerHTML=renderQL(Q_CONTRACT,'contract',CONTRACT_HEAD,'推荐 · 已确认');
  else v.innerHTML=renderTri();
}
document.getElementById('qView').addEventListener('click',function(e){var c=e.target.closest?e.target.closest('.chip'):null;if(!c)return;showDoc(c.getAttribute('data-mod'),c.getAttribute('data-sel'),c.getAttribute('data-from'));});
showHome();
</script>
</body></html>'''

docb64_js = ''.join("DOCB64['%s']='%s';\n" % (k, v) for k, v in b64docs.items())
out = TPL.replace('/*__DOCB64__*/', docb64_js)
out = out.replace('/*__QORDER__*/', qorder_js)
out = out.replace('/*__QCONTRACT__*/', qcontract_js)
out = out.replace('/*__TRIJSON__*/', tri_json)

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(out)

print("OK ->", OUT)
print("size KB:", round(len(out.encode('utf-8'))/1024, 1))
print("tri sections:", len(sections), "| tri questions:", sum(len(s['qs']) for s in sections))
print("order chars:", len(qorder_js), "| contract chars:", len(qcontract_js))
