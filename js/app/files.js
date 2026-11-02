/* Reading log files / folders / .zip, Thai encoding, drag & drop, rebuild of the analysis. */
/* ---------- reading files ---------- */
var U8 = new TextDecoder('utf-8', { fatal: true });
var TIS; try { TIS = new TextDecoder('windows-874'); } catch (e) { TIS = new TextDecoder('utf-8'); }
function decode(buf) {
  var b = new Uint8Array(buf);
  try { return { text: U8.decode(b), enc: 'UTF-8' }; } catch (e) {}
  var out = [], s = 0, bad = 0;
  for (var i = 0; i <= b.length; i++) {
    if (i === b.length || b[i] === 10) {
      var seg = b.subarray(s, i), t;
      try { t = U8.decode(seg); } catch (e2) { t = TIS.decode(seg); bad++; }
      out.push(t); s = i + 1;
    }
  }
  return { text: out.join('\n'), enc: 'TIS-620' };
}
function wanted(name) { return /\.(txt|log)(\.\d+)?$/i.test(name) || !/\.[a-z0-9]{2,4}$/i.test(name); }

async function ingest(items) { // items: [{path, file}|{path, text}]
  var out = [], skipped = 0;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.file && /\.zip$/i.test(it.path)) {
      if (typeof JSZip === 'undefined') { setStatus('อ่าน .zip ไม่ได้ เพราะโหลดตัวช่วยอ่าน zip ไม่สำเร็จ ให้แตกไฟล์ก่อนแล้วเลือกโฟลเดอร์แทน', true); continue; }
      setStatus('กำลังแตกไฟล์ ' + it.path + ' …');
      var zip = await JSZip.loadAsync(it.file);
      var base = it.path.replace(/\.zip$/i, '');
      var names = Object.keys(zip.files);
      for (var z = 0; z < names.length; z++) {
        var zf = zip.files[names[z]];
        if (zf.dir) continue;
        if (!wanted(zf.name)) { skipped++; continue; }
        var p = zf.name.indexOf('/') >= 0 ? zf.name : base + '/' + zf.name;
        out.push({ path: p, buf: await zf.async('arraybuffer') });
      }
    } else if (it.file) {
      if (!wanted(it.path)) { skipped++; continue; }
      out.push({ path: it.path, buf: await it.file.arrayBuffer() });
    } else out.push(it);
  }
  var files = [], dups = 0, keepFiles = ($('append').checked && !st.isSample) ? st.files : [];
  for (var k = 0; k < out.length; k++) {
    var o = out[k];
    setStatus('กำลังอ่าน ' + (k + 1) + '/' + out.length + ' · ' + o.path);
    await new Promise(function (r) { setTimeout(r, 0); });
    var d = o.text != null ? { text: o.text, enc: 'UTF-8' } : decode(o.buf);
    var entries = Core.parseText(d.text);
    var det = Core.detectType(entries, o.path);
    var fffd = (d.text.match(/\uFFFD/g) || []).length;
    var sig = entries.length + ':' + (entries[0] ? entries[0].raw : '') + ':' + (entries.length ? entries[entries.length - 1].raw : '');
    var dupOf = files.concat(keepFiles).filter(function (x) { return x.sig === sig; })[0];
    if (dupOf && entries.length) { dups++; continue; }
    files.push({ sig: sig, path: o.path, entries: entries, type: det.type, how: det.how, pos: Core.posFromPath(o.path), enc: d.enc, fffd: fffd,
      first: entries.length ? entries[0].t : null, last: entries.length ? entries[entries.length - 1].t : null });
  }
  return { files: files, skipped: skipped, dups: dups };
}

