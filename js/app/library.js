/* "Library เคส": guide per topic (data/case-guide.js) + saved cases, grouped by cause group → topic. Saved in localStorage. */
var LIB_KEY = 'posLogTimeline.library.v1';
var LIB = libLoad();
var libView = { grp: '*', q: '', open: {} };

function libLoad() {
  var o = null; try { o = JSON.parse(localStorage.getItem(LIB_KEY) || 'null'); } catch (e) {}
  o = o || {}; if (!o.notes) o.notes = {}; if (!Array.isArray(o.cases)) o.cases = [];
  return o;
}
function libStore() { try { localStorage.setItem(LIB_KEY, JSON.stringify(LIB)); return true; } catch (e) { return false; } }
function libFind(key) { for (var i = 0; i < LIB.cases.length; i++) if (LIB.cases[i].key === key) return LIB.cases[i]; return null; }
function libHas(c) { return !!libFind(ovKey(c)); }

/* save (or refresh) a finding from "จุดผิดปกติที่พบ" */
function libSaveCase(c) {
  var key = ovKey(c), old = libFind(key), tp = c.topicFinal != null ? c.topicFinal : c.topic.id;
  var rec = {
    key: key, pos: c.pos, start: c.start, end: c.end || null, kind: c.kind || 'gap',
    topic: tp, auto: c.topic.id, conf: c.topic.conf, why: c.topic.why.slice(0, 6),
    summary: Core.summaryText(c, st.all, st.files, topics()),
    files: st.files.filter(function (f) { return f.pos === c.pos; }).map(function (f) { return f.path; }).slice(0, 30),
    sample: !!st.isSample, note: old ? old.note : '', savedAt: Date.now()
  };
  if (old) LIB.cases[LIB.cases.indexOf(old)] = rec; else LIB.cases.push(rec);
  if (!libStore()) { if (!old) LIB.cases.pop(); return false; }
  libView.open[tp] = true;
  renderLibrary();
  return true;
}

function libTopicList() {
  var defs = topics().slice(), have = {};
  defs.forEach(function (d) { have[d.id] = 1; });
  // cases filed under a topic that was later deleted still need a home
  LIB.cases.forEach(function (k) { if (!have[k.topic]) { have[k.topic] = 1; defs.push({ id: k.topic, name: 'หัวข้อ ' + k.topic + ' (ถูกลบแล้ว)', group: 'UNK' }); } });
  return defs;
}
function libMatch(text) { return !libView.q || String(text || '').toLowerCase().indexOf(libView.q) >= 0; }
function libGuideText(d) { var g = CASE_GUIDE[d.id]; return [d.name, d.kw, LIB.notes[d.id], g && g.desc, g && g.evidence.join(' '), g && g.check.join(' ')].join(' '); }
function libCaseText(k) { return [k.pos, Core.fmtDate(k.start), Core.fmtTime(k.start), k.note, k.summary].join(' '); }

