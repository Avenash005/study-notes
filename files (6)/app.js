'use strict';

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const API_KEY     = '23743565e5ea475aa185456c57753995';
const BASE_URL    = 'https://api.twelvedata.com';
const REFRESH_MS  = 30000; // 30s — respects free tier (8 calls/min)

// ═══════════════════════════════════════════════════════════════
// STOCK DATABASE
// ═══════════════════════════════════════════════════════════════
const DB = {
  RELIANCE:   { n:'Reliance Industries', ex:'NSE',    c:'₹', lot:250,  sym12:'RELIANCE',   exch12:'NSE'    },
  TCS:        { n:'Tata Consultancy',    ex:'NSE',    c:'₹', lot:150,  sym12:'TCS',        exch12:'NSE'    },
  INFY:       { n:'Infosys Ltd',         ex:'NSE',    c:'₹', lot:300,  sym12:'INFY',       exch12:'NSE'    },
  HDFCBANK:   { n:'HDFC Bank',           ex:'NSE',    c:'₹', lot:550,  sym12:'HDFCBANK',   exch12:'NSE'    },
  ICICIBANK:  { n:'ICICI Bank',          ex:'NSE',    c:'₹', lot:700,  sym12:'ICICIBANK',  exch12:'NSE'    },
  WIPRO:      { n:'Wipro Ltd',           ex:'NSE',    c:'₹', lot:1500, sym12:'WIPRO',      exch12:'NSE'    },
  TATAMOTORS: { n:'Tata Motors',         ex:'NSE',    c:'₹', lot:1400, sym12:'TATAMOTORS', exch12:'NSE'    },
  ZOMATO:     { n:'Zomato Ltd',          ex:'NSE',    c:'₹', lot:4500, sym12:'ZOMATO',     exch12:'NSE'    },
  NIFTY50:    { n:'Nifty 50 Index',      ex:'NSE',    c:'₹', lot:50,   sym12:'NIFTY',      exch12:'NSE'    },
  AAPL:       { n:'Apple Inc',           ex:'NASDAQ', c:'$', lot:100,  sym12:'AAPL',       exch12:'NASDAQ' },
  TSLA:       { n:'Tesla Inc',           ex:'NASDAQ', c:'$', lot:100,  sym12:'TSLA',       exch12:'NASDAQ' },
  NVDA:       { n:'NVIDIA Corp',         ex:'NASDAQ', c:'$', lot:100,  sym12:'NVDA',       exch12:'NASDAQ' },
  BTC:        { n:'Bitcoin',             ex:'CRYPTO', c:'$', lot:1,    sym12:'BTC/USD',    exch12:''       },
  ETH:        { n:'Ethereum',            ex:'CRYPTO', c:'$', lot:1,    sym12:'ETH/USD',    exch12:''       },
};

const WATCHLIST = ['RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','TATAMOTORS','WIPRO','ZOMATO','NIFTY50'];

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let sym        = 'RELIANCE';
let tf         = '15min';
let bars       = [];
let livePrice  = 0;
let prevClose  = 0;
let inds       = { ema:true, bb:true, vwap:true, sig:true };
let sLog       = [];
let lastSig    = { t:'WAIT', c:50 };
let selLegs    = [];
let expDates   = [];
let selExpIdx  = 0;
let refreshTimer = null;
let refreshSec   = 0;
let wlPrices   = {};
let mktSt      = { s:'closed', l:'CLOSED', c:'closed' };

// ═══════════════════════════════════════════════════════════════
// MARKET HOURS
// ═══════════════════════════════════════════════════════════════
function getMktSt(ex) {
  const now = new Date();
  const day = now.getUTCDay();
  const isWknd = day === 0 || day === 6;
  if (ex === 'CRYPTO') return { s:'open', l:'CRYPTO 24/7', c:'open' };
  if (ex === 'NSE' || ex === 'BSE') {
    const istMin = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440;
    if (isWknd) return { s:'closed', l:'CLOSED — WEEKEND', c:'closed' };
    if (istMin >= 555 && istMin < 570) return { s:'pre', l:'PRE-MARKET NSE', c:'pre' };
    if (istMin >= 570 && istMin < 930) return { s:'open', l:'NSE OPEN', c:'open' };
    return { s:'closed', l:'CLOSED', c:'closed' };
  }
  if (ex === 'NASDAQ' || ex === 'NYSE') {
    const etMin = ((now.getUTCHours() - 5) * 60 + now.getUTCMinutes() + 1440) % 1440;
    if (isWknd) return { s:'closed', l:'CLOSED — WEEKEND', c:'closed' };
    if (etMin >= 240 && etMin < 570) return { s:'pre', l:'PRE-MARKET US', c:'pre' };
    if (etMin >= 570 && etMin < 960) return { s:'open', l:'NYSE OPEN', c:'open' };
    return { s:'closed', l:'CLOSED', c:'closed' };
  }
  return { s:'closed', l:'CLOSED', c:'closed' };
}

function nextOpen(ex) {
  const day = new Date().getUTCDay();
  if (ex === 'CRYPTO') return 'Open 24/7';
  const D = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const hop = day === 0 ? 1 : day === 6 ? 2 : 0;
  const nd = D[(day + hop) % 7];
  return (ex === 'NSE' || ex === 'BSE') ? `${nd} 9:15 AM IST` : `${nd} 9:30 AM ET`;
}

// ═══════════════════════════════════════════════════════════════
// TWELVE DATA API CALLS
// ═══════════════════════════════════════════════════════════════
function setApiStatus(type, msg) {
  const el = document.getElementById('apiStat');
  el.className = 'api-status ' + type;
  el.textContent = type === 'ok' ? '● ' + msg : type === 'err' ? '✕ ' + msg : '⟳ ' + msg;
}

async function fetchTimeSeries(ticker, interval, outputsize = 130) {
  const s = DB[ticker] || DB.RELIANCE;
  const exParam = s.exch12 ? `&exchange=${s.exch12}` : '';
  const url = `${BASE_URL}/time_series?symbol=${s.sym12}${exParam}&interval=${interval}&outputsize=${outputsize}&apikey=${API_KEY}`;
  try {
    const res  = await fetch(url);
    const data = await res.json();
    if (data.status === 'error' || !data.values) {
      setApiStatus('err', data.message || 'API Error');
      return null;
    }
    setApiStatus('ok', 'LIVE');
    return data.values.reverse().map(v => ({
      t: new Date(v.datetime).getTime(),
      o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: +v.volume || 0
    }));
  } catch (e) {
    setApiStatus('err', 'Network Error');
    return null;
  }
}

async function fetchQuote(ticker) {
  const s = DB[ticker] || DB.RELIANCE;
  const exParam = s.exch12 ? `&exchange=${s.exch12}` : '';
  const url = `${BASE_URL}/quote?symbol=${s.sym12}${exParam}&apikey=${API_KEY}`;
  try {
    const res  = await fetch(url);
    const data = await res.json();
    if (data.status === 'error' || !data.close) return null;
    return {
      price:        +data.close,
      open:         +data.open,
      prevClose:    +data.previous_close,
      volume:       +data.volume || 0,
      fiftyTwoHigh: +data.fifty_two_week?.high || 0,
      fiftyTwoLow:  +data.fifty_two_week?.low  || 0,
    };
  } catch (e) { return null; }
}

async function fetchBatchPrices(tickers) {
  const symbols = tickers.map(t => {
    const s = DB[t]; if (!s) return null;
    return s.exch12 ? `${s.sym12}:${s.exch12}` : s.sym12;
  }).filter(Boolean).join(',');
  try {
    const res  = await fetch(`${BASE_URL}/price?symbol=${symbols}&apikey=${API_KEY}`);
    return await res.json();
  } catch (e) { return null; }
}

// ═══════════════════════════════════════════════════════════════
// FALLBACK SIMULATION (market closed or API limit hit)
// ═══════════════════════════════════════════════════════════════
function genSimBars(ticker, timeframe) {
  const s     = DB[ticker] || DB.RELIANCE;
  const base  = livePrice || s.bp || 2000;
  const n     = 130;
  const vol   = base * 0.015;
  const tfMs  = { '1min':60e3,'5min':300e3,'15min':900e3,'1h':3600e3,'1day':86400e3,'1week':604800e3 };
  const step  = tfMs[timeframe] || 900e3;
  const res   = [];
  let p       = base * (0.82 + Math.random() * 0.18);
  let trend   = (Math.random() - 0.45) * 0.001;
  const now   = Date.now();
  for (let i = n; i >= 0; i--) {
    trend += (Math.random() - 0.485) * 0.0004;
    trend  = Math.max(-0.003, Math.min(0.003, trend));
    const o = p, c = p + (Math.random() - 0.5) * vol * 1.8 + p * trend;
    const h = Math.max(o,c) + Math.random() * vol * 0.6;
    const l = Math.min(o,c) - Math.random() * vol * 0.5;
    res.push({ t: now - i * step, o:+o.toFixed(2), h:+h.toFixed(2), l:+l.toFixed(2), c:+c.toFixed(2), v: Math.floor(base*500 + Math.random()*2e6) });
    p = c;
  }
  return res;
}

