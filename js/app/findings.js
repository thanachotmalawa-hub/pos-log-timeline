/* Clear data, "จุดผิดปกติที่พบ" cards, tally and the topic manager. */
/* ---------- clear ---------- */
$('btnClear').onclick = function () { $('clearBox').hidden = false; $('btnClearCancel').focus(); };
$('btnClearCancel').onclick = function () { $('clearBox').hidden = true; };
function clearData(alsoOverrides) {
  st.files = []; st.isSample = false; st.from = st.to = null; st.sel = -1; st.posSel = '*'; st.srcOn = {};
  $('from').value = ''; $('to').value = ''; $('q').value = ''; $('detail').hidden = true; $('fallback').hidden = true;
  if (alsoOverrides) { overrides = {}; try { localStorage.removeItem(OV_KEY); } catch (e) {} }
  $('clearBox').hidden = true;
  rebuild(); renderBanner();
  setStatus(alsoOverrides ? 'ล้างไฟล์และหัวข้อที่เปลี่ยนเองแล้ว' : 'ล้างไฟล์แล้ว');
}
$('btnClearFiles').onclick = function () { clearData(false); };
$('btnClearAll').onclick = function () { clearData(true); };

function renderPosSel() {
  var pos = {}; st.all.forEach(function (e) { pos[e.pos] = (pos[e.pos] || 0) + 1; });
  var keys = Object.keys(pos).sort();
  var sel = $('posSel');
  sel.hidden = keys.length < 2;
  sel.innerHTML = '<option value="*">ทุกเครื่อง</option>' + keys.map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + '</option>'; }).join('');
  if (keys.indexOf(st.posSel) < 0) st.posSel = keys.length === 1 ? keys[0] : '*';
  sel.value = keys.length === 1 ? keys[0] : st.posSel;
}
$('posSel').onchange = function () { st.posSel = this.value; applyFilters(); drawLanes(); renderCands(); if (typeof updateTabCounts === 'function') updateTabCounts(); };

function presentSrcs() {
  var cnt = {};
  st.all.forEach(function (e) { if (st.posSel === '*' || e.pos === st.posSel) cnt[e.src] = (cnt[e.src] || 0) + 1; });
  return Core.SRC_ORDER.filter(function (s) { return cnt[s]; }).map(function (s) { return { src: s, n: cnt[s] }; });
}
function renderSrcBtns() {
  var box = $('srcbtns');
  box.innerHTML = presentSrcs().map(function (x) {
    var on = st.srcOn[x.src] !== false;
    return '<button type="button" class="srcbtn" data-src="' + x.src + '" aria-pressed="' + on + '"><span class="chip s-' + x.src + '">' + Core.SRC_LABEL[x.src] + '</span><span class="n">' + x.n.toLocaleString() + '</span></button>';
  }).join('');
  Array.prototype.forEach.call(box.querySelectorAll('.srcbtn'), function (b) {
    b.onclick = function () { var s = b.dataset.src; st.srcOn[s] = st.srcOn[s] === false; b.setAttribute('aria-pressed', st.srcOn[s] !== false); applyFilters(); };
  });
}

function renderFiles() {
  var opts = Core.SRC_ORDER.map(function (s) { return '<option value="' + s + '">' + Core.SRC_LABEL[s] + '</option>'; }).join('');
  $('filesBody').innerHTML = st.files.map(function (f, i) {
    var notes = [];
    if (f.enc !== 'UTF-8') notes.push('อ่านเป็น ' + f.enc);
    if (f.fffd > 20) notes.push('<span class="warn">ภาษาไทยเสียมาก่อนแล้ว ' + f.fffd.toLocaleString() + ' จุด (ไฟล์ถูกแปลงระหว่าง copy ให้ zip ไฟล์ต้นฉบับ)</span>');
    if (!f.entries.length) notes.push('<span class="warn">ไม่มีบรรทัดที่มีเวลา</span>');
    return '<tr><td class="path mono">' + esc(f.path) + '</td><td>' + esc(f.pos) + '</td><td><select data-i="' + i + '" aria-label="ชนิด log">' + opts.replace('value="' + f.type + '"', 'value="' + f.type + '" selected') + '</select></td><td>' + f.how + '</td><td class="num">' + f.entries.length.toLocaleString() + '</td><td class="mono">' + (f.first != null ? tLabel(f.first) : '-') + '</td><td class="mono">' + (f.last != null ? tLabel(f.last) : '-') + '</td><td>' + notes.join('<br>') + '</td></tr>';
  }).join('');
  Array.prototype.forEach.call($('filesBody').querySelectorAll('select'), function (sel) {
    sel.onchange = function () { var f = st.files[+sel.dataset.i]; f.type = sel.value; f.how = 'กำหนดเอง'; rebuild(); };
  });
}

