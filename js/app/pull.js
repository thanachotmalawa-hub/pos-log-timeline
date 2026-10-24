/* "ดึง log" tab: builds a SQL script (xp_cmdshell + PowerShell) that copies the chosen log rooms for a time range
   into C:\pull_log\<PC>_<yyyyMMdd_HHmmss>\<ROOM>\ on the store machine. The page only writes text; it never
   connects to SQL or to the store. Tested script logic: files of one kind sorted by Date modified, file N holds the
   lines after file N-1's Date modified, a file is copied when that span overlaps [From, To].
   Works with Windows PowerShell 2.0+ and SQL Server 2008+. */

// series: [file filter, isStartupLog]. Every series is ordered on its own (a startup file never "closes" a log_* file).
var PULL_ROOMS = [
  { id: 'DEBUGLOG',      path: 'POS\\log\\DEBUGLOG',      series: [['log_*', 0]],                                        ex: 'log_20261024.txt, .txt.1, .txt.2' },
  { id: 'ACTIVITYLOG',   path: 'POS\\log\\ACTIVITYLOG',   series: [['log_*', 0]],                                        ex: 'log_20261024.txt, .txt.1, .txt.2' },
  { id: 'TSC',           path: 'POS\\log\\TSC',           series: [['log_*', 0]],                                        ex: 'log_20261024.txt (วันละไฟล์)' },
  { id: 'ITP',           path: 'ITP\\LOG',                series: [['log_*', 0], ['logstartup_*', 1]],                   ex: 'log_20261024.txt, .txt.1, logstartup_20261024.log' },
  { id: 'MSG',           path: 'ITP\\LOG\\MSG',           series: [['log_*', 0]],                                        ex: 'log_20261024.txt, log_20261021.txt.1' },
  { id: 'LOGCMS',        path: 'SAF\\Log\\LOGCMS',        series: [['log_*', 0]],                                        ex: 'log_20261024.txt, .txt.1' },
  { id: 'COMMON_SIGNON', path: 'SMF\\log\\COMMON_SIGNON', series: [['log_*', 0]],                                        ex: 'log_20261024.txt' },
  { id: 'DMF',           path: 'DMF\\Log',                series: [['DebugLog*', 0], ['StartUpLog*', 1], ['DebugStartupLog_*', 1]], ex: 'DebugLog.txt, DebugLog.txt_20261024_1.log, StartUpLog.log, DebugStartupLog_20261024.txt' },
  { id: 'COU',           path: 'COU\\Log',                series: [['log_*', 0]],                                        ex: 'log_20261024.txt' }
];
var PULL_KEY = 'posLogTimeline.pull.v1';

/* PowerShell body; {FROM} {TO} {ROOMS} {DRY} {SU} are filled by SQL REPLACE so the DECLARE lines stay editable.
   No double quotes and no % anywhere: the code travels inside cmd.exe "..." */