// ═══════════════════════════════════════════════════════════════
// LOAD REAL DATA
// ═══════════════════════════════════════════════════════════════
async function loadRealData(ticker, timeframe, force = false) {
  setApiStatus('loading', 'LOADING');
  document.getElementById('cNote').textContent = '⟳ Fetching from NSE…';

  const newBars = await fetchTimeSeries(ticker, timeframe, 130);
  if (newBars && newBars.length > 5) {
    bars       = newBars;
    livePrice  = bars[bars.length - 1].c;
    document.getElementById('dtag').className   = 'data-tag live';
    document.getElementById('dtag').textContent = '● LIVE NSE';
    document.getElementById('liveLabel').textContent = 'LIVE NSE';
    document.getElementById('cNote').textContent = '';
  } else {
    if (!bars.length || force) bars = genSimBars(ticker, timeframe);
    livePrice  = bars[bars.length - 1].c;
    document.getElementById('dtag').className   = 'data-tag sim';
    document.getElementById('dtag').textContent = '📊 SIMULATED';
    document.getElementById('liveLabel').textContent = 'SIM MODE';
    document.getElementById('cNote').textContent = '⚠ Simulated data';
  }

  const q = await fetchQuote(ticker);
  if (q) {
    livePrice  = q.price;
    prevClose  = q.prevClose;
    if (bars.length) bars[bars.length - 1].c = q.price;
    updateTopbarFromQuote(q);
  }

  mktSt = getMktSt((DB[ticker] || DB.RELIANCE).ex);
  updateMktUI();
  runSig();
  drawAll();
  buildExpiries();
  buildChain();
  buildStrategy();
  startRefreshTimer();
}

function updateTopbarFromQuote(q) {
  const stock = DB[sym] || DB.RELIANCE;
  const curr  = stock.c;
  const chg   = q.price - q.prevClose;
  const cp    = q.prevClose ? (chg / q.prevClose * 100) : 0;
  const up    = chg >= 0;

  document.getElementById('tbSym').textContent = sym;
  document.getElementById('tbEx').textContent  = stock.ex + ' · ' + stock.n;

  const pe = document.getElementById('tbPr');
  const oldP = parseFloat(pe.textContent.replace(/[₹$,]/g,'')) || 0;
  pe.textContent = curr + q.price.toFixed(2);
  pe.className   = 'tb-price ' + (up ? 'up' : 'dn');
  if (oldP && q.price !== oldP) {
    pe.classList.add(q.price > oldP ? 'flash-up' : 'flash-dn');
    setTimeout(() => pe.classList.remove('flash-up','flash-dn'), 400);
  }

  const ce = document.getElementById('tbCh');
  ce.textContent = (up ? '▲ +' : '▼ ') + chg.toFixed(2) + ' (' + (up?'+':'') + cp.toFixed(2) + '%)';
  ce.className   = 'tb-chg ' + (up ? 'up' : 'dn');

  document.getElementById('tO').textContent  = curr + q.open.toFixed(2);
  document.getElementById('tH').textContent  = curr + (bars.length ? Math.max(...bars.map(b=>b.h)).toFixed(2) : '—');
  document.getElementById('tL').textContent  = curr + (bars.length ? Math.min(...bars.map(b=>b.l)).toFixed(2) : '—');
  document.getElementById('tPC').textContent = curr + q.prevClose.toFixed(2);
  const v = q.volume;
  document.getElementById('tV').textContent  = v > 1e7 ? (v/1e7).toFixed(1)+'Cr' : v > 1e5 ? (v/1e5).toFixed(1)+'L' : (v/1e3).toFixed(0)+'K';
  document.getElementById('tWH').textContent = q.fiftyTwoHigh ? curr + q.fiftyTwoHigh.toFixed(2) : '—';
  document.getElementById('tWL').textContent = q.fiftyTwoLow  ? curr + q.fiftyTwoLow.toFixed(2)  : '—';
}

// ═══════════════════════════════════════════════════════════════
// REFRESH TIMER
// ═══════════════════════════════════════════════════════════════
function startRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshSec = REFRESH_MS / 1000;
  const fill = document.getElementById('rfill');
  refreshTimer = setInterval(async () => {
    refreshSec--;
    fill.style.width = (refreshSec / (REFRESH_MS / 1000) * 100) + '%';
    document.getElementById('tv2').textContent = refreshSec + 's';
    if (refreshSec <= 0) {
      refreshSec = REFRESH_MS / 1000;
      fill.style.width = '100%';
      const q = await fetchQuote(sym);
      if (q) {
        livePrice = q.price;
        prevClose = q.prevClose;
        if (bars.length) {
          bars[bars.length-1].c = q.price;
          bars[bars.length-1].h = Math.max(bars[bars.length-1].h, q.price);
          bars[bars.length-1].l = Math.min(bars[bars.length-1].l, q.price);
        }
        updateTopbarFromQuote(q);
        runSig();
        drawAll();
        updateWLFromAPI();
      }
    }
  }, 1000);
}

// ═══════════════════════════════════════════════════════════════
// WATCHLIST
// ═══════════════════════════════════════════════════════════════
async function initWL() {
  WATCHLIST.forEach(t => { if (DB[t]) wlPrices[t] = { p:0, chg:0, loading:true }; });
  renderWL();
  await updateWLFromAPI();
}

async function updateWLFromAPI() {
  try {
    const data = await fetchBatchPrices(WATCHLIST.slice(0, 6));
    if (!data) return;
    WATCHLIST.forEach(t => {
      const s   = DB[t]; if (!s) return;
      const key = s.exch12 ? `${s.sym12}:${s.exch12}` : s.sym12;
      const val = data[key] || data[s.sym12];
      if (val && val.price) {
        const p     = +val.price;
        const baseP = wlPrices[t]?.baseP || p;
        const chg   = baseP ? (p - baseP) / baseP * 100 : 0;
        wlPrices[t] = { p, chg, loading:false, baseP };
      }
    });
    renderWL();
  } catch (e) {}
}

