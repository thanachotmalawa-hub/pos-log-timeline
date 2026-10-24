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
$('posSel').onchange = function () { st.posSel = this.value; applyFilters(); drawLanes(); };

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

function renderCands() {
  var box = $('cands');
  $('candsNote').textContent = 'log หลัก ' + S.keySrc + ' · ถือว่า log หายเมื่อเงียบเกิน ' + S.gapMin + ' นาที';
  st.cands.forEach(function (c) { var o = overrides[ovKey(c)]; c.topicFinal = o != null ? o : c.topic.id; });
  renderTally(); renderLibrary();
  if (!st.files.length) { box.innerHTML = '<div class="empty-state"><b>ยังไม่มีไฟล์ log</b><span>กด "เลือกโฟลเดอร์ log" หรือลากโฟลเดอร์ / ไฟล์ .zip มาวางที่ไหนก็ได้ในหน้านี้ หรือกด "โหลดตัวอย่าง" เพื่อดูเคสตัวอย่าง</span></div>'; return; }
  if (!st.cands.length) { box.innerHTML = '<div class="empty">ไม่พบจุดผิดปกติ (ไม่มีข้อความแจ้งเตือน และไม่มีช่วงที่ log หลักเงียบเกิน ' + S.gapMin + ' นาที) ลองลดค่าในตั้งค่า หรือตรวจว่าโหลด log ITP / Activity ครบหรือไม่</div>'; return; }
  var firstOpen = -1;
  st.cands.forEach(function (c, k) { if (firstOpen < 0 && c.end && !c.afterRestart) firstOpen = k; });
  box.innerHTML = st.cands.map(function (c, k) {
    var strong = c.restarts.length || c.hb;
    var pills = '<span class="pill gap">' + (c.end ? 'หายไป ' + Core.fmtDur(c.end - c.start) : 'ไม่กลับมาในไฟล์') + '</span>';
    pills += c.restarts.length ? '<span class="pill ok">พบ restart</span>' : '<span class="pill">ไม่พบ restart</span>';
    if (c.hb) pills += '<span class="pill err">Timer หยุด</span>';
    if (c.afterRestart) pills += '<span class="pill err">เริ่มโปรแกรมไม่ครบ</span>';
    if (!c.end) pills += '<span class="pill">อาจเป็นแค่ไฟล์จบ</span>';
    if (c.kind === 'restart') pills = '<span class="pill gap">log เงียบ ' + Core.fmtDur(c.end - c.start) + ' แล้วเปิดโปรแกรมใหม่</span><span class="pill ok">พบ restart</span>' + (c.pending.length ? '<span class="pill err">มีงานไม่ได้คำตอบ</span>' : '');
    if (c.kind === 'event') pills = '<span class="pill err">พบข้อความแจ้งเตือน</span><span class="pill">ไม่มีช่วง log หาย</span>';
    var kv = [];
    if (c.kind !== 'event') kv.push(['log หยุด', '<span class="mono">' + tLabel(c.start, true) + '</span>' + (c.end ? ' → กลับมา <span class="mono">' + tLabel(c.end, true) + '</span>' : '')]);
    if (c.hb) kv.push(['ประมาณเวลาค้างจริง', '<span class="mono">' + tLabel(c.freezeFrom) + ' – ' + tLabel(c.freezeTo) + '</span> <span class="sub">(' + esc(c.hb.label) + ' ปกติทุก ' + Core.fmtDur(c.hb.interval) + ' ครั้งล่าสุด ' + tLabel(c.hb.last) + ')</span>']);
    if (c.afterRestart) kv.push(['หมายเหตุ', 'log หายต่อจาก restart ' + tLabel(c.afterRestart.t) + ' (' + esc(c.afterRestart.label) + ') โปรแกรมอาจเริ่มไม่ครบ เช่น ขึ้นหน้ารูปตึก']);
    var prc = Core.promoResults(st.all, function (e) { return e.pos === c.pos && e.t >= c.start - S.ctxMin * 60000 && e.t <= c.start; });
    if (prc.length) { var withLines = prc.filter(function (x) { return x.lines.length; }); var lp = withLines.length ? withLines[withLines.length - 1] : prc[prc.length - 1]; kv.push(['โปรโมชั่นล่าสุดก่อนค้าง', link(lp.i, tLabel(lp.t)) + ' ' + lp.lines.length + ' โปร · ส่วนลด ' + money(lp.discTotal) + ' บาท · ReturnCode ' + esc(lp.ret === '' ? '-' : lp.ret) + ' <span class="sub">(รายละเอียดในกล่อง "ผลคำนวณโปรโมชั่น")</span>']); }
    var hlFirst = -1, hlN = 0;
    for (var hi = 0; hi < st.all.length; hi++) { var he = st.all[hi]; if (he.pos !== c.pos || !he.hl || he.t < c.start - S.ctxMin * 60000 || he.t > c.start) continue; hlN++; if (hlFirst < 0) hlFirst = hi; }
    if (hlN) kv.push(['บรรทัดที่ไฮไลต์ก่อนค้าง', hlN + ' บรรทัด ใน ' + S.ctxMin + ' นาที · ' + link(hlFirst, 'ดูบรรทัดแรก')]);
    kv.push(['Restart หลังจากนั้น', c.restarts.length ? c.restarts.map(function (r) { return link(r.i, tLabel(r.t)) + ' ' + esc(r.label); }).join('<br>') : 'ไม่พบใน log']);
    var last = c.last.map(function (l) { return '<div class="r"><span class="chip s-' + l.src + '">' + l.src + '</span><span>' + link(l.i, tLabel(l.t, true)) + '</span><span title="' + esc(Core.cleanText(l.msg)) + '">' + esc(Core.cleanText(l.msg)) + '</span></div>'; }).join('');
    var steps = Core.stepsOf(c).map(function (s) {
      return '<li><div><div class="st-title"><span class="chip s-' + s.src + '">' + (s.src === 'OTHER' ? 'อื่น ๆ' : s.src) + '</span>' + esc(s.title.replace(/^[^:]+:\s*/, '')) + '</div><ul>' +
        s.lines.map(function (x) { return '<li' + (x.warn ? ' class="warn"' : '') + '>' + (x.i != null && x.i >= 0 ? link(x.i, '↗') + ' ' : '') + esc(Core.mask(Core.cleanText(x.text))) + '</li>'; }).join('') + '</ul></div></li>';
    }).join('');
    var jr = (c.journey || []);
    var journey = jr.map(function (j) {
      return '<div class="j k-' + j.kind + '"><span>' + link(j.i, tLabel(j.t)) + '</span><span class="chip s-' + j.src + '">' + j.src + '</span><span class="tx">' + esc(Core.mask(Core.cleanText(j.text))) + (j.n > 1 ? ' ×' + j.n : '') + (j.msg ? ' <span class="ret">"' + esc(j.msg) + '"</span>' : '') + (j.ret ? ' <span class="ret">→ ' + esc(j.ret) + '</span>' : '') + (j.open ? ' <span class="open">→ ไม่มีผลกลับ / ไม่จบ</span>' : '') + '</span></div>';
    }).join('');
    return '<article class="cand' + (strong ? '' : ' weak') + '">' +
      '<div class="cand-head"><h3>จุดที่ ' + (k + 1) + (st.posSel === '*' && multiPos() ? ' · ' + esc(c.pos) : '') + '</h3>' + pills + '</div>' +
      topicBlock(c, k) +
      '<dl class="kv">' + kv.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('') + '</dl>' +
      '<div><div class="sub" style="margin-bottom:6px">ไล่ log ตามลำดับ ' + S.ctxMin + ' นาทีก่อนค้าง</div><ol class="steps">' + steps + '</ol></div>' +
      (jr.length ? '<details class="journey"' + (k === firstOpen ? ' open' : '') + '><summary>ลำดับการใช้งานก่อนค้าง (' + jr.length + ' เหตุการณ์ หน้าจอ · ปุ่ม · งาน · Popup · EDC · error)</summary><div class="jlist mono">' + journey + '</div></details>' : '') +
      '<details class="lastwrap"><summary>บรรทัดสุดท้ายของแต่ละ log ก่อนหยุด</summary><div class="lastlog mono" style="margin-top:6px">' + last + '</div></details>' +
      '<div class="cand-actions"><button type="button" class="primary" data-act="focus" data-k="' + k + '">ดูช่วงก่อนค้าง ' + S.ctxMin + ' นาที</button><button type="button" data-act="copy" data-k="' + k + '">คัดลอกสรุปส่ง Dev</button><button type="button" data-act="lib" data-k="' + k + '">บันทึกเข้า Library</button><span class="copy-ok" id="ok' + k + '"></span></div>' +
      '</article>';
  }).join('');
  Array.prototype.forEach.call(box.querySelectorAll('button[data-act]'), function (b) {
    b.onclick = function () {
      var c = st.cands[+b.dataset.k];
      if (b.dataset.act === 'focus') { focusCand(c); $('tl').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else if (b.dataset.act === 'lib') { var ok = libSaveCase(c); markLibButtons(); $('ok' + b.dataset.k).textContent = ok ? 'บันทึกเข้า Library แล้ว' : 'พื้นที่เก็บในเบราว์เซอร์เต็ม บันทึกไม่ได้'; }
      else copyText(Core.summaryText(c, st.all, st.files, topics()), $('ok' + b.dataset.k));
    };
  });
  markLibButtons();
  Array.prototype.forEach.call(box.querySelectorAll('select[data-topic]'), function (sel) {
    sel.onchange = function () {
      var c = st.cands[+sel.dataset.topic], v = +sel.value;
      if (v === c.topic.id) delete overrides[ovKey(c)]; else overrides[ovKey(c)] = v;
      try { localStorage.setItem(OV_KEY, JSON.stringify(overrides)); } catch (e) {}
      renderCands();
    };
  });
  Array.prototype.forEach.call(box.querySelectorAll('a[data-i]'), function (a) {
    a.onclick = function (ev) { ev.preventDefault(); jumpToEntry(+a.dataset.i, true); };
  });
}
function topicBlock(c, k) {
  var tp = topics(), fin = c.topicFinal, auto = c.topic, manual = fin !== auto.id;
  var confCls = auto.conf === 'สูง' ? 'c-high' : auto.conf === 'กลาง' ? 'c-mid' : 'c-low';
  var opts = ['HW', 'SW', 'ENV', 'UNK'].map(function (g) {
    var list = tp.filter(function (t) { return (t.group || 'UNK') === g; });
    if (!list.length) return '';
    return '<optgroup label="' + Core.GROUP_LABEL[g] + '">' + list.map(function (t) { return '<option value="' + t.id + '"' + (t.id === fin ? ' selected' : '') + '>' + (t.id ? t.id + '. ' : '') + esc(t.name) + (t.id === auto.id ? ' (ระบบเลือก)' : '') + '</option>'; }).join('') + '</optgroup>';
  }).join('');
  var grp = Core.groupOf(tp, fin);
  var html = '<div class="topic">' +
    '<div class="topic-row"><span class="sub">หัวข้ออาการ</span>' + (manual ? '<span class="pill">เลือกเอง</span>' : '<span class="pill ' + confCls + '">ความมั่นใจ' + auto.conf + '</span>') + '</div>' +
    '<div class="topic-row">' + (fin ? '<span class="topic-no">' + fin + '</span>' : '') + '<span class="topic-name">' + esc(Core.topicName(tp, fin)) + '</span><span class="gpill g-' + grp + '">' + Core.GROUP_LABEL[grp] + '</span></div>';
  if (c.subTopic && fin === auto.id) html += '<div class="sub">' + esc(c.subTopic) + '</div>';
  if (!manual) html += '<div><div class="sub">เหตุผลจาก log</div><ul>' + auto.why.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>';
  else html += '<div class="sub">ระบบเลือก: ' + (auto.id ? auto.id + '. ' : '') + esc(Core.topicName(tp, auto.id)) + ' (' + esc(auto.why.join(' · ')) + ')</div>';
  if (!manual && auto.alt.length) html += '<div class="alt">หัวข้อที่เป็นไปได้รองลงมา: ' + auto.alt.map(function (a) { return (a.id ? a.id + '. ' : '') + esc(Core.topicName(tp, a.id)) + ' (' + esc(a.why[0]) + ')'; }).join(' · ') + '</div>';
  html += '<label class="topic-row sub">เปลี่ยนหัวข้อ <select data-topic="' + k + '" aria-label="เลือกหัวข้ออาการ">' + opts + '</select></label></div>';
  return html;
}
function renderTally() {
  var tp = topics(), cnt = {}, n = 0;
  st.cands.forEach(function (c) { if (!c.end && !c.hb && c.kind !== 'event') return; cnt[c.topicFinal] = (cnt[c.topicFinal] || 0) + 1; n++; });
  var ids = Object.keys(cnt).map(Number).sort(function (a, b) { return cnt[b] - cnt[a] || a - b; });
  var max = Math.max.apply(null, ids.map(function (i) { return cnt[i]; }).concat([1]));
  var gc = {}; ids.forEach(function (i) { var g = Core.groupOf(tp, i); gc[g] = (gc[g] || 0) + cnt[i]; });
  var groups = '<div class="groups">' + ['HW', 'SW', 'ENV', 'UNK'].filter(function (g) { return gc[g]; }).map(function (g) {
    return '<div class="grp g-' + g + '"><b>' + gc[g] + '</b><span>' + Core.GROUP_LABEL[g] + '</span></div>';
  }).join('') + '</div>';
  $('tally').innerHTML = n ? '<div class="sub">สรุปตามกลุ่มสาเหตุและหัวข้อ (' + n + ' จุด ไม่นับจุดที่แค่ไฟล์จบ)</div>' + groups + ids.map(function (i) {
    var g = Core.groupOf(tp, i);
    return '<div class="tr"><span class="mono">' + (i || '–') + '</span><span>' + esc(Core.topicName(tp, i)) + ' <span class="gpill g-' + g + '">' + Core.GROUP_LABEL[g] + '</span><div class="bar" style="width:' + (cnt[i] / max * 100) + '%"></div></span><span class="n">' + cnt[i] + '</span></div>';
  }).join('') : '';
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
