// Harry's formula engine: spreadsheet-style formulas with maths, logic, text, lookup, statistics, dates and finance.
export const ERR = n => ({ err: n });
export const isErr = v => v && typeof v === 'object' && 'err' in v;
export const colName = c => { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; };
export const colIndex = s => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
export const addr = (r, c) => colName(c) + (r + 1);
export function parseAddr(a){ const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(a); return m ? { r: +m[2] - 1, c: colIndex(m[1]) } : null; }
export function parseRange(s){ const [a, b] = s.split(':'); const p = parseAddr(a), q = parseAddr(b || a); if (!p || !q) return null; return { r0: Math.min(p.r, q.r), c0: Math.min(p.c, q.c), r1: Math.max(p.r, q.r), c1: Math.max(p.c, q.c) }; }

/* ---------- tokens ---------- */
const REF = /^(?:(?:'[^']+'|[A-Za-z_][\w.]*)!)?\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?/;
export function tokenize(src){
  const t = []; let i = 0;
  while (i < src.length) {
    const ch = src[i], rest = src.slice(i);
    if (/\s/.test(ch)) { i++; continue; }
    let m;
    if (ch === '"') { let j = i + 1, s = ''; while (j < src.length) { if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; } s += src[j++]; } t.push({ t: 'str', v: s }); i = j + 1; continue; }
    if ((m = /^\d+(\.\d+)?([eE][+-]?\d+)?|^\.\d+/.exec(rest))) { t.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if ((m = REF.exec(rest)) && !/^[\w.(]/.test(rest.slice(m[0].length))) { t.push({ t: 'ref', v: m[0] }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_][\w.]*(?=\s*\()/.exec(rest))) { t.push({ t: 'fn', v: m[0].toUpperCase() }); i += m[0].length; continue; }
    if ((m = /^(TRUE|FALSE)\b/i.exec(rest))) { t.push({ t: 'bool', v: m[0].toUpperCase() === 'TRUE' }); i += m[0].length; continue; }
    if ((m = /^#(DIV\/0!|N\/A|VALUE!|REF!|NAME\?|NUM!)/.exec(rest))) { t.push({ t: 'errlit', v: m[0] }); i += m[0].length; continue; }
    if ((m = /^(<=|>=|<>)/.exec(rest))) { t.push({ t: 'op', v: m[0] }); i += 2; continue; }
    if ('{};'.includes(ch)) { t.push({ t: ch, v: ch }); i++; continue; }
    if ('+-*/^&=<>%(),'.includes(ch)) { t.push({ t: ch === '(' || ch === ')' ? ch : ch === ',' ? ',' : 'op', v: ch }); i++; continue; }
    if ((m = /^[A-Za-z_][\w.]*/.exec(rest))) { t.push({ t: 'name', v: m[0] }); i += m[0].length; continue; }
    throw new Error('Unexpected "' + ch + '"');
  }
  return t;
}

/* ---------- parser ---------- */
export function parse(src){
  const T = tokenize(src); let p = 0;
  const peek = () => T[p], next = () => T[p++];
  const isOp = (...v) => T[p] && T[p].t === 'op' && v.includes(T[p].v);
  function cmp(){ let l = cat(); while (isOp('=', '<>', '<', '>', '<=', '>=')) { const o = next().v; l = { k: 'bin', o, l, r: cat() }; } return l; }
  function cat(){ let l = add(); while (isOp('&')) { next(); l = { k: 'bin', o: '&', l, r: add() }; } return l; }
  function add(){ let l = mul(); while (isOp('+', '-')) { const o = next().v; l = { k: 'bin', o, l, r: mul() }; } return l; }
  function mul(){ let l = pow(); while (isOp('*', '/')) { const o = next().v; l = { k: 'bin', o, l, r: pow() }; } return l; }
  function pow(){ let l = unary(); while (isOp('^')) { next(); l = { k: 'bin', o: '^', l, r: unary() }; } return l; }
  function unary(){ if (isOp('-')) { next(); return { k: 'neg', e: unary() }; } if (isOp('+')) { next(); return unary(); } return pct(); }
  function pct(){ let e = prim(); while (isOp('%')) { next(); e = { k: 'bin', o: '/', l: e, r: { k: 'num', v: 100 } }; } return e; }
  function prim(){
    const tk = next(); if (!tk) throw new Error('Formula ends too early');
    if (tk.t === 'num') return { k: 'num', v: tk.v };
    if (tk.t === 'str') return { k: 'str', v: tk.v };
    if (tk.t === 'bool') return { k: 'bool', v: tk.v };
    if (tk.t === 'errlit') return { k: 'errlit', v: tk.v };
    if (tk.t === 'ref') return { k: 'ref', v: tk.v };
    if (tk.t === 'name') return { k: 'name', v: tk.v };
    if (tk.t === '(') { const e = cmp(); if (next()?.t !== ')') throw new Error('Missing )'); return e; }
    if (tk.t === '{') { const rows = [[]]; while (peek() && peek().t !== '}') { const t2 = peek(); if (t2.t === ',') { next(); continue; } if (t2.t === ';') { next(); rows.push([]); continue; } const neg = isOp('-') ? (next(), -1) : 1; const v = next(); rows.at(-1).push(v.t === 'num' ? neg * v.v : v.v); }
      next(); return { k: 'arr', v: rows }; }
    if (tk.t === 'fn') { next(); const args = []; if (peek()?.t !== ')') { do { if (peek()?.t === ',' || peek()?.t === ';' || peek()?.t === ')') args.push({ k: 'blank' }); else args.push(cmp()); } while ((peek()?.t === ',' || peek()?.t === ';') && next()); }
      if (next()?.t !== ')') throw new Error('Missing ) after ' + tk.v); return { k: 'fn', n: tk.v.replace(/^_XLFN\./, ''), args }; }
    throw new Error('Unexpected ' + (tk.v || tk.t));
  }
  const e = cmp(); if (p < T.length) throw new Error('Unexpected ' + (T[p].v || T[p].t)); return e;
}

/* ---------- shifting references (fill, copy, paste) ---------- */
export function shiftFormula(raw, dr, dc){
  if (typeof raw !== 'string' || raw[0] !== '=') return raw;
  let out = '', i = 1; const src = raw;
  while (i < src.length) {
    if (src[i] === '"') { const j = src.indexOf('"', i + 1); const e = j < 0 ? src.length : j + 1; out += src.slice(i, e); i = e; continue; }
    const m = REF.exec(src.slice(i));
    if (m && (i === 1 || !/[\w.$]/.test(src[i - 1])) && !/^[\w.(]/.test(src.slice(i + m[0].length))) {
      const bang = m[0].lastIndexOf('!'), pre = bang >= 0 ? m[0].slice(0, bang + 1) : '';
      out += pre + m[0].slice(pre.length).replace(/(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g, (all, dc$, col, dr$, row) => {
        const c = dc$ ? colIndex(col) : colIndex(col) + dc, r = dr$ ? +row : +row + dr;
        if (c < 0 || r < 1) return '#REF!'; return dc$ + colName(c) + dr$ + r; });
      i += m[0].length; continue;
    }
    out += src[i++];
  }
  return '=' + out.replace(/^=/, '');
}

/* ---------- values ---------- */
export const num = v => { if (isErr(v)) return v; if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; if (v === '' || v == null) return 0; const n = Number(String(v).replace(/[,$£€\s]/g, '').replace(/^\((.*)\)$/, '-$1')); return isNaN(n) ? ERR('#VALUE!') : n; };
const str = v => isErr(v) ? v : v == null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? String(+v.toPrecision(15)) : String(v);
const truthy = v => typeof v === 'string' ? v.toUpperCase() === 'TRUE' || (v !== '' && v.toUpperCase() !== 'FALSE' && !isNaN(+v) && +v !== 0) : !!v;
const flat = a => a.flatMap(x => Array.isArray(x) ? x.flat(Infinity) : [x]);
const nums = (args, strict) => { const o = []; for (const a of args) { if (Array.isArray(a)) { for (const v of a.flat(Infinity)) if (typeof v === 'number') o.push(v); else if (isErr(v)) return v; } else { const n = num(a); if (isErr(n)) { if (strict) return n; } else o.push(n); } } return o; };
const grid = v => Array.isArray(v) ? (Array.isArray(v[0]) ? v : [v]) : [[v]];
const firstErr = (...v) => v.find(isErr);

function crit(c){
  if (typeof c === 'number') return v => (typeof v === 'number' ? v : num(v)) === c;
  const m = /^(<=|>=|<>|=|<|>)?(.*)$/.exec(String(c)), o = m[1] || '=', rhs = m[2], n = rhs !== '' && !isNaN(+rhs) ? +rhs : null;
  const wild = n === null && /[*?]/.test(rhs) ? new RegExp('^' + rhs.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i') : null;
  return v => {
    if (n !== null && (typeof v === 'number' || (v !== '' && !isNaN(+v)))) { const x = +v; return o === '=' ? x === n : o === '<>' ? x !== n : o === '<' ? x < n : o === '>' ? x > n : o === '<=' ? x <= n : x >= n; }
    const s = str(v).toLowerCase(), r = rhs.toLowerCase();
    if (o === '=') return wild ? wild.test(s) : s === r; if (o === '<>') return wild ? !wild.test(s) : s !== r;
    return o === '<' ? s < r : o === '>' ? s > r : o === '<=' ? s <= r : s >= r; };
}
const ifs = (args, mode) => {
  const tgt = grid(args[0]).flat(), sets = []; for (let i = 1; i + 1 < args.length; i += 2) sets.push([grid(args[i]).flat(), crit(args[i + 1])]);
  const out = []; for (let k = 0; k < tgt.length; k++) if (sets.every(([r, f]) => f(r[k] ?? ''))) out.push(tgt[k]); return out; };

/* ---------- dates (spreadsheet serial numbers) ---------- */
const EPOCH = Date.UTC(1899, 11, 30);
export const toSerial = d => (d.getTime() - EPOCH) / 864e5 - d.getTimezoneOffset() / 1440 * 0;
export const fromSerial = s => new Date(EPOCH + Math.round(s * 864e5));

/* ---------- finance ---------- */
const pmt = (r, n, pv, fv = 0, t = 0) => r === 0 ? -(pv + fv) / n : -(r * (pv * Math.pow(1 + r, n) + fv)) / ((1 + r * t) * (Math.pow(1 + r, n) - 1));
const fv = (r, n, p, pv = 0, t = 0) => r === 0 ? -(pv + p * n) : -(pv * Math.pow(1 + r, n) + p * (1 + r * t) * (Math.pow(1 + r, n) - 1) / r);
const pv = (r, n, p, f = 0, t = 0) => r === 0 ? -(f + p * n) : -(f + p * (1 + r * t) * (Math.pow(1 + r, n) - 1) / r) / Math.pow(1 + r, n);
const npv = (r, cfs) => cfs.reduce((a, c, i) => a + c / Math.pow(1 + r, i + 1), 0);
function irr(cfs, g = 0.1){
  if (!cfs.some(c => c > 0) || !cfs.some(c => c < 0)) return ERR('#NUM!');
  const f = r => cfs.reduce((a, c, i) => a + c / Math.pow(1 + r, i), 0), d = r => cfs.reduce((a, c, i) => a - i * c / Math.pow(1 + r, i + 1), 0);
  let r = g; for (let k = 0; k < 60; k++) { const y = f(r), dy = d(r); if (!isFinite(y) || dy === 0) break; const nr = r - y / dy; if (Math.abs(nr - r) < 1e-10) return nr; r = nr <= -0.9999 ? -0.99 : nr; }
  let lo = -0.9999, hi = 10; if (f(lo) * f(hi) > 0) return ERR('#NUM!'); for (let k = 0; k < 300; k++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; } return (lo + hi) / 2;
}
function rate(n, p, v, f = 0, t = 0, g = 0.1){ let r = g; for (let k = 0; k < 100; k++) { const y = fv(r, n, p, v, t) - f, h = 1e-7, d = (fv(r + h, n, p, v, t) - f - y) / h; if (!d) break; const nr = r - y / d; if (Math.abs(nr - r) < 1e-10) return nr; r = nr; } return ERR('#NUM!'); }
const regress = (ys, xs) => { const n = ys.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } const b = sxx ? sxy / sxx : 0; return { b, a: my - b * mx, r: sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0 }; };
const pairs = (ys, xs) => { const Y = grid(ys).flat(), X = xs === undefined ? Y.map((_, i) => i + 1) : grid(xs).flat(); const y = [], x = []; for (let i = 0; i < Y.length; i++) if (typeof Y[i] === 'number' && typeof X[i] === 'number') { y.push(Y[i]); x.push(X[i]); } return [y, x]; };
const variance = (a, s) => { const n = a.length; if (n - (s ? 1 : 0) <= 0) return ERR('#DIV/0!'); const m = a.reduce((x, y) => x + y, 0) / n; return a.reduce((x, y) => x + (y - m) ** 2, 0) / (n - (s ? 1 : 0)); };
const roundTo = (x, d, mode) => { const f = Math.pow(10, d); const v = x * f; const r = mode === 'up' ? Math.sign(v) * Math.ceil(Math.abs(v) - 1e-9) : mode === 'down' ? Math.sign(v) * Math.floor(Math.abs(v) + 1e-9) : Math.sign(v) * Math.round(Math.abs(v) + 1e-9); return r / f; };

function textFmt(v, f){
  v = num(v); if (isErr(v)) return v; f = String(f);
  if (/%/.test(f)) { const d = (f.split('.')[1] || '').replace(/[^0#]/g, '').length; return (v * 100).toFixed(d) + '%'; }
  if (/[dmy]/i.test(f) && !/[0#]/.test(f)) { const d = fromSerial(v); const p = n => String(n).padStart(2, '0'); return f.replace(/yyyy/i, d.getUTCFullYear()).replace(/yy/i, String(d.getUTCFullYear()).slice(2)).replace(/mm/i, p(d.getUTCMonth() + 1)).replace(/dd/i, p(d.getUTCDate())); }
  const d = (f.split('.')[1] || '').replace(/[^0#]/g, '').length, comma = f.includes(','); const s = v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: comma });
  return (f.match(/^[^0#,.]*/) || [''])[0] + s;
}

export const FN = {
  SUM: a => { const n = nums(a); return isErr(n) ? n : n.reduce((x, y) => x + y, 0); },
  AVERAGE: a => { const n = nums(a); return isErr(n) ? n : n.length ? n.reduce((x, y) => x + y, 0) / n.length : ERR('#DIV/0!'); },
  MIN: a => { const n = nums(a); return isErr(n) ? n : n.length ? Math.min(...n) : 0; },
  MAX: a => { const n = nums(a); return isErr(n) ? n : n.length ? Math.max(...n) : 0; },
  MEDIAN: a => { const n = nums(a); if (isErr(n)) return n; if (!n.length) return ERR('#NUM!'); n.sort((x, y) => x - y); const m = n.length >> 1; return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; },
  COUNT: a => flat(a).filter(v => typeof v === 'number').length,
  COUNTA: a => flat(a).filter(v => v !== '' && v != null).length,
  COUNTBLANK: a => flat(a).filter(v => v === '' || v == null).length,
  PRODUCT: a => { const n = nums(a); return isErr(n) ? n : n.reduce((x, y) => x * y, 1); },
  SUMPRODUCT: a => { const g = a.map(x => grid(x).flat()); return g[0].reduce((s, _, i) => s + g.reduce((p, arr) => p * (typeof arr[i] === 'number' ? arr[i] : 0), 1), 0); },
  SUMIF: a => (a.length > 2 ? ifs([a[2], a[0], a[1]]) : ifs([a[0], a[0], a[1]])).filter(v => typeof v === 'number').reduce((x, y) => x + y, 0),
  SUMIFS: a => ifs(a).filter(v => typeof v === 'number').reduce((x, y) => x + y, 0),
  COUNTIF: a => ifs([a[0], a[0], a[1]]).length,
  COUNTIFS: a => { const t = []; for (let i = 0; i < a.length; i += 2) t.push(a[i], a[i + 1]); return ifs([a[0], ...t]).length; },
  AVERAGEIF: a => { const v = (a.length > 2 ? ifs([a[2], a[0], a[1]]) : ifs([a[0], a[0], a[1]])).filter(v => typeof v === 'number'); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : ERR('#DIV/0!'); },
  AVERAGEIFS: a => { const v = ifs(a).filter(v => typeof v === 'number'); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : ERR('#DIV/0!'); },
  ROUND: ([x, d = 0]) => firstErr(num(x), num(d)) || roundTo(num(x), num(d)),
  ROUNDUP: ([x, d = 0]) => firstErr(num(x), num(d)) || roundTo(num(x), num(d), 'up'),
  ROUNDDOWN: ([x, d = 0]) => firstErr(num(x), num(d)) || roundTo(num(x), num(d), 'down'),
  INT: ([x]) => isErr(num(x)) ? num(x) : Math.floor(num(x)),
  ABS: ([x]) => isErr(num(x)) ? num(x) : Math.abs(num(x)),
  SQRT: ([x]) => { const n = num(x); return isErr(n) ? n : n < 0 ? ERR('#NUM!') : Math.sqrt(n); },
  POWER: ([x, y]) => firstErr(num(x), num(y)) || Math.pow(num(x), num(y)),
  EXP: ([x]) => Math.exp(num(x)), LN: ([x]) => num(x) > 0 ? Math.log(num(x)) : ERR('#NUM!'), LOG10: ([x]) => Math.log10(num(x)),
  MOD: ([x, y]) => num(y) === 0 ? ERR('#DIV/0!') : num(x) - num(y) * Math.floor(num(x) / num(y)),
  PI: () => Math.PI, RAND: () => Math.random(),
  IF: ([c, a = true, b = false]) => isErr(c) ? c : truthy(c) ? a : b,
  IFERROR: ([v, alt]) => isErr(v) ? alt : v,
  IFNA: ([v, alt]) => isErr(v) && v.err === '#N/A' ? alt : v,
  IFS: a => { for (let i = 0; i + 1 < a.length; i += 2) if (truthy(a[i])) return a[i + 1]; return ERR('#N/A'); },
  AND: a => flat(a).every(truthy), OR: a => flat(a).some(truthy), NOT: ([x]) => !truthy(x), XOR: a => flat(a).filter(truthy).length % 2 === 1,
  ISBLANK: ([x]) => x === '' || x == null, ISNUMBER: ([x]) => typeof x === 'number', ISTEXT: ([x]) => typeof x === 'string' && x !== '', ISERROR: ([x]) => isErr(x),
  CONCAT: a => flat(a).map(str).join(''), CONCATENATE: a => flat(a).map(str).join(''),
  TEXTJOIN: ([d, skip, ...a]) => flat(a).map(str).filter(s => !truthy(skip) || s !== '').join(str(d)),
  LEFT: ([s, n = 1]) => str(s).slice(0, num(n)), RIGHT: ([s, n = 1]) => num(n) ? str(s).slice(-num(n)) : '', MID: ([s, a, n]) => str(s).substr(num(a) - 1, num(n)),
  LEN: ([s]) => str(s).length, UPPER: ([s]) => str(s).toUpperCase(), LOWER: ([s]) => str(s).toLowerCase(), TRIM: ([s]) => str(s).trim().replace(/\s+/g, ' '),
  PROPER: ([s]) => str(s).toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
  SUBSTITUTE: ([s, a, b]) => str(s).split(str(a)).join(str(b)),
  FIND: ([f, s, st = 1]) => { const i = str(s).indexOf(str(f), num(st) - 1); return i < 0 ? ERR('#VALUE!') : i + 1; },
  SEARCH: ([f, s, st = 1]) => { const i = str(s).toLowerCase().indexOf(str(f).toLowerCase(), num(st) - 1); return i < 0 ? ERR('#VALUE!') : i + 1; },
  VALUE: ([s]) => num(s), TEXT: ([v, f]) => textFmt(v, f), REPT: ([s, n]) => str(s).repeat(Math.max(0, num(n))),
  VLOOKUP: ([k, t, ci, approx = true]) => { const g = grid(t), c = num(ci) - 1; if (c < 0 || c >= g[0].length) return ERR('#REF!');
    if (!truthy(approx)) { const r = g.find(row => str(row[0]).toLowerCase() === str(k).toLowerCase() || row[0] === k); return r ? r[c] : ERR('#N/A'); }
    let best = null; for (const row of g) { if (typeof row[0] === typeof k ? row[0] <= k : num(row[0]) <= num(k)) best = row; else break; } return best ? best[c] : ERR('#N/A'); },
  HLOOKUP: ([k, t, ri, approx = true]) => { const g = grid(t), T = g[0].map((_, i) => g.map(r => r[i])); return FN.VLOOKUP([k, T, ri, approx]); },
  INDEX: ([t, r, c = 1]) => { const g = grid(t); let R = num(r), C = num(c); if (g.length === 1 && C === 1 && R > 1) { C = R; R = 1; } const v = g[R - 1]?.[C - 1]; return v === undefined ? ERR('#REF!') : v; },
  MATCH: ([k, t, type = 1]) => { const a = grid(t).flat(), ty = num(type);
    if (ty === 0) { const i = a.findIndex(v => str(v).toLowerCase() === str(k).toLowerCase()); return i < 0 ? ERR('#N/A') : i + 1; }
    let b = -1; for (let i = 0; i < a.length; i++) if (ty > 0 ? a[i] <= k : a[i] >= k) b = i; else break; return b < 0 ? ERR('#N/A') : b + 1; },
  XLOOKUP: ([k, look, ret, nf]) => { const a = grid(look).flat(), r = grid(ret).flat(); const i = a.findIndex(v => str(v).toLowerCase() === str(k).toLowerCase()); return i < 0 ? (nf !== undefined ? nf : ERR('#N/A')) : r[i]; },
  ROWS: ([t]) => grid(t).length, COLUMNS: ([t]) => grid(t)[0].length,
  TODAY: () => Math.floor((Date.now() - EPOCH - new Date().getTimezoneOffset() * 6e4) / 864e5), NOW: () => (Date.now() - EPOCH - new Date().getTimezoneOffset() * 6e4) / 864e5,
  DATE: ([y, m, d]) => (Date.UTC(num(y), num(m) - 1, num(d)) - EPOCH) / 864e5,
  YEAR: ([s]) => fromSerial(num(s)).getUTCFullYear(), MONTH: ([s]) => fromSerial(num(s)).getUTCMonth() + 1, DAY: ([s]) => fromSerial(num(s)).getUTCDate(),
  EOMONTH: ([s, m]) => { const d = fromSerial(num(s)); return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + num(m) + 1, 0) - EPOCH) / 864e5; },
  EDATE: ([s, m]) => { const d = fromSerial(num(s)); return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + num(m), d.getUTCDate()) - EPOCH) / 864e5; },
  DAYS: ([e, s]) => num(e) - num(s),
  // finance
  PMT: ([r, n, v, f = 0, t = 0]) => firstErr(num(r), num(n), num(v)) || pmt(num(r), num(n), num(v), num(f), num(t)),
  FV: ([r, n, p, v = 0, t = 0]) => fv(num(r), num(n), num(p), num(v), num(t)),
  PV: ([r, n, p, f = 0, t = 0]) => pv(num(r), num(n), num(p), num(f), num(t)),
  NPER: ([r, p, v, f = 0, t = 0]) => { r = num(r); p = num(p); v = num(v); f = num(f); t = num(t); if (r === 0) return -(v + f) / p; const z = p * (1 + r * t) / r; return Math.log((z - f) / (z + v)) / Math.log(1 + r); },
  RATE: ([n, p, v, f = 0, t = 0, g = 0.1]) => rate(num(n), num(p), num(v), num(f), num(t), num(g)),
  NPV: ([r, ...a]) => { const n = nums(a); return isErr(n) ? n : npv(num(r), n); },
  IRR: ([a, g = 0.1]) => { const n = nums([a]); return isErr(n) ? n : irr(n, num(g)); },
  MIRR: ([a, fr, rr]) => { const c = nums([a]); const n = c.length - 1; const pvNeg = c.reduce((s, x, i) => s + (x < 0 ? x / Math.pow(1 + num(fr), i) : 0), 0), fvPos = c.reduce((s, x, i) => s + (x > 0 ? x * Math.pow(1 + num(rr), n - i) : 0), 0); return pvNeg === 0 ? ERR('#DIV/0!') : Math.pow(-fvPos / pvNeg, 1 / n) - 1; },
  IPMT: ([r, per, n, v, f = 0, t = 0]) => { r = num(r); const p = pmt(r, num(n), num(v), num(f), num(t)); const bal = -fv(r, num(per) - 1, p, num(v), num(t)); return num(t) === 1 && num(per) === 1 ? 0 : -bal * r * (num(t) === 1 ? 1 / (1 + r) : 1); },
  PPMT: ([r, per, n, v, f = 0, t = 0]) => pmt(num(r), num(n), num(v), num(f), num(t)) - FN.IPMT([r, per, n, v, f, t]),
  SLN: ([c, s, l]) => (num(c) - num(s)) / num(l),
  DDB: ([c, s, l, per, fac = 2]) => { let b = num(c), d = 0; for (let i = 1; i <= num(per); i++) { d = Math.min(b * num(fac) / num(l), Math.max(0, b - num(s))); b -= d; } return d; },
  DB: ([c, s, l, per]) => { const r = Math.round((1 - Math.pow(num(s) / num(c), 1 / num(l))) * 1000) / 1000; let b = num(c), d = 0; for (let i = 1; i <= num(per); i++) { d = b * r; b -= d; } return d; },
  EFFECT: ([r, n]) => Math.pow(1 + num(r) / num(n), num(n)) - 1, NOMINAL: ([r, n]) => num(n) * (Math.pow(1 + num(r), 1 / num(n)) - 1),
  // statistics and prediction
  STDEV: a => { const n = nums(a); const v = isErr(n) ? n : variance(n, true); return isErr(v) ? v : Math.sqrt(v); },
  'STDEV.S': a => FN.STDEV(a), 'STDEV.P': a => { const n = nums(a); const v = variance(n, false); return isErr(v) ? v : Math.sqrt(v); }, STDEVP: a => FN['STDEV.P'](a),
  VAR: a => variance(nums(a), true), 'VAR.S': a => variance(nums(a), true), 'VAR.P': a => variance(nums(a), false),
  SLOPE: ([y, x]) => { const [Y, X] = pairs(y, x); return Y.length < 2 ? ERR('#DIV/0!') : regress(Y, X).b; },
  INTERCEPT: ([y, x]) => { const [Y, X] = pairs(y, x); return Y.length < 2 ? ERR('#DIV/0!') : regress(Y, X).a; },
  CORREL: ([y, x]) => { const [Y, X] = pairs(y, x); return regress(Y, X).r; }, RSQ: ([y, x]) => { const [Y, X] = pairs(y, x); return regress(Y, X).r ** 2; },
  FORECAST: ([x, y, xs]) => { const [Y, X] = pairs(y, xs); if (Y.length < 2) return ERR('#DIV/0!'); const { a, b } = regress(Y, X); return a + b * num(x); },
  'FORECAST.LINEAR': a => FN.FORECAST(a),
  TREND: ([y, xs, nx]) => { const [Y, X] = pairs(y, xs); const { a, b } = regress(Y, X); return a + b * num(grid(nx ?? X.length + 1).flat()[0]); },
  GROWTH: ([y, xs, nx]) => { const [Y, X] = pairs(y, xs); if (Y.some(v => v <= 0)) return ERR('#NUM!'); const { a, b } = regress(Y.map(Math.log), X); return Math.exp(a + b * num(grid(nx ?? X.length + 1).flat()[0])); },
  LARGE: ([a, k]) => { const n = nums([a]).sort((x, y) => y - x); return n[num(k) - 1] ?? ERR('#NUM!'); },
  SMALL: ([a, k]) => { const n = nums([a]).sort((x, y) => x - y); return n[num(k) - 1] ?? ERR('#NUM!'); },
  RANK: ([v, a, ord = 0]) => { const n = nums([a]).sort((x, y) => num(ord) ? x - y : y - x); const i = n.indexOf(num(v)); return i < 0 ? ERR('#N/A') : i + 1; },
  PERCENTILE: ([a, k]) => { const n = nums([a]).sort((x, y) => x - y); const p = (n.length - 1) * num(k), lo = Math.floor(p); return n[lo] + (n[Math.ceil(p)] - n[lo]) * (p - lo); },
};
FN['RANK.EQ'] = FN.RANK; FN['PERCENTILE.INC'] = FN.PERCENTILE; FN.AVERAGEA = FN.AVERAGE;
export const FUNCTIONS = Object.keys(FN).sort();

/* ---------- evaluation ---------- */
function binop(o, a, b){
  if (o === '&') { const e = firstErr(a, b); return e || str(a) + str(b); }
  if (['=', '<>', '<', '>', '<=', '>='].includes(o)) {
    const e = firstErr(a, b); if (e) return e;
    let x = a, y = b; if (typeof x === 'string' && typeof y === 'string') { x = x.toLowerCase(); y = y.toLowerCase(); } else if (typeof x !== typeof y) { if (x === '' || x == null) x = typeof y === 'number' ? 0 : ''; if (y === '' || y == null) y = typeof x === 'number' ? 0 : ''; }
    return o === '=' ? x === y : o === '<>' ? x !== y : o === '<' ? x < y : o === '>' ? x > y : o === '<=' ? x <= y : x >= y;
  }
  const x = num(a), y = num(b), e = firstErr(x, y); if (e) return e;
  if (o === '+') return x + y; if (o === '-') return x - y; if (o === '*') return x * y;
  if (o === '/') return y === 0 ? ERR('#DIV/0!') : x / y; if (o === '^') return Math.pow(x, y);
}
/** ctx: { get(sheetName|null, r, c) -> value, sheet } */
export function evaluate(node, ctx){
  switch (node.k) {
    case 'num': case 'str': case 'bool': return node.v;
    case 'arr': return node.v;
    case 'blank': return undefined;
    case 'errlit': return ERR(node.v);
    case 'name': return ERR('#NAME?');
    case 'neg': { const v = num(evaluate(node.e, ctx)); return isErr(v) ? v : -v; }
    case 'bin': { const a = scalar(evaluate(node.l, ctx)), b = scalar(evaluate(node.r, ctx)); return binop(node.o, a, b); }
    case 'ref': {
      let ref = node.v, sh = null; const bang = ref.lastIndexOf('!'); if (bang >= 0) { sh = ref.slice(0, bang).replace(/^'|'$/g, ''); ref = ref.slice(bang + 1); }
      const R = parseRange(ref); if (!R) return ERR('#REF!');
      if (!ref.includes(':')) return ctx.get(sh, R.r0, R.c0);
      const out = []; for (let r = R.r0; r <= R.r1; r++) { const row = []; for (let c = R.c0; c <= R.c1; c++) row.push(ctx.get(sh, r, c)); out.push(row); } return out;
    }
    case 'fn': {
      const f = FN[node.n]; if (!f) return ERR('#NAME?');
      const args = node.args.map(a => evaluate(a, ctx)).filter((v, i) => !(v === undefined && node.args[i].k === 'blank' && i === node.args.length - 1));
      const lazyErr = !['IFERROR', 'IFNA', 'ISERROR', 'IF', 'COUNT', 'COUNTA', 'COUNTBLANK', 'AND', 'OR'].includes(node.n);
      if (lazyErr) { const e = args.find(a => !Array.isArray(a) && isErr(a)); if (e) return e; }
      try { const v = f(args); return typeof v === 'number' && !isFinite(v) ? ERR('#NUM!') : v; } catch (e) { return ERR('#VALUE!'); }
    }
  }
  return ERR('#VALUE!');
}
const scalar = v => Array.isArray(v) ? grid(v)[0][0] : v;

/** Turn typed input into a stored value: numbers, percentages, currency, dates, booleans. */
export function literal(raw){
  if (raw == null) return '';
  const s = String(raw).trim(); if (s === '') return '';
  if (/^(true|false)$/i.test(s)) return s.toUpperCase() === 'TRUE';
  if (/^[-+]?[$£€]?\(?[-+]?[\d,]*\.?\d+(e[-+]?\d+)?\)?%?$/i.test(s) && /\d/.test(s)) { let n = num(s.replace('%', '')); if (!isErr(n)) return /%$/.test(s) ? n / 100 : n; }
  const d = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s) || null; if (d) return (Date.UTC(+d[1], +d[2] - 1, +d[3]) - EPOCH) / 864e5;
  return String(raw);
}