function renderWL() {
  const el = document.getElementById('wl');
  el.innerHTML = WATCHLIST.map(t => {
    const s = DB[t]; if (!s) return '';
    const d = wlPrices[t] || { p:0, chg:0, loading:true };
    const up = d.chg >= 0;
    return `<div class="wi${t === sym ? ' active' : ''}" onclick="loadSym('${t}')">
      <div><div class="wt">${t}</div><div class="wn">${s.n}</div></div>
      <div>
        ${d.loading
          ? `<div class="wl-loading">⟳</div>`
          : `<div class="wp ${up?'up':'dn'}">${s.c}${d.p > 0 ? d.p.toFixed(2) : '—'}</div>
             <div class="wc ${up?'up':'dn'}">${up?'▲':' ▼'}${Math.abs(d.chg).toFixed(2)}%</div>`
        }
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// MARKET STATUS UI
// ═══════════════════════════════════════════════════════════════
function updateMktUI() {
  const stock   = DB[sym] || DB.RELIANCE;
  mktSt         = getMktSt(stock.ex);
  const isClosed = mktSt.s !== 'open';

  document.getElementById('md').className = 'mdot ' + mktSt.c;
  const msEl = document.getElementById('ms');
  msEl.className   = 'mst ' + mktSt.c;
  msEl.textContent = mktSt.l;

  const banner = document.getElementById('mb');
  if (isClosed && mktSt.s !== 'pre') {
    banner.className = 'mkt-banner';
    const today = new Date().toLocaleDateString('en-IN', { weekday:'long' }).toUpperCase();
    document.getElementById('bt').textContent = `MARKET CLOSED — ${today}`;
    document.getElementById('bs').textContent = `Last data shown · Next open: ${nextOpen(stock.ex)}`;
  } else {
    banner.className = 'mkt-banner hidden';
  }

  document.getElementById('nob').style.display = isClosed ? 'block' : 'none';
  document.getElementById('no2').textContent   = nextOpen(stock.ex);

  const mn = document.getElementById('mn');
  mn.textContent   = isClosed ? '⚠ Market CLOSED — Showing last available data from NSE' : '';
  mn.style.display = isClosed ? 'block' : 'none';

  const aiNote = document.getElementById('aiNote');
  if (isClosed) {
    aiNote.innerHTML = '⚠ Market <strong style="color:var(--y)">CLOSED</strong>. AI gives a <strong style="color:var(--t)">pre-market plan for ' + nextOpen(stock.ex) + '</strong>.';
    document.getElementById('aib').textContent = '⬡ Get Monday Trade Plan';
  } else {
    aiNote.innerHTML = '✅ Market <strong style="color:var(--g)">OPEN</strong>. AI gives a live signal on real NSE prices.';
    document.getElementById('aib').textContent = '⬡ Get Live AI Signal';
  }
}

// ═══════════════════════════════════════════════════════════════
// MATH HELPERS
// ═══════════════════════════════════════════════════════════════
function ema(d, p) { const k = 2/(p+1); let e = d[0]; return d.map(v => (e = v*k + e*(1-k), e)); }

function rsiCalc(cl, p = 14) {
  if (cl.length < p + 1) return [];
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = cl[i]-cl[i-1]; d > 0 ? g += d : l -= d; }
  let ag = g/p, al = l/p;
  const out = [100 - 100/(1 + ag/Math.max(al, 1e-9))];
  for (let i = p+1; i < cl.length; i++) {
    const d = cl[i]-cl[i-1];
    ag = (ag*(p-1) + Math.max(d,0)) / p;
    al = (al*(p-1) + Math.max(-d,0)) / p;
    out.push(100 - 100/(1 + ag/Math.max(al, 1e-9)));
  }
  return out;
}

function macdCalc(cl) {
  const e12=ema(cl,12), e26=ema(cl,26), ml=e12.map((v,i)=>v-e26[i]), sig=ema(ml,9);
  return { ml, sig, hist: ml.map((v,i)=>v-sig[i]) };
}

function bbCalc(cl, p = 20) {
  const u=[], l=[], m=[];
  for (let i = p-1; i < cl.length; i++) {
    const sl = cl.slice(i-p+1, i+1);
    const mn = sl.reduce((a,b)=>a+b,0)/p;
    const sd = Math.sqrt(sl.reduce((a,b)=>a+(b-mn)**2,0)/p);
    m.push(mn); u.push(mn+2*sd); l.push(mn-2*sd);
  }
  return { u, l, m };
}

function vwapCalc(brs) {
  let cv=0, cv2=0;
  return brs.map(b => { const tp=(b.h+b.l+b.c)/3; cv+=tp*b.v; cv2+=b.v; return cv/Math.max(cv2,1); });
}

// Black-Scholes
function nCDF(x) {
  const a=[.254829592,-.284496736,1.421413741,-1.453152027,1.061405429], p=.3275911;
  const s=x<0?-1:1, t=1/(1+p*Math.abs(x)/Math.SQRT2);
  return .5*(1+s*(1-(((((a[4]*t+a[3])*t+a[2])*t+a[1])*t+a[0])*t*Math.exp(-x*x/2))));
}
function nPDF(x) { return Math.exp(-x*x/2)/Math.sqrt(2*Math.PI); }
function bsP(S,K,T,r,σ,type) {
  if (T <= 0) return type==='call' ? Math.max(0,S-K) : Math.max(0,K-S);
  const d1=(Math.log(S/K)+(r+σ*σ/2)*T)/(σ*Math.sqrt(T)), d2=d1-σ*Math.sqrt(T);
  return type==='call' ? S*nCDF(d1)-K*Math.exp(-r*T)*nCDF(d2) : K*Math.exp(-r*T)*nCDF(-d2)-S*nCDF(-d1);
}
function bsGreeks(S,K,T,r,σ) {
  if (T <= 0) return { delta:0, putDelta:0, gamma:0, theta:0, vega:0 };
  const d1=(Math.log(S/K)+(r+σ*σ/2)*T)/(σ*Math.sqrt(T)), d2=d1-σ*Math.sqrt(T);
  const nd1=nPDF(d1), cD=nCDF(d1);
  return {
    delta:    cD,
    putDelta: cD - 1,
    gamma:    nd1 / (S*σ*Math.sqrt(T)),
    theta:    (-S*nd1*σ / (2*Math.sqrt(T)) - r*K*Math.exp(-r*T)*nCDF(d2)) / 365,
    vega:     S*nd1*Math.sqrt(T) / 100,
  };
}

// ═══════════════════════════════════════════════════════════════
// SIGNAL ENGINE
// ═══════════════════════════════════════════════════════════════
function runSig() {
  if (bars.length < 55) return;
  const cl=bars.map(b=>b.c), e20=ema(cl,20), e50=ema(cl,50);
  const rv=rsiCalc(cl), mv=macdCalc(cl), bv=bbCalc(cl);
  const n=cl.length;
  const rL=rv[rv.length-1]??50, rP=rv[rv.length-2]??50;
  const mH=mv.hist[mv.hist.length-1]??0, mHP=mv.hist[mv.hist.length-2]??0;
  const e20L=e20[n-1], e50L=e50[n-1], e20P=e20[n-2], e50P=e50[n-2], lc=cl[n-1];
  const bO=n-bv.u.length, bU=bv.u[n-1-bO]??lc, bL2=bv.l[n-1-bO]??lc;

  let sc=50, rs=[];
  if (e20L>e50L&&e20P<=e50P) { sc+=25; rs.push('EMA Golden Cross'); }
  if (e20L<e50L&&e20P>=e50P) { sc-=25; rs.push('EMA Death Cross'); }
  if (e20L>e50L) sc+=8; else sc-=8;
  if (rL<30&&rL>rP)  { sc+=18; rs.push('RSI Oversold Reversal'); }
  else if (rL>70&&rL<rP) { sc-=18; rs.push('RSI Overbought'); }
  if (rL<45) sc+=5; else if (rL>60) sc-=5;
  if (mH>0&&mHP<=0) { sc+=15; rs.push('MACD Cross Up'); }
  if (mH<0&&mHP>=0) { sc-=15; rs.push('MACD Cross Down'); }
  if (mH>0) sc+=5; else sc-=5;
  if (lc<bL2) { sc+=12; rs.push('Below BB — Oversold'); }
  if (lc>bU)  { sc-=12; rs.push('Above BB — Overbought'); }
  const mom = (cl[n-1]-cl[Math.max(0,n-6)]) / cl[Math.max(0,n-6)] * 100;
  if (mom>1)  { sc+=7; rs.push(`+${mom.toFixed(1)}% Momentum`); }
  if (mom<-1) { sc-=7; rs.push(`${mom.toFixed(1)}% Selling Pressure`); }
  sc = Math.max(5, Math.min(95, sc));

  let tp='WAIT', sub='WAIT FOR BREAKOUT · MIXED SIGNALS';
  if (sc >= 65) { tp='BUY';  sub = rs.slice(0,2).join(' · ') || 'BULLISH CONFLUENCE'; }
  if (sc <= 35) { tp='SELL'; sub = rs.slice(0,2).join(' · ') || 'BEARISH PRESSURE'; }

  const stock=DB[sym]||DB.RELIANCE, curr=stock.c, price=livePrice||lc;
  const sl  = tp==='BUY'  ? +(price*.975).toFixed(2) : +(price*1.025).toFixed(2);
  const t1  = tp==='BUY'  ? +(price*1.033).toFixed(2) : +(price*.967).toFixed(2);
  const t2  = tp==='BUY'  ? +(price*1.063).toFixed(2) : +(price*.937).toFixed(2);
  const rrv = ((Math.abs(t1-price)+Math.abs(t2-price))/2 / Math.abs(price-sl)).toFixed(1);
  const isC = mktSt.s !== 'open';

  document.getElementById('smain').className   = 'sm ' + (isC ? 'WAIT' : tp);
  document.getElementById('sword').textContent = tp;
  document.getElementById('sreason').textContent = (isC?'[Pre-mkt] ':'') + sub.toUpperCase();
  document.getElementById('sfill').style.width = sc + '%';
  document.getElementById('spct').textContent  = Math.round(sc) + '%';
  document.getElementById('lvE').textContent   = curr + price.toFixed(2);
  document.getElementById('lvS').textContent   = curr + sl.toFixed(2);
  document.getElementById('lvT1').textContent  = curr + t1.toFixed(2);
  document.getElementById('lvT2').textContent  = curr + t2.toFixed(2);
  document.getElementById('rr').textContent    = 'R:R 1:' + rrv;

  // Gauges
  const GC = { BULLISH:'#00d4a8',BEARISH:'#ff4757',OVERSOLD:'#00d4a8',OVERBOUGHT:'#ff4757',UPTREND:'#00d4a8',DOWNTREND:'#ff4757',STRONG:'#00d4a8',WEAK:'#ff4757',NEUTRAL:'#6b7899',FLAT:'#6b7899' };
  const gd = [
    { nm:'RSI(14)', v:rL.toFixed(1), pct:rL, bull:rL<50, sig:rL<30?'OVERSOLD':rL>70?'OVERBOUGHT':'NEUTRAL' },
    { nm:'MACD',    v:mH.toFixed(2), pct:50+Math.min(Math.abs(mH)/3*50,45), bull:mH>0, sig:mH>0?'BULLISH':'BEARISH' },
    { nm:'EMA',     v:e20L>e50L?'↗ UP':'↘ DN', pct:e20L>e50L?72:28, bull:e20L>e50L, sig:e20L>e50L?'UPTREND':'DOWNTREND' },
    { nm:'BB%',     v:bU>bL2?((lc-bL2)/(bU-bL2)*100).toFixed(0)+'%':'—', pct:bU>bL2?Math.min(95,(lc-bL2)/(bU-bL2)*100):50, bull:lc<(bU+bL2)/2, sig:lc>bU?'OVERBOUGHT':lc<bL2?'OVERSOLD':'NEUTRAL' },
    { nm:'Mom.5',   v:(mom>=0?'+':'')+mom.toFixed(2)+'%', pct:Math.min(95,50+mom*5), bull:mom>0, sig:mom>1?'STRONG':mom<-1?'WEAK':'FLAT' },
  ];
  document.getElementById('gr').innerHTML =
    '<div style="font-size:7px;font-weight:700;color:var(--t3);letter-spacing:2px;margin-bottom:6px">TECHNICAL GAUGES</div>' +
    gd.map(g => {
      const col = GC[g.sig] || '#6b7899';
      return `<div class="grow">
        <div class="gnm">${g.nm}</div>
        <div class="gbar"><div class="gfill" style="width:${Math.max(5,Math.min(95,g.pct))}%;background:${col}"></div></div>
        <div class="gvl" style="color:${g.bull?'#00d4a8':'#ff4757'}">${g.v}</div>
        <div class="gsg" style="color:${col}">${g.sig}</div>
      </div>`;
    }).join('');

  if (tp !== lastSig.t || Math.abs(sc - lastSig.c) > 8) {
    addLog(tp, sc, price, curr, sub);
    lastSig = { t:tp, c:sc };
  }
}

function addLog(tp, conf, price, curr, reason) {
  const time = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const tag  = mktSt.s !== 'open' ? ' [PRE-MKT]' : '';
  sLog.unshift({ tp, conf, price, curr, reason: reason + tag, time });
  if (sLog.length > 25) sLog.pop();
  document.getElementById('sigCount').textContent = sLog.length + ' signals';
  document.getElementById('sl3').innerHTML = sLog.map((e, i) =>
    `<div class="li${i===0?' fl':''}">
      <div class="lb ${e.tp}">${e.tp}</div>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between">
          <span class="lp">${e.curr}${e.price.toFixed(2)}</span>
          <span class="lt3">${e.time}</span>
        </div>
        <div class="ld">${e.reason} · ${Math.round(e.conf)}%</div>
      </div>
    </div>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
// OPTIONS: EXPIRIES
// ═══════════════════════════════════════════════════════════════
function getExpiries() {
  const d=new Date(), dates=[];
  for (let i=0; i<28; i++) {
    const nd=new Date(d); nd.setDate(d.getDate()+i);
    if (nd.getDay()===4) dates.push(new Date(nd));
    if (dates.length===4) break;
  }
  for (let m=1; m<=2; m++) {
    const md=new Date(d.getFullYear(), d.getMonth()+m+1, 0);
    while (md.getDay()!==4) md.setDate(md.getDate()-1);
    dates.push(new Date(md));
  }
  return dates;
}

function buildExpiries() {
  expDates = getExpiries();
  document.getElementById('er').innerHTML = expDates.map((d, i) => {
    const dl = Math.round((d-new Date())/86400000);
    return `<button class="eb${i===0?' on':''}" onclick="selExp(${i})">
      ${d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}${dl<=7?' W':''}
      <br><span style="font-size:7px;color:var(--t3)">${dl}d</span>
    </button>`;
  }).join('');
}

function selExp(idx) {
  selExpIdx = idx;
  document.querySelectorAll('.eb').forEach((b,i) => b.className = 'eb' + (i===idx?' on':''));
  buildChain(); buildStrategy(); buildGreeks();
}

// ═══════════════════════════════════════════════════════════════
// OPTIONS: CHAIN
// ═══════════════════════════════════════════════════════════════
function buildChain() {
  const stock=DB[sym]||DB.RELIANCE, S=livePrice||bars[bars.length-1]?.c||2000;
  const exp=expDates[selExpIdx]; if (!exp) return;
  const T=Math.max(.001,(exp-new Date())/3.154e10), r=.065;
  const step=S>50000?500:S>10000?200:S>5000?100:S>2000?50:S>500?20:S>100?5:2;
  const atm=Math.round(S/step)*step;
  const strikes=[-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6].map(d=>atm+d*step);
  const curr=stock.c;
  document.getElementById('csp').textContent = 'Real Spot: '+curr+S.toFixed(0);
  document.getElementById('cb').innerHTML = strikes.map(K => {
    const σ=.18+Math.random()*.08, cp=bsP(S,K,T,r,σ,'call'), pp=bsP(S,K,T,r,σ,'put'), g=bsGreeks(S,K,T,r,σ);
    const itm=K<=S, cOI=(2000+Math.floor(Math.random()*80000)/1000).toFixed(0), pOI=(2000+Math.floor(Math.random()*80000)/1000).toFixed(0);
    return `<tr class="${itm?'itmc':''}">
      <td onclick="addLeg('buy','call',${K},${cp.toFixed(2)},${σ})" style="color:var(--g)">${curr}${cp.toFixed(2)}</td>
      <td style="color:var(--t2)">${g.delta.toFixed(2)}</td>
      <td style="color:var(--t3)">${(σ*100).toFixed(1)}%</td>
      <td style="color:var(--t3)">${cOI}K</td>
      <td class="ctr">${curr}${K}</td>
      <td style="color:var(--t3)">${pOI}K</td>
      <td style="color:var(--t3)">${((σ+.01)*100).toFixed(1)}%</td>
      <td style="color:var(--t2)">${g.putDelta.toFixed(2)}</td>
      <td onclick="addLeg('buy','put',${K},${pp.toFixed(2)},${σ})" style="color:var(--r)">${curr}${pp.toFixed(2)}</td>
    </tr>`;
  }).join('');
}

function addLeg(act, tp, strike, prem, iv) {
  selLegs.push({ act, tp, strike, prem:+prem, iv });
  if (selLegs.length > 4) selLegs.shift();
  buildStrategy();
  document.querySelectorAll('.ot2').forEach(t=>t.classList.remove('on'));
  document.querySelector('.ot2[data-ot="strategy"]').classList.add('on');
  document.querySelectorAll('[id^="otc-"]').forEach(b=>b.style.display='none');
  document.getElementById('otc-strategy').style.display='block';
}

// ═══════════════════════════════════════════════════════════════
// OPTIONS: STRATEGY BUILDER
// ═══════════════════════════════════════════════════════════════
function buildStrategy() {
  const stock=DB[sym]||DB.RELIANCE, S=livePrice||bars[bars.length-1]?.c||2000;
  const exp=expDates[selExpIdx]; if (!exp) return;
  const T=Math.max(.001,(exp-new Date())/3.154e10), r=.065, curr=stock.c;
  const sig=document.getElementById('sword').textContent;

  if (!selLegs.length) {
    const step=S>2000?50:S>500?20:5, atm=Math.round(S/step)*step;
    if (sig==='BUY') {
      selLegs=[{act:'buy',tp:'call',strike:atm,prem:+bsP(S,atm,T,r,.22,'call').toFixed(2),iv:.22},{act:'sell',tp:'call',strike:atm+2*step,prem:+bsP(S,atm+2*step,T,r,.22,'call').toFixed(2),iv:.22}];
    } else if (sig==='SELL') {
      selLegs=[{act:'buy',tp:'put',strike:atm,prem:+bsP(S,atm,T,r,.22,'put').toFixed(2),iv:.22},{act:'sell',tp:'put',strike:atm-2*step,prem:+bsP(S,atm-2*step,T,r,.22,'put').toFixed(2),iv:.22}];
    } else {
      selLegs=[
        {act:'sell',tp:'call',strike:atm+2*step,prem:+bsP(S,atm+2*step,T,r,.22,'call').toFixed(2),iv:.22},
        {act:'buy', tp:'call',strike:atm+4*step,prem:+bsP(S,atm+4*step,T,r,.22,'call').toFixed(2),iv:.22},
        {act:'sell',tp:'put', strike:atm-2*step,prem:+bsP(S,atm-2*step,T,r,.22,'put').toFixed(2),iv:.22},
        {act:'buy', tp:'put', strike:atm-4*step,prem:+bsP(S,atm-4*step,T,r,.22,'put').toFixed(2),iv:.22},
      ];
    }
  }

  const nm  = selLegs.length===2&&selLegs[0].tp==='call'&&selLegs[0].act==='buy'?'Bull Call Spread'
              :selLegs.length===2&&selLegs[0].tp==='put' &&selLegs[0].act==='buy'?'Bear Put Spread'
              :selLegs.length>=4?'Iron Condor':'Custom Strategy';
  const np  = selLegs.reduce((a,l)=>(l.act==='buy'?a-l.prem:a+l.prem),0);
  const lot = stock.lot || 1;
  const mp  = selLegs.length>=4 ? Math.abs(np)*lot
              : selLegs.length===2 ? (selLegs[0].tp==='call'
                ? (Math.abs(selLegs[1].strike-selLegs[0].strike)-Math.abs(np))*lot
                : (Math.abs(selLegs[0].strike-selLegs[1].strike)-Math.abs(np))*lot) : 'Unlimited';
  const ml  = np<0 ? Math.abs(np)*lot : 'Limited';
  const isBull = selLegs.some(l=>l.tp==='call'&&l.act==='buy');
  const stc = isBull ? 'bull' : selLegs.some(l=>l.tp==='put'&&l.act==='buy') ? 'bear' : 'neut';
  const legCls = {buy_call:'bc',sell_call:'sc',buy_put:'bp',sell_put:'sp'};

  document.getElementById('stb').innerHTML = `
    <div class="stbx">
      <div class="sttl">
        ${nm}
        <span class="sttag ${stc}">${stc==='bull'?'BULLISH':stc==='bear'?'BEARISH':'NEUTRAL'}</span>
        <button onclick="selLegs=[];buildStrategy()" style="margin-left:auto;background:none;border:1px solid var(--border2);color:var(--t3);font-size:8px;padding:2px 6px;border-radius:2px;cursor:pointer">Reset</button>
      </div>
      <div class="str"><span>Net Premium</span><strong style="color:${np>=0?'var(--g)':'var(--r)'}">${curr}${Math.abs(np).toFixed(2)} ${np>=0?'Credit':'Debit'}</strong></div>
      <div class="str"><span>Max Profit</span><strong style="color:var(--g)">${typeof mp==='number'?curr+mp.toFixed(0):mp}</strong></div>
      <div class="str"><span>Max Loss</span><strong style="color:var(--r)">${typeof ml==='number'?curr+ml.toFixed(0):ml}</strong></div>
      <div class="str"><span>Lot Size</span><strong>${lot}</strong></div>
      <div style="margin-top:6px">
        ${selLegs.map(l=>`<div class="leg ${legCls[l.act+'_'+l.tp]||''}">
          <span class="la">${l.act.toUpperCase()}</span>
          <span class="lt4">${l.tp.toUpperCase()}</span>
          <span class="lsk">${curr}${l.strike}</span>
          <span class="lpr">@${curr}${l.prem.toFixed(2)}</span>
        </div>`).join('')}
      </div>
    </div>
    <div style="font-size:8px;color:var(--t3);padding:2px 0 4px">P&L at Expiry (1 lot)</div>
    <div class="pnlw"><canvas id="pnlc" height="90"></canvas></div>`;

  requestAnimationFrame(() => drawPnL(S, curr, lot));
}

function drawPnL(S, curr, lot) {
  const c = document.getElementById('pnlc'); if (!c) return;
  const w=c.offsetWidth||260, dpr=window.devicePixelRatio||1;
  c.width=w*dpr; c.height=90*dpr; c.style.width=w+'px'; c.style.height='90px';
  const ctx=c.getContext('2d'); ctx.scale(dpr,dpr);
  ctx.fillStyle='#080b0f'; ctx.fillRect(0,0,w,90);
  const strikes=selLegs.map(l=>l.strike), minS=Math.min(...strikes)*.93, maxS=Math.max(...strikes)*1.07;
  const ps=[], n=60;
  for (let i=0; i<=n; i++) ps.push(minS+(maxS-minS)*i/n);
  const pnl = ps.map(price => selLegs.reduce((sum,l)=>{
    const pay=l.tp==='call'?Math.max(0,price-l.strike):Math.max(0,l.strike-price);
    return sum+(l.act==='buy'?(pay-l.prem):(l.prem-pay));
  },0)*lot);
  const mxP=Math.max(...pnl), mnP=Math.min(...pnl), rng=Math.max(mxP-mnP,1);
  const pad={t:8,r:4,b:16,l:48}, pw=w-pad.l-pad.r, ph=90-pad.t-pad.b;
  const xOf=i=>pad.l+i/n*pw, yOf=v=>pad.t+ph*(1-(v-mnP)/rng), zy=yOf(0);
  ctx.strokeStyle='rgba(107,120,153,.4)'; ctx.lineWidth=1; ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(pad.l,zy); ctx.lineTo(w-pad.r,zy); ctx.stroke(); ctx.setLineDash([]);
  const si=(S-minS)/(maxS-minS)*n, sx=xOf(si);
  ctx.strokeStyle='rgba(255,165,2,.5)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(sx,pad.t); ctx.lineTo(sx,90-pad.b); ctx.stroke();
  ctx.beginPath(); pnl.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](xOf(i),yOf(v)));
  const g=ctx.createLinearGradient(0,pad.t,0,90-pad.b);
  g.addColorStop(0,'rgba(0,212,168,.15)'); g.addColorStop(1,'rgba(255,71,87,.15)');
  ctx.fillStyle=g; ctx.lineTo(xOf(n),yOf(mnP)); ctx.lineTo(xOf(0),yOf(mnP)); ctx.closePath(); ctx.fill();
  ctx.beginPath(); pnl.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](xOf(i),yOf(v)));
  ctx.strokeStyle='#00ffcc'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='#6b7899'; ctx.font='8px IBM Plex Mono'; ctx.textAlign='right';
  ctx.fillText(curr+mxP.toFixed(0), pad.l-2, pad.t+6);
  ctx.fillText(curr+mnP.toFixed(0), pad.l-2, 90-pad.b-2);
  ctx.fillStyle='#ffa502'; ctx.textAlign='center'; ctx.fillText('SPOT',sx,88);
}