function pullPs() {
  var rows = [];
  PULL_ROOMS.forEach(function (r) { r.series.forEach(function (s) { rows.push("@('" + r.id + "','" + r.path + "','" + s[0] + "'," + s[1] + ')'); }); });
  return [
    "$inv=[Globalization.CultureInfo]::InvariantCulture;$f=[datetime]::Parse('{FROM}',$inv);$t=[datetime]::Parse('{TO}',$inv);$dry={DRY};$su={SU};",
    '$all=@(' + rows.join(',') + ');',
    "$want='{ROOMS}'.ToUpper().Split(',');",
    "$out='C:\\pull_log\\'+$env:COMPUTERNAME+'_'+(Get-Date).ToString('yyyyMMdd_HHmmss',$inv);",
    "'RUN  '+[Environment]::UserName+' on '+$env:COMPUTERNAME;'TIME '+$f.ToString('yyyy-MM-dd HH:mm:ss',$inv)+' -> '+$t.ToString('yyyy-MM-dd HH:mm:ss',$inv);if($dry){'MODE DRY RUN (list only, nothing copied)'}else{'TO   '+$out};",
    '$total=0;',
    "foreach($r in $all){if($want -notcontains $r[0]){continue};$src=Join-Path 'C:\\Store' $r[1];",
    "if(-not(Test-Path $src)){'MISS '+$r[0]+' : '+$src;continue};",
    '$files=@(Get-ChildItem -Path $src -Filter $r[2]|Where-Object{-not $_.PSIsContainer}|Sort-Object LastWriteTime);$prev=[datetime]::MinValue;$n=0;',
    "foreach($i in $files){$w=$i.LastWriteTime;if(($w -ge $f -and $prev -le $t) -or ($su -and $r[3] -and $w.Date -ge $f.Date -and $w.Date -le $t.Date)){$line='  '+$r[0]+'\\'+$i.Name+'  '+$w.ToString('MM-dd HH:mm:ss',$inv)+'  '+[math]::Round($i.Length/1KB)+' KB';",
    "if($dry){$line;$n++}else{try{$dst=Join-Path $out $r[0];if(-not(Test-Path $dst)){New-Item -Path $dst -ItemType Directory -Force -ErrorAction Stop|Out-Null};Copy-Item -Path $i.FullName -Destination $dst -Force -ErrorAction Stop;$line;$n++}catch{'ERR  '+$r[0]+'\\'+$i.Name+' : '+$_.Exception.Message}}};$prev=$w};",
    "'OK   '+$r[0]+' '+$r[2]+' : '+$n+' of '+$files.Count;$total+=$n};",
    "if($dry){'DONE '+$total+' file(s) would be copied'}elseif($total -eq 0){'DONE no file in this time range'}else{'DONE '+$total+' file(s) -> '+$out}"
  ].join('');
}