function renderLibrary() {
  var defs = libTopicList(), byTopic = {};
  LIB.cases.forEach(function (k) { (byTopic[k.topic] = byTopic[k.topic] || []).push(k); });
  Object.keys(byTopic).forEach(function (id) { byTopic[id].sort(function (a, b) { return b.start - a.start; }); });
  var gCount = { '*': LIB.cases.length };
  defs.forEach(function (d) { var g = d.group || 'UNK'; gCount[g] = (gCount[g] || 0) + (byTopic[d.id] || []).length; });
  $('libNote').textContent = defs.length + ' หัวข้อ · บันทึกไว้ ' + LIB.cases.length + ' เคส';
  $('libGroups').innerHTML = ['*', 'HW', 'SW', 'ENV', 'UNK'].map(function (g) {
    return '<button type="button" role="tab" data-g="' + g + '" aria-selected="' + (libView.grp === g) + '">' + (g === '*' ? 'ทั้งหมด' : Core.GROUP_LABEL[g]) + ' <span class="n">' + (gCount[g] || 0) + '</span></button>';
  }).join('');

  var html = ['HW', 'SW', 'ENV', 'UNK'].filter(function (g) { return libView.grp === '*' || libView.grp === g; }).map(function (g) {
    var list = defs.filter(function (d) { return (d.group || 'UNK') === g; }).map(function (d) {
      var cases = byTopic[d.id] || [], topicHit = libMatch(libGuideText(d));
      var shown = topicHit ? cases : cases.filter(function (k) { return libMatch(libCaseText(k)); });
      return (topicHit || shown.length) ? { d: d, cases: shown, total: cases.length } : null;
    }).filter(Boolean);
    if (!list.length) return '';
    var n = list.reduce(function (s, x) { return s + x.total; }, 0);
    return '<div class="lib-group"><h3 class="lib-gh g-' + g + '">' + Core.GROUP_LABEL[g] + ' <span class="sub">' + list.length + ' หัวข้อ · ' + n + ' เคส</span></h3>' + list.map(libTopicHtml).join('') + '</div>';
  }).join('');
  $('libBody').innerHTML = html || '<div class="empty">ไม่พบหัวข้อหรือเคสที่ตรงกับคำค้น</div>';
  bindLibrary();
}
function libTopicHtml(x) {
  var d = x.d, g = CASE_GUIDE[d.id], open = libView.open[d.id] || (libView.q && x.cases.length);
  var guide = g ? '<p class="lib-desc">' + esc(g.desc) + '</p><div class="lib-cols">' +
      '<div><div class="sub">หลักฐานใน log ที่ระบบใช้ตัดสิน</div><ul>' + g.evidence.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      '<div><div class="sub">สิ่งที่ควรตรวจ / แนบส่ง Dev</div><ul>' + g.check.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div></div>'
    : '<p class="sub">หัวข้อที่เพิ่มเอง ' + (d.kw ? 'ระบบเลือกเมื่อพบคำค้น <span class="mono">' + esc(d.kw) + '</span> ใน ' + (d.kwSrc && d.kwSrc !== '*' ? Core.SRC_LABEL[d.kwSrc] : 'ทุก log') : 'ยังไม่มีคำค้นใน log (ตั้งได้ที่ "จัดการหัวข้ออาการ")') + '</p>';
  if (g && d.kw) guide += '<p class="sub">คำค้นเพิ่มเติม: <span class="mono">' + esc(d.kw) + '</span></p>';
  var note = '<label class="lib-note"><span class="sub">บันทึกของทีม (วิธีแก้ที่ใช้ได้ผล, ผู้รับผิดชอบ, เลข ticket)</span><textarea rows="2" data-note="' + d.id + '">' + esc(LIB.notes[d.id] || '') + '</textarea></label>';
  var cases = x.cases.length ? '<div class="lib-cases">' + x.cases.map(libCaseHtml).join('') + '</div>'
    : '<div class="empty">' + (x.total ? 'ไม่มีเคสที่ตรงกับคำค้น' : 'ยังไม่มีเคสที่บันทึกไว้ กด "บันทึกเข้า Library" ในการ์ดจุดผิดปกติ') + '</div>';
  return '<details class="lib-topic" data-id="' + d.id + '"' + (open ? ' open' : '') + '><summary>' + (d.id ? '<span class="topic-no">' + d.id + '</span>' : '') +
    '<span class="lib-tname">' + esc(d.name) + '</span><span class="pill' + (x.total ? ' gap' : '') + '">' + x.total + ' เคส</span></summary>' +
    '<div class="lib-in">' + guide + note + cases + '</div></details>';
}
function libCaseHtml(k) {
  var tp = libTopicList(), opts = ['HW', 'SW', 'ENV', 'UNK'].map(function (g) {
    var list = tp.filter(function (t) { return (t.group || 'UNK') === g; });
    return list.length ? '<optgroup label="' + Core.GROUP_LABEL[g] + '">' + list.map(function (t) { return '<option value="' + t.id + '"' + (t.id === k.topic ? ' selected' : '') + '>' + (t.id ? t.id + '. ' : '') + esc(t.name) + '</option>'; }).join('') + '</optgroup>' : '';
  }).join('');
  var when = Core.fmtDate(k.start) + ' ' + Core.fmtTime(k.start) + (k.end ? ' → ' + Core.fmtTime(k.end) + ' (หาย ' + Core.fmtDur(k.end - k.start) + ')' : '');
  var tag = k.topic !== k.auto ? '<span class="pill">เลือกเอง</span>' : '<span class="pill ' + (k.conf === 'สูง' ? 'c-high' : k.conf === 'กลาง' ? 'c-mid' : 'c-low') + '">ความมั่นใจ' + esc(k.conf) + '</span>';
  var ek = esc(k.key);
  return '<div class="lib-case" data-key="' + ek + '">' +
    '<div class="topic-row"><b>' + esc(k.pos) + '</b><span class="mono">' + when + '</span>' + tag + (k.sample ? '<span class="pill">ข้อมูลตัวอย่าง</span>' : '') +
    '<span class="sub">บันทึก ' + Core.fmtDate(k.savedAt) + '</span></div>' +
    (k.why && k.why.length && k.topic === k.auto ? '<div class="sub">' + esc(k.why.slice(0, 2).join(' · ')) + '</div>' : '') +
    '<input type="text" data-cnote="' + ek + '" value="' + esc(k.note || '') + '" placeholder="หมายเหตุของเคสนี้ เช่น สาขา, ticket, ผลการแก้" aria-label="หมายเหตุเคส">' +
    '<details><summary class="sub">ดูสรุปที่บันทึกไว้</summary><pre class="lib-sum">' + esc(k.summary) + '</pre></details>' +
    '<div class="actions"><button type="button" data-lact="copy" data-key="' + ek + '">คัดลอกสรุปส่ง Dev</button>' +
    '<label class="sub lib-move">ย้ายหัวข้อ <select data-move="' + ek + '" aria-label="ย้ายไปหัวข้อ">' + opts + '</select></label>' +
    '<button type="button" data-lact="del" data-key="' + ek + '">ลบ</button><span class="copy-ok" data-ok="' + ek + '"></span></div></div>';
}
function bindLibrary() {
  var box = $('libBody');
  function okEl(key) { return box.querySelector('[data-ok="' + CSS.escape(key) + '"]'); }
  Array.prototype.forEach.call(box.querySelectorAll('details.lib-topic'), function (dt) {
    dt.ontoggle = function () { if (dt.open) libView.open[dt.dataset.id] = true; else delete libView.open[dt.dataset.id]; };
  });
  Array.prototype.forEach.call(box.querySelectorAll('textarea[data-note]'), function (ta) {
    ta.onchange = function () { var v = ta.value.trim(); if (v) LIB.notes[ta.dataset.note] = v; else delete LIB.notes[ta.dataset.note]; libStore(); };
  });
  Array.prototype.forEach.call(box.querySelectorAll('input[data-cnote]'), function (inp) {
    inp.onchange = function () { var k = libFind(inp.dataset.cnote); if (k) { k.note = inp.value.trim(); libStore(); } };
  });
  Array.prototype.forEach.call(box.querySelectorAll('select[data-move]'), function (sel) {
    sel.onchange = function () { var k = libFind(sel.dataset.move); if (!k) return; k.topic = +sel.value; libView.open[k.topic] = true; libStore(); renderLibrary(); };
  });
  Array.prototype.forEach.call(box.querySelectorAll('button[data-lact]'), function (b) {
    b.onclick = function () {
      var k = libFind(b.dataset.key); if (!k) return;
      if (b.dataset.lact === 'copy') { copyText(k.summary + (k.note ? '\nหมายเหตุ: ' + k.note : ''), okEl(k.key)); return; }
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'กดอีกครั้งเพื่อลบ'; b.className = 'danger'; return; }
      LIB.cases.splice(LIB.cases.indexOf(k), 1); libStore(); renderLibrary(); markLibButtons();
    };
  });
}
/* refresh the "บันทึกเข้า Library" buttons on the finding cards without re-rendering them */
function markLibButtons() {
  Array.prototype.forEach.call(document.querySelectorAll('#cands button[data-act="lib"]'), function (b) {
    var c = st.cands[+b.dataset.k]; b.textContent = c && libHas(c) ? 'อัปเดตใน Library ✓' : 'บันทึกเข้า Library';
  });
}

