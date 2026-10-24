/* ===== core: pure log parsing & analysis (no DOM) ===== */
var Core = (function () {
  var SRC_ORDER = ['ACT', 'ITP', 'DEBUG', 'MSG', 'COU', 'EDC', 'CMS', 'SMF', 'PMS', 'BOOT', 'OTHER'];
  var SRC_LABEL = { ACT: 'Activity', ITP: 'ITP', DEBUG: 'Debug', MSG: 'Msg', COU: 'Counter Service', EDC: 'EDC', CMS: 'CMS', SMF: 'SignOn (SMF)', PMS: 'PMS', BOOT: 'ITP Startup', OTHER: 'อื่น ๆ' };

  var DEFAULTS = {
    gapMin: 6,
    ctxMin: 5,
    keySrc: 'ITP,ACT',
    restart: [
      'ACT :: Load state\\.xml,result\\.xml Ok :: POS engine เริ่มทำงาน',
      'ITP :: Start Execute\\(\\) :: ITP เริ่มทำงาน',
      'ITP :: \\[StartMain\\] :: ITP เปิดหน้าจอหลัก',
      'BOOT :: \\[ITP is starting\\.\\.\\] :: ITP เริ่มทำงาน (startup log)'
    ].join('\n'),
    heartbeat: 'ITP :: cmsTimer_Elapsed\\] Monitor CMS :: ITP cmsTimer',
    noise: '^UI(<=|=>)\\[|GetTargetSMFApp|GetSaleItemComputeGroup|MiddlewareUtils\\.Convert|Watcher Run|CreateButton|AutoLocationDisplay|RTF-ConvertText|CheckTextAreaSize|textboxHeight|KeyValue',
    topics: [
      '1 :: POS ค้างหน้าจอเงินทอน ก่อนหลุดออกสู่ Desktop',
      '2 :: POS ค้างหลังจากทำรายการขายสำเร็จ',
      '3 :: POS ค้างหลังสแกน Barcode Coupon',
      '4 :: POS ค้างหลังสแกนสินค้า',
      '5 :: POS ค้างหลังจากยืนยันสมาชิกผ่านเครื่อง EDC',
      '6 :: POS ค้างหลังจากชำระเงินด้วย Mobile Payment สำเร็จ',
      '7 :: POS ไม่สามารถเข้าหน้าขายได้ เนื่องจากแจ้งเตือน Low Disk Space',
      '8 :: POS ค้างระหว่างทำรายการ TopUp ระหว่างรอรับข้อมูลจาก TSCAPI.ReadKey',
      '9 :: POS ค้างระหว่างทำรายการ Counter Service ขั้นตอนแสดง Popup ยืนยัน',
      '10 :: POS เปิดโปรแกรมขายไม่ครบหลัง Restart (ค้างหน้ารูปตึก)',
      '11 :: POS ค้างระหว่างคำนวณโปรโมชั่น / เตรียมชำระเงิน',
      '12 :: POS ค้างหลังมีการป้อนข้อมูลผิดปกติ (คีย์ CTRL/ALT ค้าง / สแกนเนอร์ส่งเลขซ้ำ)',
      '13 :: POS ค้างที่หน้า Login หลัง Sign Off',
      '0 :: ระบุไม่ได้ (log ไม่พอ ต้องวิเคราะห์เพิ่ม)'
    ].join('\n'),
    forms: [
      'PNLITPPOS30003 = หน้า Home',
      'PNLITPPOS00002 = หน้าขาย',
      'PNLITPPOS00070 = หน้าชำระเงิน',
      'PNLITPPOS30074 = หน้าเงินทอน',
      'PNLITPPOS00001 = หน้า Login (เก่า) เรียก CommonSignon',
      'NewSignOn = หน้า Login (NewSignOn)',
      'PNLITPCOM00010 = Customer Display',
      'AllMemberVerifyForSale = หน้าสะสม AllMember (กดจากหน้าขาย)',
      'AllMemberVerifyForm = หน้าสะสม AllMember (กดจากหน้าชำระ)',
      'AllMemberTelConfirm = ยืนยันเบอร์โทร AllMember',
      'AllMemberDetial = รายละเอียดสมาชิก AllMember',
      'OneTouch_Bakery = หน้า One Touch (เบเกอรี่)',
      'MonitoringForm = หน้าตรวจสถานะตอนเปิดโปรแกรม',
      'MobilePaymentSelect = หน้าเลือกช่องทาง Mobile Payment',
      'MobilePaymentConfirm = หน้ายืนยัน Mobile Payment',
      'PNLITPPOS10015 = หน้านำส่งเงิน Drop (คาดว่า เปิดหลัง DropInit)',
      'FormLogin_Keypad = หน้า Login (SMF Keypad)'
    ].join('\n'),
    buttons: [
      'btnSale_Click = ปุ่มขาย (จากหน้า Home)',
      'btnESC_Click = กด ESC',
      'btnConfirm_Click = ปุ่มยืนยัน',
      'buttonConfirm_Click = ปุ่มยืนยัน',
      'btnTelNo_Click = ปุ่มกรอกเบอร์โทร',
      'btnCom7Reward_Click = ปุ่มสะสมแต้ม 7Rewards / AllMember',
      'btnComCash_Click = ปุ่มรับเงินสด',
      'btnComFitCash_Click = ปุ่มรับเงินพอดี',
      'btnCom1000_Click = ปุ่มธนบัตร 1000',
      'btnCom500_Click = ปุ่มธนบัตร 500',
      'btnCom100_Click = ปุ่มธนบัตร 100',
      'btnSignOff_Click = ปุ่ม Sign Off'
    ].join('\n'),
    funcs: [
      'BeginSale = สแกน / เพิ่มสินค้า',
      'PreparePay = กดชำระเงิน (คำนวณยอด / โปรโมชั่น)',
      'PrePayment = เตรียมหน้าชำระเงิน',
      'ReceiveCash = รับเงินสด',
      'ReceiveCashEnough = รับเงินพอดี',
      'FinishPayment = จบการขาย บันทึกบิล',
      'PrintReceipt = เปิดลิ้นชัก / พิมพ์ใบเสร็จ',
      'CheckCashDrawer = รอปิดลิ้นชัก',
      'CloseCashDrawer = ปิดลิ้นชัก',
      'InitialSale = เริ่มบิลใหม่ กลับหน้าขาย',
      'CancelPayment = ยกเลิกการชำระเงิน',
      'BarcodeCoupon = สแกนคูปอง',
      'UseAutoCouponFromSale = ใช้คูปองอัตโนมัติ',
      'InputAllMember = กรอกข้อมูลสมาชิก AllMember',
      'InputAllMemberId = กรอกรหัสสมาชิก AllMember',
      'ConfirmAllMemberInput = ยืนยันข้อมูลสมาชิก',
      'ConfirmAllMemberInputFromSale = ยืนยันข้อมูลสมาชิก (จากหน้าขาย)',
      'ConfirmUseAllMember = ยืนยันใช้สิทธิ์สมาชิก',
      'PaymentMemberNew = ชำระ / สะสมแต้มสมาชิก',
      'InputPointAmount = กรอกจำนวนแต้ม',
      'ExitInputAllMember = ออกจากหน้าสมาชิก',
      'CancelAllMemberFromSale = ยกเลิกสมาชิก (จากหน้าขาย)',
      'AllMemberTermcondition = ยอมรับเงื่อนไขสมาชิก',
      'HasSaleItems = ตรวจว่ามีรายการขาย',
      'ValidateQtySign = ตรวจจำนวนสินค้า',
      'UISignOnWithUser = Login พนักงาน',
      'UISIGNONWITHUSER = Login พนักงาน',
      'InitialSaleUISignOnWithUser = Login แล้วเริ่มขาย',
      'InitialTerminalInfo = โหลดข้อมูลเครื่อง',
      'DropInit = นำส่งเงิน (Drop) เริ่ม',
      'DropNextNo = นำส่งเงิน (Drop) เลขถัดไป',
      'DropSave = นำส่งเงิน (Drop) บันทึก',
      'DropValidateAmt = นำส่งเงิน (Drop) ตรวจยอด',
      'DropValidateNo = นำส่งเงิน (Drop) ตรวจเลข',
      'ETidelDrop = นำส่งเงินเข้าตู้ Tidel',
      'SRBC = Counter Service ค้นหาบาร์โค้ด',
      'CheckStatusEDCOpenApp = ตรวจสถานะ EDC',
      'AutoSettlementOnStartUp = Settlement อัตโนมัติตอนเปิดเครื่อง',
      'GetSummaryOcdDataExtend = ดึงยอด OCD',
      'ExitSale = ออกจากหน้าขาย',
      'UISIGNOFF = Sign Off',
      'UpdateTerminalInfo = อัปเดตข้อมูลเครื่อง',
      'MobilePayment = เลือกชำระด้วย Mobile Payment',
      'MobilePaymentSelect = เลือกช่องทาง Mobile Payment',
      'GetMobilePaymentIssuer = ดึงผู้ให้บริการ Mobile Payment',
      'ConfirmMobilePayment = ยืนยันชำระ Mobile Payment'
    ].join('\n'),
    msgCodes: [
      'POSI02000001 = กำลังติดต่อสำนักงานใหญ่'
    ].join('\n'),
    topicDefs: [
      { id: 1, name: 'POS ค้างหน้าจอเงินทอน ก่อนหลุดออกสู่ Desktop', group: 'SW' },
      { id: 2, name: 'POS ค้างหลังจากทำรายการขายสำเร็จ', group: 'SW' },
      { id: 3, name: 'POS ค้างหลังสแกน Barcode Coupon', group: 'SW' },
      { id: 4, name: 'POS ค้างหลังสแกนสินค้า', group: 'SW' },
      { id: 5, name: 'POS ค้างหลังจากยืนยันสมาชิกผ่านเครื่อง EDC', group: 'SW' },
      { id: 6, name: 'POS ค้างหลังจากชำระเงินด้วย Mobile Payment สำเร็จ', group: 'SW' },
      { id: 7, name: 'POS ไม่สามารถเข้าหน้าขายได้ เนื่องจากแจ้งเตือน Low Disk Space', group: 'HW' },
      { id: 8, name: 'POS ค้างระหว่างทำรายการ TopUp ระหว่างรอรับข้อมูลจาก TSCAPI.ReadKey', group: 'HW' },
      { id: 9, name: 'POS ค้างระหว่างทำรายการ Counter Service ขั้นตอนแสดง Popup ยืนยัน', group: 'SW' },
      { id: 10, name: 'POS เปิดโปรแกรมขายไม่ครบหลัง Restart (ค้างหน้ารูปตึก)', group: 'SW' },
      { id: 11, name: 'POS ค้างระหว่างคำนวณโปรโมชั่น / เตรียมชำระเงิน', group: 'SW' },
      { id: 12, name: 'POS ค้างหลังมีการป้อนข้อมูลผิดปกติ (คีย์ CTRL/ALT ค้าง / สแกนเนอร์ส่งเลขซ้ำ)', group: 'HW' },
      { id: 13, name: 'POS ค้างระหว่าง Sign Off / Sign On (รวม Auto Sign Off)', group: 'SW' },
      { id: 0, name: 'ระบุไม่ได้ (log ไม่พอ ต้องวิเคราะห์เพิ่ม)', group: 'UNK' }
    ],
    highlight: 'error|exception|fail(ed|ure)?|ไม่สำเร็จ|ผิดพลาด|ติดต่อ\\s*Helpdesk|timeout|time out|not found|ไม่พบ|null ?reference|cannot|unable|refused|denied|Return Code\\s*[:=]\\s*[1-9]',
    highlightExclude: 'ProductPriceAdjException|ProductAdjExceptionItem|TenderExcept|ErrorMapping|timeout=\\d|Tag not found|not found in Config|not found workFlow|GetSummaryOcdDataExtend\\]\\[Return code : 1|ReadKeyCommit Call|time out: 0|ServicePOSSelfCheck|exceptiondata',
    important: 'State=\\[|Send Function|Receive Function|Key = |barcode :|TargetForm|API (Show|Close|POPUP|Update)|Message =|ReturnCode|Return Code|Result Code|Start .*Call|Begin command|Load state|Start Execute|StartMain|Exception|\\|ERROR\\||\\|FATAL\\|'
  };

  var TS_RE = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)(?:[,.](\d{1,3}))?/;
  function parseTs(s) {
    var m = TS_RE.exec(s);
    if (!m) return null;
    var y = +m[1];
    if (y > 2400) y -= 543; // พ.ศ. -> ค.ศ.
    var ms = m[7] ? +(m[7] + '00').slice(0, 3) : 0;
    return { t: Date.UTC(y, +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms), len: m[0].length };
  }

  function splitFields(raw, tsLen) {
    var p = raw.slice(tsLen).split('|');
    var r = { lvl: (p[1] || '').trim(), thr: (p[2] || '').trim(), cls: (p[3] || '').trim(), logger: '', msg: '' };
    if (p.length >= 11 && /^log\./.test(p[5] || '')) {
      r.logger = p[5];
      r.meth = (p[7] || '').trim();
      r.code = (p[9] || '').trim();
      r.msg = p.slice(10).join('|');
      if (!r.msg.trim()) r.msg = p.slice(7).join('|');
    } else if (p.length >= 6) {
      r.msg = p.slice(5).join('|');
      if (!r.msg.trim()) r.msg = p.slice(3).join('|');
    } else {
      r.msg = p.slice(2).join('|');
    }
    r.msg = r.msg.trim();
    return r;
  }

  function parseText(text) {
    var lines = text.split('\n'), res = [], last = null;
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      if (raw.charCodeAt(raw.length - 1) === 13) raw = raw.slice(0, -1);
      if (i === 0 && raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
      if (!raw) continue;
      var ts = parseTs(raw);
      if (!ts) {
        if (last) { last.raw += '\n' + raw; last.msg += ' ⏎ ' + raw.trim(); }
        continue;
      }
      var f = splitFields(raw, ts.len);
      last = { t: ts.t, ln: i + 1, lvl: f.lvl, thr: f.thr, cls: f.cls, meth: f.meth || '', code: f.code || '', logger: f.logger, msg: f.msg, raw: raw };
      res.push(last);
    }
    return res;
  }

  var TYPE_RULES = [
    ['MSG', /\|log\.itp\.msgbox\|/],
    ['BOOT', /\|log\.itp\.startup\|/],
    ['ITP', /\|log\.itp\./],
    ['ACT', /\|log\.pos\.activity\|/],
    ['DEBUG', /\|log\.pos\.debug\|/],
    ['COU', /\|log\.cou\./],
    ['CMS', /\|log\.(saf\.)?cms/i],
    ['SMF', /\|log\.smf\./i],
    ['PMS', /\|log\.saf\.pms/i],
    ['EDC', /SmartTermProxy|Cappuccino|SendCommand2EDC|WriteLogJCS|ReadKey Call|GetSystemInfo/]
  ];
  var FOLDER_MAP = [
    [/^(cou|counter|cs)/i, 'COU'], [/^debug/i, 'DEBUG'], [/^(act|activity)/i, 'ACT'],
    [/^itp/i, 'ITP'], [/^(msg|message)/i, 'MSG'], [/^edc/i, 'EDC'], [/^cms/i, 'CMS'], [/^(smf|signon)/i, 'SMF'], [/^pms/i, 'PMS']
  ];

  function detectType(entries, path) {
    var score = {}, n = Math.min(entries.length, 500);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < TYPE_RULES.length; j++) {
        if (TYPE_RULES[j][1].test(entries[i].raw)) { score[TYPE_RULES[j][0]] = (score[TYPE_RULES[j][0]] || 0) + 1; break; }
      }
    }
    var best = null, bs = 0;
    for (var k in score) if (score[k] > bs) { bs = score[k]; best = k; }
    if (best) return { type: best, how: 'เนื้อหา' };
    var segs = path.split('/');
    for (var s = segs.length - 2; s >= 0; s--) {
      for (var f = 0; f < FOLDER_MAP.length; f++) if (FOLDER_MAP[f][0].test(segs[s])) return { type: FOLDER_MAP[f][1], how: 'โฟลเดอร์' };
    }
    return { type: 'OTHER', how: '-' };
  }

  function posFromPath(path) {
    var segs = path.split('/');
    for (var i = 0; i < segs.length - 1; i++) if (/\d+[_\- ]?POS\d+/i.test(segs[i])) return segs[i];
    // folders made by the "ดึง log" script: <COMPUTERNAME>_<yyyyMMdd_HHmmss> → the machine name, so several pulls merge
    for (var j = 0; j < segs.length - 1; j++) { var pm = /^(.+)_\d{8}_\d{6}$/.exec(segs[j]); if (pm) return pm[1]; }
    if (segs.length >= 3) return segs[segs.length - 3];
    if (segs.length === 2) return segs[0];
    return '-';
  }

  function parseRules(text) {
    var out = [];
    String(text || '').split('\n').forEach(function (line) {
      var p = line.split('::');
      if (p.length < 2) return;
      try { out.push({ src: p[0].trim(), re: new RegExp(p[1].trim()), label: (p[2] || p[1]).trim() }); } catch (e) {}
    });
    return out;
  }
  function safeRe(s) { try { return s && s.trim() ? new RegExp(s) : null; } catch (e) { return null; } }

  function lowerBound(arr, t, get) {
    var lo = 0, hi = arr.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (get(arr[mid]) < t) lo = mid + 1; else hi = mid; }
    return lo;
  }

  /* files: [{path, type, pos, entries}] -> sorted merged entries with flags */
  function merge(files, settings) {
    var all = [];
    files.forEach(function (f, fi) {
      if (f.excluded) return;
      for (var i = 0; i < f.entries.length; i++) {
        var e = f.entries[i];
        e.f = fi; e.src = f.type; e.pos = f.pos;
        all.push(e);
      }
    });
    all.sort(function (a, b) { return a.t - b.t || a.f - b.f || a.ln - b.ln; });
    flag(all, settings);
    return all;
  }

  function flag(all, settings) {
    var noise = safeRe(settings.noise), imp = safeRe(settings.important);
    var hl = null, hlx = null; try { hl = settings.highlight ? new RegExp(settings.highlight, 'i') : null; } catch (e) {} try { hlx = settings.highlightExclude ? new RegExp(settings.highlightExclude, 'i') : null; } catch (e) {}
    var rst = parseRules(settings.restart), hb = parseRules(settings.heartbeat);
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      e.noise = !!(noise && noise.test(e.msg));
      e.imp = !!(imp && imp.test(e.raw));
      e.err = /\|(ERROR|FATAL)\|/.test(e.raw) || EXC_RE.test(e.msg);
      e.hl = !!(hl && hl.test(e.msg) && !(hlx && hlx.test(e.msg)));
      e.rst = null; e.hb = -1;
      for (var r = 0; r < rst.length; r++) if ((rst[r].src === e.src || rst[r].src === '*') && rst[r].re.test(e.raw)) { e.rst = rst[r].label; break; }
      for (var h = 0; h < hb.length; h++) if ((hb[h].src === e.src || hb[h].src === '*') && hb[h].re.test(e.raw)) { e.hb = h; break; }
    }
    return { hbRules: hb };
  }

  var EXC_RE = /\w*Exception:|\[Exception\]|Error Exception|Exception\s+:|Unhandled|StackTrace/;
  var STATE_RE = /State=\[(\w*)\]\[(\w+)\]\[(\d+)\]\[(\w+)\]/;

  function guessSymptom(ctx) {
    var st = ctx.lastState, recent = ctx.recentText || '';
    if (/TopUp|ReadKey/i.test(recent)) return 'ค้างระหว่างทำรายการ TopUp / รอข้อมูลจากเครื่องอ่านบัตร';
    if (ctx.couRecent) return 'ค้างระหว่างทำรายการ Counter Service';
    if (!st) return 'ไม่มีสถานะ POS ก่อนหยุด (ต้องดู log อื่นประกอบ)';
    var func = st.func, step = st.step, name = func + ' ' + step;
    if (/Mobile|QR|Wallet|PromptPay|TrueMoney/i.test(name)) return 'ค้างหลัง/ระหว่างชำระเงินด้วย Mobile Payment';
    if (/Coupon/i.test(func)) return 'ค้างระหว่างใช้คูปอง';
    if (/Member|EDC|Card/i.test(func)) return 'ค้างระหว่างยืนยันสมาชิก / EDC';
    if (st.state === 'Idle' && /InitialSale/.test(func)) return 'ค้างขณะอยู่หน้าขายว่าง (Idle) หลังจบบิล ไม่มีรายการค้าง';
    if (/CashDrawer|PrintReceipt|FinishPayment/.test(func)) return 'ค้างหลังชำระเงิน (หน้าจอเงินทอน / พิมพ์ใบเสร็จ / ลิ้นชัก)';
    if (/ReceiveCash/.test(func)) return 'ค้างระหว่างรับเงิน';
    if (/Promotion|PreparePay|PrePayment/i.test(name)) return 'ค้างระหว่างคำนวณโปรโมชั่น / เตรียมชำระเงิน';
    if (/BeginSale/.test(func)) return 'ค้างหลังสแกนสินค้า';
    return 'ค้างระหว่าง ' + func + ' (' + step + ')';
  }

  function analyze(all, settings, hbRules) {
    setDict(settings); setCustom(settings);
    // learn popup texts by message code from every readable MSG line
    var lcode = null;
    for (var li = 0; li < all.length; li++) {
      var le = all[li]; if (le.src !== 'MSG') continue;
      var lm = /\[Message Code\|([^\]]*)\]/.exec(le.msg);
      if (lm) { lcode = lm[1] || null; continue; }
      lm = /^Message = (.*)/.exec(le.msg);
      if (lm && lcode) {
        var txt = lm[1].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        if (txt && !/\uFFFD/.test(txt) && /[\u0E00-\u0E7F]/.test(txt) && !DICT.codes[lcode]) LEARNED[lcode] = txt.slice(0, 160);
        lcode = null;
      } else if (/API (Show|POPUP :)/.test(le.msg)) lcode = null;
    }
    var gapMs = Math.max(1, +settings.gapMin || 6) * 60000;
    var keyWanted = String(settings.keySrc || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var byPos = {};
    all.forEach(function (e, i) { (byPos[e.pos] = byPos[e.pos] || []).push(i); });
    var cands = [];
    Object.keys(byPos).forEach(function (pos) {
      var idx = byPos[pos];
      var present = {};
      idx.forEach(function (i) { present[all[i].src] = 1; });
      var keys = keyWanted.filter(function (s) { return present[s]; });
      if (!keys.length) keys = Object.keys(present);
      var keyIdx = idx.filter(function (i) { return keys.indexOf(all[i].src) >= 0; });
      var bySrc = {};
      idx.forEach(function (i) { (bySrc[all[i].src] = bySrc[all[i].src] || []).push(i); });
      var lastT = all[idx[idx.length - 1]].t;
      // file coverage per source: [first,last] of each file, merged when files touch (rotated logs)
      var cov = {};
      var fr = {};
      idx.forEach(function (i) { var e = all[i], r = fr[e.f] || (fr[e.f] = { src: e.src, a: e.t, b: e.t }); if (e.t < r.a) r.a = e.t; if (e.t > r.b) r.b = e.t; });
      Object.keys(fr).forEach(function (f) { (cov[fr[f].src] = cov[fr[f].src] || []).push([fr[f].a, fr[f].b]); });
      Object.keys(cov).forEach(function (sname) {
        var arr = cov[sname].sort(function (x, y) { return x[0] - y[0]; }), out = [];
        arr.forEach(function (iv) { var l = out[out.length - 1]; if (l && iv[0] - l[1] < 120000) l[1] = Math.max(l[1], iv[1]); else out.push(iv.slice()); });
        cov[sname] = out;
      });
      var covers = function (sname, a, b) { return (cov[sname] || []).some(function (iv) { return iv[0] <= a && iv[1] >= b; }); };
      var hbSrc = {}; idx.forEach(function (i) { if (all[i].hb >= 0) hbSrc[all[i].src] = 1; });
      var judges = keys.filter(function (sname) { return hbSrc[sname]; });
      if (!judges.length) judges = keys;
      for (var k = 0; k < keyIdx.length; k++) {
        var a = all[keyIdx[k]], b = k + 1 < keyIdx.length ? all[keyIdx[k + 1]] : null;
        var end = b ? b.t : null;
        if (b ? (b.t - a.t > gapMs) : (lastT - a.t > gapMs)) {
          var covered = judges.some(function (sname) { return covers(sname, a.t, end === null ? Math.min(lastT, a.t + gapMs) : end); });
          if (!covered) continue; // no file for that period, not a freeze
          cands.push(buildCand(all, pos, idx, bySrc, keys, a.t, end, settings, hbRules));
        }
      }
      // restart without a long gap: the program was started again while logs were only briefly quiet
      var lastRst = -Infinity;
      for (var q0 = 0; q0 < idx.length; q0++) {
        var re0 = all[idx[q0]];
        if (!re0.rst) continue;
        if (re0.t - lastRst < 5 * 60000) { lastRst = re0.t; continue; }
        lastRst = re0.t;
        if (cands.some(function (c) { return c.pos === pos && c.end !== null && Math.abs(c.end - re0.t) < 5 * 60000; })) continue;
        var pk = -1;
        for (var z0 = keyIdx.length - 1; z0 >= 0; z0--) { var ez = all[keyIdx[z0]]; if (ez.t < re0.t && !ez.rst && !/ExecuteMainProcess/.test(ez.meth)) { pk = keyIdx[z0]; break; } }
        if (pk < 0) continue;
        var pt = all[pk].t;
        if (re0.t - pt > 60 * 60000) continue;
        if (!judges.some(function (sname) { return covers(sname, pt, pt); })) continue;
        var cr0 = buildCand(all, pos, idx, bySrc, keys, pt, re0.t, settings, hbRules);
        cr0.kind = 'restart';
        cands.push(cr0);
      }
      // Low Disk Space messages that are not near any gap -> event card
      for (var q = 0; q < idx.length; q++) {
        var ev = all[idx[q]];
        if (!LOWDISK_RE.test(ev.raw)) continue;
        var near = cands.some(function (c) { return c.pos === pos && ev.t >= c.start - 1800000 && ev.t <= (c.end || c.start) + 1800000; });
        if (!near) { var ce = buildCand(all, pos, idx, bySrc, keys, ev.t, ev.t, settings, hbRules); ce.kind = 'event'; cands.push(ce); }
        while (q + 1 < idx.length && all[idx[q + 1]].t - ev.t < 1800000) q++;
      }
    });
    cands.sort(function (x, y) { return x.start - y.start; });
    return cands;
  }

  function buildCand(all, pos, idx, bySrc, keys, start, end, settings, hbRules) {
    var ctxMs = (+settings.ctxMin || 5) * 60000;
    var c = { pos: pos, start: start, end: end, keys: keys, last: [], restarts: [], pending: [] };
    // last line per source before stop (within 60 min)
    Object.keys(bySrc).sort(function (x, y) { return SRC_ORDER.indexOf(x) - SRC_ORDER.indexOf(y); }).forEach(function (src) {
      var arr = bySrc[src];
      var j = lowerBound(arr, start + 1, function (i) { return all[i].t; }) - 1;
      if (j >= 0 && start - all[arr[j]].t < 3600000) {
        var k = j;
        while (k > 0 && all[arr[k]].noise && all[arr[j]].t - all[arr[k - 1]].t < 60000) k--;
        if (all[arr[k]].noise) k = j;
        var e = all[arr[k]];
        c.last.push({ src: src, i: arr[k], t: all[arr[j]].t, msg: e.msg });
      }
    });
    // heartbeat
    hbRules.forEach(function (rule, h) {
      var hbs = idx.filter(function (i) { return all[i].hb === h; });
      if (hbs.length < 2) return;
      var deltas = [];
      for (var q = 1; q < hbs.length; q++) { var d = all[hbs[q]].t - all[hbs[q - 1]].t; if (d > 0 && d < 1800000) deltas.push(d); }
      if (!deltas.length) return;
      deltas.sort(function (x, y) { return x - y; });
      var interval = deltas[Math.floor(deltas.length / 2)];
      var j = lowerBound(hbs, start + 1, function (i) { return all[i].t; }) - 1;
      if (j < 0) return;
      var lastHb = all[hbs[j]].t;
      if (start - lastHb > interval * 3) return;
      var expected = lastHb + interval;
      if (end === null || expected < end) {
        if (!c.hb || expected < c.hb.expected) c.hb = { label: rule.label, last: lastHb, interval: interval, expected: expected };
      }
    });
    c.freezeFrom = start;
    c.freezeTo = c.hb ? Math.max(start, c.hb.expected) : null;
    // restarts after gap
    var hi = end === null ? Infinity : end + 15 * 60000;
    var lo = lowerBound(idx, start + 1, function (i) { return all[i].t; });
    for (var r = lo; r < idx.length && all[idx[r]].t <= hi; r++) {
      var e = all[idx[r]];
      if (e.rst && !c.restarts.some(function (x) { return x.label === e.rst && Math.abs(x.t - e.t) < 60000; })) c.restarts.push({ t: e.t, label: e.rst, i: idx[r] });
    }
    // restart just before gap -> incomplete start
    var pre = lowerBound(idx, start - 3 * 60000, function (i) { return all[i].t; });
    for (var p = pre; p < idx.length && all[idx[p]].t <= start; p++) if (all[idx[p]].rst) { c.afterRestart = { t: all[idx[p]].t, label: all[idx[p]].rst }; }
    // context scan
    var from = start - ctxMs, s0 = lowerBound(idx, from, function (i) { return all[i].t; });
    var sends = {}, recentText = '', couRecent = null, flows = [], edc = {}, popup = null, lastEdcResult = null;
    var clicks = {}, J = [], errs = {}, popEv = null, curForm = null;
    c.errors = []; c.stuckKeys = []; c.badBarcodes = []; c.badLogin = null; c.signOff = null;
    function jpush(ev) {
      var le = J[J.length - 1];
      if (ev.key && le && le.key === ev.key) { le.n = (le.n || 1) + 1; le.tEnd = ev.t; return le; }
      J.push(ev); return ev;
    }
    var tailEnd = start + 60000; if (end !== null && end < tailEnd) tailEnd = end - 1;
    for (var x = s0; x < idx.length && all[idx[x]].t <= tailEnd; x++) {
      var en = all[idx[x]], m, ii = idx[x];
      if (en.t > start && !/^(EDC|MSG|COU|CMS|SMF|PMS|BOOT|OTHER)$/.test(en.src)) continue; // peripheral logs may keep writing a few seconds after the UI stops
      if (en.rst) jpush({ t: en.t, i: ii, src: en.src, kind: 'rst', text: 'Restart: ' + en.rst });
      if (en.src === 'ACT' && (m = STATE_RE.exec(en.msg))) {
        c.lastState = { state: m[1], func: m[2], stepNo: m[3], step: m[4], t: en.t, i: ii };
        var lf = flows[flows.length - 1];
        if (!lf || lf.func !== m[2]) flows.push({ func: m[2], t: en.t, i: ii, steps: [m[4]], state: m[1] });
        else { lf.steps.push(m[4]); lf.state = m[1]; lf.tEnd = en.t; }
      }
      if (en.src === 'ITP') {
        if (en.meth && DICT.forms[en.meth] && en.meth !== curForm) curForm = en.meth;
        if ((m = /Send Function : (\w+)/.exec(en.msg))) {
          sends[m[1]] = { t: en.t, i: ii };
          if (!SKIP_BIZ.test(m[1])) sends[m[1]].ev = jpush({ t: en.t, i: ii, src: 'ITP', kind: 'biz', key: 'biz:' + m[1], fn: m[1], text: 'ส่งงาน ' + m[1] + ' · ' + funcName(m[1]) });
        }
        if ((m = /Receive Function : (\w+)\]\[Return code : (\w+)/.exec(en.msg)) || (m = /Receive Function : (\w+)/.exec(en.msg))) {
          if (sends[m[1]] && sends[m[1]].ev) sends[m[1]].ev.ret = 'return ' + (m[2] || '-');
          delete sends[m[1]];
        }
        if ((m = /[Tt]argetForm\|([^\]]+)\]/.exec(en.msg))) {
          c.lastForm = { name: m[1], t: en.t, i: ii }; curForm = m[1];
          jpush({ t: en.t, i: ii, src: 'ITP', kind: 'form', key: 'form:' + m[1], text: 'เปิด ' + formName(m[1]) + ' (' + m[1] + ')' });
        }
        if ((m = /^\[(\w+_Click)\](?:\[Command = '([^']*)'\])?/.exec(en.msg))) {
          var form = en.meth || curForm || '', ck = form + '/' + m[1];
          if (en.code === 'ITPA50002') {
            if (clicks[ck]) { clicks[ck].ev.done = true; delete clicks[ck]; }
          } else if (!(m[1] === 'button_Click' && !m[2])) {
            var label = m[1] === 'button_Click' ? 'ปุ่ม ' + m[2] : btnName(m[1]);
            var cev = jpush({ t: en.t, i: ii, src: 'ITP', kind: 'click', text: (/^กด/.test(label) ? label : 'กด' + label) + ' (' + m[1] + ') ที่' + formName(form) });
            clicks[ck] = { t: en.t, i: ii, btn: m[1], form: form, ev: cev };
            c.lastClick = { btn: m[1], label: label, form: form, t: en.t, i: ii };
          }
        }
        if ((m = /Holded detected\. Pressing Key = (.*?) \(\d+\) \( \+ (?:Left |Right )?(\w+)\)/.exec(en.msg))) {
          c.stuckKeys.push({ t: en.t, i: ii, key: m[1], mod: m[2] });
          jpush({ t: en.t, i: ii, src: 'ITP', kind: 'warn', key: 'hold:' + m[2], text: 'ITP ตรวจพบปุ่ม ' + m[2] + ' ค้าง (Holded) ขณะกดปุ่ม ' + m[1] });
        }
        if ((m = /barcode : (\S+)/.exec(en.msg))) {
          c.lastKey = { text: 'สแกน ' + (m[1].length > 30 ? m[1].slice(0, 24) + '… (' + m[1].length + ' หลัก)' : m[1]), t: en.t, i: ii };
          var bad = oddInput(m[1]);
          if (bad) c.badBarcodes.push({ t: en.t, i: ii, code: m[1] });
          jpush({ t: en.t, i: ii, src: 'ITP', kind: bad ? 'warn' : 'scan', text: 'สแกนบาร์โค้ด ' + (m[1].length > 30 ? m[1].slice(0, 24) + '…' : m[1]) + ' (' + m[1].length + ' หลัก' + (bad ? ' ผิดปกติ' : '') + ')' });
        } else if ((m = /Key = '([^']+)'/.exec(en.msg))) c.lastKey = { text: 'กด ' + m[1], t: en.t, i: ii };
        if (/BeginAutoSignOff starting\.\. this\.InvokeRequired = True/.test(en.msg)) { c.autoSignOff = { t: en.t, i: ii }; jpush({ t: en.t, i: ii, src: 'ITP', kind: 'warn', key: 'autosignoff', text: 'ระบบ Auto Sign Off (ไม่มีการใช้งานครบเวลา)' }); }
        if (/\[LogIn\]\[LogInPass\] -+> (\w+)/.test(en.msg)) { var lp = /LogInPass\] -+> (\w+)/.exec(en.msg)[1]; jpush({ t: en.t, i: ii, src: 'ITP', kind: 'login', text: 'Login ' + (lp === 'True' ? 'สำเร็จ' : 'ไม่สำเร็จ') }); }
        if (/NewSignOn/.test(en.meth) && /\[LogIn\] Start/.test(en.msg)) jpush({ t: en.t, i: ii, src: 'ITP', kind: 'form', key: 'form:NewSignOn', text: 'เข้าหน้า Login (NewSignOn)' });
      }
      if (en.src === 'SMF') {
        if (/^Logout\(\)/.test(en.msg)) { c.signOff = { t: en.t, i: ii }; jpush({ t: en.t, i: ii, src: 'SMF', kind: 'form', text: 'Sign Off ออกจากระบบ' }); }
        if ((m = /^Username:(.*)/.exec(en.msg))) {
          var un = m[1].trim(), odd = oddInput(un);
          if (odd) c.badLogin = { t: en.t, i: ii, len: un.length };
          jpush({ t: en.t, i: ii, src: 'SMF', kind: odd ? 'warn' : 'login', text: 'Login ด้วย Username ยาว ' + un.length + ' ตัว' + (odd ? ' (ผิดปกติ มีเลขซ้ำ)' : '') });
        }
        if (/^Fail/.test(en.msg) && /CheckSignOn/.test(en.cls)) { var lj = J[J.length - 1]; if (lj && /Login ด้วย/.test(lj.text)) lj.ret = 'Login ไม่สำเร็จ'; }
      }
      if (en.src === 'EDC') {
        if ((m = /\*\*\*Start (\w+) Call\*\*\*/.exec(en.msg))) {
          edc[m[1]] = { t: en.t, i: ii, ev: jpush({ t: en.t, i: ii, src: 'EDC', kind: 'edc', text: 'EDC เรียก ' + m[1] }) };
        } else if ((m = /^(\w+) Result\b(?: : Code=(\w+))?/.exec(en.msg))) {
          if (edc[m[1]]) edc[m[1]].ev.ret = 'Result ' + (m[2] || '');
          delete edc[m[1]];
          lastEdcResult = { name: m[1], t: en.t, i: ii, ok: /Code=G0001/.test(en.msg) };
        }
      }
      if (en.src === 'MSG') {
        if (/API POPUP :/.test(en.msg) && popEv && !popEv.ret && en.t - popEv.t < 2000) { /* same popup, second header line */ }
        else if (/API (Show|POPUP :)/.test(en.msg)) {
          popup = { t: en.t, i: ii, code: '' };
          popEv = jpush({ t: en.t, i: ii, src: 'MSG', kind: 'popup', text: 'แสดง Popup' + (/Show Only/.test(en.msg) ? ' (แสดงข้อความรอ)' : '') });
        } else if (popup && (m = /\[Message Code\|([^\]]*)\]/.exec(en.msg))) { popup.code = m[1]; if (popEv && m[1]) popEv.text += ' ' + m[1]; }
        else if (popEv && !popEv.msg && (m = /^Message = (.*)/.exec(en.msg))) {
          var pm = m[1].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
          var pcode = popup && popup.code;
          if (pcode && pm && !/\uFFFD/.test(pm) && !DICT.codes[pcode]) LEARNED[pcode] = pm.slice(0, 160);
          if (/\uFFFD/.test(pm) && pcode && (DICT.codes[pcode] || LEARNED[pcode])) pm = DICT.codes[pcode] || LEARNED[pcode];
          popEv.msg = cleanText(pm).slice(0, 140); popup && (popup.msg = popEv.msg);
        }
        else if ((m = /POPUP return : (\w+)/.exec(en.msg))) { if (popEv) popEv.ret = 'ผู้ใช้กด ' + m[1]; popup = null; }
        else if (/API Close|Close Success|Dialog closed/.test(en.msg)) { if (popEv && !popEv.ret) popEv.ret = 'ปิดแล้ว'; popup = null; }
        if (/API (Show|POPUP|Close)/.test(en.msg)) c.lastPopup = { text: en.msg.replace(/=+/g, '').trim(), t: en.t, i: ii };
      }
      if (en.src === 'COU') {
        couRecent = { t: en.t, i: ii };
        if ((m = /Begin command=(\w+)/.exec(en.msg))) jpush({ t: en.t, i: ii, src: 'COU', kind: 'cou', key: 'cou:' + m[1], text: 'Counter Service คำสั่ง ' + m[1] + ' · ' + funcName(m[1]) });
        else if ((m = /Command =\s+(C_\w+)/.exec(en.msg))) jpush({ t: en.t, i: ii, src: 'COU', kind: 'cou', key: 'cou:' + m[1], text: 'Counter Service ผล ' + m[1] });
      }
      if (en.err && !ERR_IGNORE.test(en.msg)) {
        var ek = en.src + ':' + en.msg.slice(0, 80);
        if (errs[ek]) errs[ek].n++;
        else { errs[ek] = { src: en.src, msg: en.msg, t: en.t, i: ii, n: 1 }; c.errors.push(errs[ek]); }
        jpush({ t: en.t, i: ii, src: en.src, kind: 'err', key: 'err:' + ek, text: en.src + ' error: ' + en.msg.slice(0, 160) });
      }
      if (Math.abs(start - en.t) < 120000) recentText += en.msg + '\n';
      for (var cr = 0; cr < CUSTOM.length; cr++) {
        var R = CUSTOM[cr];
        if ((R.src === '*' || R.src === en.src) && R.re.test(en.raw)) {
          c.kwHits = c.kwHits || {};
          var hk = c.kwHits[R.id] || (c.kwHits[R.id] = { t: en.t, i: ii, n: 0, src: en.src, kw: R.kw });
          hk.n++; hk.tLast = en.t;
        }
      }
    }
    Object.keys(sends).forEach(function (fn) { c.pending.push({ fn: fn, t: sends[fn].t, i: sends[fn].i }); if (sends[fn].ev) sends[fn].ev.open = true; });
    c.edcPending = Object.keys(edc).map(function (k) { edc[k].ev.open = true; return { fn: k, t: edc[k].t, i: edc[k].i }; });
    c.pendingClicks = Object.keys(clicks).map(function (k) { return clicks[k]; }).filter(function (k) { return c.lastClick && k.t === c.lastClick.t && start - k.t < 60000 && !/ESC|Com\d+|Cash/.test(k.btn); });
    if (popup && popEv) { popEv.open = true; c.openPopup = popup; }
    if (!c.lastForm && curForm) c.lastForm = { name: curForm, t: start, i: -1, fromCls: true };
    c.curForm = curForm;
    c.journey = J.slice(-60);
    c.errors.sort(function (a, b) { return (a.src === 'DEBUG' ? 0 : 1) - (b.src === 'DEBUG' ? 0 : 1) || b.t - a.t; });
    // low disk anywhere near
    var ld = lowerBound(idx, start - 1800000, function (i) { return all[i].t; }), ldEnd = (end || start) + 1800000;
    for (var z = ld; z < idx.length && all[idx[z]].t <= ldEnd; z++) if (LOWDISK_RE.test(all[idx[z]].raw)) { c.lowDisk = { t: all[idx[z]].t, i: idx[z] }; break; }
    c.symptom = guessSymptom({ lastState: c.lastState, recentText: recentText, couRecent: couRecent && start - couRecent.t < 60000 });
    c.topic = classify(c, { flows: flows, popup: popup, couRecent: couRecent, recentText: recentText, lastEdcResult: lastEdcResult, start: start });
    return c;
  }

  var SKIP_BIZ = /^(GetSummaryOcdDataExtend)$/;
  var ERR_IGNORE = /SOSStoreConfig\.xml not found|GetTargetSMFApp\]Exception/;
  var DICT = { forms: {}, buttons: {}, funcs: {}, codes: {} };
  var LEARNED = {};
  var CUSTOM = [];
  var GROUP_LABEL = { HW: 'Hardware', SW: 'Software', ENV: 'ระบบ / Network', UNK: 'ยังไม่สรุป' };
  function setCustom(settings) {
    CUSTOM = [];
    (settings.topicDefs || []).forEach(function (d) {
      if (!d || !d.kw || !String(d.kw).trim()) return;
      try { CUSTOM.push({ id: +d.id, re: new RegExp(d.kw, 'i'), kw: d.kw, src: d.kwSrc || '*' }); } catch (e) {}
    });
  }
  function groupOf(defs, id) { for (var i = 0; i < (defs || []).length; i++) if (+defs[i].id === +id) return defs[i].group || 'UNK'; return 'UNK'; }
  function parseDict(text) {
    var o = {};
    String(text || '').split('\n').forEach(function (l) { var p = l.indexOf('='); if (p > 0) o[l.slice(0, p).trim()] = l.slice(p + 1).trim(); });
    return o;
  }
  function setDict(settings) {
    DICT = { forms: parseDict(settings.forms), buttons: parseDict(settings.buttons), funcs: parseDict(settings.funcs), codes: parseDict(settings.msgCodes) };
  }
  function formName(n) { return n ? (DICT.forms[n] || 'หน้า ' + n) : 'หน้าที่ไม่ทราบชื่อ'; }
  function btnName(n) {
    if (DICT.buttons[n]) return DICT.buttons[n];
    var s = n.replace(/_Click$/, '').replace(/^(btn|button)/, '').replace(/([a-z])([A-Z0-9])/g, '$1 $2');
    return 'ปุ่ม ' + (s || n);
  }
  function pressText(b) { var l = btnName(b); return /^กด/.test(l) ? l : 'กด' + l; }
  function oddInput(v) { return v.length > 20 || /(\d)\1{9,}/.test(v); }
  function funcName(n) { return DICT.funcs[n] || n; }
  var LOWDISK_RE =/Low ?Disk|disk space|DiskSpace|ดิสก์|พื้นที่.{0,10}(เต็ม|ไม่พอ)/i;
  var MOBILE_RE = /Mobile|QR|Wallet|PromptPay|TrueMoney|EWallet|Rabbit|Alipay|WeChat/i;
  var MEMBER_RE = /AllMember|Member(?!Code)/;

  function funcTopic(fn) {
    if (/SIGNON|SIGNOFF|SignOn|SignOff/i.test(fn)) return 13;
    if (MOBILE_RE.test(fn)) return 6;
    if (/BarcodeCoupon|Coupon(?!FromSale)/.test(fn) && !/UseAutoCoupon/.test(fn)) return 3;
    if (MEMBER_RE.test(fn)) return 5;
    if (/TopUp|Reload|Refill/i.test(fn)) return 8;
    if (/^BeginSale$/.test(fn)) return 4;
    if (/PreparePay|PrePayment|Promotion/.test(fn)) return 11;
    if (/FinishPayment|PrintReceipt|CashDrawer|InitialSale/.test(fn)) return 2;
    if (/^SRBC$|^CS/.test(fn)) return 9;
    return null;
  }

  function classify(c, k) {
    var sc = {}, why = {};
    function add(t, pts, reason) { sc[t] = (sc[t] || 0) + pts; (why[t] = why[t] || []).push(reason); }
    var T = function (t) { return fmtTime(t); };
    Object.keys(c.kwHits || {}).forEach(function (id) {
      var h = c.kwHits[id];
      add(+id, 5, 'พบคำค้นที่ตั้งไว้ "' + h.kw + '" ใน ' + h.src + ' ตอน ' + T(h.t) + (h.n > 1 ? ' (' + h.n + ' ครั้ง)' : ''));
    });
    if (c.autoSignOff && k.start - c.autoSignOff.t < 300000) add(13, 2, 'ระบบ Auto Sign Off ตอน ' + T(c.autoSignOff.t) + ' ก่อนค้าง ' + fmtDur(k.start - c.autoSignOff.t));
    if (c.lowDisk) add(7, 6, 'พบข้อความ Low Disk Space ตอน ' + T(c.lowDisk.t));
    if (c.afterRestart) add(10, 5, 'log หายภายใน 3 นาทีหลัง restart (' + c.afterRestart.label + ' ' + T(c.afterRestart.t) + ')');
    (c.edcPending || []).forEach(function (p) {
      if (/ReadKey/i.test(p.fn)) add(8, 4, 'EDC เรียก ' + p.fn + ' ตอน ' + T(p.t) + ' แต่ไม่ได้รับ Result');
      else if (/Member|Telephone|NID/i.test(p.fn)) add(5, 4, 'EDC เรียก ' + p.fn + ' ตอน ' + T(p.t) + ' แต่ไม่ได้รับ Result');
      else add(0, 1, 'EDC เรียก ' + p.fn + ' แต่ไม่ได้รับ Result');
    });
    if (/TSCAPI/i.test(k.recentText)) add(8, 2, 'พบ TSCAPI ใน 2 นาทีก่อนค้าง');
    if (c.stuckKeys.length) {
      var mods = {}; c.stuckKeys.forEach(function (s) { mods[s.mod] = 1; });
      add(12, Math.min(5, 2 + c.stuckKeys.length), 'ITP ตรวจพบปุ่ม ' + Object.keys(mods).join('/') + ' ค้าง ' + c.stuckKeys.length + ' ครั้ง (GlobalHookManager) ล่าสุด ' + T(c.stuckKeys[c.stuckKeys.length - 1].t));
    }
    if (c.badBarcodes.length) add(12, 2, 'สแกนบาร์โค้ดผิดปกติ ' + c.badBarcodes.length + ' ครั้ง เช่น ' + T(c.badBarcodes[0].t) + ' ยาว ' + c.badBarcodes[0].code.length + ' หลัก');
    if (c.badLogin) add(12, 2, 'Login ด้วย Username ผิดปกติ (ยาว ' + c.badLogin.len + ' ตัว มีเลขซ้ำ) ตอน ' + T(c.badLogin.t));
    (c.pendingClicks || []).forEach(function (p) {
      var b = p.btn + ' ' + p.form, t = /Coupon/i.test(b) ? 3 : /Mobile|QR|Wallet|Prompt/i.test(b) ? 6 : /TopUp|Reload/i.test(b) ? 8 : /7Reward|Member|TelNo/i.test(b) ? 5 : null;
      if (t !== null) add(t, 1, pressText(p.btn) + ' ที่' + formName(p.form) + ' ตอน ' + T(p.t) + ' แต่ไม่มี log จบปุ่ม');
    });
    if (c.lastForm && k.start - c.lastForm.t < 180000) {
      var lfn = c.lastForm.name;
      if (/^AllMember/.test(lfn)) add(5, 2, 'หน้าจอสุดท้ายคือ ' + formName(lfn) + ' (' + lfn + ')');
      if (/^(PNLITPPOS00001|NewSignOn|FormLogin_Keypad)$/.test(lfn)) {
        if (c.afterRestart) add(10, 2, 'หน้าจอสุดท้ายคือ ' + formName(lfn));
        else add(13, c.signOff ? 3 : 2, 'หน้าจอสุดท้ายคือ ' + formName(lfn) + (c.signOff ? ' หลัง Sign Off ตอน ' + T(c.signOff.t) : ''));
      }
      if (lfn === 'PNLITPPOS00070') add(11, 1, 'หน้าจอสุดท้ายคือหน้าชำระเงิน (PNLITPPOS00070)');
    }
    k.flows.forEach(function (f) { if (/TopUp|Reload/i.test(f.func) && k.start - f.t < 120000) add(8, 3, 'ทำรายการ ' + f.func + ' ตอน ' + T(f.t)); });
    var couNear = k.couRecent && k.start - k.couRecent.t < 120000;
    if (k.popup) {
      if (couNear) add(9, 5, 'Popup ' + (k.popup.code || '') + ' แสดงตอน ' + T(k.popup.t) + ' ระหว่าง Counter Service และยังไม่ถูกปิด');
      else add(0, 1, 'มี Popup ' + (k.popup.code || '') + ' ค้างอยู่ตอน ' + T(k.popup.t));
    }
    if (couNear && !k.popup) add(9, 2, 'มี log Counter Service ล่าสุดตอน ' + T(k.couRecent.t) + ' (' + fmtDur(k.start - k.couRecent.t) + ' ก่อนค้าง)');
    c.pending.forEach(function (p) {
      var t = funcTopic(p.fn);
      add(t === null ? 0 : t, 3, 'ITP ส่ง ' + p.fn + ' ตอน ' + T(p.t) + ' แต่ไม่ได้รับคำตอบ');
    });
    var flows = k.flows.filter(function (f) { return !/^(CheckCashDrawer|GetSummaryOcdDataExtend)$/.test(f.func); });
    var last = flows[flows.length - 1];
    var finished = flows.filter(function (f) { return f.func === 'FinishPayment' && f.steps.indexOf('EndFinishPayment') >= 0; }).pop();
    var acts = function (t) { return (c.journey || []).filter(function (j) { return j.t > t && /^(click|scan|warn|login)$/.test(j.kind); }).length; };
    var mobile = flows.filter(function (f) { return MOBILE_RE.test(f.func); }).pop();
    var mobAfter = mobile ? acts(mobile.t) : 0;
    if (mobile) add(6, (finished && finished.t > mobile.t ? 4 : 2) - (mobAfter > 2 ? 3 : 0), 'ชำระด้วย ' + mobile.func + ' ตอน ' + T(mobile.t) + (finished && finished.t > mobile.t ? ' แล้วจบบิลสำเร็จ' : '') + (mobAfter > 2 ? ' แต่หลังจากนั้นมีการใช้งานต่ออีก ' + mobAfter + ' ครั้ง' : ''));
    var coupon = flows.filter(function (f) { return f.func === 'BarcodeCoupon'; }).pop();
    if (coupon && k.start - coupon.t < 120000) add(3, last === coupon ? 4 : 2, 'สแกนคูปอง (BarcodeCoupon) ตอน ' + T(coupon.t));
    var member = flows.filter(function (f) { return MEMBER_RE.test(f.func); }).pop();
    if (member && k.start - member.t < 120000) {
      var edcOk = k.lastEdcResult && /Member/.test(k.lastEdcResult.name) && k.start - k.lastEdcResult.t < 120000;
      add(5, (last === member ? 3 : 1) + (edcOk ? 2 : 0), 'ยืนยันสมาชิก (' + member.func + ') ตอน ' + T(member.t) + (edcOk ? ' และ EDC ส่ง ' + k.lastEdcResult.name + ' กลับมาแล้ว' : ''));
    }
    if (last) {
      var lt = funcTopic(last.func), ended = /^End/.test(last.steps[last.steps.length - 1]);
      if (lt === 4) add(4, ended ? 3 : 4, 'flow สุดท้ายคือ BeginSale (สแกนสินค้า) ตอน ' + T(last.t) + (ended ? '' : ' และยังไม่จบ'));
      if (lt === 11) add(11, ended ? 2 : 4, 'flow สุดท้ายคือ ' + last.func + ' ตอน ' + T(last.t) + (ended ? '' : ' และยังไม่จบขั้นตอน'));
      if (lt === 9) add(9, 2, 'flow สุดท้ายคือ Counter Service (' + last.func + ')');
    }
    if (c.lastForm && /PNLITPPOS30074/.test(c.lastForm.name)) add(1, 4, 'หน้าจอสุดท้ายคือหน้าเงินทอน (PNLITPPOS30074) ยังไม่กลับหน้าขาย');
    if (c.lastForm && c.lastForm.name === 'PNLITPPOS00002' && finished) add(2, 1, 'กลับมาหน้าขาย (PNLITPPOS00002) แล้ว');
    if (finished) {
      var idle = c.lastState && c.lastState.state === 'Idle' && /InitialSale/.test(c.lastState.func);
      var finAfter = acts(finished.t);
      add(2, finAfter > 2 ? 1 : 3, 'จบบิลสำเร็จ (EndFinishPayment) ตอน ' + T(finished.t) + (idle ? ' แล้วกลับหน้าขาย (Idle)' : '') + (finAfter > 2 ? ' แต่หลังจากนั้นมีการใช้งานต่ออีก ' + finAfter + ' ครั้ง' : ''));
      if (idle) c.subTopic = 'กลับหน้าขายว่างแล้ว (Idle) ไม่มีรายการค้าง ค้างห่างจากจบบิล ' + fmtDur(k.start - finished.t);
    }
    var ids = Object.keys(sc).map(Number).sort(function (a, b) { return sc[b] - sc[a]; });
    if (!ids.length) return { id: 0, score: 0, conf: 'ต่ำ', why: ['ไม่พบหลักฐานที่ตรงกับหัวข้อใดใน ' + Math.round((k.start - (k.flows[0] ? k.flows[0].t : k.start)) / 60000) + ' นาทีก่อนค้าง'], alt: [] };
    var best = ids[0], s = sc[best];
    var conf = s >= 5 ? 'สูง' : s >= 3 ? 'กลาง' : 'ต่ำ';
    if (ids[1] !== undefined && sc[ids[1]] >= s - 1 && conf === 'สูง') conf = 'กลาง';
    return { id: best, score: s, conf: conf, why: why[best], alt: ids.slice(1, 3).map(function (t) { return { id: t, score: sc[t], why: why[t] }; }) };
  }

  function parseTopics(text) {
    var out = [];
    String(text || '').split('\n').forEach(function (line) {
      var p = line.split('::'); if (p.length < 2) return;
      var id = parseInt(p[0], 10); if (isNaN(id)) return;
      out.push({ id: id, name: p.slice(1).join('::').trim() });
    });
    return out;
  }
  function topicName(topics, id) { for (var i = 0; i < topics.length; i++) if (+topics[i].id === +id) return topics[i].name; return 'หัวข้อ ' + id; }

  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function fmtTime(t) { var d = new Date(t); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()); }
  function fmtTimeMs(t) { return fmtTime(t) + ',' + pad(new Date(t).getUTCMilliseconds(), 3); }
  function fmtDate(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function fmtDur(ms) {
    var s = Math.round(ms / 1000);
    if (s < 60) return s + ' วินาที';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' นาที';
    var h = Math.floor(m / 60);
    return h + ' ชม. ' + (m % 60) + ' นาที';
  }

  function journeyText(j) {
    var s = j.text;
    if (j.n > 1) s += ' ×' + j.n;
    if (j.msg) s += ' "' + j.msg + '"';
    if (j.ret) s += ' → ' + j.ret;
    if (j.open) s += ' → ไม่มีผลกลับ / ไม่จบ';
    return s;
  }

  /* steps in the order the support team reads logs: Activity → Debug → ITP → MSG → others */
  function stepsOf(c) {
    var out = [], T = fmtTime;
    var a = [];
    if (c.lastState) a.push({ text: 'สถานะล่าสุด ' + T(c.lastState.t) + ' [' + c.lastState.state + '][' + c.lastState.func + '][' + c.lastState.stepNo + '][' + c.lastState.step + '] · ' + funcName(c.lastState.func), i: c.lastState.i });
    else a.push({ text: 'ไม่พบ State ใน Activity ช่วงก่อนค้าง' });
    if (c.pending.length) c.pending.forEach(function (p) { a.push({ text: 'ส่งงาน ' + p.fn + ' (' + funcName(p.fn) + ') ตอน ' + T(p.t) + ' แต่ยังไม่ได้คำตอบ', i: p.i, warn: true }); });
    else a.push({ text: 'ทุกงานที่ ITP ส่งมาได้คำตอบครบ' });
    out.push({ src: 'ACT', title: 'Activity: POS ทำงานถึงขั้นไหน', lines: a });
    var d = (c.errors || []).filter(function (e) { return e.src === 'DEBUG' || e.src === 'ACT'; });
    out.push({ src: 'DEBUG', title: 'Debug: มี error ช่วงก่อนค้างไหม', lines: d.length ? d.slice(0, 4).map(function (e) { return { text: T(e.t) + ' ' + e.msg.slice(0, 160) + (e.n > 1 ? ' (×' + e.n + ')' : ''), i: e.i, warn: true }; }) : [{ text: 'ไม่พบ ERROR / Exception ใน Debug / Activity' }] });
    var it = [];
    if (c.lastForm) it.push({ text: 'หน้าจอล่าสุด: ' + formName(c.lastForm.name) + ' (' + c.lastForm.name + ')' + (c.lastForm.fromCls ? '' : ' ตอน ' + T(c.lastForm.t)), i: c.lastForm.i });
    if (c.lastClick) it.push({ text: 'ปุ่มล่าสุด: ' + c.lastClick.label + ' (' + c.lastClick.btn + ') ที่' + formName(c.lastClick.form) + ' ตอน ' + T(c.lastClick.t), i: c.lastClick.i });
    if (c.lastKey) it.push({ text: 'คีย์ / บาร์โค้ดล่าสุด: ' + c.lastKey.text + ' ตอน ' + T(c.lastKey.t), i: c.lastKey.i });
    (c.pendingClicks || []).forEach(function (p) { it.push({ text: pressText(p.btn) + ' ตอน ' + T(p.t) + ' ยังไม่มี log จบปุ่ม (บางปุ่ม เช่น ปุ่มธนบัตร ไม่เขียน log จบอยู่แล้ว)', i: p.i, warn: true }); });
    if (!it.length) it.push({ text: 'ไม่พบการกดปุ่ม / เปลี่ยนหน้าจอใน ITP ช่วงก่อนค้าง' });
    out.push({ src: 'ITP', title: 'ITP: ผู้ใช้กดอะไร หน้าจออะไรแสดง', lines: it });
    var ms = [];
    var pops = (c.journey || []).filter(function (j) { return j.kind === 'popup'; }).slice(-3);
    pops.forEach(function (p) { ms.push({ text: T(p.t) + ' ' + journeyText(p), i: p.i, warn: !!p.open }); });
    if (!ms.length) ms.push({ text: 'ไม่มี Popup ช่วงก่อนค้าง' });
    out.push({ src: 'MSG', title: 'MSG: ช่วงนั้นมีข้อความอะไรแสดง', lines: ms });
    var o = [];
    (c.edcPending || []).forEach(function (p) { o.push({ text: 'EDC เรียก ' + p.fn + ' ตอน ' + T(p.t) + ' แต่ไม่ได้รับ Result', i: p.i, warn: true }); });
    (c.journey || []).filter(function (j) { return j.kind === 'edc' && !j.open; }).slice(-2).forEach(function (j) { o.push({ text: T(j.t) + ' ' + journeyText(j), i: j.i }); });
    (c.journey || []).filter(function (j) { return j.kind === 'cou'; }).slice(-2).forEach(function (j) { o.push({ text: T(j.t) + ' ' + journeyText(j), i: j.i }); });
    (c.errors || []).filter(function (e) { return !/^(DEBUG|ACT)$/.test(e.src); }).slice(0, 2).forEach(function (e) { o.push({ text: e.src + ' error ' + T(e.t) + ' ' + e.msg.slice(0, 120), i: e.i, warn: true }); });
    c.last.filter(function (l) { return /^(COU|EDC|CMS|SMF|PMS|OTHER)$/.test(l.src); }).forEach(function (l) { o.push({ text: l.src + ' บรรทัดสุดท้าย ' + T(l.t) + ' ' + l.msg.slice(0, 100), i: l.i }); });
    if (!o.length) o.push({ text: 'ไม่มี log อื่นในช่วงนี้' });
    out.push({ src: 'OTHER', title: 'Log อื่นประกอบ (COU / EDC / CMS)', lines: o });
    return out;
  }

  /* ---------- promotion engine responses (PromoSrvMessage XML in Debug log) ---------- */
  function attrs(str) { var o = {}, m, re = /(\w+)="([^"]*)"/g; while ((m = re.exec(str))) o[m[1]] = m[2]; return o; }
  function baht(v, prec) { var n = parseFloat(v); if (isNaN(n)) return null; return n / (prec || 100); }
  function parsePromo(raw) {
    var i = raw.indexOf('<PromoSrvMessage'); if (i < 0) return null;
    var xml = raw.slice(i);
    var hm = /<PromoSrvMessage\b([^>]*)>/.exec(xml); if (!hm) return null;
    var h = attrs(hm[1]);
    var r = { method: h.Method || '', ret: h.ReturnCode != null ? h.ReturnCode : '', count: +h.Count || 0, totalReward: h.TotalRewardAmount, totalDeferred: h.TotalDeferredAmount, freeText: cleanText(h.FreeText || ''), lines: [], items: {}, truncated: !/<\/PromoSrvMessage>/.test(xml) };
    var dre = /<DiscountLine\b([^>]*?)(\/>|>([\s\S]*?)<\/DiscountLine>)/g, dm;
    while ((dm = dre.exec(xml))) {
      var a = attrs(dm[1]), body = dm[3] || '', prec = +a.FundedPrecision || 100;
      var line = { id: a.PromNumber || a.OriginalPromID || '', ext: a.ExternalReferenceID || '', desc: cleanText(a.Description || ''), promType: a.PromType || '', rewardType: a.RewardType || '', triggered: a.PromotionTriggered, count: +a.Count || 0, qualify: baht(a.QualifySpend, prec), received: a.RewardReceived, items: [], disc: 0 };
      var cre = /<DiscountChargeItem\b([^>]*)\/?>/g, cm;
      while ((cm = cre.exec(body))) {
        var c = attrs(cm[1]);
        var cp = +c.FundedPrecision || prec, money = cp === 100;
        var it = { seq: c.ItemSeq, plu: c.PluCode, price: baht(c.Price), qty: parseFloat(c.Quantity) || 0, disc: money ? (baht(c.Amount) || 0) : 0, units: money ? 0 : (parseFloat(c.Amount) || 0) / cp };
        line.items.push(it); line.disc += it.disc; line.units = (line.units || 0) + it.units;
      }
      var tre = /<TriggerItem\b([^>]*NetPrice[^>]*)\/?>/g, tm;
      while ((tm = tre.exec(body))) { var t = attrs(tm[1]); line.items.forEach(function (x) { if (x.seq === t.ItemSeq) x.net = baht(t.NetPrice); }); }
      if (!line.items.length) {
        var rre = /<(?:TriggerItem|RewardedItem)\b([^>]*)\/?>/g, rm;
        while ((rm = rre.exec(body))) { var q = attrs(rm[1]); if (!line.items.some(function (x) { return x.seq === q.ItemSeq; })) line.items.push({ seq: q.ItemSeq, plu: q.PluCode, price: baht(q.Price), qty: parseFloat(q.Quantity) || 0, disc: prec === 100 ? (baht(q.RewardAmount) || 0) : 0, units: prec === 100 ? 0 : (parseFloat(q.RewardAmount) || 0) / prec, trigOnly: !q.RewardAmount }); }
        line.items.forEach(function (x) { line.disc += x.disc; });
      }
      line.disc = Math.round(line.disc * 100) / 100;
      r.lines.push(line);
      line.items.forEach(function (x) {
        var k = x.seq || x.plu, agg = r.items[k] || (r.items[k] = { seq: x.seq, plu: x.plu, price: x.price, qty: x.qty, disc: 0, promos: [] });
        agg.disc = Math.round((agg.disc + (x.disc || 0)) * 100) / 100;
        if (agg.promos.indexOf(line.id) < 0 && x.disc) agg.promos.push(line.id);
      });
    }
    Object.keys(r.items).forEach(function (k) { var x = r.items[k]; x.gross = x.price != null ? Math.round(x.price * x.qty * 100) / 100 : null; x.net = x.gross != null ? Math.round((x.gross - x.disc) * 100) / 100 : null; });
    r.discTotal = Math.round(r.lines.reduce(function (s0, l) { return s0 + l.disc; }, 0) * 100) / 100;
    return r;
  }
  function promoResults(all, filter) {
    var out = [], last = null;
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (filter && !filter(e)) continue;
      if (e.raw.indexOf('PromoSrvMessage') < 0 || !/XML RESULT|RESULT <=|Response/i.test(e.raw)) continue;
      var p = parsePromo(e.raw); if (!p) continue;
      p.t = e.t; p.i = i; p.pos = e.pos; p.sig = e.raw.slice(e.raw.indexOf('<PromoSrvMessage'));
      var xs = e.raw.search(/<(?:LPEComboMessage|PromoSrvMessage)\b/); p.xml = xs >= 0 ? e.raw.slice(xs).trim() : p.sig;
      if (last && last.sig === p.sig && p.t - last.t < 60000) { last.n = (last.n || 1) + 1; last.tLast = p.t; continue; }
      out.push(p); last = p;
    }
    return out;
  }

  /* Thai text that was already lost before the file reached the browser shows as U+FFFD. Collapse those runs into one marker. */
  var BROKEN = '[ภาษาไทยเสีย]';
  function cleanText(s) {
    s = String(s);
    if (s.indexOf('\uFFFD') < 0) return s;
    return s.replace(/[^\s|<>\[\]"]*\uFFFD[^\s|<>\[\]"]*(\s+[^\s|<>\[\]"]*\uFFFD[^\s|<>\[\]"]*)*/g, BROKEN).replace(/(\[ภาษาไทยเสีย\]\s*)+/g, BROKEN + ' ').trim();
  }
  function mask(s) { return String(s).replace(/\b[\w.+-]+@([\w-]+\.)+[\w-]+/g, 'xxx@xxx').replace(/\b(0\d{2})\d{4}(\d{3})\b/g, '$1xxxx$2').replace(/\b(\d{6})\d{6,9}(\d{4})\b/g, '$1xxxxxx$2'); }
  function summaryText(c, all, files, topics) {
    var L = [], tp = c.topicFinal != null ? c.topicFinal : c.topic.id;
    L.push('[POS Log Timeline] เครื่อง ' + c.pos + ' วันที่ ' + fmtDate(c.start));
    var defs = topics || DEFAULTS.topicDefs;
    L.push('กลุ่มสาเหตุ: ' + GROUP_LABEL[groupOf(defs, tp)]);
    L.push('หัวข้อ: ' + (tp ? tp + '. ' : '') + topicName(defs, tp) + (c.topicFinal != null && c.topicFinal !== c.topic.id ? ' (ผู้วิเคราะห์เลือกเอง)' : ' (ความมั่นใจ: ' + c.topic.conf + ')'));
    if (c.subTopic) L.push('รายละเอียด: ' + c.subTopic);
    if (c.topicFinal == null || c.topicFinal === c.topic.id) c.topic.why.forEach(function (w) { L.push('  • ' + w); });
    L.push('Log หยุด: ' + fmtTimeMs(c.start) + (c.end ? ' → กลับมา ' + fmtTimeMs(c.end) + ' (หายไป ' + fmtDur(c.end - c.start) + ')' : ' → ไม่กลับมาในไฟล์ที่มี'));
    if (c.hb) L.push('ประมาณเวลาค้าง: ' + fmtTime(c.freezeFrom) + ' – ' + fmtTime(c.freezeTo) + ' (' + c.hb.label + ' ปกติทุก ' + fmtDur(c.hb.interval) + ' ครั้งล่าสุด ' + fmtTime(c.hb.last) + ')');
    if (c.afterRestart) L.push('หมายเหตุ: log หายต่อจาก restart ' + fmtTime(c.afterRestart.t) + ' (' + c.afterRestart.label + ') โปรแกรมอาจเริ่มไม่ครบ');
    L.push('');
    stepsOf(c).forEach(function (s, n) {
      L.push((n + 1) + ') ' + s.title);
      s.lines.forEach(function (x) { L.push('   - ' + x.text); });
    });
    L.push('');
    L.push('ลำดับการใช้งานก่อนค้าง (' + Math.min(15, (c.journey || []).length) + ' เหตุการณ์ล่าสุด):');
    (c.journey || []).slice(-15).forEach(function (j) { L.push('  ' + fmtTime(j.t) + '  ' + journeyText(j)); });
    L.push('');
    L.push('Log สุดท้ายของแต่ละไฟล์:');
    c.last.forEach(function (l) { L.push('  - ' + l.src + ' ' + fmtTimeMs(l.t) + '  ' + l.msg.slice(0, 160)); });
    L.push('Restart หลังจากนั้น: ' + (c.restarts.length ? c.restarts.map(function (r) { return fmtTime(r.t) + ' ' + r.label; }).join(', ') : 'ไม่พบใน log'));
    return mask(cleanText(L.join('\n')));
  }

  return {
    SRC_ORDER: SRC_ORDER, SRC_LABEL: SRC_LABEL, DEFAULTS: DEFAULTS,
    parseText: parseText, detectType: detectType, posFromPath: posFromPath,
    merge: merge, flag: flag, analyze: analyze, parseRules: parseRules, safeRe: safeRe,
    lowerBound: lowerBound, fmtTime: fmtTime, fmtTimeMs: fmtTimeMs, fmtDate: fmtDate, fmtDur: fmtDur,
    summaryText: summaryText, parseTs: parseTs, mask: mask, parseTopics: parseTopics, topicName: topicName,
    stepsOf: stepsOf, parsePromo: parsePromo, promoResults: promoResults, cleanText: cleanText, learned: function () { return LEARNED; }, resetLearned: function () { LEARNED = {}; }, groupOf: groupOf, GROUP_LABEL: GROUP_LABEL, journeyText: journeyText, formName: formName, setDict: setDict
  };
})();
if (typeof module !== 'undefined') module.exports = Core;