function pullSql(o) {
  var sq = function (s) { return String(s).replace(/'/g, "''"); };
  return [
    '/* POS Log Timeline · ดึง log · สร้างเมื่อ ' + o.made,
    '   ห้อง: ' + o.rooms.join(', '),
    '   ช่วงเวลา: ' + o.from + ' ถึง ' + o.to + (o.dry ? ' · โหมดทดสอบ (ไม่ copy)' : ' · copy จริง'),
    '   วางใน SSMS ที่ต่อเครื่องสาขา กด Ctrl+T (ผลเป็นข้อความ) แล้วกด Execute (F5)',
    '   อ่านอย่างเดียว: ไม่ลบหรือแก้ไฟล์ log ต้นฉบับ เขียนเฉพาะใน C:\\pull_log */',
    '',
    "DECLARE @From    varchar(19)  = '" + o.from + "';   -- yyyy-MM-dd HH:mm:ss (ปี ค.ศ.)",
    "DECLARE @To      varchar(19)  = '" + o.to + "';",
    "DECLARE @Rooms   varchar(300) = '" + o.rooms.join(',') + "';",
    'DECLARE @DryRun  bit = ' + (o.dry ? 1 : 0) + ';   -- 1 = ทดสอบ แสดงรายการไฟล์ ไม่ copy · 0 = copy จริง',
    'DECLARE @Startup bit = ' + (o.startup ? 1 : 0) + ';   -- 1 = แนบ log startup ของวันที่เลือกเสมอ',
    '',
    "IF (SELECT CONVERT(int, value_in_use) FROM sys.configurations WHERE name = 'xp_cmdshell') = 0",
    'BEGIN',
    "  RAISERROR('xp_cmdshell is turned off on this server. Do not turn it on yourself: ask the DBA / follow company policy.', 16, 1);",
    '  RETURN;',
    'END;',
    '',
    "DECLARE @ps varchar(8000) = '" + sq(pullPs()) + "';",
    "SET @ps = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@ps, '{FROM}', @From), '{TO}', @To), '{ROOMS}', REPLACE(@Rooms, ' ', '')),",
    "  '{DRY}', CASE WHEN @DryRun = 1 THEN '$true' ELSE '$false' END), '{SU}', CASE WHEN @Startup = 1 THEN '$true' ELSE '$false' END);",
    '',
    "DECLARE @cmd varchar(8000) = 'powershell -NoProfile -NonInteractive -Command \"' + @ps + '\"';",
    'EXEC master..xp_cmdshell @cmd;',
    ''
  ].join('\n');
}

/* ---------- Thai wording for a time, so 17:00 reads "5 โมงเย็น" ---------- */
var TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function thaiClock(h, m) {
  var w;
  if (h === 0) w = 'เที่ยงคืน';
  else if (h <= 5) w = 'ตี ' + h;
  else if (h <= 11) w = h + ' โมงเช้า';
  else if (h === 12) w = 'เที่ยง';
  else if (h === 13) w = 'บ่ายโมง';
  else if (h <= 15) w = 'บ่าย ' + (h - 12) + ' โมง';
  else if (h <= 18) w = (h - 12) + ' โมงเย็น';
  else w = (h - 18) + ' ทุ่ม';
  return m ? w + ' ' + m + ' นาที' : w;
}
function thaiDate(d) { return d.getDate() + ' ' + TH_MON[d.getMonth()] + ' ' + (d.getFullYear() + 543); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function isoDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function hhmm(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function readDT(dId, tId) {
  var dv = $(dId).value, tv = $(tId).value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dv) || !/^\d{2}:\d{2}/.test(tv)) return null;
  var p = dv.split('-'), q = tv.split(':');
  return new Date(+p[0], +p[1] - 1, +p[2], +q[0], +q[1], 0);
}
function setDT(dId, tId, d) { $(dId).value = isoDate(d); $(tId).value = hhmm(d); }
function sqlDT(d) { return isoDate(d) + ' ' + hhmm(d) + ':00'; }

/* ---------- state ---------- */
var pullState = (function () {
  var s = { rooms: PULL_ROOMS.map(function (r) { return r.id; }), startup: true, ip: '' };
  try { var j = JSON.parse(localStorage.getItem(PULL_KEY) || 'null'); if (j) { if (Array.isArray(j.rooms)) s.rooms = j.rooms; if (j.startup != null) s.startup = !!j.startup; if (j.ip) s.ip = String(j.ip); } } catch (e) {}
  return s;
})();
function savePull() { try { localStorage.setItem(PULL_KEY, JSON.stringify({ rooms: pullState.rooms, startup: pullState.startup, ip: pullState.ip })); } catch (e) {} }

function renderPullRooms() {
  $('pullRooms').innerHTML = PULL_ROOMS.map(function (r, i) {
    var on = pullState.rooms.indexOf(r.id) >= 0;
    return '<label class="room' + (on ? ' on' : '') + '"><input type="checkbox" data-room="' + r.id + '"' + (on ? ' checked' : '') + '>' +
      '<span class="room-no">' + (i + 1) + '</span><span class="room-txt"><b>' + r.id + '</b><code>C:\\Store\\' + esc(r.path) + '</code><span class="sub">' + esc(r.ex) + '</span></span></label>';
  }).join('');
  Array.prototype.forEach.call($('pullRooms').querySelectorAll('[data-room]'), function (cb) {
    cb.onchange = function () {
      var id = cb.dataset.room;
      pullState.rooms = PULL_ROOMS.map(function (r) { return r.id; }).filter(function (x) { return x === id ? cb.checked : pullState.rooms.indexOf(x) >= 0; });
      cb.closest('.room').classList.toggle('on', cb.checked);
      savePull(); updatePull();
    };
  });
}

function updatePull() {
  var f = readDT('pullFromD', 'pullFromT'), t = readDT('pullToD', 'pullToT');
  var dry = $('pullDry').checked, warn = [];
  pullState.startup = $('pullStartup').checked;
  $('pullRoomCount').textContent = 'เลือก ' + pullState.rooms.length + ' / ' + PULL_ROOMS.length + ' ห้อง';
  if (!pullState.rooms.length) warn.push('ยังไม่ได้เลือกห้อง log');
  if (!f || !t) warn.push('ใส่วันที่และเวลาให้ครบ');
  else if (t <= f) warn.push('เวลาสิ้นสุดต้องหลังเวลาเริ่ม');
  else if (t - f > 3 * 864e5) warn.push('ช่วงเวลายาวกว่า 3 วัน ไฟล์อาจเยอะและ copy นาน ลองแคบลงถ้าไม่จำเป็น');
  if (f && t && t > f) {
    var mins = Math.round((t - f) / 60000), dur = mins >= 60 ? Math.floor(mins / 60) + ' ชม.' + (mins % 60 ? ' ' + (mins % 60) + ' นาที' : '') : mins + ' นาที';
    var same = isoDate(f) === isoDate(t);
    $('pullSay').innerHTML = 'ดึง log <b>' + thaiDate(f) + '</b> เวลา <b>' + hhmm(f) + '</b> (' + thaiClock(f.getHours(), f.getMinutes()) + ') ถึง ' +
      (same ? '' : '<b>' + thaiDate(t) + '</b> ') + 'เวลา <b>' + hhmm(t) + '</b> (' + thaiClock(t.getHours(), t.getMinutes()) + ') · รวม ' + dur;
  } else $('pullSay').textContent = '';
  var hard = warn.filter(function (w) { return !/ยาวกว่า/.test(w); });
  $('pullWarn').hidden = !warn.length; $('pullWarn').textContent = warn.join(' · ');
  $('pullMode').textContent = dry ? 'ทดสอบ: แสดงรายการ ไม่ copy' : 'copy จริง';
  $('pullMode').className = 'pill ' + (dry ? 'ok' : 'err');
  $('pullCopy').disabled = !!hard.length;
  $('pullSql').value = hard.length ? '-- ' + hard.join('\n-- ') : pullSql({
    from: sqlDT(f), to: sqlDT(t), rooms: pullState.rooms, dry: dry, startup: pullState.startup,
    made: new Date().toISOString().slice(0, 16).replace('T', ' ')
  });
  // after-run helpers
  var ip = $('pullIp').value.trim(); pullState.ip = ip; savePull();
  var okHost = /^[A-Za-z0-9.\-]+$/.test(ip);
  $('pullUnc').textContent = '\\\\' + (okHost ? ip : '<IP>') + '\\C$\\pull_log';
  var name = $('pullDelName').value.trim(), okName = /^[A-Za-z0-9_.\-]+$/.test(name) && !/^\.+$/.test(name);
  $('pullDelSql').textContent = okName ? "EXEC master..xp_cmdshell 'rmdir /s /q \"C:\\pull_log\\" + name + "\"';" : '(ใส่ชื่อโฟลเดอร์ก่อน)';
  $('pullDelCopy').disabled = !okName;
}

function quickRange(kind) {
  var now = new Date(), f, t;
  if (kind === 'today') { f = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0); t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59); }
  else if (kind === 'yesterday') { f = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0); t = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59); }
  else { var h = kind === 'last3' ? 3 : 1; t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1); f = new Date(t - h * 3600000); }
  setDT('pullFromD', 'pullFromT', f); setDT('pullToD', 'pullToT', t); updatePull();
}