$('libGroups').onclick = function (ev) { var b = ev.target.closest('button[data-g]'); if (!b) return; libView.grp = b.dataset.g; renderLibrary(); };
$('libQ').oninput = function () { libView.q = this.value.trim().toLowerCase(); renderLibrary(); };
$('libOpenAll').onclick = function () {
  var all = $('libBody').querySelectorAll('details.lib-topic'), anyClosed = Array.prototype.some.call(all, function (d) { return !d.open; });
  Array.prototype.forEach.call(all, function (d) { d.open = anyClosed; });
};
$('libExport').onclick = function () { copyText('POSLOGTIMELINE-LIBRARY ' + JSON.stringify(LIB), $('libOk')); };
$('libImport').onclick = function () {
  var t = $('libImportBox').value.trim().replace(/^POSLOGTIMELINE-LIBRARY\s*/, '');
  try {
    var o = JSON.parse(t);
    if (!o || !Array.isArray(o.cases)) throw new Error('x');
    var added = 0;
    o.cases.forEach(function (k) { if (!k || !k.key) return; var old = libFind(k.key); if (!old) { LIB.cases.push(k); added++; } else if ((k.savedAt || 0) > (old.savedAt || 0)) LIB.cases[LIB.cases.indexOf(old)] = k; });
    Object.keys(o.notes || {}).forEach(function (id) {
      var mine = LIB.notes[id], theirs = String(o.notes[id] || '').trim();
      if (theirs && (!mine || mine.indexOf(theirs) < 0)) LIB.notes[id] = mine ? mine + '\n' + theirs : theirs;
    });
    if (!libStore()) { $('libOk').textContent = 'พื้นที่เก็บในเบราว์เซอร์เต็ม นำเข้าไม่สำเร็จ'; LIB = libLoad(); return; }
    renderLibrary(); markLibButtons();
    $('libOk').textContent = 'นำเข้าแล้ว เคสใหม่ ' + added + ' เคส'; $('libImportBox').value = '';
  } catch (e) { $('libOk').textContent = 'อ่านข้อมูลไม่ได้ ให้คัดลอกข้อความทั้งก้อนที่ขึ้นต้นด้วย POSLOGTIMELINE-LIBRARY'; }
};
