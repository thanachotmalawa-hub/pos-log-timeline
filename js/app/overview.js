/* "ภาพรวมการเขียน log" chart: zoom buttons, overview strip, gap bands, mouse interaction. */
/* ---------- swimlanes ---------- */
var laneGeom = null;
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function laneCands() { var pos = st.posSel; return st.cands.filter(function (c) { return pos === '*' || c.pos === pos; }); }
function setRange(f, t) {
  var g0 = laneGeom;
  if (g0 && f != null && t != null) {
    var span = t - f, full = g0.T1 - g0.T0;
    if (span >= full) { f = t = null; }
    else { if (f < g0.T0) { t += g0.T0 - f; f = g0.T0; } if (t > g0.T1) { f -= t - g0.T1; t = g0.T1; } f = Math.max(f, g0.T0); }
  }
  st.from = f == null ? null : Math.floor(f); st.to = t == null ? null : Math.ceil(t);
  $('from').value = st.from == null ? '' : tLabel(st.from); $('to').value = st.to == null ? '' : tLabel(st.to);
  applyFilters(); drawLanes();
}
function renderLaneQuick() {
  var box = $('laneQuick'), cs = laneCands();
  if (!cs.length) { box.innerHTML = st.all.length ? '<span class="lbl">ไม่พบจุดผิดปกติ</span>' : ''; return; }
  var shown = cs.slice(0, 12);
  box.innerHTML = '<span class="lbl">ไปที่จุดผิดปกติ:</span>' + shown.map(function (c, k) {
    var on = st.from != null && st.from <= c.start && (st.to == null || st.to >= c.start);
    var txt = (k + 1) + ' · ' + tLabel(c.start) + (c.kind === 'event' ? ' แจ้งเตือน' : ' log หาย' + (c.end ? ' ' + Core.fmtDur(c.end - c.start) : ''));
    return '<button type="button" class="qchip' + (c.kind === 'event' ? ' ev' : '') + (on ? ' on' : '') + '" data-qc="' + st.cands.indexOf(c) + '" title="ซูมไปดูช่วงนี้และเปิด Timeline ที่เวลานี้">' + esc(txt) + '</button>';
  }).join('') + (cs.length > shown.length ? '<button type="button" class="qchip more" data-goto-tab="cands">ดูทั้งหมด ' + cs.length + ' จุด →</button>' : '');
  Array.prototype.forEach.call(box.querySelectorAll('[data-qc]'), function (b) { b.onclick = function () { focusCand(st.cands[+b.dataset.qc]); }; });
}
function drawLanes() {
  var cv = $('lanes'), wrap = $('lanesWrap');
  var srcs = presentSrcs().map(function (x) { return x.src; });
  var W = wrap.clientWidth, laneH = 28, ovTop = 4, ovH = 14, top = ovTop + ovH + 12, axisH = 24, left = 92;
  var H = top + Math.max(1, srcs.length) * laneH + axisH;
  var dpr = window.devicePixelRatio || 1;
  cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  var pos = st.posSel, all = st.all;
  var items = []; for (var i = 0; i < all.length; i++) if (pos === '*' || all[i].pos === pos) items.push(all[i]);
  var zoomed = st.from != null || st.to != null;
  ['lzOut', 'lzPrev', 'lzNext'].forEach(function (id) { $(id).disabled = !zoomed; });
  $('lzIn').disabled = !items.length; $('lzAll').setAttribute('aria-pressed', String(!zoomed && items.length > 0));
  if (!items.length) { laneGeom = null; $('laneRange').textContent = ''; renderLaneQuick(); return; }
  var T0 = items[0].t, T1 = items[items.length - 1].t; if (T1 <= T0) T1 = T0 + 60000;
  var t0 = st.from != null ? st.from : T0, t1 = st.to != null ? st.to : T1;
  if (t1 <= t0) t1 = t0 + 60000;
  var plotW = Math.max(50, W - left - 10);
  var x = function (t) { return left + (t - t0) / (t1 - t0) * plotW; };
  var X = function (t) { return left + (t - T0) / (T1 - T0) * plotW; };
  var ink = cssVar('--ink'), muted = cssVar('--muted'), line = cssVar('--line'), gapBg = cssVar('--gap-bg'), gap = cssVar('--gap'), ok = cssVar('--ok'), err = cssVar('--err'), accent = cssVar('--accent'), sunken = cssVar('--sunken');
  var font = '11px ' + cssVar('--f-mono'), uiFont = '12px ' + cssVar('--f-ui');
  var cs = laneCands();
  $('laneRange').textContent = zoomed
    ? 'กำลังดู ' + tLabel(t0) + ' – ' + tLabel(t1) + ' (' + Core.fmtDur(t1 - t0) + ') จากทั้งหมด ' + Core.fmtDur(T1 - T0)
    : 'แสดง log ทั้งหมด ' + tLabel(T0) + ' – ' + tLabel(T1) + ' (' + Core.fmtDur(T1 - T0) + ')';

  // overview strip: the whole log, with the window currently shown
  g.fillStyle = muted; g.font = font; g.textBaseline = 'middle'; g.fillText('ทั้งหมด', 8, ovTop + ovH / 2);
  g.fillStyle = sunken; g.fillRect(left, ovTop, plotW, ovH);
  cs.forEach(function (c) { if (c.kind === 'event') return; var a = X(c.start), b = X(c.end || T1); g.fillStyle = gapBg; g.fillRect(a, ovTop, Math.max(2, b - a), ovH); });
  var obins = Math.max(10, Math.floor(plotW / 2)), ocnt = new Array(obins).fill(0), omax = 0, oerr = new Array(obins).fill(0);
  items.forEach(function (e) { var b = Math.min(obins - 1, Math.floor((e.t - T0) / (T1 - T0) * obins)); ocnt[b]++; if (e.err) oerr[b]++; if (ocnt[b] > omax) omax = ocnt[b]; });
  var obw = plotW / obins;
  for (var ob = 0; ob < obins; ob++) { if (!ocnt[ob]) continue; var oh = Math.max(2, Math.log(ocnt[ob] + 1) / Math.log(omax + 1) * (ovH - 2)); g.fillStyle = oerr[ob] ? err : muted; g.fillRect(left + ob * obw, ovTop + ovH - oh, Math.max(1, obw - 0.3), oh); }
  var wa = X(t0), wb = X(t1);
  if (zoomed) { g.fillStyle = 'rgba(128,128,128,0.18)'; g.fillRect(left, ovTop, Math.max(0, wa - left), ovH); g.fillRect(wb, ovTop, Math.max(0, left + plotW - wb), ovH); }
  g.strokeStyle = accent; g.lineWidth = 2; g.strokeRect(Math.max(left, wa) + 1, ovTop + 1, Math.max(4, Math.min(left + plotW, wb) - Math.max(left, wa) - 2), ovH - 2); g.lineWidth = 1;

  laneGeom = { t0: t0, t1: t1, T0: T0, T1: T1, left: left, plotW: plotW, top: top, laneH: laneH, H: H, ovTop: ovTop, ovH: ovH, nLanes: srcs.length, srcs: srcs, bands: [], cnt: {}, bins: 0 };
  // gap bands (labelled so it is clear what the orange area means)
  cs.forEach(function (c) {
    var a = Math.max(x(c.start), left), b = Math.min(x(c.end || t1), left + plotW);
    if (b <= left || a >= left + plotW) return;
    if (c.kind === 'event') {
      var xe = Math.round(x(c.start)) + 0.5;
      g.strokeStyle = err; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(xe, top); g.lineTo(xe, top + srcs.length * laneH); g.stroke(); g.setLineDash([]);
      laneGeom.bands.push({ a: xe - 4, b: xe + 4, c: c });
      return;
    }
    g.fillStyle = gapBg; g.fillRect(a, top, Math.max(2, b - a), srcs.length * laneH);
    g.strokeStyle = gap; g.lineWidth = 1; g.strokeRect(a + 0.5, top + 0.5, Math.max(1, b - a - 1), srcs.length * laneH - 1);
    laneGeom.bands.push({ a: a, b: b, c: c });
    var label = 'log หาย ' + (c.end ? Core.fmtDur(c.end - c.start) : 'จนจบไฟล์');
    g.font = '600 ' + uiFont; var tw = g.measureText(label).width;
    if (b - a > tw + 12) { g.fillStyle = gap; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(label, (a + b) / 2, top + Math.min(srcs.length * laneH, laneH) / 2); g.textAlign = 'left'; }
  });
  // lanes
  var bins = Math.max(10, Math.floor(plotW / 2));
  laneGeom.bins = bins;
  srcs.forEach(function (s, li) {
    var y = top + li * laneH;
    g.fillStyle = muted; g.font = font; g.textBaseline = 'middle'; g.fillText(s, 8, y + laneH / 2);
    g.strokeStyle = line; g.beginPath(); g.moveTo(left, y + laneH - 0.5); g.lineTo(left + plotW, y + laneH - 0.5); g.stroke();
    var cnt = new Array(bins).fill(0), errs = new Array(bins).fill(0), max = 0;
    items.forEach(function (e) {
      if (e.src !== s || e.t < t0 || e.t > t1) return;
      var b = Math.min(bins - 1, Math.floor((e.t - t0) / (t1 - t0) * bins));
      cnt[b]++; if (e.err) errs[b]++; if (cnt[b] > max) max = cnt[b];
    });
    laneGeom.cnt[s] = cnt;
    var col = cssVar('--c-' + s) || ink, bw = plotW / bins;
    for (var b = 0; b < bins; b++) {
      if (!cnt[b]) continue;
      var hh = Math.max(3, (Math.log(cnt[b] + 1) / Math.log(max + 1)) * (laneH - 6));
      g.fillStyle = errs[b] ? err : col;
      g.fillRect(left + b * bw, y + laneH - 3 - hh, Math.max(1, bw - 0.3), hh);
    }
  });
  // restarts
  items.forEach(function (e) {
    if (!e.rst || e.t < t0 || e.t > t1) return;
    var xx = Math.round(x(e.t)) + 0.5;
    g.strokeStyle = ok; g.lineWidth = 2; g.beginPath(); g.moveTo(xx, top); g.lineTo(xx, top + srcs.length * laneH); g.stroke(); g.lineWidth = 1;
  });
  renderLaneQuick();
  // axis
  var ay = top + srcs.length * laneH;
  var span = t1 - t0, steps = [1, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200].map(function (s) { return s * 1000; });
  var step = steps[steps.length - 1];
  for (var k = 0; k < steps.length; k++) if (span / steps[k] <= Math.max(2, plotW / 90)) { step = steps[k]; break; }
  g.fillStyle = muted; g.font = font; g.textBaseline = 'top'; g.textAlign = 'center';
  for (var tt = Math.ceil(t0 / step) * step; tt <= t1; tt += step) {
    var xx2 = Math.round(x(tt)) + 0.5;
    g.strokeStyle = line; g.beginPath(); g.moveTo(xx2, ay); g.lineTo(xx2, ay + 4); g.stroke();
    var lab = step < 60000 ? Core.fmtTime(tt) : Core.fmtTime(tt).slice(0, 5);
    g.fillText(lab, Math.min(Math.max(xx2, left + 18), left + plotW - 18), ay + 6);
  }
  g.textAlign = 'left';
}
(function laneEvents() {
  var cv = $('lanes'), tip = $('laneTip'), dragA = null, dragMoved = false;
  function tAt(ev) {
    var r = cv.getBoundingClientRect(); var px = ev.clientX - r.left, py = ev.clientY - r.top; if (!laneGeom) return null;
    var G = laneGeom, f = Math.min(1, Math.max(0, (px - G.left) / G.plotW));
    var inOv = py <= G.ovTop + G.ovH + 4;
    return { t: G.t0 + f * (G.t1 - G.t0), T: G.T0 + f * (G.T1 - G.T0), px: px, py: py, inOv: inOv, inPlot: px >= G.left, f: f };
  }
  function bandAt(a) { if (!laneGeom || a.inOv) return null; for (var k = laneGeom.bands.length - 1; k >= 0; k--) { var b = laneGeom.bands[k]; if (a.px >= b.a && a.px <= b.b) return b.c; } return null; }
  function laneAt(a) { var G = laneGeom; var li = Math.floor((a.py - G.top) / G.laneH); return li >= 0 && li < G.nLanes ? G.srcs[li] : null; }
  function tipText(a) {
    var G = laneGeom;
    if (a.inOv) return Core.fmtTime(a.T) + ' · คลิกเพื่อเลื่อนไปดูช่วงนี้';
    var c = bandAt(a);
    if (c) return c.kind === 'event' ? Core.fmtTime(c.start) + ' มีข้อความแจ้งเตือน · คลิกเพื่อซูมดู' : 'log หาย ' + Core.fmtTime(c.start) + ' – ' + (c.end ? Core.fmtTime(c.end) + ' (' + Core.fmtDur(c.end - c.start) + ')' : 'จนจบไฟล์') + ' · คลิกเพื่อซูมดู';
    var s = laneAt(a), n = '';
    if (s && G.cnt[s]) { var b = Math.min(G.bins - 1, Math.floor(a.f * G.bins)); n = ' · ' + s + ' ' + G.cnt[s][b] + ' บรรทัด'; }
    return Core.fmtTime(a.t) + n + ' · คลิกเพื่อเปิด Timeline';
  }
  function placeTip(a, text) {
    tip.hidden = false; tip.textContent = text;
    var w = tip.offsetWidth, W = cv.clientWidth;
    tip.style.left = Math.min(Math.max(a.px, w / 2 + 2), W - w / 2 - 2) + 'px'; tip.style.top = (a.py - 8) + 'px';
  }
  cv.addEventListener('pointermove', function (ev) {
    var a = tAt(ev); if (!a) return;
    if (dragA && !dragA.inOv && Math.abs(a.px - dragA.px) > 4) dragMoved = true;
    if (dragMoved) {
      var f = Math.min(dragA.t, a.t), t = Math.max(dragA.t, a.t);
      placeTip(a, 'ปล่อยเพื่อซูม ' + Core.fmtTime(f) + ' – ' + Core.fmtTime(t) + ' (' + Core.fmtDur(t - f) + ')');
      drawLanes();
      var g = cv.getContext('2d'), G = laneGeom, xa = Math.min(dragA.px, a.px), xb = Math.max(dragA.px, a.px);
      g.fillStyle = 'rgba(29,95,168,0.18)'; g.fillRect(xa, G.top, xb - xa, G.nLanes * G.laneH);
      g.strokeStyle = cssVar('--accent'); g.strokeRect(xa + 0.5, G.top + 0.5, xb - xa - 1, G.nLanes * G.laneH - 1);
    } else placeTip(a, tipText(a));
  });
  cv.addEventListener('pointerleave', function () { tip.hidden = true; });
  cv.addEventListener('pointerdown', function (ev) { if (ev.button !== 0) return; dragA = tAt(ev); dragMoved = false; try { cv.setPointerCapture(ev.pointerId); } catch (e) {} });
  cv.addEventListener('pointerup', function (ev) {
    var b = tAt(ev), a = dragA; dragA = null;
    if (!a || !b) return;
    if (dragMoved) { dragMoved = false; tip.hidden = true; setRange(Math.min(a.t, b.t), Math.max(a.t, b.t)); return; }
    if (a.inOv) { // recentre the current window there (or a 10-minute window when showing everything)
      var G = laneGeom, span = (st.from != null || st.to != null) ? G.t1 - G.t0 : Math.min(10 * 60000, (G.T1 - G.T0) / 4);
      setRange(b.T - span / 2, b.T + span / 2); return;
    }
    if (!b.inPlot) return;
    var c = bandAt(b);
    if (c) { focusCand(c); return; }
    jumpToTime(b.t, true);
    $('tl').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  cv.addEventListener('dblclick', function () { setRange(null, null); });
  function span() { var G = laneGeom; return G ? G.t1 - G.t0 : 0; }
  $('lzAll').onclick = function () { setRange(null, null); };
  $('lzIn').onclick = function () { var G = laneGeom; if (!G) return; var c = (G.t0 + G.t1) / 2, s = Math.max(30000, span() / 2); setRange(c - s / 2, c + s / 2); };
  $('lzOut').onclick = function () { var G = laneGeom; if (!G) return; var c = (G.t0 + G.t1) / 2, s = span() * 2; setRange(c - s / 2, c + s / 2); };
  $('lzPrev').onclick = function () { var G = laneGeom; if (!G) return; var s = span(); setRange(G.t0 - s * 0.5, G.t1 - s * 0.5); };
  $('lzNext').onclick = function () { var G = laneGeom; if (!G) return; var s = span(); setRange(G.t0 + s * 0.5, G.t1 + s * 0.5); };
  var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { drawLanes(); renderRows(true); }, 150); });
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawLanes); } catch (e) {}
  try { new MutationObserver(drawLanes).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) {}
})();