(function initPull() {
  renderPullRooms();
  $('pullStartup').checked = pullState.startup;
  $('pullIp').value = pullState.ip;
  quickRange('last1');
  $('pullAll').onclick = function () { pullState.rooms = PULL_ROOMS.map(function (r) { return r.id; }); savePull(); renderPullRooms(); updatePull(); };
  $('pullNone').onclick = function () { pullState.rooms = []; savePull(); renderPullRooms(); updatePull(); };
  ['pullFromD', 'pullFromT', 'pullToD', 'pullToT', 'pullDry', 'pullStartup'].forEach(function (id) { $(id).onchange = updatePull; $(id).oninput = updatePull; });
  $('pullIp').oninput = updatePull; $('pullDelName').oninput = updatePull;
  Array.prototype.forEach.call(document.querySelectorAll('[data-qr]'), function (b) { b.onclick = function () { quickRange(b.dataset.qr); }; });
  $('pullIncGo').onclick = function () {
    var tv = $('pullIncT').value; if (!/^\d{2}:\d{2}/.test(tv)) { $('pullIncT').focus(); return; }
    var base = readDT('pullFromD', 'pullFromT') || new Date(), q = tv.split(':'), w = +$('pullIncW').value;
    var c = new Date(base.getFullYear(), base.getMonth(), base.getDate(), +q[0], +q[1]);
    setDT('pullFromD', 'pullFromT', new Date(c - w * 60000)); setDT('pullToD', 'pullToT', new Date(+c + w * 60000)); updatePull();
  };
  $('pullCopy').onclick = function () { copyText($('pullSql').value, $('pullOk')); };
  $('pullUncCopy').onclick = function () { copyText($('pullUnc').textContent, $('pullOk')); };
  $('pullDirCopy').onclick = function () { copyText($('pullDirSql').textContent, $('pullOk')); };
  $('pullDelCopy').onclick = function () { copyText($('pullDelSql').textContent, $('pullOk')); };
})();