// ═══════════════════════════════════════════════════════════════
// OPTIONS: GREEKS
// ═══════════════════════════════════════════════════════════════
function buildGreeks() {
  const stock=DB[sym]||DB.RELIANCE, S=livePrice||bars[bars.length-1]?.c||2000, exp=expDates[selExpIdx];
  if (!exp||!selLegs.length) {
    document.getElementById('gb').innerHTML='<div style="color:var(--t3);font-size:10px;padding:10px;text-align:center">Select strikes from Chain tab first</div>';
    return;
  }
  const T=Math.max(.001,(exp-new Date())/3.154e10), r=.065;
  let nD=0,nG=0,nT=0,nV=0;
  selLegs.forEach(l=>{
    const g=bsGreeks(S,l.strike,T,r,l.iv||.22), sg=l.act==='buy'?1:-1;
    nD+=(l.tp==='call'?g.delta:g.putDelta)*sg; nG+=g.gamma*sg; nT+=g.theta*sg; nV+=g.vega*sg;
  });
  const lot=stock.lot||1, curr=stock.c;
  document.getElementById('gb').innerHTML = `
    <div style="font-size:8px;color:var(--t3);margin-bottom:8px;padding:4px">Net Greeks — Real spot: ${curr}${S.toFixed(0)} · 1 lot = ${lot} shares</div>
    <div class="gg">
      <div class="gc"><div class="gcl">Delta Δ</div><div class="gcv" style="color:${nD>=0?'var(--g)':'var(--r)'}">${nD.toFixed(3)}</div><div style="font-size:7px;color:var(--t3);margin-top:2px">${curr}${(nD*S).toFixed(2)}/1%</div></div>
      <div class="gc"><div class="gcl">Gamma Γ</div><div class="gcv" style="color:${nG>=0?'var(--g)':'var(--r)'}">${nG.toFixed(4)}</div><div style="font-size:7px;color:var(--t3);margin-top:2px">Δ/move</div></div>
      <div class="gc"><div class="gcl">Theta Θ</div><div class="gcv" style="color:${nT>=0?'var(--g)':'var(--r)'}">${nT.toFixed(3)}</div><div style="font-size:7px;color:var(--t3);margin-top:2px">${curr}/day</div></div>
      <div class="gc"><div class="gcl">Vega ν</div><div class="gcv" style="color:${nV>=0?'var(--g)':'var(--r)'}">${nV.toFixed(3)}</div><div style="font-size:7px;color:var(--t3);margin-top:2px">${curr}/1% IV</div></div>
    </div>
    <div style="margin-top:8px;padding:8px;background:var(--bg2);border-radius:4px;border:1px solid var(--border);font-size:9px;line-height:1.7;color:var(--t2)">
      <strong style="color:var(--t)">Position Summary:</strong><br>
      ${nD>0?'📈 Net Long — benefits from price increase':'📉 Net Short — benefits from price decrease'}<br>
      ${nT>0?'⏱ Positive Theta — time decay works for you':'⏱ Negative Theta — time works against you'}<br>
      ${nV>0?'📊 Long Vega — rising IV benefits position':'📊 Short Vega — falling IV benefits position'}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// CHART ENGINE
// ═══════════════════════════════════════════════════════════════
const PAD = { t:14, r:62, b:14, l:4 };

function szCanvas(c) {
  const r=c.getBoundingClientRect(), w=r.width||c.offsetWidth||400, h=r.height||c.offsetHeight||200, dpr=window.devicePixelRatio||1;
  c.width=w*dpr; c.height=h*dpr;
  const ctx=c.getContext('2d'); ctx.scale(dpr,dpr);
  return { ctx, w, h };
}

function drawMain() {
  const c=document.getElementById('mc'); const{ctx,w,h}=szCanvas(c); if(bars.length<5)return;
  const cl=bars.map(b=>b.c), e20=ema(cl,20), e50=ema(cl,50), bv=bbCalc(cl), vw=vwapCalc(bars);
  const n=bars.length, pW=w-PAD.l-PAD.r, pH=h-PAD.t-PAD.b, bw=pW/n, cw=Math.max(1,bw*.65);
  const bO=n-bv.u.length;
  const allH=[...bars.map(b=>b.h),...(inds.bb&&bv.u.length?bv.u:[])];
  const allL=[...bars.map(b=>b.l),...(inds.bb&&bv.l.length?bv.l:[])];
  const pmx=Math.max(...allH)*1.004, pmn=Math.min(...allL)*.996, pr=pmx-pmn;
  const xOf=i=>PAD.l+(i+.5)*bw, yOf=p=>PAD.t+pH*(1-(p-pmn)/pr);
  const stock=DB[sym]||DB.RELIANCE;

  ctx.fillStyle='#080b0f'; ctx.fillRect(0,0,w,h);

  // Grid lines
  ctx.strokeStyle='rgba(26,30,44,.8)'; ctx.lineWidth=1;
  for(let i=0;i<=5;i++){
    const y=PAD.t+pH*i/5;
    ctx.beginPath(); ctx.moveTo(PAD.l,y); ctx.lineTo(w-PAD.r,y); ctx.stroke();
    ctx.fillStyle='#323a52'; ctx.font='8px IBM Plex Mono'; ctx.textAlign='right';
    ctx.fillText(stock.c+(pmx-pr*i/5).toFixed(2), w-1, y+4);
  }
  const vs=Math.max(1,Math.floor(n/7));
  for(let i=0;i<n;i+=vs){
    const x=xOf(i);
    ctx.strokeStyle='rgba(26,30,44,.5)'; ctx.beginPath(); ctx.moveTo(x,PAD.t); ctx.lineTo(x,h-PAD.b); ctx.stroke();
    const d=new Date(bars[i].t);
    const lb=tf==='1day'||tf==='1week'?`${d.getDate()}/${d.getMonth()+1}`:d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
    ctx.fillStyle='#323a52'; ctx.font='8px IBM Plex Mono'; ctx.textAlign='center'; ctx.fillText(lb,x,h-2);
  }

  // Bollinger Bands
  if(inds.bb&&bv.u.length){
    ctx.beginPath(); bv.u.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](xOf(i+bO),yOf(v)));
    for(let i=bv.l.length-1;i>=0;i--)ctx.lineTo(xOf(i+bO),yOf(bv.l[i]));
    ctx.closePath(); ctx.fillStyle='rgba(168,85,247,.05)'; ctx.fill();
    ctx.strokeStyle='rgba(168,85,247,.3)'; ctx.lineWidth=1;
    ctx.beginPath(); bv.u.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](xOf(i+bO),yOf(v))); ctx.stroke();
    ctx.beginPath(); bv.l.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](xOf(i+bO),yOf(v))); ctx.strokeStyle='rgba(168,85,247,.2)'; ctx.stroke();
    ctx.beginPath(); bv.m.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](xOf(i+bO),yOf(v)));
    ctx.strokeStyle='rgba(168,85,247,.12)'; ctx.setLineDash([3,4]); ctx.lineWidth=.8; ctx.stroke(); ctx.setLineDash([]);
  }

  // VWAP
  if(inds.vwap){
    ctx.beginPath(); vw.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](xOf(i),yOf(v)));
    ctx.strokeStyle='rgba(255,165,2,.6)'; ctx.lineWidth=1; ctx.setLineDash([4,3]); ctx.stroke(); ctx.setLineDash([]);
  }

  // EMAs
  if(inds.ema){
    [[e20,'rgba(61,142,248,.85)'],[e50,'rgba(249,115,22,.85)']].forEach(([vals,col])=>{
      ctx.beginPath(); vals.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](xOf(i),yOf(v)));
      ctx.strokeStyle=col; ctx.lineWidth=1.4; ctx.stroke();
    });
  }

  // Candles
  for(let i=0;i<n;i++){
    const b=bars[i], x=xOf(i), oY=yOf(b.o), cY=yOf(b.c), hY=yOf(b.h), lY=yOf(b.l);
    const bull=b.c>=b.o, col=bull?'#00d4a8':'#ff4757';
    ctx.strokeStyle=col; ctx.lineWidth=.8;
    ctx.beginPath(); ctx.moveTo(x,hY); ctx.lineTo(x,lY); ctx.stroke();
    const by=bull?cY:oY, bh=Math.max(1,Math.abs(oY-cY));
    if(i===n-1){
      ctx.strokeStyle=col; ctx.lineWidth=1; ctx.strokeRect(x-cw/2,by,cw,bh);
      ctx.fillStyle='rgba(8,11,15,.7)'; ctx.fillRect(x-cw/2+1,by+1,cw-2,Math.max(0,bh-2));
    }else{
      ctx.fillStyle=col; ctx.fillRect(x-cw/2,by,cw,bh);
    }
  }

  // Buy/Sell signals
  if(inds.sig){
    for(let i=5;i<n;i++){
      const cross=e20[i]>e50[i]&&e20[i-1]<=e50[i-1], crossD=e20[i]<e50[i]&&e20[i-1]>=e50[i-1];
      if(cross||crossD){
        const x=xOf(i), y=yOf(bars[i].c), ib=cross;
        ctx.fillStyle=ib?'#00d4a8':'#ff4757';
        ctx.beginPath();
        if(ib){ctx.moveTo(x,y+18);ctx.lineTo(x-5,y+28);ctx.lineTo(x+5,y+28);}
        else{ctx.moveTo(x,y-18);ctx.lineTo(x-5,y-28);ctx.lineTo(x+5,y-28);}
        ctx.closePath(); ctx.fill();
        ctx.font='bold 8px IBM Plex Mono'; ctx.textAlign='center'; ctx.fillStyle=ib?'#00d4a8':'#ff4757';
        ctx.fillText(ib?'BUY':'SELL', x, ib?y+40:y-40);
      }
    }
    // Live signal arrow
    const sw=document.getElementById('sword').textContent;
    if(sw==='BUY'||sw==='SELL'){
      const x=xOf(n-1), y=yOf(bars[n-1].c), ib=sw==='BUY';
      ctx.shadowColor=ib?'#00d4a8':'#ff4757'; ctx.shadowBlur=12;
      ctx.fillStyle=ib?'#00ffcc':'#ff6b78';
      ctx.beginPath();
      if(ib){ctx.moveTo(x,y+14);ctx.lineTo(x-7,y+26);ctx.lineTo(x+7,y+26);}
      else{ctx.moveTo(x,y-14);ctx.lineTo(x-7,y-26);ctx.lineTo(x+7,y-26);}
      ctx.closePath(); ctx.fill(); ctx.shadowBlur=0;
      ctx.font='bold 9px IBM Plex Mono'; ctx.textAlign='center'; ctx.fillStyle=ib?'#00ffcc':'#ff6b78';
      ctx.fillText('▶NOW', x, ib?y+38:y-38);
    }
  }

  // Price line + tag
  const lc=livePrice||bars[n-1].c, py=yOf(lc), up=lc>=(prevClose||lc*.99);
  ctx.strokeStyle=up?'rgba(0,212,168,.4)':'rgba(255,71,87,.4)'; ctx.lineWidth=1; ctx.setLineDash([2,3]);
  ctx.beginPath(); ctx.moveTo(PAD.l,py); ctx.lineTo(w-PAD.r,py); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle=up?'#00d4a8':'#ff4757'; ctx.fillRect(w-PAD.r+1,py-8,PAD.r-1,16);
  ctx.fillStyle='#080b0f'; ctx.textAlign='left'; ctx.font='bold 8px IBM Plex Mono';
  ctx.fillText(stock.c+lc.toFixed(2), w-PAD.r+3, py+3);
}

function drawRSI() {
  const c=document.getElementById('rc'); const{ctx,w,h}=szCanvas(c);
  const cl=bars.map(b=>b.c); if(cl.length<15)return;
  const rv=rsiCalc(cl), n=bars.length, off=n-rv.length, bw=w/n;
  ctx.fillStyle='#080b0f'; ctx.fillRect(0,0,w,h);
  [30,50,70].forEach(l=>{
    const y=h*(1-l/100);
    ctx.strokeStyle='rgba(26,30,44,.8)'; ctx.lineWidth=1; ctx.setLineDash(l===50?[]:[3,3]);
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w-PAD.r,y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#323a52'; ctx.font='8px IBM Plex Mono'; ctx.textAlign='right'; ctx.fillText(l,w-2,y+3);
  });
  ctx.beginPath(); rv.forEach((v,i)=>ctx[i?'lineTo':'moveTo']((i+off+.5)*bw, h*(1-v/100)));
  const last=rv[rv.length-1];
  ctx.strokeStyle=last>70?'#ff4757':last<30?'#00d4a8':'#ffa502'; ctx.lineWidth=1.3; ctx.stroke();
  ctx.fillStyle=last>70?'#ff4757':last<30?'#00d4a8':'#ffa502';
  ctx.font='bold 8px IBM Plex Mono'; ctx.textAlign='left'; ctx.fillText(last.toFixed(1),PAD.l,10);
}

function drawMACD() {
  const c=document.getElementById('macc'); const{ctx,w,h}=szCanvas(c);
  const cl=bars.map(b=>b.c); if(cl.length<30)return;
  const{ml,sig,hist}=macdCalc(cl), n=bars.length, off=n-hist.length, bw=w/n;
  const mx=Math.max(...hist.map(Math.abs))*1.3||1, yOf=v=>h/2-v/mx*(h/2-4);
  ctx.fillStyle='#080b0f'; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(26,30,44,.6)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,h/2); ctx.lineTo(w-PAD.r,h/2); ctx.stroke();
  hist.forEach((v,i)=>{
    const x=(i+off+.5)*bw, y=yOf(v), bH=Math.abs(y-h/2);
    ctx.fillStyle=v>=0?'rgba(0,212,168,.4)':'rgba(255,71,87,.4)';
    ctx.fillRect(x-bw*.38, Math.min(y,h/2), bw*.76, Math.max(1,bH));
  });
  [[ml,'#3d8ef8'],[sig,'#f97316']].forEach(([vals,col])=>{
    const o=n-vals.length; ctx.beginPath(); vals.forEach((v,i)=>ctx[i?'lineTo':'moveTo']((i+o+.5)*bw,yOf(v)));
    ctx.strokeStyle=col; ctx.lineWidth=1.2; ctx.stroke();
  });
  const lh=hist[hist.length-1];
  ctx.fillStyle=lh>=0?'#00d4a8':'#ff4757'; ctx.font='bold 8px IBM Plex Mono'; ctx.textAlign='left'; ctx.fillText(lh.toFixed(2),PAD.l,10);
}

function drawVol() {
  const c=document.getElementById('vc'); const{ctx,w,h}=szCanvas(c);
  ctx.fillStyle='#080b0f'; ctx.fillRect(0,0,w,h);
  const n=bars.length, bw=w/n, vm=Math.max(...bars.map(b=>b.v))||1;
  bars.forEach((b,i)=>{
    const bH=(b.v/vm)*(h-4);
    ctx.fillStyle=b.c>=b.o?'rgba(0,212,168,.35)':'rgba(255,71,87,.35)';
    ctx.fillRect(i*bw, h-bH-2, Math.max(1,bw-1), bH);
  });
}

function drawAll() { drawMain(); drawRSI(); drawMACD(); drawVol(); }

// ═══════════════════════════════════════════════════════════════
// CROSSHAIR
// ═══════════════════════════════════════════════════════════════
function setupXH() {
  const c=document.getElementById('mc'), tip=document.getElementById('xht');
  c.addEventListener('mousemove', e=>{
    const r=c.getBoundingClientRect(), mx=e.clientX-r.left, w=r.width, n=bars.length;
    const bw=(w-PAD.l-PAD.r)/n, i=Math.floor((mx-PAD.l)/bw);
    if(i<0||i>=n){tip.style.display='none';return;}
    const b=bars[i], stock=DB[sym]||DB.RELIANCE, curr=stock.c, d=new Date(b.t), up=b.c>=b.o;
    tip.style.display='block';
    tip.style.left=(mx+14+140>w?mx-148:mx+14)+'px';
    tip.style.top='30px';
    tip.innerHTML=`<div style="font-family:var(--head);font-size:12px;font-weight:700;color:${up?'#00d4a8':'#ff4757'};margin-bottom:4px">${sym}</div>
      <div style="color:var(--t3);font-size:8px;margin-bottom:4px">${d.toLocaleDateString('en-IN')} ${d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>
      <div style="display:grid;grid-template-columns:16px 1fr;gap:2px 8px;font-size:9px">
        <span style="color:var(--t3)">O</span><span>${curr}${b.o.toFixed(2)}</span>
        <span style="color:#00d4a8">H</span><span style="color:#00d4a8">${curr}${b.h.toFixed(2)}</span>
        <span style="color:#ff4757">L</span><span style="color:#ff4757">${curr}${b.l.toFixed(2)}</span>
        <span style="color:${up?'#00d4a8':'#ff4757'}">C</span><span style="color:${up?'#00d4a8':'#ff4757'};font-weight:700">${curr}${b.c.toFixed(2)}</span>
        <span style="color:var(--t3)">V</span><span>${b.v>1e5?(b.v/1e5).toFixed(1)+'L':(b.v/1e3).toFixed(0)+'K'}</span>
      </div>`;
  });
  c.addEventListener('mouseleave', ()=>tip.style.display='none');
}

// ═══════════════════════════════════════════════════════════════
// TICKER BAR
// ═══════════════════════════════════════════════════════════════
const MKTS = [
  {n:'NIFTY50',v:'23,412',c:'+0.82%',up:true},{n:'SENSEX',v:'76,890',c:'+0.91%',up:true},
  {n:'BANK NIFTY',v:'52,340',c:'-0.23%',up:false},{n:'S&P 500',v:'5,234',c:'+0.44%',up:true},
  {n:'NASDAQ',v:'16,450',c:'+0.61%',up:true},{n:'GOLD',v:'$2,312',c:'+0.5%',up:true},
  {n:'CRUDE',v:'$84.2',c:'-1.1%',up:false},{n:'USD/INR',v:'83.42',c:'-0.1%',up:false},
  {n:'BTC',v:'$72,410',c:'+2.1%',up:true},{n:'ETH',v:'$3,840',c:'-0.8%',up:false},
];
function buildTicker() {
  document.getElementById('ts').innerHTML = [...MKTS,...MKTS].map(m=>
    `<div class="ti"><span class="ti-n">${m.n}</span><span style="font-weight:600" class="${m.up?'up':'dn'}">${m.v}</span><span class="${m.up?'up':'dn'}" style="font-size:9px">${m.c}</span></div>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
// AI ANALYSIS
// ═══════════════════════════════════════════════════════════════
async function doAI() {
  const btn=document.getElementById('aib'), sp=document.getElementById('aisp'), out=document.getElementById('aio');
  btn.disabled=true; sp.className='aisp show'; out.className='aio';

  const stock=DB[sym]||DB.RELIANCE, price=livePrice||bars[bars.length-1]?.c||0;
  const cl=bars.map(b=>b.c), rv=cl.length>14?rsiCalc(cl):[], rL=rv.length?rv[rv.length-1].toFixed(1):'N/A';
  const e20v=cl.length>20?ema(cl,20):[], e50v=cl.length>50?ema(cl,50):[];
  const trend=e20v.length&&e50v.length?(e20v[e20v.length-1]>e50v[e50v.length-1]?'Bullish (EMA20 > EMA50)':'Bearish'):'N/A';
  const chgP=prevClose?((price-prevClose)/prevClose*100).toFixed(2):'N/A';
  const isCl=mktSt.s!=='open', today=new Date().toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'short'}), no=nextOpen(stock.ex);
  const sig=document.getElementById('sword').textContent;
  const isLive=document.getElementById('dtag').textContent.includes('LIVE');

  const prompt = `You are a professional NSE/BSE options trader and technical analyst.

TODAY: ${today}. Market: ${isCl?'CLOSED ('+mktSt.l+')':'OPEN'}.
DATA: ${isLive?'REAL NSE live data':'Simulated data'}
STOCK: ${sym} (${stock.n}) — ${stock.ex}
LIVE PRICE: ${stock.c}${price.toFixed(2)} | Day change: ${chgP}%
RSI(14): ${rL} | EMA Trend: ${trend} | Signal: ${sig} | Lot: ${stock.lot}
${isCl?`Next open: ${no}`:'MARKET IS LIVE NOW'}

${isCl?`PRE-MARKET PLAN for ${no}:
VERDICT: [BUY/SELL/HOLD] [emoji]
CONFIDENCE: [X]%
REASON: [2 sharp lines]
ENTRY ZONE: ${stock.c}[range]
TARGET 1: ${stock.c}[price] (+X%) | TARGET 2: ${stock.c}[price] (+X%)
STOP LOSS: ${stock.c}[price] (-X%)
OPTIONS PLAY: [strategy, strike, expiry, premium]
R:R: [X:X]
KEY RISK: [1 specific risk]`
:`LIVE SIGNAL:
VERDICT: [BUY/SELL/HOLD] [emoji]
CONFIDENCE: [X]%
REASON: [2 sharp lines]
ENTRY: ${stock.c}[price] | T1: ${stock.c}[price] | T2: ${stock.c}[price]
STOP LOSS: ${stock.c}[price]
OPTIONS PLAY: [strategy + strike]
R:R: [X:X]
KEY RISK: [1 risk]`}

Sharp, fast, trader-style. Numbers realistic for ${sym} at ${stock.c}${price.toFixed(0)}.`;

  try {
    const res  = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1000, messages:[{role:'user',content:prompt}] }) });
    const data = await res.json();
    const text = data.content.map(b=>b.text||'').join('');
    const vm   = text.match(/VERDICT:\s*(\w+)/i);
    const verdict = vm ? vm[1].toUpperCase() : 'HOLD';
    sp.className='aisp'; out.className='aio show';
    out.innerHTML = `
      <div class="avt ${verdict}">${verdict==='BUY'?'🟢':verdict==='SELL'?'🔴':'🟡'} ${verdict} — ${sym}
        ${isLive?'<span style="font-size:9px;color:var(--g);background:var(--g3);padding:1px 5px;border-radius:2px;font-family:var(--font)">● LIVE</span>':''}
      </div>
      ${isCl?`<div style="font-size:8px;color:var(--y);margin-bottom:6px;padding:3px 6px;background:var(--y2);border-radius:2px;border:1px solid rgba(255,165,2,.15)">📅 Plan for: ${no}</div>`:''}
      <div style="white-space:pre-line;font-size:9px;line-height:1.8;margin-top:6px">
        ${text.replace(/VERDICT:.*\n?/i,'')
              .replace(/\*\*(.*?)\*\*/g,'<strong style="color:var(--t)">$1</strong>')
              .replace(/^(CONFIDENCE|REASON|ENTRY|TARGET|STOP|OPTIONS|RISK|R:R|KEY RISK|VERDICT|LIVE)[\s:]*/gm,'<strong style="color:var(--t2)">$&</strong>')}
      </div>`;
  } catch(e) {
    sp.className='aisp'; out.className='aio show';
    out.innerHTML='<span style="color:var(--r)">API error — check connection.</span>';
  }
  btn.disabled=false;
}

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════

