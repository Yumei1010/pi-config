/**
 * 浏览器用量面板的前端（单文件 HTML，无外部依赖）
 *
 * 配色直接取自 commandcode.ai 网页端的深色主题变量（从它的 root CSS 里抓的）：
 *   --background #000 · --card #09090b · --muted #18181b · --secondary/--accent #27272a
 *   --border #222225 / --border-muted #232324 · --foreground #fafafa · --muted-foreground #a1a1aa
 *   --brand #556af3 · --brand-text #556af3 · --danger #d1242f · --warning #d1aa24 · --success #22c55e
 *
 * 页面从本机 pi 扩展起的服务拉数据：GET {base}/api/snapshot?days=N
 * 认证靠 URL 路径里的随机 token（`__TOKEN__` 占位符由服务端替换）。
 */

/** 生成面板 HTML；base 形如 `/d/<token>` */
export function dashboardHtml(base: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>用量面板 · Command Code & DeepSeek</title>
<style>
:root{
  --background:#000; --foreground:#fafafa; --card:#09090b; --popover:#09090b;
  --muted:#18181b; --muted-foreground:#a1a1aa; --secondary:#27272a; --accent:#27272a;
  --border:#222225; --border-muted:#232324; --input:#27272a; --ring:#d4d4d8;
  --primary:#fafafa; --primary-foreground:#18181b;
  --brand:#556af3; --brand-deep:#2e1b9c; --brand-text:#556af3;
  --danger:#d1242f; --warning:#d1aa24; --success:#22c55e; --info:#3b82f6;
  --radius:12px;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{
  background:var(--background); color:var(--foreground);
  font:14px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;
  -webkit-font-smoothing:antialiased;
}
a{color:var(--brand)}
.layout{display:grid;grid-template-columns:232px 1fr;min-height:100vh}
/* ── 侧栏 ── */
.sidebar{background:var(--muted);border-right:1px solid var(--border);padding:18px 14px;display:flex;flex-direction:column;gap:6px}
.brand{display:flex;align-items:center;gap:10px;padding:6px 8px 16px}
.brand-mark{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,var(--brand),var(--brand-deep));box-shadow:0 0 0 1px #ffffff14}
.brand-text{font-weight:600;letter-spacing:.2px}
.brand-sub{color:var(--muted-foreground);font-size:11px}
.nav-item{
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  padding:9px 11px;border-radius:9px;color:var(--muted-foreground);cursor:pointer;
  border:1px solid transparent;background:none;font:inherit;text-align:left;width:100%;
}
.nav-item:hover{background:var(--secondary);color:var(--foreground)}
.nav-item.active{background:var(--secondary);color:var(--foreground);border-color:var(--border)}
.nav-dot{width:7px;height:7px;border-radius:50%;background:var(--success)}
.nav-dot.warn{background:var(--warning)}
.nav-dot.err{background:var(--danger)}
.sidebar-foot{margin-top:auto;color:var(--muted-foreground);font-size:11px;line-height:1.7;padding:8px}
.sidebar-foot code{background:var(--secondary);padding:1px 5px;border-radius:5px;font-size:10.5px}
/* ── 主体 ── */
.main{padding:22px 26px 40px;min-width:0}
.topbar{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
h1{margin:0;font-size:22px;font-weight:600;letter-spacing:.2px}
.sub{color:var(--muted-foreground);font-size:12.5px;margin-top:4px}
.controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.seg{display:flex;background:var(--muted);border:1px solid var(--border);border-radius:9px;overflow:hidden}
.seg button{background:none;border:0;color:var(--muted-foreground);padding:7px 12px;font:inherit;cursor:pointer}
.seg button:hover{color:var(--foreground)}
.seg button.active{background:var(--secondary);color:var(--foreground)}
.btn{
  display:inline-flex;align-items:center;gap:6px;background:var(--primary);color:var(--primary-foreground);
  border:0;border-radius:9px;padding:8px 13px;font:inherit;font-weight:500;cursor:pointer;
}
.btn:hover{opacity:.9}
.btn.ghost{background:var(--muted);color:var(--foreground);border:1px solid var(--border)}
.section-title{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted-foreground);margin:22px 0 10px}
.grid{display:grid;gap:12px}
.kpis{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:15px 16px}
.kpi .label{color:var(--muted-foreground);font-size:12px}
.kpi .value{font-size:23px;font-weight:600;margin-top:6px;letter-spacing:.2px}
.kpi .foot{color:var(--muted-foreground);font-size:11.5px;margin-top:4px}
.two{grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)}
@media(max-width:860px){
  .layout{grid-template-columns:1fr}
  .sidebar{flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 14px;border-right:0;border-bottom:1px solid var(--border)}
  .brand{padding:0 4px 0 0}
  .brand-sub{display:none}
  .nav-item{width:auto;padding:7px 12px}
  .sidebar-foot{margin:0;padding:4px 0 0;width:100%}
  .two{grid-template-columns:1fr}
  .main{padding:18px 16px 32px}
}
.bars{display:flex;flex-direction:column;gap:12px}
.bar-row{display:flex;align-items:center;gap:12px}
.bar-label{width:52px;color:var(--muted-foreground);font-size:12px}
.bar-track{flex:1;height:7px;background:var(--secondary);border-radius:99px;overflow:hidden}
.bar-fill{height:100%;border-radius:99px}
.bar-value{min-width:196px;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;font-size:12.5px;color:var(--muted-foreground)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.table-wrap{overflow:auto;max-height:460px;border:1px solid var(--border);border-radius:var(--radius);background:var(--card)}
th,td{padding:9px 12px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--border-muted)}
th{position:sticky;top:0;background:var(--card);color:var(--muted-foreground);font-size:11px;text-transform:uppercase;letter-spacing:.06em;z-index:1}
tbody tr:hover{background:var(--muted)}
td.num,th.num{text-align:right}
.tag{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;padding:2px 8px;border-radius:99px;border:1px solid var(--border);color:var(--muted-foreground)}
.tag.ok{color:var(--success);border-color:#22c55e3d;background:#22c55e14}
.tag.fail{color:var(--danger);border-color:#d1242f3d;background:#d1242f14}
.mono{font-family:ui-monospace,SFMono-Regular,"JetBrains Mono",Menlo,monospace;font-size:12.5px}
.muted{color:var(--muted-foreground)}
.banner{border-radius:var(--radius);padding:12px 14px;margin-bottom:12px;border:1px solid var(--border);background:var(--muted);color:var(--muted-foreground);font-size:12.5px;line-height:1.75}
.banner.warn{border-color:#d1aa2459;background:#d1aa2414;color:#e8d199}
.banner.err{border-color:#d1242f59;background:#d1242f14;color:#f0a9ad}
.spark{display:block}
.empty{color:var(--muted-foreground);padding:16px;text-align:center;font-size:12.5px}
.hidden{display:none}
.plan-pill{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:99px;background:#556af31f;color:#a9b4ff;border:1px solid #556af34d;font-size:12px}
</style>
</head>
<body data-api="__BASE__">
<div class="layout">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark"></div>
      <div>
        <div class="brand-text">用量面板</div>
        <div class="brand-sub">Command Code · DeepSeek</div>
      </div>
    </div>
    <button class="nav-item active" data-tab="cc"><span>Command Code</span><span class="nav-dot" id="dot-cc"></span></button>
    <button class="nav-item" data-tab="ds"><span>DeepSeek 官方</span><span class="nav-dot" id="dot-ds"></span></button>
    <nav class="nav-item" id="go-cc-quota"><span>额度与套餐</span><span class="muted">↑</span></nav>
    <div class="sidebar-foot">
      数据来自 pi 扩展 <code>usage-dashboard</code><br>
      凭据：<code>command-code-cookie.txt</code><br>
      <code>auth.json</code> / <code>deepseek-platform-token.txt</code>
    </div>
  </aside>

  <main class="main">
    <div class="topbar">
      <div>
        <h1>用量</h1>
        <div class="sub" id="subtitle">正在加载…</div>
      </div>
      <div class="controls">
        <div class="seg" id="range">
          <button data-days="1">1 天</button>
          <button data-days="7" class="active">7 天</button>
          <button data-days="30">30 天</button>
        </div>
        <button class="btn ghost" id="refresh">刷新</button>
        <button class="btn ghost" id="auto">自动刷新：开</button>
      </div>
    </div>

    <div id="banners"></div>

    <!-- ── Command Code ── -->
    <section id="view-cc">
      <div class="grid kpis">
        <div class="card kpi"><div class="label">总 token</div><div class="value" id="cc-tokens">—</div><div class="foot" id="cc-tokens-foot">输入 / 输出</div></div>
        <div class="card kpi"><div class="label">总请求</div><div class="value" id="cc-runs">—</div><div class="foot" id="cc-runs-foot">成功 / 失败</div></div>
        <div class="card kpi"><div class="label">本期花费</div><div class="value" id="cc-cost">—</div><div class="foot" id="cc-cost-foot">平均每次</div></div>
        <div class="card kpi"><div class="label">成功率</div><div class="value" id="cc-success">—</div><div class="foot" id="cc-success-foot">计费周期内</div></div>
      </div>

      <div class="section-title" id="cc-quota-title">额度与套餐</div>
      <div class="grid two">
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <span class="plan-pill" id="cc-plan">—</span>
            <span class="muted" id="cc-remaining">—</span>
          </div>
          <div class="bars" style="margin-top:16px">
            <div class="bar-row"><div class="bar-label">5 小时</div><div class="bar-track"><div class="bar-fill" id="bar-5h" style="width:0"></div></div><div class="bar-value" id="val-5h">—</div></div>
            <div class="bar-row"><div class="bar-label">本周</div><div class="bar-track"><div class="bar-fill" id="bar-w" style="width:0"></div></div><div class="bar-value" id="val-w">—</div></div>
            <div class="bar-row"><div class="bar-label">本月</div><div class="bar-track"><div class="bar-fill" id="bar-m" style="width:0"></div></div><div class="bar-value" id="val-m">—</div></div>
          </div>
        </div>
        <div class="card">
          <div class="label muted" style="font-size:12px">调用频率（图表接口 · 每个时间桶的请求数）</div>
          <div id="cc-freq" style="margin-top:12px"></div>
        </div>
      </div>

      <div class="section-title">各模型用量</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>模型</th><th class="num">请求</th><th class="num">输入</th><th class="num">输出</th>
            <th class="num">总计</th><th class="num">花费</th><th class="num">缓存节省</th><th class="num">均耗时</th>
          </tr></thead>
          <tbody id="cc-models"><tr><td colspan="8" class="empty">加载中…</td></tr></tbody>
        </table>
      </div>

      <div class="section-title">最近调用明细 <span class="muted" id="cc-detail-note"></span></div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>时间</th><th>模型</th><th>状态</th><th class="num">输入</th><th class="num">输出</th><th class="num">耗时</th><th class="num">花费</th>
          </tr></thead>
          <tbody id="cc-recent"><tr><td colspan="7" class="empty">加载中…</td></tr></tbody>
        </table>
      </div>
    </section>

    <!-- ── DeepSeek ── -->
    <section id="view-ds" class="hidden">
      <div class="grid kpis">
        <div class="card kpi"><div class="label">账户余额</div><div class="value" id="ds-balance">—</div><div class="foot" id="ds-balance-foot">官方 /user/balance</div></div>
        <div class="card kpi"><div class="label">充值余额</div><div class="value" id="ds-topup">—</div><div class="foot">topped_up_balance</div></div>
        <div class="card kpi"><div class="label">赠送余额</div><div class="value" id="ds-granted">—</div><div class="foot">granted_balance</div></div>
        <div class="card kpi"><div class="label">平台用量窗口</div><div class="value" id="ds-window">—</div><div class="foot" id="ds-window-foot">需 userToken</div></div>
      </div>

      <div class="section-title">各模型用量（platform.deepseek.com）</div>
      <div id="ds-blocked"></div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>模型</th><th class="num">API Key</th><th class="num">请求</th><th class="num">缓存命中</th>
            <th class="num">缓存未命中</th><th class="num">输出</th><th class="num">总计 token</th><th class="num">费用</th>
          </tr></thead>
          <tbody id="ds-models"><tr><td colspan="8" class="empty">加载中…</td></tr></tbody>
        </table>
      </div>
    </section>
  </main>
</div>

<script>
const API = document.body.dataset.api;
let days = 7;
let auto = true;
let timer = null;

// ── 格式化 ──
function fmtCount(n){
  n = Number(n) || 0;
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return (n/1e3).toFixed(n < 1e4 ? 1 : 0) + 'k';
  if (n < 1e9) return (n/1e6).toFixed(n < 1e7 ? 2 : 1) + 'M';
  return (n/1e9).toFixed(2) + 'G';
}
function fmtMoney(n, cur){
  n = Number(n) || 0;
  const sym = cur === 'USD' ? '$' : cur === 'CNY' ? '¥' : '';
  if (!cur) return '$' + n.toFixed(n < 1 ? 4 : 2);
  return sym + n.toFixed(n < 1 ? 4 : 2);
}
function fmtMs(ms){ ms = Number(ms) || 0; return ms >= 1000 ? (ms/1000).toFixed(1) + 's' : Math.round(ms) + 'ms'; }
function fmtTime(ms){
  if (!ms) return '—';
  const d = new Date(ms), p = (x) => String(x).padStart(2, '0');
  return p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function fmtPct(v){ return v == null ? '—' : (v >= 10 ? Math.round(v) : v.toFixed(1)) + '%'; }
function barColor(p){
  if (p == null) return 'var(--muted-foreground)';
  return p > 90 ? 'var(--danger)' : p > 75 ? 'var(--warning)' : p > 50 ? '#a1a1aa' : 'var(--success)';
}
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function spark(values, width, height){
  if (!values || values.length === 0) return '';
  const max = Math.max.apply(null, values.concat([1]));
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => (i * step).toFixed(1) + ',' + (height - (v / max) * (height - 2) - 1).toFixed(1));
  const area = '0,' + height + ' ' + pts.join(' ') + ' ' + width + ',' + height;
  return '<svg class="spark" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">'
    + '<polygon fill="var(--brand)" fill-opacity="0.18" points="' + area + '"/>'
    + '<polyline fill="none" stroke="var(--brand-text)" stroke-width="1.5" points="' + pts.join(' ') + '"/>'
    + '</svg>';
}
function set(id, text){ const el = document.getElementById(id); if (el) el.textContent = text; }
function setHtml(id, html){ const el = document.getElementById(id); if (el) el.innerHTML = html; }
function dot(id, state){
  const el = document.getElementById(id);
  if (el) el.className = 'nav-dot' + (state === 'err' ? ' err' : state === 'warn' ? ' warn' : '');
}

// ── 渲染：Command Code ──
function renderCC(cc){
  const s = cc.summary;
  if (s){
    set('cc-tokens', fmtCount(s.tokens));
    set('cc-tokens-foot', '输入 ' + fmtCount(s.tokensIn) + ' / 输出 ' + fmtCount(s.tokensOut));
    set('cc-runs', String(s.totalCount));
    set('cc-runs-foot', '成功 ' + s.completedCount + ' / 失败 ' + s.failedCount);
    set('cc-cost', fmtMoney(s.totalCost, 'USD'));
    set('cc-cost-foot', '平均每次 ' + fmtMoney(s.averageCost, 'USD'));
    set('cc-success', fmtPct(s.successRate));
    set('cc-success-foot', '计费周期内（' + (cc.detailPages || 0) + ' 页明细）');
  }
  const q = cc.quota || {};
  set('cc-plan', '套餐 ' + (q.planLabel || '—') + (q.monthlyCap ? ' · $' + q.monthlyCap + '/月' : ''));
  set('cc-remaining', q.monthlyRemaining != null ? '本期剩余 $' + q.monthlyRemaining.toFixed(2) : '剩余额度未知');
  const bars = [['5h', q.fiveHour, q.fiveHourUsed, q.fiveHourCap], ['w', q.weekly, q.weeklyUsed, q.weeklyCap], ['m', q.monthly, null, null]];
  bars.forEach(function(b){
    const fill = document.getElementById('bar-' + b[0]);
    const p = b[1];
    if (fill){
      fill.style.width = (p == null ? 0 : Math.max(2, Math.min(100, p))) + '%';
      fill.style.background = barColor(p);
    }
    const windows = { '5h': '5 小时', 'w': '本周', 'm': '本月' };
    let text = windows[b[0]] + ' ' + fmtPct(p);
    if (b[2] != null && b[3] && b[2] > 0) text += '（$' + b[2].toFixed(2) + ' / $' + b[3].toFixed(2) + '）';
    if (b[0] === 'm' && q.monthlyRemaining != null && q.monthlyCap) text += '（已用 $' + (q.monthlyCap - q.monthlyRemaining).toFixed(2) + ' / $' + q.monthlyCap + '）';
    set('val-' + b[0], text);
  });

  // 频率
  const freq = cc.freq || [];
  setHtml('cc-freq', freq.length === 0
    ? '<div class="muted" style="font-size:12.5px">暂无数据</div>'
    : freq.map(function(r){
        return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'
          + '<div class="mono" style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.model) + '</div>'
          + '<div class="muted" style="font-size:12px;white-space:nowrap">' + r.requests + ' 次 · ' + Math.round(r.perHour) + '/h · 峰 ' + r.peak + '</div>'
          + '<div>' + spark(r.values, 130, 22) + '</div>'
          + '</div>';
      }).join(''));

  // 模型表
  const models = cc.models || [];
  setHtml('cc-models', models.length === 0
    ? '<tr><td colspan="8" class="empty">暂无数据</td></tr>'
    : models.map(function(m){
        return '<tr>'
          + '<td class="mono">' + esc(m.model) + '</td>'
          + '<td class="num">' + m.requests + (m.failed ? ' <span class="tag fail">' + m.failed + ' 失败</span>' : '') + '</td>'
          + '<td class="num">' + fmtCount(m.tokensIn) + '</td>'
          + '<td class="num">' + fmtCount(m.tokensOut) + '</td>'
          + '<td class="num">' + fmtCount(m.tokens) + '</td>'
          + '<td class="num">' + fmtMoney(m.cost, 'USD') + '</td>'
          + '<td class="num muted">' + (m.cacheSavings ? fmtMoney(m.cacheSavings, 'USD') : '—') + '</td>'
          + '<td class="num muted">' + (m.avgDurationMs ? fmtMs(m.avgDurationMs) : '—') + '</td>'
          + '</tr>';
      }).join(''));

  // 明细
  const recent = cc.recent || [];
  const span = cc.detailSpan ? fmtTime(cc.detailSpan.from) + ' → ' + fmtTime(cc.detailSpan.to) : '—';
  set('cc-detail-note', '（服务端上限 100 条 · 实际跨度 ' + span + '）');
  setHtml('cc-recent', recent.length === 0
    ? '<tr><td colspan="7" class="empty">暂无数据</td></tr>'
    : recent.map(function(r){
        const ok = !r.status || r.status === 'completed';
        return '<tr>'
          + '<td class="muted">' + fmtTime(r.createdAt) + '</td>'
          + '<td class="mono">' + esc(r.model) + '</td>'
          + '<td><span class="tag ' + (ok ? 'ok' : 'fail') + '">' + esc(r.status || 'completed') + '</span></td>'
          + '<td class="num">' + fmtCount(r.tokensIn) + '</td>'
          + '<td class="num">' + fmtCount(r.tokensOut) + '</td>'
          + '<td class="num muted">' + fmtMs(r.durationMs) + '</td>'
          + '<td class="num">' + fmtMoney(r.cost, 'USD') + '</td>'
          + '</tr>';
      }).join(''));
}

// ── 渲染：DeepSeek ──
function renderDS(ds){
  const b = ds.balance;
  if (b){
    set('ds-balance', fmtMoney(b.totalBalance, b.currency));
    set('ds-balance-foot', (b.isAvailable ? '账户可用' : '账户不可用') + ' · 官方 /user/balance');
    set('ds-topup', fmtMoney(b.toppedUpBalance, b.currency));
    set('ds-granted', fmtMoney(b.grantedBalance, b.currency));
  } else {
    set('ds-balance', '—'); set('ds-topup', '—'); set('ds-granted', '—');
  }

  const u = ds.usage;
  if (u){
    set('ds-window', days + ' 天');
    set('ds-window-foot', fmtTime(u.from * 1000) + ' → ' + fmtTime(u.to * 1000) + (u.bucket ? ' · ' + u.bucket : ''));
  } else {
    set('ds-window', '—');
    set('ds-window-foot', ds.configured && ds.configured.platform ? '接口不可用' : '需 userToken');
  }

  const rows = (u && u.rows) || [];
  setHtml('ds-models', rows.length === 0
    ? '<tr><td colspan="8" class="empty">' + (u ? '该时间范围内没有用量' : '未配置平台令牌，无法查询各模型用量') + '</td></tr>'
    : rows.map(function(r){
        return '<tr>'
          + '<td class="mono">' + esc(r.model) + '</td>'
          + '<td class="num">' + r.apiKeys + '</td>'
          + '<td class="num">' + r.requests + '</td>'
          + '<td class="num">' + fmtCount(r.promptCacheHitToken) + '</td>'
          + '<td class="num">' + fmtCount(r.promptCacheMissToken) + '</td>'
          + '<td class="num">' + fmtCount(r.responseToken) + '</td>'
          + '<td class="num">' + fmtCount(r.tokens) + '</td>'
          + '<td class="num">' + (r.cost ? fmtMoney(r.cost, r.currency) : '—') + '</td>'
          + '</tr>';
      }).join(''));
}

// ── 加载 ──
async function load(){
  set('subtitle', '正在加载…');
  try {
    const res = await fetch(API + '/api/snapshot?days=' + days, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderCC(data.commandcode || {});
    renderDS(data.deepseek || {});

    const warns = [];
    (data.commandcode && data.commandcode.warnings || []).forEach(function(w){ warns.push('Command Code：' + w); });
    (data.deepseek && data.deepseek.warnings || []).forEach(function(w){ warns.push('DeepSeek：' + w); });
    setHtml('banners', warns.length === 0 ? '' : warns.map(function(w){
      const err = /失败|未配置 DeepSeek API Key/.test(w);
      return '<div class="banner ' + (err ? 'err' : 'warn') + '">' + esc(w) + '</div>';
    }).join(''));
    dot('dot-cc', warns.some(function(w){ return /Command Code/.test(w); }) ? 'warn' : 'ok');
    dot('dot-ds', (data.deepseek && data.deepseek.balance) ? ((data.deepseek.usage) ? 'ok' : 'warn') : 'err');

    set('subtitle', '更新于 ' + fmtTime(data.fetchedAt) + ' · 数据源：Command Code 内部接口 + DeepSeek 官方接口');
  } catch (e){
    set('subtitle', '加载失败：' + (e && e.message ? e.message : e));
    setHtml('banners', '<div class="banner err">无法获取数据：' + esc(e && e.message ? e.message : e) + '</div>');
  }
}

function schedule(){
  if (timer) clearTimeout(timer);
  if (!auto) return;
  timer = setTimeout(function(){ load().then(schedule); }, 60000);
}

// ── 交互 ──
document.querySelectorAll('[data-days]').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('[data-days]').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    days = Number(btn.dataset.days);
    load().then(schedule);
  });
});
document.querySelectorAll('[data-tab]').forEach(function(btn){
  btn.addEventListener('click', function(){
    const tab = btn.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(function(b){ b.classList.toggle('active', b === btn); });
    document.getElementById('view-cc').classList.toggle('hidden', tab !== 'cc');
    document.getElementById('view-ds').classList.toggle('hidden', tab !== 'ds');
  });
});
const quotaNav = document.getElementById('go-cc-quota');
if (quotaNav) quotaNav.addEventListener('click', function(){
  document.querySelector('[data-tab="cc"]').click();
  const t = document.getElementById('cc-quota-title');
  if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
document.getElementById('refresh').addEventListener('click', function(){ load().then(schedule); });
document.getElementById('auto').addEventListener('click', function(e){
  auto = !auto;
  e.target.textContent = '自动刷新：' + (auto ? '开' : '关');
  schedule();
});

load().then(schedule);
</script>
</body>
</html>`.replace(/__BASE__/g, base);
}
