import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { monitor } from './monitor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_PORT = Number(process.env.SYSTEM_COMMANDER_DASHBOARD_PORT) || 4319;
const MCP_RELAY_URL = String(process.env.SYSTEM_COMMANDER_REMOTE_RELAY_URL || process.env.SYSTEM_COMMANDER_RELAY_URL || '').replace(/\/$/, '');
const MCP_DEVICE_ID = String(process.env.SYSTEM_COMMANDER_REMOTE_DEVICE_ID || '');
const MCP_URL = MCP_RELAY_URL && MCP_DEVICE_ID ? `${MCP_RELAY_URL}/mcp/${encodeURIComponent(MCP_DEVICE_ID)}` : '';

function loadLogoDataUri(filename: string): string {
    try {
        const buf = fs.readFileSync(path.join(__dirname, 'assets', filename));
        return `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
        return '';
    }
}

const LOGO_MARK = loadLogoDataUri('logo.png');
const LOGO_WORDMARK = loadLogoDataUri('logo-text.png');

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#07090d" />
<title>System Commander — Live Monitor</title>
<link rel="icon" type="image/png" href="${LOGO_MARK}" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#07090d;--surface:#0d1016;--surface-2:#11151d;--surface-3:#151a23;
  --line:#1e2530;--line-2:#252d39;--text:#f3f6fa;--muted:#7e8897;--muted-2:#56606f;
  --cyan:#62d6e7;--cyan-2:#3bb9cf;--green:#56df95;--amber:#ffbd66;--red:#ff6e78;
  --shadow:0 24px 80px rgba(0,0,0,.38);
}
*{box-sizing:border-box}
html{color-scheme:dark;background:var(--bg)}
body{
  margin:0;min-height:100vh;background:
    radial-gradient(900px 520px at 88% -12%,rgba(98,214,231,.08),transparent 62%),
    radial-gradient(760px 480px at -10% 98%,rgba(74,108,255,.06),transparent 62%),
    var(--bg);
  color:var(--text);font-family:'DM Sans',system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
}
button{font:inherit}
.mono{font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
.shell{max-width:1420px;margin:0 auto;padding:0 28px 36px}
.topbar{
  height:82px;display:flex;align-items:center;justify-content:space-between;gap:24px;
  border-bottom:1px solid rgba(255,255,255,.06)
}
.brand{display:flex;align-items:center;gap:13px;min-width:0}
.brand-mark{width:34px;height:34px;object-fit:contain}
.brand-wordmark{width:166px;height:auto;display:block}
.brand-divider{width:1px;height:25px;background:var(--line)}
.brand-label{font-size:12px;color:var(--muted);letter-spacing:.02em}
.toolbar{display:flex;align-items:center;gap:10px}
.status-pill,.refresh-pill{
  display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid var(--line);
  border-radius:999px;background:rgba(13,16,22,.72);font-size:12px;color:var(--muted)
}
.status-dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 0 4px rgba(86,223,149,.10)}
.refresh-icon{width:6px;height:6px;border-radius:50%;background:var(--cyan)}
.hero{padding:34px 0 30px;display:flex;align-items:flex-end;justify-content:space-between;gap:28px}
.eyebrow{font-size:11px;line-height:1;text-transform:uppercase;letter-spacing:.18em;color:var(--cyan);font-weight:700}
h1{margin:10px 0 8px;font-size:34px;line-height:1.05;letter-spacing:-.035em}
.hero-copy{max-width:700px;color:var(--muted);font-size:14px;line-height:1.65}
.hero-side{text-align:right}.hero-side .big{font-size:26px;font-weight:600;letter-spacing:-.03em}
.mcp-link-card{margin:-2px 0 18px;padding:14px 16px;border:1px solid rgba(98,214,231,.14);border-radius:14px;background:linear-gradient(180deg,rgba(98,214,231,.055),rgba(13,16,22,.88));display:flex;align-items:center;justify-content:space-between;gap:16px}.mcp-link-copy{min-width:0}.mcp-link-label{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--cyan);font-weight:700}.mcp-link-url{margin-top:6px;color:var(--text);font:500 11px/1.5 'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mcp-link-sub{margin-top:4px;color:var(--muted);font-size:11px}.mcp-copy{flex:none;border:1px solid rgba(98,214,231,.18);border-radius:9px;background:rgba(98,214,231,.07);color:var(--cyan);padding:8px 11px;font-size:11px;font-weight:600;cursor:pointer}.mcp-copy:hover{background:rgba(98,214,231,.12)}
.hero-side .sub{margin-top:4px;color:var(--muted);font-size:12px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
.stat{
  padding:18px 18px 17px;background:linear-gradient(180deg,rgba(20,25,34,.92),rgba(13,16,22,.92));
  border:1px solid var(--line);border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.12)
}
.stat-head{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--muted);font-size:12px}
.stat-value{margin-top:10px;font-size:28px;line-height:1;font-weight:600;letter-spacing:-.035em}
.stat-meta{margin-top:10px;color:var(--muted-2);font-size:11px}
.tone-cyan{color:var(--cyan)}.tone-green{color:var(--green)}.tone-amber{color:var(--amber)}
.grid{display:grid;grid-template-columns:minmax(320px,.92fr) minmax(520px,1.58fr);gap:14px}
.panel{
  background:rgba(13,16,22,.86);border:1px solid var(--line);border-radius:16px;
  overflow:hidden;box-shadow:var(--shadow)
}
.panel-header{padding:17px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:16px}
.panel-title{font-size:13px;font-weight:600;letter-spacing:.01em}
.panel-sub{margin-top:3px;font-size:11px;color:var(--muted)}
.panel-count{font-size:11px;color:var(--muted);padding:6px 9px;border:1px solid var(--line);border-radius:999px}
.clients{padding:10px}
.client-card{
  display:grid;grid-template-columns:38px 1fr auto;gap:12px;align-items:center;padding:13px 10px;
  border:1px solid transparent;border-radius:12px;transition:.18s ease
}
.client-card:hover{background:var(--surface-2);border-color:var(--line)}
.client-avatar{
  width:38px;height:38px;display:grid;place-items:center;border-radius:11px;
  background:linear-gradient(135deg,rgba(98,214,231,.14),rgba(79,107,255,.14));
  color:var(--cyan);border:1px solid rgba(98,214,231,.15);font-size:13px;font-weight:700
}
.client-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.client-meta{margin-top:4px;color:var(--muted);font-size:11px}
.client-right{text-align:right}.client-calls{font-size:12px;font-weight:600}.client-seen{margin-top:4px;color:var(--muted-2);font-size:10px}
.badge{
  display:inline-flex;align-items:center;gap:5px;margin-left:6px;padding:3px 7px;
  border-radius:999px;border:1px solid rgba(98,214,231,.16);color:var(--cyan);background:rgba(98,214,231,.06);
  font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-weight:700
}
.live-strip{margin:0 10px 10px;padding:10px 11px;background:rgba(98,214,231,.045);border:1px solid rgba(98,214,231,.10);border-radius:11px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.live-left{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:11px}
.live-bars{display:flex;align-items:flex-end;gap:2px;height:18px}
.live-bars span{display:block;width:3px;border-radius:3px;background:var(--cyan);opacity:.7}
.activity{min-width:0}
.table-wrap{max-height:494px;overflow:auto}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{text-align:left;padding:11px 16px}
th{position:sticky;top:0;background:rgba(13,16,22,.98);z-index:1;color:var(--muted-2);font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:600;border-bottom:1px solid var(--line)}
tbody tr{transition:.15s ease}
tbody tr:hover{background:rgba(255,255,255,.018)}
tbody tr:not(:last-child) td{border-bottom:1px solid rgba(255,255,255,.04)}
.call-tool{font-weight:600;color:#e8edf3}.call-client{color:var(--muted)}.call-time,.call-duration{color:var(--muted-2);white-space:nowrap}
.status-badge{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:600;padding:4px 7px;border-radius:999px}
.status-badge.ok{color:var(--green);background:rgba(86,223,149,.08)}.status-badge.err{color:var(--red);background:rgba(255,110,120,.08)}
.status-badge i{width:5px;height:5px;border-radius:50%;background:currentColor}
.empty{padding:38px 20px!important;text-align:center;color:var(--muted);font-size:12px}
.empty strong{display:block;color:var(--text);font-size:13px;margin-bottom:5px}
.footer{padding:16px 2px 0;display:flex;justify-content:space-between;gap:20px;color:var(--muted-2);font-size:10px}
.footer .mono{color:var(--muted)}
@media(max-width:1050px){.stats{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.activity .table-wrap{max-height:420px}}
@media(max-width:700px){.shell{padding:0 16px 24px}.topbar{height:auto;padding:18px 0;align-items:flex-start}.brand-divider,.brand-label{display:none}.brand-wordmark{width:145px}.toolbar{flex-direction:column;align-items:flex-end}.hero{padding:28px 0 22px;align-items:flex-start;flex-direction:column}.hero-side{text-align:left}.stats{grid-template-columns:1fr 1fr}.stats .stat{padding:15px}.stat-value{font-size:23px}h1{font-size:29px}.table-wrap{max-height:none;overflow:visible}th:nth-child(2),td:nth-child(2){display:none}.call-client{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
@media(max-width:470px){.stats{grid-template-columns:1fr}.panel-header{padding:15px}.client-card{grid-template-columns:34px 1fr auto}.client-avatar{width:34px;height:34px;border-radius:10px}}
</style>
</head>
<body>
<div class="shell">
  <header class="topbar">
    <div class="brand">
      <img class="brand-mark" src="${LOGO_MARK}" alt="" />
      <img class="brand-wordmark" src="${LOGO_WORDMARK}" alt="System Commander" />
      <span class="brand-divider"></span>
      <span class="brand-label">Live monitor</span>
    </div>
    <div class="toolbar">
      <div class="status-pill"><span class="status-dot"></span><span>System online</span></div>
      <div class="refresh-pill"><span class="refresh-icon"></span><span>Live · 2s refresh</span></div>
    </div>
  </header>

  <section class="hero">
    <div>
      <div class="eyebrow">Command center</div>
      <h1>See what System Commander is doing.</h1>
      <div class="hero-copy">A live view of connected clients and every tool request moving through this computer. Nothing is persisted here; this dashboard reflects the current session.</div>
    </div>
    <div class="hero-side">
      <div class="big mono" id="hero-clock">--:--:--</div>
      <div class="sub">Local computer time</div>
    </div>
  </section>

  ${MCP_URL ? `<section class="mcp-link-card"><div class="mcp-link-copy"><div class="mcp-link-label">Your MCP connection</div><div class="mcp-link-url" id="mcp-link-url">${MCP_URL}</div><div class="mcp-link-sub">Use this device-specific URL when connecting your AI client.</div></div><button class="mcp-copy" id="mcp-copy" type="button">Copy link</button></section>` : ''}

  <section class="stats">
    <div class="stat">
      <div class="stat-head"><span>Connected clients</span><span class="tone-green">●</span></div>
      <div class="stat-value mono" id="stat-clients">0</div>
      <div class="stat-meta">Currently active MCP clients</div>
    </div>
    <div class="stat">
      <div class="stat-head"><span>Requests / minute</span><span class="tone-cyan">↗</span></div>
      <div class="stat-value mono tone-cyan" id="stat-rate">0</div>
      <div class="stat-meta">Tool calls during the last 60 seconds</div>
    </div>
    <div class="stat">
      <div class="stat-head"><span>Average latency</span><span class="tone-amber">◌</span></div>
      <div class="stat-value mono tone-amber" id="stat-latency">0ms</div>
      <div class="stat-meta">Average of the latest 50 requests</div>
    </div>
    <div class="stat">
      <div class="stat-head"><span>Error rate</span><span class="tone-green" id="error-dot">●</span></div>
      <div class="stat-value mono" id="stat-errors">0%</div>
      <div class="stat-meta">Latest 50 requests</div>
    </div>
  </section>

  <section class="grid">
    <div class="panel">
      <div class="panel-header">
        <div><div class="panel-title">Connected clients</div><div class="panel-sub">Applications talking to this computer</div></div>
        <div class="panel-count" id="clients-count">0</div>
      </div>
      <div class="live-strip">
        <div class="live-left"><span class="status-dot"></span><span>Watching for activity</span></div>
        <div class="live-bars" id="live-bars"></div>
      </div>
      <div class="clients" id="clients-list"></div>
    </div>

    <div class="panel activity">
      <div class="panel-header">
        <div><div class="panel-title">Recent activity</div><div class="panel-sub">Newest requests appear here automatically</div></div>
        <div class="panel-count" id="events-count">0</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Client</th><th>Tool</th><th>Duration</th><th>Status</th></tr></thead>
          <tbody id="events-body"><tr><td class="empty" colspan="5"><strong>Waiting for your first request</strong>System Commander activity will appear here in real time.</td></tr></tbody>
        </table>
      </div>
    </div>
  </section>

  <footer class="footer">
    <span>System Commander · local live monitor</span>
    <span class="mono">localhost:${DASHBOARD_PORT}</span>
  </footer>
</div>

<script>
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const initials = value => {
  const parts = String(value || 'SC').trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || 'S') + (parts[1]?.[0] || 'C');
};
function timeAgo(ts){
  const s=Math.max(0,Math.floor((Date.now()-ts)/1000));
  if(s<5)return 'just now'; if(s<60)return s+'s ago'; if(s<3600)return Math.floor(s/60)+'m ago'; return Math.floor(s/3600)+'h ago';
}
function tickClock(){ document.getElementById('hero-clock').textContent=new Date().toLocaleTimeString(); }
document.getElementById('mcp-copy')?.addEventListener('click', async () => { const value=document.getElementById('mcp-link-url')?.textContent || ''; try { await navigator.clipboard.writeText(value); const button=document.getElementById('mcp-copy'); if(button){button.textContent='Copied ✓'; setTimeout(()=>button.textContent='Copy link',1400);} } catch {} });
function drawBars(events){
  const el=document.getElementById('live-bars');
  const count=Math.min(24, Math.max(12, events.length));
  const source=events.slice(0,count);
  el.innerHTML=Array.from({length:count},(_,i)=>{
    const e=source[i]; const height=e ? Math.max(4,Math.min(18,Math.round((e.durationMs||20)/25)+4)) : 4;
    return '<span style="height:'+height+'px"></span>';
  }).join('');
}
async function refresh(){
  try{
    const res=await fetch('/api/state',{cache:'no-store'}); if(!res.ok) return;
    const data=await res.json(); const events=Array.isArray(data.events)?data.events:[]; const clients=Array.isArray(data.clients)?data.clients:[];
    const now=Date.now(); const recent=events.filter(e=>now-e.timestamp<60000); const sample=events.slice(0,50);
    const avg=sample.length?Math.round(sample.reduce((sum,e)=>sum+(Number(e.durationMs)||0),0)/sample.length):0;
    const errors=sample.filter(e=>e.isError).length; const errorRate=sample.length?Math.round((errors/sample.length)*100):0;
    document.getElementById('stat-clients').textContent=clients.length;
    document.getElementById('clients-count').textContent=clients.length+' active';
    document.getElementById('stat-rate').textContent=recent.length;
    document.getElementById('stat-latency').textContent=avg+'ms';
    const errorEl=document.getElementById('stat-errors'); errorEl.textContent=errorRate+'%'; errorEl.className='stat-value mono '+(errorRate?'tone-amber':'tone-green');
    document.getElementById('error-dot').className=errorRate?'tone-amber':'tone-green';
    document.getElementById('events-count').textContent=events.length+' total';
    document.getElementById('clients-list').innerHTML=clients.length?clients.map(c=>'<div class="client-card">'+
      '<div class="client-avatar">'+esc(initials(c.name))+'</div>'+
      '<div><div class="client-name">'+esc(c.name)+(c.remote?'<span class="badge">remote</span>':'')+'</div>'+
      '<div class="client-meta">'+esc(c.version)+' · last seen '+esc(timeAgo(c.lastSeen))+'</div></div>'+
      '<div class="client-right"><div class="client-calls mono">'+esc(c.toolCallCount)+' calls</div><div class="client-seen">connected</div></div>'+
      '</div>').join(''):'<div class="empty"><strong>No clients connected</strong>Start an MCP client and it will appear here automatically.</div>';
    document.getElementById('events-body').innerHTML=events.length?events.slice(0,100).map(e=>'<tr>'+
      '<td class="call-time mono">'+esc(timeAgo(e.timestamp))+'</td>'+
      '<td class="call-client">'+esc(e.clientName)+'</td>'+
      '<td class="call-tool mono">'+esc(e.toolName)+'</td>'+
      '<td class="call-duration mono">'+esc(e.durationMs)+'ms</td>'+
      '<td><span class="status-badge '+(e.isError?'err':'ok')+'"><i></i>'+(e.isError?'error':'ok')+'</span></td>'+
      '</tr>').join(''):'<tr><td class="empty" colspan="5"><strong>Waiting for your first request</strong>System Commander activity will appear here in real time.</td></tr>';
    drawBars(events);
  }catch{}
}
tickClock();setInterval(tickClock,1000);refresh();setInterval(refresh,2000);
</script>
</body>
</html>`;

export function startDashboardServer(openBrowser: boolean = true) {
    const httpServer = http.createServer((req, res) => {
        if (req.url === '/api/state') {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(monitor.getState()));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(PAGE);
    });

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
        const reason = err.code === 'EADDRINUSE'
            ? `port ${DASHBOARD_PORT} is already in use (another instance running?)`
            : err.message;
        console.error(` - ⚠️  Dashboard server failed to start: ${reason}`);
    });

    httpServer.listen(DASHBOARD_PORT, () => {
        const url = `http://localhost:${DASHBOARD_PORT}`;
        if (openBrowser) {
            import('open').then(({ default: open }) => {
                open(url).catch(() => {});
            });
        }
    });

    return httpServer;
}
