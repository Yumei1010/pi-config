/**
 * 浏览器用量面板的前端（单文件 HTML，无外部依赖）
 *
 * 视觉语言照着 commandcode.ai 的 usage 页面做，关键数值都是从它网页端的编译后 CSS /
 * SSR DOM 里抠出来的，不是凭感觉调的：
 *   --radius: 0px          整套直角系统（这是最大的观感差异）
 *   --spacing: .25rem      Tailwind 间距刻度（p-5 = 20px、px-4 = 16px、py-3 = 12px、gap-4 = 16px）
 *   --text-xs .75rem / --text-sm .875rem / --text-base 1rem / --text-2xl 1.5rem
 *   --tracking-wide .025em / --tracking-wider .05em
 *   主题：默认浅色（--background #fff / --foreground #09090b / --muted #f4f4f5 /
 *        --border #e4e4e7 / --muted-foreground #71717a），html.dark 覆盖为深色
 *        （--background #000 / --card #09090b / --muted #18181b / --border #222225 /
 *         --muted-foreground #a1a1aa）；语义色两套都备：brand #556af3 /
 *        danger #f85149(浅)·#d1242f(深) / success #16a34a(浅)·#22c55e(深)
 *   组件语言：`//` 前缀的小节标题、四角刻度方块（size-1.5/2 偏移 3px/4px）、
 *            等宽大写小标签、大号数值 + 小号单位、柱状迷你图（透明度 0.35→1 递进）、
 *            表头 uppercase tracking-wider + tbody divide-y divide-border
 *   字体：Geist / Geist Mono（由本机服务从 commandcode.ai 取回并缓存，取不到自动回退系统字体）
 *
 * 数据来自本机服务：GET {base}/api/snapshot?days=N（base 形如 /d/<token>）
 */

