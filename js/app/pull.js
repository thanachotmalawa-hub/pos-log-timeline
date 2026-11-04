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
// Windows Event Log (Get-EventLog, PowerShell 2.0+). Saved files go to <pull folder>\WINEVENT\EVENT_<log>.txt
var PULL_EVLOGS = [
  { id: 'Application', ex: 'Application Error / Application Hang / .NET Runtime ของโปรแกรม POS' },
  { id: 'System',      ex: 'ปิด-เปิดเครื่อง (6005/6006/6008/1074/41), Disk, Driver, Service' }
];
// always kept even when only Error/Warning is chosen: boot / shutdown / unexpected shutdown / power loss
var PULL_EV_KEEP = '41,1074,6005,6006,6008,6009,6013';

/* PowerShell body; {FROM} {TO} {ROOMS} {DRY} {SU} {STAMP} are filled by SQL REPLACE so the DECLARE lines stay editable.
   No double quotes and no % anywhere: the code travels inside cmd.exe "..." */
function pullPs() {
  var rows = [];
  PULL_ROOMS.forEach(function (r) { r.series.forEach(function (s) { rows.push("@('" + r.id + "','" + r.path + "','" + s[0] + "'," + s[1] + ')'); }); });
  return [
    "$inv=[Globalization.CultureInfo]::InvariantCulture;$f=[datetime]::Parse('{FROM}',$inv);$t=[datetime]::Parse('{TO}',$inv);$dry={DRY};$su={SU};",
    '$all=@(' + rows.join(',') + ');',
    "$want='{ROOMS}'.ToUpper().Split(',');",
    "$out='C:\\pull_log\\'+$env:COMPUTERNAME+'_{STAMP}';",
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

/* Windows Event Log part; {FROM} {TO} {DRY} {STAMP} {LOGS} {ALL} {SHOW} {SAVE} filled by SQL REPLACE.
   SHOW: one line per event in the SSMS result (cut at 250 chars, the xp_cmdshell output column is nvarchar(255)).
   SAVE: one .txt per log in <same pull folder>\WINEVENT, lines shaped like the POS logs so this web reads them
   (time|LEVEL|EventID|Source||log.win.<log>|WIN|Source|LEVEL|EventID|Message). */
function pullEvPs() {
  return [
    "$inv=[Globalization.CultureInfo]::InvariantCulture;$f=[datetime]::Parse('{FROM}',$inv);$t=[datetime]::Parse('{TO}',$inv);$dry={DRY};$show={SHOW};$save={SAVE};$any={ALL};",
    '$keep=@(' + PULL_EV_KEEP + ');',
    "$out='C:\\pull_log\\'+$env:COMPUTERNAME+'_{STAMP}\\WINEVENT';",
    "'EVENT '+$f.ToString('yyyy-MM-dd HH:mm:ss',$inv)+' -> '+$t.ToString('yyyy-MM-dd HH:mm:ss',$inv)+$(if($any){'  (all levels)'}else{'  (Error/Warning + boot/shutdown)'});",
    "foreach($ln in '{LOGS}'.Split(',')){if(-not $ln){continue};",
    "try{$ev=@(Get-EventLog -LogName $ln -After $f -Before $t -ErrorAction Stop)}catch{'ERR  EVENT '+$ln+' : '+$_.Exception.Message;continue};",
    "if(-not $any){$ev=@($ev|Where-Object{$_.EntryType -eq 'Error' -or $_.EntryType -eq 'Warning' -or $keep -contains $_.EventID})};",
    '$ev=@($ev|Sort-Object TimeGenerated,Index);$rows=@();',
    "foreach($e in $ev){$lv='INFO';if($e.EntryType -eq 'Error'){$lv='ERROR'}elseif($e.EntryType -eq 'Warning' -or $e.EntryType -eq 'FailureAudit'){$lv='WARN'};",
    "$m=([string]$e.Message -replace '\\s+',' ').Trim();$rows+=,@($e.TimeGenerated.ToString('yyyy-MM-dd HH:mm:ss.fff',$inv),$lv,[string]$e.EventID,[string]$e.Source,$m)};",
    "'OK   EVENT '+$ln+' : '+$rows.Count+' event(s)';",
    "if($show){foreach($r in $rows){$x='  '+$r[0].Substring(0,19)+'  '+$r[1]+'  '+$r[3]+' ('+$r[2]+')  '+$r[4];if($x.Length -gt 250){$x=$x.Substring(0,250)};$x}};",
    "if($save){if($dry){'  DRY RUN: '+$ln+' not saved'}elseif($rows.Count){try{if(-not(Test-Path $out)){New-Item -Path $out -ItemType Directory -Force -ErrorAction Stop|Out-Null};",
    "$p=Join-Path $out ('EVENT_'+$ln+'.txt');$txt=@();foreach($r in $rows){$txt+=$r[0]+'|'+$r[1]+'|'+$r[2]+'|'+$r[3]+'||log.win.'+$ln.ToLower()+'|WIN|'+$r[3]+'|'+$r[1]+'|'+$r[2]+'|'+$r[4]};",
    "[IO.File]::WriteAllLines($p,[string[]]$txt,(New-Object Text.UTF8Encoding($true)));'SAVE '+$p}catch{'ERR  EVENT '+$ln+' : '+$_.Exception.Message}}}};",
    "'DONE EVENT'"
  ].join('');
}

/* Machine info (WMI, PowerShell 2.0+); {DRY} {SAVE} {STAMP} filled by SQL REPLACE. Read-only: OS, uptime/last boot,
   CPU/RAM/pagefile, disks + physical drive status (SMART when allowed), PowerShell/.NET, top processes, POS processes.
   SAVE writes <same pull folder>\SYSINFO\SYSINFO.txt (no time column, so the timeline ignores it). */
function pullSysPs() {
  return [
    "$inv=[Globalization.CultureInfo]::InvariantCulture;$dry={DRY};$save={SAVE};$o=@();$now=Get-Date;",
    "$out='C:\\pull_log\\'+$env:COMPUTERNAME+'_{STAMP}\\SYSINFO';",
    "function L($k,$v){$script:o+=($k.PadRight(11)+': '+$v)};function G($b){[math]::Round($b/1GB,1)};",
    "try{$os=Get-WmiObject Win32_OperatingSystem;$cs=Get-WmiObject Win32_ComputerSystem;$boot=$os.ConvertToDateTime($os.LastBootUpTime);$up=$now-$boot;",
    "L 'Computer' ($env:COMPUTERNAME+'  '+$cs.Manufacturer+' '+$cs.Model);",
    "L 'OS' ($os.Caption+' SP'+$os.ServicePackMajorVersion+'  ver '+$os.Version+'  '+$os.OSArchitecture);",
    "L 'Installed' ($os.ConvertToDateTime($os.InstallDate).ToString('yyyy-MM-dd',$inv));",
    "L 'Last boot' ($boot.ToString('yyyy-MM-dd HH:mm:ss',$inv)+'  uptime '+$up.Days+'d '+$up.Hours+'h '+$up.Minutes+'m');",
    "L 'Now' ($now.ToString('yyyy-MM-dd HH:mm:ss',$inv)+'  '+[TimeZone]::CurrentTimeZone.StandardName);",
    "$tm=$cs.TotalPhysicalMemory;$fm=$os.FreePhysicalMemory*1KB;L 'RAM' ('total '+(G $tm)+' GB  free '+(G $fm)+' GB  used '+[math]::Round(100-$fm*100/$tm)+' pct');",
    "L 'Virtual' ('total '+(G ($os.TotalVirtualMemorySize*1KB))+' GB  free '+(G ($os.FreeVirtualMemory*1KB))+' GB')}catch{L 'ERR OS' $_.Exception.Message};",
    "try{$b=Get-WmiObject Win32_BIOS;L 'BIOS' ($b.SMBIOSBIOSVersion+'  '+$b.ReleaseDate.Substring(0,8)+'  SN '+$b.SerialNumber)}catch{};",
    "try{foreach($c in @(Get-WmiObject Win32_Processor)){L 'CPU' (($c.Name -replace '\\s+',' ').Trim()+'  '+$c.NumberOfCores+' core/'+$c.NumberOfLogicalProcessors+' thread  load '+$c.LoadPercentage+' pct')}}catch{L 'ERR CPU' $_.Exception.Message};",
    "try{foreach($d in @(Get-WmiObject Win32_LogicalDisk -Filter 'DriveType=3')){L ('Disk '+$d.DeviceID) ('size '+(G $d.Size)+' GB  free '+(G $d.FreeSpace)+' GB  ('+[math]::Round($d.FreeSpace*100/$d.Size)+' pct free)  '+$d.FileSystem)}}catch{L 'ERR Disk' $_.Exception.Message};",
    "try{foreach($d in @(Get-WmiObject Win32_DiskDrive)){L 'Drive' ($d.Model+'  '+(G $d.Size)+' GB  '+$d.InterfaceType+'  status '+$d.Status)}}catch{};",
    "try{foreach($s in @(Get-WmiObject -Namespace root\\wmi MSStorageDriver_FailurePredictStatus -ErrorAction Stop)){L 'SMART' ('PredictFailure='+$s.PredictFailure+'  reason '+$s.Reason)}}catch{L 'SMART' 'not available (no permission / not supported)'};",
    "L 'PowerShell' ([string]$PSVersionTable.PSVersion+'  .NET CLR '+[Environment]::Version);",
    "try{$p=@(Get-Process);L 'Processes' ([string]$p.Count+' running');",
    "foreach($x in @($p|Sort-Object WorkingSet -Descending|Select-Object -First 5)){L 'Top memory' ($x.ProcessName+'  '+[math]::Round($x.WorkingSet/1MB)+' MB  handles '+$x.HandleCount+'  cpu '+[math]::Round($x.TotalProcessorTime.TotalSeconds)+' s')};",
    "foreach($x in @($p|Where-Object{$_.ProcessName -like 'th.co.gosoft*'}|Sort-Object ProcessName)){L 'POS proc' (($x.ProcessName -replace '^th\\.co\\.gosoft\\.sts\\.','')+'  '+[math]::Round($x.WorkingSet/1MB)+' MB  handles '+$x.HandleCount+'  threads '+$x.Threads.Count)}}catch{L 'ERR Proc' $_.Exception.Message};",
    "'SYSINFO '+$env:COMPUTERNAME;$o;",
    "if($save){if($dry){'  DRY RUN: SYSINFO not saved'}else{try{if(-not(Test-Path $out)){New-Item -Path $out -ItemType Directory -Force -ErrorAction Stop|Out-Null};$fp=Join-Path $out 'SYSINFO.txt';",
    "[IO.File]::WriteAllLines($fp,[string[]]$o,(New-Object Text.UTF8Encoding($true)));'SAVE '+$fp}catch{'ERR  SYSINFO : '+$_.Exception.Message}}};",
    "'DONE SYSINFO'"
  ].join('');
}

function pullSql(o) {
  var sq = function (s) { return String(s).replace(/'/g, "''"); };
  var ev = o.evLogs || [];
  var evHow = [o.evShow ? 'แสดงในผลลัพธ์' : '', o.evSave ? 'บันทึกไฟล์' : ''].filter(Boolean).join(' + ');
  var b = function (v) { return "CASE WHEN " + v + " = 1 THEN '$true' ELSE '$false' END"; };
  return [
    '/* POS Log Timeline · ดึง log · สร้างเมื่อ ' + o.made,
    '   ห้อง: ' + (o.rooms.length ? o.rooms.join(', ') : '(ไม่ดึงห้อง log)'),
    '   Windows Event Log: ' + (ev.length ? ev.join(', ') + ' · ' + (o.evAll ? 'ทุกระดับ' : 'Error/Warning + ปิด-เปิดเครื่อง') + ' · ' + evHow : '(ไม่ดึง)'),
    '   ข้อมูลเครื่อง (OS / สเปค): ' + (o.sys ? 'ตรวจ' + (o.sysSave ? ' + บันทึกไฟล์' : '') : '(ไม่ตรวจ)'),
    '   ช่วงเวลา: ' + o.from + ' ถึง ' + o.to + (o.dry ? ' · โหมดทดสอบ (ไม่ copy / ไม่บันทึกไฟล์)' : ' · copy จริง'),
    '   วางใน SSMS ที่ต่อเครื่องสาขา กด Ctrl+T (ผลเป็นข้อความ) แล้วกด Execute (F5)',
    '   อ่านอย่างเดียว: ไม่ลบหรือแก้ไฟล์ log / event log ต้นฉบับ เขียนเฉพาะใน C:\\pull_log */',
    '',
    "DECLARE @From    varchar(19)  = '" + o.from + "';   -- yyyy-MM-dd HH:mm:ss (ปี ค.ศ.)",
    "DECLARE @To      varchar(19)  = '" + o.to + "';",
    "DECLARE @Rooms   varchar(300) = '" + o.rooms.join(',') + "';   -- ว่าง = ไม่ดึงห้อง log",
    'DECLARE @DryRun  bit = ' + (o.dry ? 1 : 0) + ';   -- 1 = ทดสอบ แสดงรายการไฟล์ ไม่ copy · 0 = copy จริง',
    'DECLARE @Startup bit = ' + (o.startup ? 1 : 0) + ';   -- 1 = แนบ log startup ของวันที่เลือกเสมอ',
    "DECLARE @EvLogs  varchar(100) = '" + ev.join(',') + "';   -- Application,System · ว่าง = ไม่ดึง Windows Event Log",
    'DECLARE @EvAll   bit = ' + (o.evAll ? 1 : 0) + ';   -- 0 = Error/Warning + ปิด-เปิดเครื่อง · 1 = ทุกระดับ (รวม Information)',
    'DECLARE @EvShow  bit = ' + (o.evShow ? 1 : 0) + ';   -- 1 = แสดง event ในผลลัพธ์ของ SSMS',
    'DECLARE @EvSave  bit = ' + (o.evSave ? 1 : 0) + ';   -- 1 = บันทึกเป็นไฟล์ใน <โฟลเดอร์ pull_log เดียวกัน>\\WINEVENT',
    'DECLARE @SysInfo bit = ' + (o.sys ? 1 : 0) + ';   -- 1 = ตรวจ OS / สเปคเครื่อง / RAM / Disk / process',
    'DECLARE @SysSave bit = ' + (o.sysSave ? 1 : 0) + ';   -- 1 = บันทึกเป็นไฟล์ <โฟลเดอร์ pull_log เดียวกัน>\\SYSINFO\\SYSINFO.txt',
    '',
    "IF (SELECT CONVERT(int, value_in_use) FROM sys.configurations WHERE name = 'xp_cmdshell') = 0",
    'BEGIN',
    "  RAISERROR('xp_cmdshell is turned off on this server. Do not turn it on yourself: ask the DBA / follow company policy.', 16, 1);",
    '  RETURN;',
    'END;',
    '',
    '-- ชื่อโฟลเดอร์ร่วมกันของ log และ event log: C:\\pull_log\\<ชื่อเครื่อง>_<yyyyMMdd_HHmmss>',
    "DECLARE @Stamp varchar(15) = CONVERT(varchar(8), GETDATE(), 112) + '_' + REPLACE(CONVERT(varchar(8), GETDATE(), 108), ':', '');",
    'DECLARE @ps varchar(8000), @cmd varchar(8000);',
    '',
    "IF REPLACE(@Rooms, ' ', '') <> ''",
    'BEGIN',
    "  SET @ps = '" + sq(pullPs()) + "';",
    "  SET @ps = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@ps, '{FROM}', @From), '{TO}', @To), '{ROOMS}', REPLACE(@Rooms, ' ', '')),",
    "    '{DRY}', " + b('@DryRun') + "), '{SU}', " + b('@Startup') + "), '{STAMP}', @Stamp);",
    "  SET @cmd = 'powershell -NoProfile -NonInteractive -Command \"' + @ps + '\"';",
    '  EXEC master..xp_cmdshell @cmd;',
    'END;',
    '',
    "IF REPLACE(@EvLogs, ' ', '') <> '' AND (@EvShow = 1 OR @EvSave = 1)",
    'BEGIN',
    "  SET @ps = '" + sq(pullEvPs()) + "';",
    "  SET @ps = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@ps, '{FROM}', @From), '{TO}', @To), '{LOGS}', REPLACE(@EvLogs, ' ', '')),",
    "    '{DRY}', " + b('@DryRun') + "), '{ALL}', " + b('@EvAll') + "), '{SHOW}', " + b('@EvShow') + "), '{SAVE}', " + b('@EvSave') + "), '{STAMP}', @Stamp);",
    "  SET @cmd = 'powershell -NoProfile -NonInteractive -Command \"' + @ps + '\"';",
    '  EXEC master..xp_cmdshell @cmd;',
    'END;',
    '',
    'IF @SysInfo = 1',
    'BEGIN',
    "  SELECT @@VERSION AS [SQL Server];",
    "  SET @ps = '" + sq(pullSysPs()) + "';",
    "  SET @ps = REPLACE(REPLACE(REPLACE(@ps, '{DRY}', " + b('@DryRun') + "), '{SAVE}', " + b('@SysSave') + "), '{STAMP}', @Stamp);",
    "  SET @cmd = 'powershell -NoProfile -NonInteractive -Command \"' + @ps + '\"';",
    '  EXEC master..xp_cmdshell @cmd;',
    'END;',
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
  var s = { rooms: PULL_ROOMS.map(function (r) { return r.id; }), startup: true, evLogs: PULL_EVLOGS.map(function (r) { return r.id; }), evAll: false, evShow: true, evSave: true, sys: true, sysSave: true };
  try {
    var j = JSON.parse(localStorage.getItem(PULL_KEY) || 'null');
    if (j) {
      if (Array.isArray(j.rooms)) s.rooms = j.rooms;
      if (j.startup != null) s.startup = !!j.startup;
      if (Array.isArray(j.evLogs)) s.evLogs = j.evLogs.filter(function (x) { return PULL_EVLOGS.some(function (r) { return r.id === x; }); });
      ['evAll', 'evShow', 'evSave', 'sys', 'sysSave'].forEach(function (k) { if (j[k] != null) s[k] = !!j[k]; });
    }
  } catch (e) {}
  return s;
})();
function savePull() {
  try { localStorage.setItem(PULL_KEY, JSON.stringify({ rooms: pullState.rooms, startup: pullState.startup, evLogs: pullState.evLogs, evAll: pullState.evAll, evShow: pullState.evShow, evSave: pullState.evSave, sys: pullState.sys, sysSave: pullState.sysSave })); } catch (e) {}
}

function renderPullEv() {
  $('pullEvLogs').innerHTML = PULL_EVLOGS.map(function (r) {
    var on = pullState.evLogs.indexOf(r.id) >= 0;
    return '<label class="room' + (on ? ' on' : '') + '"><input type="checkbox" data-evlog="' + r.id + '"' + (on ? ' checked' : '') + '>' +
      '<span class="room-txt"><b>' + r.id + '</b><span class="sub">' + esc(r.ex) + '</span></span></label>';
  }).join('');
  Array.prototype.forEach.call($('pullEvLogs').querySelectorAll('[data-evlog]'), function (cb) {
    cb.onchange = function () {
      var id = cb.dataset.evlog;
      pullState.evLogs = PULL_EVLOGS.map(function (r) { return r.id; }).filter(function (x) { return x === id ? cb.checked : pullState.evLogs.indexOf(x) >= 0; });
      cb.closest('.room').classList.toggle('on', cb.checked);
      savePull(); updatePull();
    };
  });
  $('pullEvAll').value = pullState.evAll ? '1' : '0';
  $('pullEvShow').checked = pullState.evShow;
  $('pullEvSave').checked = pullState.evSave;
  $('pullSys').checked = pullState.sys;
  $('pullSysSave').checked = pullState.sysSave;
}

function renderPullRooms() {
  $('pullRooms').innerHTML = PULL_ROOMS.map(function (r, i) {
    var on = pullState.rooms.indexOf(r.id) >= 0;
    return '<label class="room' + (on ? ' on' : '') + '"><input type="checkbox" data-room="' + r.id + '"' + (on ? ' checked' : '') + '>' +
      '<span class="room-no">' + (i + 1) + '</span><span class="room-txt"><b>' + r.id + '</b><code>C:\\Store\\' + esc(r.path) + '</code><span class="sub">ตัวอย่างไฟล์: ' + esc(r.ex) + '</span></span></label>';
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
  pullState.evAll = $('pullEvAll').value === '1';
  pullState.evShow = $('pullEvShow').checked;
  pullState.evSave = $('pullEvSave').checked;
  pullState.sys = $('pullSys').checked;
  pullState.sysSave = $('pullSysSave').checked;
  $('pullSysSave').disabled = !pullState.sys;
  Array.prototype.forEach.call(document.querySelectorAll('.dry-note'), function (n) { n.hidden = !dry; });
  savePull();
  var evOn = pullState.evLogs.length > 0 && (pullState.evShow || pullState.evSave);
  $('pullRoomCount').textContent = 'เลือก ' + pullState.rooms.length + ' / ' + PULL_ROOMS.length + ' ห้อง';
  if (!pullState.rooms.length && !evOn && !pullState.sys) warn.push('ยังไม่ได้เลือกห้อง log, Windows Event Log หรือข้อมูลเครื่อง');
  if (pullState.evLogs.length && !pullState.evShow && !pullState.evSave) warn.push('Windows Event Log: เลือกอย่างน้อย 1 แบบ (แสดงในผลลัพธ์ / บันทึกไฟล์)');
  if (evOn && pullState.evAll && f && t && t - f > 6 * 3600000) warn.push('Event Log ทุกระดับในช่วงยาวกว่า 6 ชม. อาจมีหลายพันบรรทัด ลองเลือกเฉพาะ Error/Warning');
  if (!f || !t) warn.push('ใส่วันที่และเวลาให้ครบ');
  else if (t <= f) warn.push('เวลาสิ้นสุดต้องหลังเวลาเริ่ม');
  else if (t - f > 3 * 864e5) warn.push('ช่วงเวลายาวกว่า 3 วัน ไฟล์อาจเยอะและ copy นาน ลองแคบลงถ้าไม่จำเป็น');
  if (f && t && t > f) {
    var mins = Math.round((t - f) / 60000), dur = mins >= 60 ? Math.floor(mins / 60) + ' ชม.' + (mins % 60 ? ' ' + (mins % 60) + ' นาที' : '') : mins + ' นาที';
    var same = isoDate(f) === isoDate(t);
    $('pullSay').innerHTML = 'ดึง log <b>' + thaiDate(f) + '</b> เวลา <b>' + hhmm(f) + '</b> (' + thaiClock(f.getHours(), f.getMinutes()) + ') ถึง ' +
      (same ? '' : '<b>' + thaiDate(t) + '</b> ') + 'เวลา <b>' + hhmm(t) + '</b> (' + thaiClock(t.getHours(), t.getMinutes()) + ') · รวม ' + dur;
  } else $('pullSay').textContent = '';
  var hard = warn.filter(function (w) { return !/ยาวกว่า|หลายพัน/.test(w); });
  $('pullWarn').hidden = !warn.length; $('pullWarn').textContent = warn.join(' · ');
  $('pullMode').textContent = dry ? 'ทดสอบ: แสดงรายการ ไม่ copy' : 'copy จริง';
  $('pullMode').className = 'pill ' + (dry ? 'ok' : 'err');
  $('pullCopy').disabled = !!hard.length;
  $('pullSql').value = hard.length ? '-- ' + hard.join('\n-- ') : pullSql({
    from: sqlDT(f), to: sqlDT(t), rooms: pullState.rooms, dry: dry, startup: pullState.startup,
    evLogs: evOn ? pullState.evLogs : [], evAll: pullState.evAll, evShow: pullState.evShow, evSave: pullState.evSave, sys: pullState.sys, sysSave: pullState.sysSave,
    made: new Date().toISOString().slice(0, 16).replace('T', ' ')
  });
  // after-run helper: delete only the folder that was named
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
  renderPullEv();
  $('pullStartup').checked = pullState.startup;
  quickRange('last1');
  $('pullAll').onclick = function () { pullState.rooms = PULL_ROOMS.map(function (r) { return r.id; }); savePull(); renderPullRooms(); updatePull(); };
  $('pullNone').onclick = function () { pullState.rooms = []; savePull(); renderPullRooms(); updatePull(); };
  ['pullFromD', 'pullFromT', 'pullToD', 'pullToT', 'pullDry', 'pullStartup', 'pullEvAll', 'pullEvShow', 'pullEvSave', 'pullSys', 'pullSysSave'].forEach(function (id) { $(id).onchange = updatePull; $(id).oninput = updatePull; });
  $('pullDelName').oninput = updatePull;
  Array.prototype.forEach.call(document.querySelectorAll('[data-qr]'), function (b) { b.onclick = function () { quickRange(b.dataset.qr); }; });
  $('pullIncGo').onclick = function () {
    var tv = $('pullIncT').value; if (!/^\d{2}:\d{2}/.test(tv)) { $('pullIncT').focus(); return; }
    var base = readDT('pullFromD', 'pullFromT') || new Date(), q = tv.split(':'), w = +$('pullIncW').value;
    var c = new Date(base.getFullYear(), base.getMonth(), base.getDate(), +q[0], +q[1]);
    setDT('pullFromD', 'pullFromT', new Date(c - w * 60000)); setDT('pullToD', 'pullToT', new Date(+c + w * 60000)); updatePull();
  };
  $('pullCopy').onclick = function () { copyText($('pullSql').value, $('pullOk')); };
  $('pullDirCopy').onclick = function () { copyText($('pullDirSql').textContent, $('pullOk')); };
  $('pullDelCopy').onclick = function () { copyText($('pullDelSql').textContent, $('pullOk')); };
})();