async function load(items, isSample) {
  try {
    setStatus('กำลังอ่านไฟล์…');
    var r = await ingest(items);
    var useful = r.files.filter(function (f) { return f.entries.length; });
    if (!useful.length) { setStatus('ไม่พบบรรทัดที่ขึ้นต้นด้วยวันเวลา (เช่น 2026-10-02 07:25:01,148) ในไฟล์ที่เลือก', true); return; }
    var keep = $('append').checked && !st.isSample && !isSample;
    st.files = keep ? st.files.concat(r.files) : r.files;
    st.isSample = !!isSample;
    st.from = st.to = null; st.sel = -1; st.posSel = '*'; st.srcOn = {};
    $('from').value = ''; $('to').value = ''; $('q').value = '';
    rebuild();
    var noTs = r.files.length - useful.length;
    setStatus('อ่าน ' + useful.length + ' ไฟล์ · ' + st.all.length.toLocaleString() + ' บรรทัด' + (noTs ? ' · ' + noTs + ' ไฟล์ไม่มีบรรทัดที่มีเวลา' : '') + (r.skipped ? ' · ข้าม ' + r.skipped + ' ไฟล์ที่ไม่ใช่ .txt/.log' : '') + (r.dups ? ' · ข้าม ' + r.dups + ' ไฟล์ที่ซ้ำกัน' : '') + (st.learnedNote ? ' · ' + st.learnedNote : ''));
    st.learnedNote = '';
    renderBanner();
    // open on the whole log; zooming in is the user's choice (overview chips / chart / "ดูช่วงก่อนค้าง")
    st.from = st.to = null; $('from').value = ''; $('to').value = '';
    applyFilters(); drawLanes();
  } catch (e) {
    console.error(e); setStatus('อ่านไฟล์ไม่สำเร็จ: ' + (e && e.message || e), true);
  }
}

function renderBroken() {
  var bad = st.files.filter(function (f) { return f.fffd > 20; });
  var box = $('brokenWarn');
  if (!bad.length || st.isSample) { box.hidden = true; return; }
  var tot = bad.reduce(function (a, f) { return a + f.fffd; }, 0);
  box.hidden = false;
  box.innerHTML = '<b>ภาษาไทยในไฟล์เสียมาก่อนแล้ว</b> ' + bad.length + ' จาก ' + st.files.length + ' ไฟล์ (' + tot.toLocaleString() + ' จุด) ในเว็บจะแสดงเป็น <span class="mono">[ภาษาไทยเสีย]</span> ' +
    'สาเหตุคือไฟล์ถูกแปลงรหัสตัวอักษรระหว่าง copy หรือส่งต่อ (เช่น แนบในแชท เปิดแล้ว Save ใหม่ หรือส่งผ่านโปรแกรมที่แปลงเป็น UTF-8) ตัวอักษรเดิมหายไปแล้ว กู้จากไฟล์นี้ไม่ได้' +
    '<br>วิธีแก้: <b>zip โฟลเดอร์ log จากเครื่อง POS ก่อนส่งต่อ</b> แล้วลาก .zip หรือโฟลเดอร์ต้นฉบับเข้าเว็บนี้โดยตรง เว็บอ่านภาษาไทยแบบ TIS-620 ได้เอง ระหว่างนี้ข้อความ Popup ที่เคยเห็นแล้วจะแสดงจาก "ข้อความ Popup ตามรหัส" ในตั้งค่าแทน';
}
function renderBanner() {
  $('bannerText').innerHTML = st.isSample
    ? '<b>กำลังแสดงข้อมูลตัวอย่าง</b> (ตัดมาจาก 4 เคสจริง: 17923 วันที่ 2 ต.ค. · 08350 วันที่ 26 ก.ย. · 19967 วันที่ 1 ต.ค. · 16750 วันที่ 30 ต.ค. LPE timeout บิลใหญ่ ปิดเบอร์โทร ชื่อ และรหัสสมาชิกแล้ว) · ลากโฟลเดอร์หรือไฟล์ .zip ของเคสจริงมาวางที่ไหนก็ได้ในหน้านี้'
    : !st.files.length
    ? '<b>เริ่มต้นใช้งาน</b> · กด "เลือกโฟลเดอร์ log" หรือลากโฟลเดอร์ / ไฟล์ .zip มาวางที่ไหนก็ได้ในหน้านี้ · อยากดูตัวอย่างก่อน กด "โหลดตัวอย่าง"'
    : 'ลากโฟลเดอร์ / .zip อื่นมาวางเพื่อเปิดเคสใหม่ · ติ๊ก "เพิ่มต่อจากข้อมูลเดิม" ถ้าต้องการรวมหลายชุด';
}