/** 生成面板 HTML；base 形如 `/d/<token>` */
export function dashboardHtml(base: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Usage · 用量面板</title>
<script>
// 默认浅色（白底黑字）；用户手动切过则沿用其选择（在首帧前执行，避免闪一下深色）
try { if (localStorage.getItem('usage-theme') === 'dark') document.documentElement.classList.add('dark'); } catch (e) {}
</script>
<style>
@font-face{font-family:Geist;font-style:normal;font-weight:100 900;font-display:swap;src:url(${base}/font/geist.woff2)format("woff2")}
@font-face{font-family:"Geist Mono";font-style:normal;font-weight:100 900;font-display:swap;src:url(${base}/font/geist-mono.woff2)format("woff2")}
/* 浅色为默认（白底黑字）；深色由 html.dark 覆盖。两套变量都取自参考站点的 .light / .dark */
:root{
  /* 页面用 #fafafa、卡片纯白，浅色下才有层次；文字灰阶分"小标签"与"脚注"两档 */
  --background:#fafafa; --foreground:#09090b; --card:#fff;
  --muted:#f4f4f5; --secondary:#f4f4f5;
  --muted-foreground:#52525b; --text-faint:#71717a;
  --border:#e4e4e7; --border-muted:#eaeaec; --border-strong:#d4d4d8;
  --track:#ededf0; --shadow:0 1px 2px rgba(0,0,0,.04);
  --sidebar:#fafafa; --sidebar-accent:#f4f4f5; --sidebar-border:#e5e7eb;
  --brand:#556af3; --brand-soft:#556af31a;
  --danger:#f85149; --danger-text:#b91c1c; --warning:#d1aa24; --warning-text:#b45309;
  --success:#16a34a; --success-text:#15803d;
  --warn-fg:#92400e; --warn-bg:#fffbeb; --warn-border:#fcd34d;
  --err-fg:#b91c1c; --err-bg:#fef2f2; --err-border:#fca5a5;
  --hot-fg:#b91c1c; --bar:#71717a;
  --radius:0px; --spacing:.25rem;
  --font-sans:Geist,"Geist Fallback",ui-sans-serif,system-ui,"Segoe UI",sans-serif;
  --font-mono:"Geist Mono","Cascadia Code",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
html.dark{
  --background:#000; --foreground:#fafafa; --card:#09090b;
  --muted:#18181b; --secondary:#27272a;
  --muted-foreground:#a1a1aa; --text-faint:#71717a;
  --border:#222225; --border-muted:#232324; --border-strong:#2f2f33;
  --track:#27272a; --shadow:none;
  --sidebar:#18181b; --sidebar-accent:#27272a; --sidebar-border:#27272a;
  --brand:#556af3; --brand-soft:#556af31f;
  --danger:#d1242f; --danger-text:#f87171; --warning:#d1aa24; --warning-text:#d1aa24;
  --success:#22c55e; --success-text:#22c55e;
  --warn-fg:#e6d29a; --warn-bg:#d1aa240f; --warn-border:#d1aa2459;
  --err-fg:#efa6aa; --err-bg:#d1242f0f; --err-border:#d1242f59;
  --hot-fg:#f87171; --bar:#a1a1aa;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{
  background:var(--background);color:var(--foreground);
  font-family:var(--font-sans);font-size:var(--text-base,1rem);line-height:1.5;
  -webkit-font-smoothing:antialiased;
}
.mono{font-family:var(--font-mono);font-feature-settings:"ss02","ss03"}
.muted{color:var(--muted-foreground)}
.num{font-variant-numeric:tabular-nums}
a{color:var(--brand)}

/* ── 布局 ── */
.layout{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:100vh}
.sidebar{background:var(--sidebar);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:8px;gap:8px;position:sticky;top:0;align-self:start;height:100vh;overflow:auto}
.brand{height:64px;display:flex;align-items:center;gap:10px;padding:0 16px}
.brand-mark{width:26px;height:26px;border:1px solid var(--border);background:var(--sidebar-accent);display:grid;place-items:center;color:var(--brand)}
.brand-name{font-size:.9375rem;font-weight:600;letter-spacing:-.01em}
.nav{display:flex;flex-direction:column;gap:8px;padding:8px}
.nav-item{
  display:flex;align-items:center;gap:10px;width:100%;padding:8px;border:1px solid transparent;
  background:none;color:var(--muted-foreground);font:600 .875rem/1.5 var(--font-sans);text-align:left;cursor:pointer;
}
.nav-item > span:first-of-type{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav-item:hover{background:var(--sidebar-accent);color:var(--foreground)}
.nav-item.active{background:var(--sidebar-accent);border-color:var(--border);color:var(--foreground)}
.nav-state{font:400 .6875rem var(--font-mono);color:var(--muted-foreground);white-space:nowrap}
.nav-item.active .nav-state{color:var(--foreground);opacity:.75}
.nav-spacer{flex:0 0 auto;display:flex;align-items:center;gap:6px}
.dot{width:6px;height:6px;background:var(--success)}
.dot.warn{background:var(--warning)}
.dot.err{background:var(--danger)}
.side-foot{margin-top:auto;padding:8px 12px;border-top:1px solid var(--border-muted);color:var(--text-faint);font-size:.6875rem;line-height:1.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.side-foot code{font-family:var(--font-mono);font-size:.625rem;color:var(--foreground);background:var(--secondary);padding:1px 4px}

.main{display:flex;flex-direction:column;min-width:0}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:20px 24px;border-bottom:1px solid var(--border)}
.topbar h1{margin:0;font-size:1.625rem;font-weight:600;letter-spacing:-.02em;line-height:1.3}
.topbar .sub{color:var(--muted-foreground);font-size:.75rem;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:600px}
.controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.content{padding:28px 24px 40px}
.content-inner{max-width:1600px;margin:0 auto}

/* ── 分段按钮 / 普通按钮（直角） ── */
.seg{display:flex}
.seg button{
  height:36px;padding:0 12px;border:1px solid var(--border);border-left:0;background:var(--background);
  color:var(--muted-foreground);font:500 .75rem var(--font-mono);text-transform:uppercase;letter-spacing:.05em;cursor:pointer;
  font-feature-settings:"ss02","ss03";
}
.seg button:first-child{border-left:1px solid var(--border)}
.seg button:hover{color:var(--foreground);background:var(--muted)}
.seg button.active{background:var(--secondary);border-color:var(--border-strong);color:var(--foreground);font-weight:600}
.seg[data-disabled="1"]{opacity:.3;filter:grayscale(1)}
.seg[data-disabled="1"] button{cursor:not-allowed}
.btn{
  height:36px;display:inline-flex;align-items:center;gap:8px;padding:0 12px;border:1px solid var(--border);
  background:var(--background);color:var(--foreground);font:500 .75rem var(--font-mono);text-transform:uppercase;
  letter-spacing:.05em;cursor:pointer;
}
.btn:hover{background:var(--muted)}
.btn.primary{background:var(--secondary);color:var(--foreground);border-color:var(--border)}
.btn.quiet{color:var(--muted-foreground)}
.btn.quiet.on{color:var(--foreground)}

/* ── 小节 ── */
.section{margin-bottom:48px}
.section-h{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}
.section-h h2{margin:0;font-size:1rem;font-weight:600;line-height:1.75rem;display:flex;align-items:center;gap:8px}
.section-h h2 .slash{color:var(--muted-foreground);opacity:.6;letter-spacing:-.2em}
.section-h .meta{display:flex;align-items:center;gap:8px;color:var(--muted-foreground);font:400 .75rem var(--font-mono)}
.pill{display:inline-block;padding:3px 8px;border:1px solid var(--border);font:500 .6875rem var(--font-mono);color:var(--foreground)}
.pill.hot{border-color:var(--danger);background:var(--err-bg);color:var(--hot-fg)}

/* ── 卡片：直角 + 四角刻度 ── */
.card{position:relative;background:var(--card);border:1px solid var(--border);box-shadow:var(--shadow);padding:16px 20px}
.card.fill{background:var(--muted)}
.tick{position:absolute;z-index:10;background:var(--muted);border:1px solid var(--border);width:6px;height:6px}
.tick.tl{top:0;left:0;transform:translate(-5px,-5px)}
.tick.tr{top:0;right:0;transform:translate(5px,-5px)}
.tick.bl{bottom:0;left:0;transform:translate(-5px,5px)}
.tick.br{bottom:0;right:0;transform:translate(5px,5px)}
.card.big .tick{width:8px;height:8px}
.card.big .tick.tl{transform:translate(-4px,-4px)}
.card.big .tick.tr{transform:translate(4px,-4px)}
.card.big .tick.bl{transform:translate(-4px,4px)}
.card.big .tick.br{transform:translate(4px,4px)}

.grid{display:grid;gap:20px}
.kpis{grid-template-columns:repeat(auto-fit,minmax(240px,1fr));align-items:stretch}
.split{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);align-items:stretch}
@media(max-width:1080px){.split{grid-template-columns:minmax(0,1fr)}}
@media(max-width:860px){
  .layout{grid-template-columns:minmax(0,1fr);height:auto}
  .sidebar{border-right:0;border-bottom:1px solid var(--border);flex-direction:row;flex-wrap:wrap;align-items:center}
  .brand{height:auto;padding:8px 12px}
  .nav{flex-direction:row;padding:4px;gap:4px}
  .nav-item{width:auto}
  .side-foot{display:none}
}

/* ── 指标卡 ── */
.kpi-label{display:flex;align-items:center;gap:8px;font:400 .75rem var(--font-mono);text-transform:uppercase;letter-spacing:.025em;color:var(--muted-foreground)}
.kpi-label svg{width:16px;height:16px;color:var(--muted-foreground);stroke-width:1.5}
.kpi-value{display:flex;align-items:baseline;gap:6px;margin:10px 0 14px}
.kpi-value b{font-variant-numeric:tabular-nums;font-size:1.75rem;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.kpi-value span{font-size:.8125rem;color:var(--text-faint)}
.kpi-note{margin-top:auto;font:400 .6875rem var(--font-mono);color:var(--text-faint)}
.bars{margin-top:auto;display:flex;align-items:flex-end;gap:2px;height:26px;border-bottom:1px solid var(--border-muted);padding-bottom:1px}
.bars i{flex:1;min-width:2px;background:var(--bar);display:block}
.bars i.hi{background:var(--brand)}
.meter{margin-top:auto;height:6px;background:var(--track);border:1px solid var(--border)}
.meter i{display:block;height:100%}
.kpi-value b.soft{font-size:1rem;font-weight:500;color:var(--muted-foreground)}

/* ── 额度条 ── */
.limits{display:flex;flex-direction:column;justify-content:space-between;gap:24px;flex:1}
.limit-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:12px}
.limit-top .name{font:400 .75rem var(--font-mono);text-transform:uppercase;letter-spacing:.025em;color:var(--muted-foreground)}
.limit-top .val{font:400 .75rem var(--font-mono);color:var(--text-faint);font-feature-settings:"ss02","ss03"}
.limit-top .val b{font-weight:600;color:var(--foreground)}
.limit-top .val b.hot{color:var(--danger-text)}
.limit.hot{background:var(--err-bg);border-left:2px solid var(--danger);padding-left:8px}
.track{height:6px;background:var(--track);border:1px solid var(--border);position:relative}
.track i{display:block;height:100%}
.limit-foot{margin-top:6px;font:400 .6875rem var(--font-mono);color:var(--muted-foreground)}

/* ── 表格 ── */
.table-wrap{overflow-x:auto;max-height:520px;overflow-y:auto}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
thead th{
  position:sticky;top:0;background:var(--card);padding:11px 16px;text-align:left;
  font:500 .75rem var(--font-sans);text-transform:uppercase;letter-spacing:.05em;color:var(--muted-foreground);
  border-bottom:1px solid var(--border-strong);white-space:nowrap;
}
thead th.r, tbody td.r{width:104px}
thead th.r{text-align:right}
tbody td{padding:11px 16px;font-size:.875rem;border-top:1px solid var(--border-muted);white-space:nowrap}
tbody td.r{text-align:right;font-variant-numeric:tabular-nums}
tbody tr:hover td{background:var(--muted)}
tbody td.model{font-family:var(--font-mono);font-size:.8125rem;max-width:280px;overflow:hidden;text-overflow:ellipsis}
.badge{display:inline-block;padding:2px 6px;border:1px solid var(--border);font:500 .6875rem var(--font-mono);text-transform:uppercase;letter-spacing:.05em;color:var(--muted-foreground)}
.badge.ok{color:var(--success-text);border-color:currentColor}
.badge.fail{color:var(--danger-text);border-color:currentColor}
.empty{padding:16px;color:var(--muted-foreground);font-size:.8125rem}
.empty-row td{background:none}
.empty-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.btn-link{background:none;border:0;padding:0;color:var(--warn-fg);font:400 .75rem var(--font-mono);cursor:pointer;text-decoration:underline;text-underline-offset:3px}

/* ── 频率柱状图行 ── */
.freq-row{display:flex;align-items:center;gap:16px;padding:10px 0;border-top:1px solid var(--border-muted)}
.freq-row:first-child{border-top:0}
.freq-name{font-family:var(--font-mono);font-size:.8125rem;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.freq-meta{font:400 .6875rem var(--font-mono);color:var(--muted-foreground);white-space:nowrap}
.freq-bars{display:flex;align-items:flex-end;gap:2px;height:22px;width:180px;flex:none}
.freq-bars i{flex:1;min-width:1px;background:var(--brand);opacity:.85;display:block}

/* ── 提示 ── */
.banner{position:relative;border:1px solid var(--border);background:var(--muted);padding:12px 16px;margin-bottom:16px;font-size:.8125rem;color:var(--muted-foreground);line-height:1.7;overflow-wrap:anywhere}
.banner b{color:var(--foreground);font-weight:600}
.banner .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px}
.banner .path{font-family:var(--font-mono);font-size:.6875rem;color:var(--foreground);word-break:break-all}
.banner-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.banner-title{font-weight:600}
.banner-more{margin-top:8px;padding-top:8px;border-top:1px solid var(--border)}
.table-wrap.empty-mode thead{display:none}
.table-wrap.empty-mode .empty-actions{justify-content:center;padding:44px 0}
.banner.warn{border-color:var(--warn-border);background:var(--warn-bg);color:var(--warn-fg)}
.banner.err{border-color:var(--err-border);background:var(--err-bg);color:var(--err-fg)}
.banner .banner-title{color:inherit}
.banner code{font-family:var(--font-mono);font-size:.75rem;color:var(--foreground)}
.skeleton{background:var(--muted);animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}
.hidden{display:none}
</style>
</head>
<body data-api="${base}">
<div class="layout">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 18V6h3l5 8 5-8h3v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/>
        </svg>
      </div>
      <div>
        <div class="brand-name">Usage</div>
        <div class="muted" style="font-size:.6875rem;font-family:var(--font-mono)">CC · DeepSeek</div>
      </div>
    </div>
    <nav class="nav">
      <button class="nav-item active" data-tab="cc">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" stroke="currentColor" stroke-linecap="square"/><path d="M8 12h8M12 8v8" stroke="currentColor" stroke-linecap="square"/></svg>
        <span>Command Code</span><span class="nav-spacer"><span class="nav-state" id="state-cc">—</span><i class="dot" id="dot-cc" title="Command Code 数据状态"></i></span>
      </button>
      <button class="nav-item" data-tab="ds">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-linecap="square"/><path d="M12 7.5v9M9 10.5h4.5a1.5 1.5 0 0 1 0 3H9" stroke="currentColor" stroke-linecap="square"/></svg>
        <span>DeepSeek 官方</span><span class="nav-spacer"><span class="nav-state" id="state-ds">—</span><i class="dot" id="dot-ds" title="DeepSeek 数据状态"></i></span>
      </button>
    </nav>
    <div class="side-foot" title="Command Code cookie + DeepSeek API key / userToken">数据源 · CC cookie + DeepSeek key</div>
  </aside>

  <div class="main">
    <div class="topbar">
      <div>
        <h1>Usage</h1>
        <div class="sub" id="subtitle">正在加载…</div>
      </div>
      <div class="controls">
        <div class="seg" id="range">
          <button data-days="1">1D</button>
          <button data-days="7" class="active">7D</button>
          <button data-days="30">30D</button>
        </div>
        <button class="btn" id="theme" title="切换深浅色">◐</button>
        <button class="btn" id="auto">AUTO ◉</button>
        <button class="btn primary" id="refresh">刷新</button>
      </div>
    </div>

    <div class="content">
      <div class="content-inner">
      <div id="banners"></div>

      <!-- ── Command Code ── -->
      <section id="view-cc">
        <div class="section">
          <div class="section-h">
            <h2><span class="slash">//</span>Overview</h2>
            <div class="meta" id="cc-overview-meta"></div>
          </div>
          <div class="grid kpis" id="cc-kpis"></div>
        </div>

        <div class="section">
          <div class="section-h">
            <h2><span class="slash">//</span>Usage Limits</h2>
            <div class="meta" id="cc-plan"></div>
          </div>
          <div class="grid split">
            <div class="card big">
              <div class="tick tl"></div><div class="tick tr"></div><div class="tick bl"></div><div class="tick br"></div>
              <div class="kpi-label">Window limits</div>
              <div class="limits" id="cc-limits" style="margin-top:16px"></div>
            </div>
            <div class="card big">
              <div class="tick tl"></div><div class="tick tr"></div><div class="tick bl"></div><div class="tick br"></div>
              <div class="kpi-label">Request rate</div>
              <div id="cc-freq" style="margin-top:8px"></div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-h">
            <h2><span class="slash">//</span>Models</h2>
            <div class="meta" id="cc-models-meta"></div>
          </div>
          <div class="card big" style="padding:0">
            <div class="tick tl"></div><div class="tick tr"></div><div class="tick bl"></div><div class="tick br"></div>
            <div class="table-wrap">
              <table>
                <thead><tr>
                  <th>Model</th><th class="r">Runs</th><th class="r">Input</th><th class="r">Output</th>
                  <th class="r">Total</th><th class="r">Cost</th><th class="r">Cache saved</th><th class="r">Avg time</th>
                </tr></thead>
                <tbody id="cc-models"></tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-h">
            <h2><span class="slash">//</span>Recent runs</h2>
            <div class="meta" id="cc-recent-meta"></div>
          </div>
          <div class="card big" style="padding:0">
            <div class="tick tl"></div><div class="tick tr"></div><div class="tick bl"></div><div class="tick br"></div>
            <div class="table-wrap">
              <table>
                <thead><tr>
                  <th>Time</th><th>Model</th><th>Status</th><th class="r">Input</th><th class="r">Output</th><th class="r">Timing</th><th class="r">Cost</th>
                </tr></thead>
                <tbody id="cc-recent"></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <!-- ── DeepSeek ── -->
      <section id="view-ds" class="hidden">
        <div class="section">
          <div class="section-h">
            <h2><span class="slash">//</span>Balance</h2>
            <div class="meta" id="ds-meta"></div>
          </div>
          <div class="grid kpis" id="ds-kpis"></div>
        </div>
        <div class="section">
          <div class="section-h">
            <h2><span class="slash">//</span>Model usage</h2>
            <div class="meta" id="ds-usage-meta"></div>
          </div>
          <div class="card big" style="padding:0">
            <div class="tick tl"></div><div class="tick tr"></div><div class="tick bl"></div><div class="tick br"></div>
            <div class="table-wrap" id="ds-table-wrap">
              <table>
                <thead><tr>
                  <th>Model</th><th class="r">Key 数</th><th class="r">请求</th><th class="r">缓存命中</th>
                  <th class="r">缓存未命中</th><th class="r">输出</th><th class="r">总 token</th><th class="r">费用</th>
                </tr></thead>
                <tbody id="ds-models"></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  </div>
</div>

<script>
const API = document.body.dataset.api;
let days = 7, auto = true, timer = null;

function fmtCount(n){
  n = Number(n) || 0;
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return (n/1e3).toFixed(n < 1e4 ? 1 : 0) + 'K';
  if (n < 1e9) return (n/1e6).toFixed(n < 1e7 ? 2 : 1) + 'M';
  return (n/1e9).toFixed(2) + 'B';
}
function fmtBalance(n, cur){
  n = Number(n) || 0;
  return (cur === 'CNY' ? '¥' : '$') + n.toFixed(2);
}
function fmtCost(n, cur){
  n = Number(n) || 0;
  // 单次花费可能只有零点几美分，<0.01 时才给 4 位小数
  const digits = n !== 0 && Math.abs(n) < 0.01 ? 4 : 2;
  return (cur === 'CNY' ? '¥' : '$') + n.toFixed(digits);
}
function fmtMs(ms){ ms = Number(ms) || 0; return ms >= 1000 ? (ms/1000).toFixed(1) + 's' : Math.round(ms) + 'ms'; }
function fmtTime(ms){
  const d = new Date(Number(ms) || 0), p = (x) => String(x).padStart(2, '0');
  return p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function fmtPct(v){ return v == null ? '—' : Number(v).toFixed(1) + '%'; }
function fmtInt(n){ return (Number(n) || 0).toLocaleString('en-US'); }
function fmtMoney2(n){ return '$' + (Number(n) || 0).toFixed(2); }
function secColor(p){ return p == null ? 'var(--muted-foreground)' : p > 90 ? 'var(--danger)' : p > 75 ? 'var(--warning)' : p > 50 ? '#a1a1aa' : 'var(--success)'; }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// 柱状迷你图：与参考页同款——高度按比例，透明度自下而上 0.35 → 1
function bars(values, highlightLast){
  if (!values || values.length === 0) return '';
  const max = Math.max.apply(null, values.concat([1]));
  return values.map(function(v, i){
    const h = Math.max(8, Math.round((v / max) * 100));      // 最低 8% ≈ 2px，避免零值柱消失
    const op = (0.5 + (0.5 * (i / Math.max(1, values.length - 1)))).toFixed(2);
    const hi = highlightLast && i >= values.length - 3;
    return '<i class="' + (hi ? 'hi' : '') + '" style="height:' + h + '%;opacity:' + op + '"></i>';
  }).join('');
}

function kpiCard(icon, label, value, unit, series, sub, opts){
  const o = opts || {};
  const foot = (series && series.length)
    ? '<div class="bars">' + bars(series, true) + '</div>'
    : (o.meter != null
        ? '<div class="meter"><i style="width:' + Math.max(1, Math.min(100, o.meter)) + '%;background:' + (o.meterColor || 'var(--success)') + '"></i></div>'
        : '');
  return '<div class="card">'
    + '<div class="tick tl"></div><div class="tick tr"></div><div class="tick bl"></div><div class="tick br"></div>'
    + '<div class="kpi-label">' + icon + '<span>' + esc(label) + '</span></div>'
    + '<div class="kpi-value"><b class="num' + (o.soft ? ' soft' : '') + '">' + esc(value) + '</b>' + (unit ? '<span>' + esc(unit) + '</span>' : '') + '</div>'
    + foot
    + (sub ? '<div class="kpi-note">' + esc(sub) + '</div>' : '')
    + '</div>';
}
const ICONS = {
  tokens: '<svg viewBox="0 0 24 24" fill="none"><path d="M12.5 6.85h-1L10.25 10.1 7 11.35v1l3.25 1.25 1.25 3.25h1l1.25-3.25L17 12.35v-1l-3.25-1.25z" stroke="currentColor" stroke-linecap="square"/><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-linecap="square"/></svg>',
  runs: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-linecap="square"/></svg>',
  cost: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.5" width="17" height="15" stroke="currentColor" stroke-linecap="square"/><path d="M8 9.5h8M8 14.5h5" stroke="currentColor" stroke-linecap="square"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2.5 21.5 6v5.9c0 5-4.5 7.6-9.5 9.6-5-2-9.5-4.6-9.5-9.6V6z" stroke="currentColor" stroke-linecap="square"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-linecap="square"/><path d="M12 6.5V12l4 2.5" stroke="currentColor" stroke-linecap="square"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6.5" width="18" height="12" stroke="currentColor" stroke-linecap="square"/><path d="M3 10.5h18" stroke="currentColor" stroke-linecap="square"/></svg>',
};

function emptyRow(cols, text, action){
  // 用 data-goto + 事件委托，避免内联 onclick（模板字符串里转义引号极易踩坑）
  return '<tr class="empty-row"><td colspan="' + cols + '"><div class="empty-actions">'
    + '<span>' + esc(text) + '</span>'
    + (action ? '<button class="btn-link" data-goto="banners">' + esc(action) + '</button>' : '')
    + '</div></td></tr>';
}

function set(id, v){ const el = document.getElementById(id); if (el) el.textContent = v; }
function setHtml(id, v){ const el = document.getElementById(id); if (el) el.innerHTML = v; }
function dot(id, state){ const el = document.getElementById(id); if (el) el.className = 'dot' + (state === 'err' ? ' err' : state === 'warn' ? ' warn' : ''); }

function renderCC(cc){
  const s = cc.summary || {};
  const freq = cc.freq || [];
  // 时间桶宽度（图表接口不直接给，用窗口跨度 / 桶数推算），用于解释「峰值/桶」
  const bucketMinutes = (cc.chartWindow && freq.length && freq[0].values.length)
    ? Math.max(1, Math.round((cc.chartWindow.to - cc.chartWindow.from) / 60000 / freq[0].values.length))
    : null;
  const sr = cc.series || { requests: [], tokens: [], cost: [] };

  setHtml('cc-kpis',
    kpiCard(ICONS.tokens, 'Total Tokens', fmtCount(s.tokens), '', sr.tokens,
      s.tokens ? '输入 ' + fmtCount(s.tokensIn) + ' · 输出 ' + fmtCount(s.tokensOut) : '')
    + kpiCard(ICONS.runs, 'Total Runs', fmtInt(s.totalCount), '', sr.requests,
        s.totalCount ? '完成 ' + fmtInt(s.completedCount) + ' · 失败 ' + fmtInt(s.failedCount) : '')
    + kpiCard(ICONS.cost, 'Total Cost', fmtCost(s.totalCost, 'USD'), '', sr.cost,
        '平均 ' + fmtCost(s.averageCost, 'USD') + ' / 次')
    + kpiCard(ICONS.ok, 'Success Rate', fmtPct(s.successRate), '', null,
        '完成 ' + fmtInt(s.completedCount) + ' · 失败 ' + fmtInt(s.failedCount),
        { meter: s.successRate }));

  const q = cc.quota || {};
  const low = q.monthlyRemaining != null && q.monthlyCap > 0 && q.monthlyRemaining <= q.monthlyCap * 0.1;
  setHtml('cc-plan',
    '<span class="muted mono" style="font-size:.6875rem">' + esc(q.planLabel || '—')
      + (q.monthlyCap ? ' · $' + q.monthlyCap + '/月' : '') + '</span>'
    + (q.monthlyRemaining != null
        ? '<span class="pill' + (low ? ' hot' : '') + '">本月 ' + fmtPct(q.monthly)
            + ' · 剩余 ' + fmtMoney2(q.monthlyRemaining) + '</span>'
        : ''));
  set('cc-overview-meta', cc.chartWindow ? ('图表窗口 ' + fmtTime(cc.chartWindow.from) + ' → ' + fmtTime(cc.chartWindow.to)) : '');

  const limits = [
    ['5 小时', q.fiveHour, q.fiveHourUsed, q.fiveHourCap],
    ['本周', q.weekly, q.weeklyUsed, q.weeklyCap],
    ['本月', q.monthly, q.monthlyCap && q.monthlyRemaining != null ? q.monthlyCap - q.monthlyRemaining : null, q.monthlyCap],
  ];
  setHtml('cc-limits', limits.map(function(row){
    const pct = row[1];
    const used = row[2], cap = row[3];
    const fill = pct == null ? 0 : Math.max(0, Math.min(100, pct));
    const hot = pct != null && pct > 90;
    return '<div' + (hot ? ' class="limit hot"' : '') + '>'
      + '<div class="limit-top"><span class="name">' + row[0] + '</span>'
      + '<span class="val"><b' + (hot ? ' class="hot"' : '') + '>' + fmtPct(pct) + '</b>'
      + (used != null && cap ? '　$' + Number(used).toFixed(2) + ' / $' + Number(cap).toFixed(2) : '') + '</span></div>'
      + '<div class="track"><i style="width:' + fill + '%;background:' + secColor(pct) + '"></i></div>'
      + '</div>';
  }).join(''));

  setHtml('cc-freq', freq.length === 0 ? '<div class="empty">暂无数据</div>' : freq.map(function(f){
    const short = String(f.model).split('/').pop();
    return '<div class="freq-row">'
      + '<span class="freq-name" title="' + esc(f.model) + '">' + esc(short) + '</span>'
      + '<span class="freq-meta">' + fmtInt(f.requests) + ' 次 · 平均 ' + Math.round(f.perHour) + '/小时 · 峰值 '
        + f.peak + '/桶' + (bucketMinutes ? '（约 ' + bucketMinutes + ' 分钟）' : '') + '</span>'
      + '<span class="freq-bars">' + bars(f.values, true) + '</span>'
      + '</div>';
  }).join(''));

  const models = cc.models || [];
  set('cc-models-meta', models.length + ' 个模型');
  setHtml('cc-models', models.length === 0 ? emptyRow(8, '该窗口内没有模型用量数据。') : models.map(function(m){
    return '<tr>'
      + '<td class="model">' + esc(m.model) + '</td>'
      + '<td class="r">' + m.requests + (m.failed ? ' <span class="badge fail">' + m.failed + ' fail</span>' : '') + '</td>'
      + '<td class="r">' + fmtCount(m.tokensIn) + '</td>'
      + '<td class="r">' + fmtCount(m.tokensOut) + '</td>'
      + '<td class="r">' + fmtCount(m.tokens) + '</td>'
      + '<td class="r">' + fmtCost(m.cost, 'USD') + '</td>'
      + '<td class="r muted">' + (m.cacheSavings ? fmtCost(m.cacheSavings, 'USD') : '—') + '</td>'
      + '<td class="r muted">' + (m.avgDurationMs ? fmtMs(m.avgDurationMs) : '—') + '</td>'
      + '</tr>';
  }).join(''));

  const recent = cc.recent || [];
  set('cc-recent-meta', recent.length + ' 条 · 服务端上限 100 条/天');
  setHtml('cc-recent', recent.length === 0 ? emptyRow(7, '没有调用明细。') : recent.map(function(r){
    const ok = !r.status || r.status === 'completed';
    return '<tr>'
      + '<td class="muted mono" style="font-size:.75rem">' + fmtTime(r.createdAt) + '</td>'
      + '<td class="model">' + esc(r.model) + '</td>'
      + '<td><span class="badge ' + (ok ? 'ok' : 'fail') + '">' + esc(r.status || 'completed') + '</span></td>'
      + '<td class="r">' + fmtCount(r.tokensIn) + '</td>'
      + '<td class="r">' + fmtCount(r.tokensOut) + '</td>'
      + '<td class="r muted">' + fmtMs(r.durationMs) + '</td>'
      + '<td class="r">' + fmtCost(r.cost, 'USD') + '</td>'
      + '</tr>';
  }).join(''));
}

function renderBanners(warns){
  if (!warns.length) return '';
  const errs = warns.filter(function(w){ return /失败|未配置 DeepSeek API Key/.test(w); });
  const soft = warns.filter(function(w){ return errs.indexOf(w) === -1; });
  const hasTokenHint = soft.some(function(w){ return /平台登录令牌/.test(w); });
  const blocks = [];
  if (errs.length) blocks.push('<div class="banner err"><b>数据获取失败</b>' + errs.map(function(w){ return '<div>' + esc(w) + '</div>'; }).join('') + '</div>');
  if (hasTokenHint) {
    blocks.push('<div class="banner warn">'
      + '<div class="banner-line">'
      + '<span class="banner-title">DeepSeek 各模型用量未启用</span>'
      + '<span class="muted">仅显示余额</span>'
      + '<code class="path" title="~/.pi/agent/deepseek-platform-token.txt">deepseek-platform-token.txt</code>'
      + '<button class="btn-link" data-toggle="more-ds">查看获取方式 ⌄</button>'
      + '</div>'
      + '<div class="banner-more hidden" id="more-ds">登录 platform.deepseek.com → F12 → Application → Local Storage → '
      + '<code>userToken</code> → 复制值 → 在 pi 里执行 <code>/usage ds-token</code> 粘贴（不经过对话记录）。</div>'
      + '</div>');
  }
  const rest = soft.filter(function(w){ return !/平台登录令牌/.test(w); });
  if (rest.length) blocks.push('<div class="banner">' + rest.map(function(w){ return esc(w); }).join('<br>') + '</div>');
  return blocks.join('');
}

function renderDS(ds){
  const b = ds.balance;
  const hasToken = !!(ds.configured && ds.configured.platform);
  set('ds-meta', hasToken ? '平台用量已启用' : '仅余额');
  const usageSeries = ds.usage && ds.usage.rows.length ? ds.usage.rows.map(function(r){ return r.requests; }) : [];
  setHtml('ds-kpis',
    kpiCard(ICONS.wallet, 'Balance', b ? fmtBalance(b.totalBalance, b.currency) : '未配置', '', [],
      b ? '总额 = 充值 + 赠送' : 'auth.json 缺少 deepseek key')
    + kpiCard(ICONS.cost, 'Topped up', b ? fmtBalance(b.toppedUpBalance, b.currency) : '—', '', [], '充值部分' + (b && b.isAvailable ? ' · 账户可用' : ''))
    + kpiCard(ICONS.tokens, 'Granted', b ? fmtBalance(b.grantedBalance, b.currency) : '—', '', [], '赠送余额')
    + kpiCard(ICONS.clock, 'Window', ds.usage ? days + 'D' : '未配置', ds.usage ? '次' : '',
        usageSeries,
        ds.usage ? fmtTime(ds.usage.from * 1000) + ' → ' + fmtTime(ds.usage.to * 1000) : '需平台 userToken',
        ds.usage ? null : { soft: true }));

  set('ds-usage-meta', ds.usage ? (ds.usage.rows.length + ' model(s) · bucket ' + (ds.usage.bucket || '—')) : 'platform.deepseek.com');

  const rows = (ds.usage && ds.usage.rows) || [];
  const dsWrap = document.getElementById('ds-table-wrap');
  if (dsWrap) dsWrap.classList.toggle('empty-mode', rows.length === 0);
  setHtml('ds-models', rows.length === 0
    ? emptyRow(8, ds.usage ? '该时间范围内没有用量。' : '未配置平台令牌，无法查询各模型用量。', '去配置')
    : rows.map(function(r){
        return '<tr>'
          + '<td class="model">' + esc(r.model) + '</td>'
          + '<td class="r">' + r.apiKeys + '</td>'
          + '<td class="r">' + r.requests + '</td>'
          + '<td class="r">' + fmtCount(r.promptCacheHitToken) + '</td>'
          + '<td class="r">' + fmtCount(r.promptCacheMissToken) + '</td>'
          + '<td class="r">' + fmtCount(r.responseToken) + '</td>'
          + '<td class="r">' + fmtCount(r.tokens) + '</td>'
          + '<td class="r">' + (r.cost ? fmtCost(r.cost, r.currency) : '—') + '</td>'
          + '</tr>';
      }).join(''));
}

async function load(){
  set('subtitle', '正在加载…');
  try {
    const res = await fetch(API + '/api/snapshot?days=' + days, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderCC(data.commandcode || {});
    renderDS(data.deepseek || {});

    const warns = [];
    ((data.commandcode && data.commandcode.warnings) || []).forEach(function(w){ warns.push('Command Code：' + w); });
    ((data.deepseek && data.deepseek.warnings) || []).forEach(function(w){ warns.push('DeepSeek：' + w); });
    setHtml('banners', renderBanners(warns));
    const ccWarn = warns.some(function(w){ return /Command Code/.test(w); });
    dot('dot-cc', ccWarn ? 'warn' : 'ok');
    set('state-cc', ccWarn ? '异常' : '正常');
    const dsOk = !!(data.deepseek && data.deepseek.balance);
    dot('dot-ds', dsOk ? (data.deepseek.usage ? 'ok' : 'warn') : 'err');
    set('state-ds', dsOk ? (data.deepseek.usage ? '正常' : '仅余额') : '未配置');

    set('subtitle', '更新于 ' + fmtTime(data.fetchedAt) + ' · 数据源：Command Code 内部接口 + DeepSeek 官方接口');
  } catch (e){
    set('subtitle', '加载失败');
    setHtml('banners', '<div class="banner err">无法获取数据：' + esc(e && e.message ? e.message : e) + '</div>');
  }
}

function schedule(){ if (timer) clearTimeout(timer); if (!auto) return; timer = setTimeout(function(){ load().then(schedule); }, 60000); }

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
    // 时间范围只对 DeepSeek 平台接口有效；Command Code 页签上保持原位但置灰（避免工具栏跳位）
    const rangeEl = document.getElementById('range');
    rangeEl.dataset.disabled = tab === 'ds' ? '0' : '1';
    rangeEl.title = tab === 'ds' ? 'DeepSeek 平台用量的时间范围' : 'Command Code 接口窗口由服务端固定，不支持切换';
  });
});
document.addEventListener('click', function(e){
  const toggle = e.target && e.target.closest ? e.target.closest('[data-toggle]') : null;
  if (toggle) {
    const box = document.getElementById(toggle.dataset.toggle);
    if (box) {
      const hidden = box.classList.toggle('hidden');
      toggle.textContent = hidden ? '查看获取方式 ⌄' : '收起 ⌃';
    }
    return;
  }
  const btn = e.target && e.target.closest ? e.target.closest('[data-goto]') : null;
  if (!btn) return;
  const target = document.getElementById(btn.dataset.goto);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
document.getElementById('theme').addEventListener('click', function(){
  const dark = document.documentElement.classList.toggle('dark');
  try { localStorage.setItem('usage-theme', dark ? 'dark' : 'light'); } catch (e) {}
  load();
});
document.getElementById('refresh').addEventListener('click', function(){ load().then(schedule); });
document.getElementById('auto').addEventListener('click', function(e){
  auto = !auto;
  e.target.textContent = auto ? 'AUTO ◉' : 'AUTO ○';
  schedule();
});
load().then(schedule);
</script>
</body>
</html>`;
}