/* ---------- "จุดผิดปกติ" tab: only the error / warning lines found, grouped by message ---------- */
// lines that count as an error: |ERROR| / |FATAL| level, an exception, or a highlighted word (Return Code = 1, ไม่พบ, timeout, ติดต่อ Helpdesk ...)
// plus a few states that are problems even without an error word
var ERR_EXTRA = /Promotion Status\]\s*:\s*Offline/i;
function errText(msg) {
  return Core.cleanText(msg).replace(/<[^>]+>/g, ' ').replace(/\s*⏎\s*/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function errSig(text) { return text.replace(/\d+(\.\d+)?/g, '#').slice(0, 160); }
function errGroups() {
  var map = {}, out = [], pos = st.posSel;
  for (var i = 0; i < st.all.length; i++) {
    var e = st.all[i];
    if (pos !== '*' && e.pos !== pos) continue;
    var isErr = !!e.err, isWarn = !isErr && (e.hl || ERR_EXTRA.test(e.msg));
    if (!isErr && !isWarn) continue;
    var text = errText(e.msg), key = e.pos + '|' + e.src + '|' + (isErr ? 'E' : 'W') + '|' + errSig(text);
    var g = map[key];
    if (!g) { g = map[key] = { pos: e.pos, src: e.src, isErr: isErr, text: text, hits: [] }; out.push(g); }
    g.hits.push(i);
  }
  return out; // already in time order of first occurrence
}
var errFilterBound = false;
function renderCands() {
  var box = $('cands');
  if (!errFilterBound) {
    errFilterBound = true;
    $('fErrOnly').onchange = renderCands;
    var t; $('errQ').oninput = function () { clearTimeout(t); t = setTimeout(renderCands, 200); };
    $('btnCopyErrs').onclick = function () { copyText(errCopyText(), $('errsOk')); };
  }
  var groups = errGroups();
  st.errGroups = groups;
  var onlyErr = $('fErrOnly').checked, q = $('errQ').value.trim().toLowerCase();
  var shown = groups.filter(function (g) { return (!onlyErr || g.isErr) && (!q || g.text.toLowerCase().indexOf(q) >= 0); });
  st.errShown = shown;
  var nE = 0, nW = 0; groups.forEach(function (g) { if (g.isErr) nE += g.hits.length; else nW += g.hits.length; });
  $('candsNote').textContent = groups.length ? 'พบ ' + groups.length + ' แบบ · ERROR / Exception ' + nE.toLocaleString() + ' บรรทัด · คำเตือน ' + nW.toLocaleString() + ' บรรทัด' : '';
  $('tally').innerHTML = '';
  if (!st.files.length) { box.innerHTML = '<div class="empty-state"><b>ยังไม่มีไฟล์ log</b><span>กด "เลือกโฟลเดอร์ log" หรือลากโฟลเดอร์ / ไฟล์ .zip มาวางที่ไหนก็ได้ในหน้านี้ หรือกด "โหลดตัวอย่าง" เพื่อดูเคสตัวอย่าง</span></div>'; return; }
  if (!groups.length) { box.innerHTML = '<div class="empty">ไม่พบบรรทัด error ใน log ที่โหลด</div>'; return; }
  if (!shown.length) { box.innerHTML = '<div class="empty">ไม่มี error ตามตัวกรองนี้</div>'; return; }
  var multi = st.posSel === '*' && multiPos();
  box.innerHTML = shown.map(function (g, k) {
    var first = st.all[g.hits[0]], last = st.all[g.hits[g.hits.length - 1]], n = g.hits.length;
    var when = link(g.hits[0], tLabel(first.t, true)) + (n > 1 ? ' ถึง ' + link(g.hits[n - 1], tLabel(last.t, true)) : '');
    var times = n > 1 ? '<details class="err-times"><summary>เวลาที่พบทั้งหมด ' + n + ' ครั้ง</summary><div class="mono">' +
      g.hits.slice(0, 200).map(function (i) { return link(i, tLabel(st.all[i].t, true)); }).join(' ') + (n > 200 ? ' …' : '') + '</div></details>' : '';
    return '<article class="errcard' + (g.isErr ? ' is-err' : ' is-warn') + '">' +
      '<div class="err-head"><span class="pill ' + (g.isErr ? 'err' : 'gap') + '">' + (g.isErr ? 'ERROR / Exception' : 'คำเตือน') + '</span>' +
      '<span class="chip s-' + g.src + '">' + g.src + '</span>' + (multi ? '<span class="pill">' + esc(g.pos) + '</span>' : '') +
      '<span class="err-n">' + n.toLocaleString() + ' ครั้ง</span><span class="err-when">' + when + '</span></div>' +
      '<div class="err-msg mono">' + esc(Core.mask(g.text.length > 700 ? g.text.slice(0, 700) + '…' : g.text)) + '</div>' + times +
      '</article>';
  }).join('');
  Array.prototype.forEach.call(box.querySelectorAll('a[data-i]'), function (a) {
    a.onclick = function (ev) { ev.preventDefault(); jumpToEntry(+a.dataset.i, true); };
  });
}
// plain text only (no arrows / dashes / symbols) so it pastes cleanly into ticket systems
function errCopyText() {
  var gs = st.errShown || [];
  if (!gs.length) return 'ไม่พบ log error';
  var L = [];
  gs.forEach(function (g) {
    var first = st.all[g.hits[0]], last = st.all[g.hits[g.hits.length - 1]];
    var t = Core.fmtTimeMs(first.t) + (g.hits.length > 1 ? ' ถึง ' + Core.fmtTimeMs(last.t) : '');
    L.push(t + ' ' + g.src + ' (' + g.hits.length + ' ครั้ง) ' + Core.mask(g.text.slice(0, 300)));
  });
  return L.join('\n');
}

/* ---------- topic manager ---------- */
function renderTopicRows() {
  var srcOpts = ['*'].concat(Core.SRC_ORDER);
  $('topicRows').innerHTML = S.topicDefs.map(function (d, k) {
    return '<tr data-k="' + k + '"><td class="idc">' + d.id + '</td>' +
      '<td><input type="text" data-f="name" value="' + esc(d.name || '') + '" aria-label="ชื่อหัวข้อ ' + d.id + '"></td>' +
      '<td><select data-f="group" aria-label="กลุ่มสาเหตุ หัวข้อ ' + d.id + '">' + ['HW', 'SW', 'ENV', 'UNK'].map(function (g) { return '<option value="' + g + '"' + ((d.group || 'UNK') === g ? ' selected' : '') + '>' + Core.GROUP_LABEL[g] + '</option>'; }).join('') + '</select></td>' +
      '<td class="kw"><input type="text" data-f="kw" value="' + esc(d.kw || '') + '" placeholder="' + (d.builtin ? 'ใช้กฎในระบบ' : 'เช่น PrinterOffline|Paper Out') + '" aria-label="คำค้น หัวข้อ ' + d.id + '"></td>' +
      '<td><select data-f="kwSrc" aria-label="ค้นใน log หัวข้อ ' + d.id + '">' + srcOpts.map(function (x) { return '<option value="' + x + '"' + ((d.kwSrc || '*') === x ? ' selected' : '') + '>' + (x === '*' ? 'ทุก log' : Core.SRC_LABEL[x]) + '</option>'; }).join('') + '</select></td>' +
      '<td>' + (d.builtin ? '<span class="sub">ในระบบ</span>' : '<button type="button" data-del="' + k + '" aria-label="ลบหัวข้อ ' + d.id + '">ลบ</button>') + '</td></tr>';
  }).join('');
  Array.prototype.forEach.call($('topicRows').querySelectorAll('button[data-del]'), function (b) {
    b.onclick = function () { readTopicRows(); S.topicDefs.splice(+b.dataset.del, 1); renderTopicRows(); };
  });
}
function readTopicRows() {
  Array.prototype.forEach.call($('topicRows').querySelectorAll('tr'), function (tr) {
    var d = S.topicDefs[+tr.dataset.k];
    Array.prototype.forEach.call(tr.querySelectorAll('[data-f]'), function (el) { d[el.dataset.f] = el.value.trim(); });
  });
}
$('btnAddTopic').onclick = function () {
  readTopicRows();
  var next = Math.max(13, Math.max.apply(null, S.topicDefs.map(function (d) { return d.id; }))) + 1;
  S.topicDefs.splice(S.topicDefs.length - 1, 0, { id: next, name: 'หัวข้อใหม่ ' + next, group: 'UNK', kw: '', kwSrc: '*' });
  renderTopicRows();
  var rows = $('topicRows').querySelectorAll('tr'); var inp = rows[rows.length - 2] && rows[rows.length - 2].querySelector('input'); if (inp) { inp.focus(); inp.select(); }
};
$('btnSaveTopics').onclick = function () {
  readTopicRows();
  var bad = S.topicDefs.filter(function (d) { if (!d.kw) return false; try { new RegExp(d.kw); return false; } catch (e) { return true; } });
  if (bad.length) { $('topicOk').textContent = 'คำค้นของหัวข้อ ' + bad.map(function (d) { return d.id; }).join(', ') + ' ใช้ไม่ได้ ตรวจวงเล็บหรือเครื่องหมายพิเศษ'; return; }
  saveSettings(); rebuild();
  $('topicOk').textContent = 'บันทึกแล้ว วิเคราะห์ใหม่ตามหัวข้อล่าสุด'; setTimeout(function () { $('topicOk').textContent = ''; }, 3000);
};
$('btnExport').onclick = function () {
  readTopicRows();
  var o = {}; ['gapMin', 'ctxMin', 'keySrc', 'restart', 'heartbeat', 'noise', 'important', 'forms', 'buttons', 'funcs', 'msgCodes', 'highlight', 'highlightExclude', 'topicDefs'].forEach(function (k) { o[k] = S[k]; });
  copyText('POSLOGTIMELINE-SETTINGS ' + JSON.stringify(o), $('exportOk'));
};
$('btnImport').onclick = function () {
  var t = $('importBox').value.trim().replace(/^POSLOGTIMELINE-SETTINGS\s*/, '');
  try {
    var o = JSON.parse(t);
    if (!o || !Array.isArray(o.topicDefs)) throw new Error('x');
    Object.assign(S, o); saveSettings(); S = loadSettings(); fillSettings(); renderTopicRows(); rebuild();
    $('exportOk').textContent = 'นำเข้าแล้ว ' + S.topicDefs.length + ' หัวข้อ'; $('importBox').value = '';
  } catch (e) { $('exportOk').textContent = 'อ่านการตั้งค่าไม่ได้ ให้คัดลอกข้อความทั้งก้อนที่ขึ้นต้นด้วย POSLOGTIMELINE-SETTINGS'; }
};
function link(i, label) { return '<a href="#" class="mono" data-i="' + i + '">' + label + '</a>'; }
function multiPos() { var p = {}; st.all.forEach(function (e) { p[e.pos] = 1; }); return Object.keys(p).length > 1; }

function focusCand(c, quiet) {
  st.from = c.start - S.ctxMin * 60000;
  st.to = (c.end || c.start) + 3 * 60000;
  if (multiPos()) { st.posSel = c.pos; $('posSel').value = c.pos; }
  $('from').value = tLabel(st.from); $('to').value = tLabel(st.to);
  applyFilters(); drawLanes();
  jumpToTime(c.start, true);
}
