/* Tabs: "ภาพรวม & Timeline" (overview chart, timeline, promotions) · จุดผิดปกติ · หัวข้ออาการ · ไฟล์ที่โหลด · ตั้งค่า.
   Load after the other js/app files (it wraps a few of their functions) and before main.js. */
var TABS = ['main', 'cands', 'topics', 'files', 'settings'];
var curTab = 'main';

function switchTab(name, focusBtn) {
  if (TABS.indexOf(name) < 0) name = 'main';
  var changed = name !== curTab;
  curTab = name;
  TABS.forEach(function (t) {
    var on = t === name, btn = $('tabbtn-' + t);
    btn.setAttribute('aria-selected', String(on)); btn.tabIndex = on ? 0 : -1;
    $('tab-' + t).hidden = !on;
  });
  if (focusBtn) $('tabbtn-' + name).focus();
  // on a narrow screen the tab bar scrolls sideways: keep the chosen tab in view
  var bar = $('tabBar'), b = $('tabbtn-' + name);
  if (b.offsetLeft < bar.scrollLeft) bar.scrollLeft = b.offsetLeft - 8;
  else if (b.offsetLeft + b.offsetWidth > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = b.offsetLeft + b.offsetWidth - bar.clientWidth + 8;
  // the chart and the virtual-scrolled timeline measure their size, so redraw them once they are visible again
  if (name === 'main' && changed) { drawLanes(); renderRows(true); }
}

function updateTabCounts() {
  var nc = st.cands.length, nf = st.files.length;
  $('tabnCands').textContent = nc ? nc : '';
  $('tabnFiles').textContent = nf ? nf : '';
}

TABS.forEach(function (t, i) {
  var btn = $('tabbtn-' + t);
  btn.onclick = function () { switchTab(t); };
  btn.onkeydown = function (ev) {
    var k = ev.key, j = -1;
    if (k === 'ArrowRight') j = (i + 1) % TABS.length;
    else if (k === 'ArrowLeft') j = (i - 1 + TABS.length) % TABS.length;
    else if (k === 'Home') j = 0;
    else if (k === 'End') j = TABS.length - 1;
    if (j < 0) return;
    ev.preventDefault(); switchTab(TABS.at(j), true);
  };
});

// any element with data-goto-tab="<name>" opens that tab
document.addEventListener('click', function (ev) {
  var el = ev.target.closest ? ev.target.closest('[data-goto-tab]') : null;
  if (el) { ev.preventDefault(); switchTab(el.getAttribute('data-goto-tab')); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});

// everything that jumps to a time or line needs the timeline tab open first
(function wrapForTabs() {
  var _focusCand = focusCand, _jumpToEntry = jumpToEntry, _jumpToTime = jumpToTime, _rebuild = rebuild, _load = load;
  focusCand = function () { switchTab('main'); return _focusCand.apply(this, arguments); };
  jumpToEntry = function () { switchTab('main'); return _jumpToEntry.apply(this, arguments); };
  jumpToTime = function () { switchTab('main'); return _jumpToTime.apply(this, arguments); };
  rebuild = function () { var r = _rebuild.apply(this, arguments); updateTabCounts(); return r; };
  load = function () { switchTab('main'); return _load.apply(this, arguments); };
})();

switchTab('main'); // the page always opens on the overview + timeline tab
