/* Reference guide for the built-in topics, shown in "Library เคส".
   desc = what the store sees, evidence = what the analyser scores in classify() (js/core.js),
   check = what to look at / attach for Dev. Topics added by users have no entry here. */
var CASE_GUIDE = {
  1: {
    desc: 'หน้าจอค้างที่หน้าเงินทอนหลังรับเงิน ไม่กลับหน้าขาย แล้วโปรแกรมหลุดออกสู่ Desktop',
    evidence: ['หน้าจอสุดท้ายคือหน้าเงินทอน PNLITPPOS30074 และยังไม่กลับหน้าขาย'],
    check: ['ดู FinishPayment / PrintReceipt / CheckCashDrawer ว่าจบครบไหม', 'ดู Exception ใน Debug log ช่วงก่อนหลุด', 'แนบเลขใบเสร็จ / Common ของบิลสุดท้าย']
  },
  2: {
    desc: 'ขายจบบิลแล้ว (พิมพ์ใบเสร็จ) แต่เครื่องค้างตอนเริ่มบิลถัดไปหรือขณะอยู่หน้าขายว่าง',
    evidence: ['พบ EndFinishPayment จบบิลสำเร็จก่อนค้าง', 'กลับมาหน้าขาย PNLITPPOS00002 / State Idle แล้ว', 'ITP ส่ง FinishPayment / PrintReceipt / CashDrawer / InitialSale แต่ไม่ได้รับคำตอบ'],
    check: ['ระยะห่างระหว่างจบบิลกับเวลาค้าง (ถ้านานมาก อาจเป็นเรื่องอื่น)', 'ลิ้นชัก / เครื่องพิมพ์ตอบกลับครบไหม', 'งานพื้นหลังที่ทำงานช่วงนั้น เช่น CMS / Timer']
  },
  3: {
    desc: 'สแกนคูปอง (Barcode Coupon) แล้วเครื่องค้าง',
    evidence: ['flow BarcodeCoupon ภายใน 2 นาทีก่อนค้าง (หนักขึ้นถ้าเป็น flow สุดท้าย)', 'ITP ส่ง BarcodeCoupon แต่ไม่ได้รับคำตอบ', 'กดปุ่มที่เกี่ยวกับ Coupon แล้วไม่มี log จบปุ่ม'],
    check: ['เลขคูปองที่สแกน (ใน ITP barcode :)', 'ผลคำนวณโปรครั้งล่าสุด', 'ReturnCode ของ BarcodeCoupon']
  },
  4: {
    desc: 'สแกนสินค้า / เพิ่มสินค้าแล้วเครื่องค้าง',
    evidence: ['flow สุดท้ายคือ BeginSale และยังไม่จบ', 'ITP ส่ง BeginSale แต่ไม่ได้รับคำตอบ'],
    check: ['บาร์โค้ดสินค้าตัวสุดท้าย', 'ผลคำนวณโปรหลังสแกน', 'ถ้าบาร์โค้ดยาวผิดปกติ ให้ดูหัวข้อ 12 ด้วย']
  },
  5: {
    desc: 'ยืนยันสมาชิก AllMember / 7Rewards ผ่าน EDC แล้วเครื่องค้าง',
    evidence: ['EDC เรียกคำสั่ง Member / Telephone / NID แต่ไม่ได้รับ Result', 'flow ยืนยันสมาชิกภายใน 2 นาทีก่อนค้าง และ EDC ส่งผลกลับแล้ว', 'หน้าจอสุดท้ายเป็นหน้า AllMember*', 'กดปุ่ม 7Reward / Member / TelNo แล้วไม่มี log จบปุ่ม'],
    check: ['log EDC ช่วงเดียวกัน (คำสั่งที่ส่งและ Result)', 'Ticket AllMember', 'สถานะการเชื่อมต่อ EDC']
  },
  6: {
    desc: 'ชำระด้วย Mobile Payment (QR / Wallet) สำเร็จ แล้วเครื่องค้าง',
    evidence: ['flow Mobile / QR / Wallet / PromptPay ก่อนค้าง (หนักขึ้นถ้าจบบิลสำเร็จหลังจากนั้น)', 'ITP ส่งงาน Mobile Payment แต่ไม่ได้รับคำตอบ', 'คะแนนลดลงถ้าหลังชำระยังมีการใช้งานต่อหลายครั้ง'],
    check: ['ช่องทางที่ใช้ชำระ', 'ผลตอบกลับจากผู้ให้บริการ', 'บิลถูกบันทึกแล้วหรือยัง (เลขใบเสร็จ)']
  },
  7: {
    desc: 'เปิดโปรแกรมแล้วขึ้นแจ้งเตือน Low Disk Space เข้าหน้าขายไม่ได้',
    evidence: ['พบข้อความ Low Disk / disk space / พื้นที่เต็ม ภายใน 30 นาทีรอบจุดค้าง'],
    check: ['พื้นที่ว่างของไดรฟ์ที่ติดตั้ง POS', 'ขนาดโฟลเดอร์ log / ไฟล์ชั่วคราว', 'ส่งต่อทีม Hardware / Infra']
  },
  8: {
    desc: 'ทำรายการ TopUp / เติมเงิน แล้วค้างระหว่างรออ่านข้อมูลจาก TSCAPI.ReadKey',
    evidence: ['EDC เรียก ReadKey แต่ไม่ได้รับ Result', 'พบ TSCAPI ใน 2 นาทีก่อนค้าง', 'flow TopUp / Reload ภายใน 2 นาทีก่อนค้าง'],
    check: ['สถานะเครื่องอ่านบัตร / EDC', 'log EDC ช่วงเดียวกัน', 'ส่งต่อทีม Hardware']
  },
  9: {
    desc: 'ทำรายการ Counter Service แล้วค้างที่ Popup ยืนยัน',
    evidence: ['มี Popup ค้างอยู่ระหว่าง Counter Service (ภายใน 2 นาที) และยังไม่ถูกปิด', 'มี log Counter Service ล่าสุดก่อนค้าง', 'flow สุดท้ายคือ SRBC / CS*'],
    check: ['รหัส Popup และข้อความ', 'log COU ช่วงเดียวกัน', 'บาร์โค้ดบิลที่ชำระ']
  },
  10: {
    desc: 'Restart แล้วโปรแกรมขายเปิดไม่ครบ ค้างที่หน้ารูปตึก',
    evidence: ['log หายภายใน 3 นาทีหลัง restart', 'หน้าจอสุดท้ายเป็นหน้า Login หลัง restart'],
    check: ['ITP Startup log (BOOT) ว่าหยุดที่ขั้นไหน', 'MonitoringForm / การตรวจสถานะตอนเปิดโปรแกรม', 'Settlement อัตโนมัติตอนเปิดเครื่อง']
  },
  11: {
    desc: 'กดชำระเงินแล้วค้างระหว่างคำนวณโปรโมชั่น / เตรียมหน้าชำระเงิน',
    evidence: ['flow สุดท้ายคือ PreparePay / PrePayment / Promotion และยังไม่จบ', 'ITP ส่ง PreparePay / PrePayment แต่ไม่ได้รับคำตอบ', 'หน้าจอสุดท้ายคือหน้าชำระเงิน PNLITPPOS00070'],
    check: ['กล่อง "ผลคำนวณโปรโมชั่น" ครั้งล่าสุด (ReturnCode, XML ถูกตัดไหม)', 'จำนวนรายการในบิล', 'PMS log ช่วงเดียวกัน']
  },
  12: {
    desc: 'มีการป้อนข้อมูลผิดปกติ เช่น ปุ่ม CTRL / ALT ค้าง หรือสแกนเนอร์ส่งเลขซ้ำ แล้วเครื่องค้าง',
    evidence: ['ITP GlobalHookManager ตรวจพบปุ่ม CTRL / ALT ค้าง', 'สแกนบาร์โค้ดยาวผิดปกติหรือมีเลขซ้ำต่อกันยาว', 'Login ด้วย Username ยาวผิดปกติ'],
    check: ['คีย์บอร์ด / สแกนเนอร์ที่หน้าร้าน', 'ค่าที่สแกนเข้ามา (ใน ลำดับการใช้งาน)', 'ส่งต่อทีม Hardware']
  },
  13: {
    desc: 'ค้างระหว่าง Sign Off / Sign On หรือหลัง Auto Sign Off',
    evidence: ['ระบบ Auto Sign Off ภายใน 5 นาทีก่อนค้าง', 'ITP ส่งงาน SignOn / SignOff แต่ไม่ได้รับคำตอบ', 'หน้าจอสุดท้ายเป็นหน้า Login (ไม่ใช่หลัง restart)'],
    check: ['SMF log ช่วงเดียวกัน', 'เวลา Sign Off กับเวลาค้าง', 'ผู้ใช้ที่ Login ล่าสุด']
  },
  0: {
    desc: 'ยังสรุปไม่ได้จาก log ที่มี',
    evidence: ['ไม่พบหลักฐานที่ตรงกับหัวข้อใด หรือคะแนนต่ำ', 'มีงาน / Popup ค้างที่ไม่เข้ากับหัวข้อใด'],
    check: ['ตรวจว่าโหลด log ครบทุกชนิด (ITP, Activity, Debug, EDC)', 'ดู "ลำดับการใช้งานก่อนค้าง" ด้วยตาเอง', 'ถ้าเจอซ้ำหลายครั้ง ให้เพิ่มเป็นหัวข้อใหม่พร้อมคำค้นใน log']
  }
};