$('inDir').onchange = function (e) {
  var fl = Array.prototype.slice.call(e.target.files);
  load(fl.map(function (f) { return { path: f.webkitRelativePath || f.name, file: f }; }));
  e.target.value = '';
};
$('inFiles').onchange = function (e) {
  var fl = Array.prototype.slice.call(e.target.files);
  load(fl.map(function (f) { return { path: f.name, file: f }; }));
  e.target.value = '';
};
$('btnSample').onclick = loadSample;
function loadSample() {
  var data = window.POS_SAMPLE_DATA || []; // from data/sample-data.js
  if (!data.length) { setStatus('ไม่พบข้อมูลตัวอย่าง (data/sample-data.js)', true); return; }
  load(data.map(function (d) { return { path: d.path, text: d.text }; }), true);
}

/* drag & drop of folders */
var dragDepth = 0;
document.addEventListener('dragenter', function (e) { if (hasFiles(e)) { dragDepth++; $('dropOverlay').hidden = false; } });
document.addEventListener('dragleave', function () { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dropOverlay').hidden = true; });
document.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
document.addEventListener('drop', async function (e) {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $('dropOverlay').hidden = true;
  // everything must be taken from dataTransfer now: the browser empties it as soon as this handler awaits
  var dt = e.dataTransfer, items = dt.items, plain = [], dirs = [];
  if (items && items.length) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i]; if (it.kind !== 'file') continue;
      var en = it.webkitGetAsEntry ? it.webkitGetAsEntry() : null;
      if (en && en.isDirectory) { dirs.push(en); continue; }
      var f = it.getAsFile(); if (f) plain.push({ path: f.name, file: f });
    }
  } else {
    Array.prototype.forEach.call(dt.files || [], function (f) { plain.push({ path: f.name, file: f }); });
  }
  // folders are read through the FileSystem API, which some browsers block on pages opened from a local file (file://)
  var list = plain.slice(), failed = [];
  for (var j = 0; j < dirs.length; j++) {
    try { list = list.concat(await walk(dirs[j], '')); }
    catch (err) { console.warn('read dropped folder failed', err); failed.push(dirs[j].name); }
  }
  if (list.length) await load(list);
  if (failed.length) setStatus('เบราว์เซอร์ไม่ยอมให้อ่านโฟลเดอร์ที่ลากมา (' + failed.join(', ') + ') เมื่อเปิดเว็บจากไฟล์ในเครื่อง ใช้ปุ่ม "เลือกโฟลเดอร์ log" หรือ zip โฟลเดอร์แล้วลาก .zip มาแทน', true);
});
function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
async function walk(entry, prefix) {
  if (entry.isFile) { var f = await new Promise(function (res, rej) { entry.file(res, rej); }); return [{ path: prefix + entry.name, file: f }]; }
  if (entry.isDirectory) {
    var reader = entry.createReader(), all = [];
    while (true) { var batch = await new Promise(function (res, rej) { reader.readEntries(res, rej); }); if (!batch.length) break; all = all.concat(batch); }
    var out = [];
    for (var i = 0; i < all.length; i++) out = out.concat(await walk(all[i], prefix + entry.name + '/'));
    return out;
  }
  return [];
}

/* ---------- rebuild & analysis ---------- */
function rebuild() {
  st.all = Core.merge(st.files, S);
  var fl = Core.flag(st.all, S);
  st.hbRules = fl.hbRules;
  st.cands = Core.analyze(st.all, S, st.hbRules);
  var days = {};
  st.all.forEach(function (e) { days[Core.fmtDate(e.t)] = 1; });
  st.multiDay = Object.keys(days).length > 1;
  st.baseDate = st.all.length ? Core.fmtDate(st.all[0].t) : null;
  learnCodes();
  renderPosSel(); renderSrcBtns(); renderFiles(); renderCands(); applyFilters(); drawLanes(); renderBroken();
}
function learnCodes() {
  var L = Core.learned(), have = {}, add = [];
  String(S.msgCodes || '').split('\n').forEach(function (l) { var p = l.indexOf('='); if (p > 0) have[l.slice(0, p).trim()] = 1; });
  Object.keys(L).forEach(function (code) { if (!have[code]) add.push(code + ' = ' + L[code]); });
  Core.resetLearned();
  if (!add.length || st.isSample) return;
  S.msgCodes = String(S.msgCodes || '').replace(/\s+$/, '') + '\n' + add.join('\n');
  saveSettings(); try { $('sCodes').value = S.msgCodes; } catch (e) {}
  st.learnedNote = 'เรียนรู้ข้อความ Popup ใหม่ ' + add.length + ' รหัส';
}