// Tab switching (Signal / Options / AI)
document.querySelectorAll('.trow .tab').forEach(tab => {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.trow .tab').forEach(t=>t.classList.remove('on'));
    document.querySelectorAll('.tb').forEach(b=>b.classList.remove('on'));
    this.classList.add('on');
    document.getElementById('tab-' + this.dataset.t).classList.add('on');
    if (this.dataset.t === 'options') { buildExpiries(); buildChain(); buildStrategy(); }
  });
});

// Options sub-tabs (Chain / Strategy / Greeks)
document.querySelectorAll('.ot2').forEach(tab => {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.ot2').forEach(t=>t.classList.remove('on'));
    document.querySelectorAll('[id^="otc-"]').forEach(b=>b.style.display='none');
    this.classList.add('on');
    document.getElementById('otc-' + this.dataset.ot).style.display='block';
    if (this.dataset.ot === 'strategy') buildStrategy();
    if (this.dataset.ot === 'greeks')   buildGreeks();
  });
});

// Indicator toggles
document.querySelectorAll('.ib').forEach(btn => {
  btn.addEventListener('click', function () {
    this.classList.toggle('on');
    inds[this.dataset.ind] = this.classList.contains('on');
    drawAll();
  });
});

// Search
const siEl=document.getElementById('si'), sdEl=document.getElementById('sd');
siEl.addEventListener('input', function () {
  const q = this.value.toUpperCase().trim();
  if (!q) { sdEl.className='sdrop'; return; }
  const m = Object.entries(DB).filter(([t,s])=>t.includes(q)||s.n.toUpperCase().includes(q)).slice(0,8);
  if (!m.length) { sdEl.className='sdrop'; return; }
  sdEl.innerHTML = m.map(([t,s])=>`<div class="srow" onclick="loadSym('${t}')"><div><div class="srow-t">${t}</div><div class="srow-n">${s.n}</div></div><div class="srow-e">${s.ex}</div></div>`).join('');
  sdEl.className = 'sdrop open';
});
document.addEventListener('click', e=>{ if (!e.target.closest('.sw')) sdEl.className='sdrop'; });

// Timeframe
document.getElementById('tfR').addEventListener('click', e => {
  const b = e.target.closest('.tf'); if (!b) return;
  document.querySelectorAll('.tf').forEach(x=>x.classList.remove('on'));
  b.classList.add('on'); tf = b.dataset.tf;
  loadSym(sym, true);
});

// ═══════════════════════════════════════════════════════════════
// LOAD SYMBOL
// ═══════════════════════════════════════════════════════════════
async function loadSym(ticker, force = false) {
  sym = ticker;
  siEl.value = ''; sdEl.className = 'sdrop';
  document.getElementById('aio').className = 'aio';
  selLegs = []; livePrice = 0; prevClose = 0;
  document.getElementById('tbSym').textContent = ticker;
  document.getElementById('tbPr').textContent  = (DB[ticker]||DB.RELIANCE).c + '—';
  document.getElementById('tbCh').textContent  = 'Loading…';
  document.getElementById('tbCh').className    = 'tb-chg up';
  renderWL();
  await loadRealData(ticker, tf, force);
}

// ═══════════════════════════════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════════════════════════════
function updateClock() {
  const now = new Date();
  document.getElementById('clk').textContent  = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
  document.getElementById('wlc').textContent  = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
(async function init() {
  buildTicker();
  bars = genSimBars('RELIANCE', '15min'); // Show chart immediately while API loads
  requestAnimationFrame(() => {
    drawAll();
    setupXH();
    buildExpiries();
    buildChain();
    buildStrategy();
  });
  updateClock();
  setInterval(updateClock, 1000);
  initWL();
  await loadSym('RELIANCE');
  window.addEventListener('resize', () => drawAll());
})();
