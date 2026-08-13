/* 完整攻略分頁 — 閘門
 * ─────────────────────────────────────────────
 * 🔴 跟站上其他工具共用同一組 localStorage key 與 REDEEM_API，
 *    已經拿過等級 3 的碼就直接開。
 *
 * 鎖法：標題留著、答案模糊。整段藏起來會被當成頁面壞掉直接關掉，
 *      看得到「這裡有七條」才會想解鎖。
 *
 * 宿主頁沒有 #pane-guide 就靜默跳過。
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var wrap = document.querySelector('#pane-guide .gd-wrap');
  if (!wrap) return;

  var UNLOCK_KEY = 'seth-gate-unlock-v1';
  var LEGACY_AI_KEY = 'seth-room-unlocked';
  var REDEEM_API = 'https://seth-unlock-bot.ysyyds1688.workers.dev/api/redeem';
  var NEED_LEVEL = 3;                                   // 當月累計存款 3,000
  var LINE_URL = 'https://line.me/R/ti/p/@128zirab';    // 發碼的 bot 在這個帳號
  var REG_URL = 'https://ys89.bet/activity/entry?url=/activity/detail/RegistrationBonus/NTD'
              + '&proxy=dvjhkv&utm_source=tsaishen888&utm_medium=tool_gate'
              + '&utm_campaign=ys368&utm_content=full-guide';

  var unlocked = (function () {
    var u = {};
    try { u = JSON.parse(localStorage.getItem(UNLOCK_KEY)) || {}; } catch (e) {}
    try { if (localStorage.getItem(LEGACY_AI_KEY) === '1') u.level = 3; } catch (e) {}
    if (u.dep) u.level = 3; else if (u.reg && !u.level) u.level = 2;
    return u;
  })();
  function opened() { return Number(unlocked.level || 0) >= NEED_LEVEL; }

  function apply() {
    var ok = opened();
    wrap.classList.toggle('gd-locked', !ok);
    var g = $('gd-gate');
    if (g) g.hidden = ok;
  }

  var reg = $('gd-reg'), line = $('gd-line');
  if (reg) {
    reg.href = REG_URL;
    reg.addEventListener('click', function () {
      if (typeof gtag === 'function') gtag('event', 'reg_intent', { source: 'full_guide_gate' });
    });
  }
  if (line) {
    line.href = LINE_URL;
    line.addEventListener('click', function () {
      if (typeof gtag === 'function') gtag('event', 'line_intent', { source: 'full_guide_gate' });
    });
  }

  var inp = $('gd-code'), btn = $('gd-unlock'), note = $('gd-note');
  function submit() {
    var code = (inp.value || '').trim().toLowerCase();
    if (!code) { note.textContent = '請先貼上解鎖碼。'; return; }
    btn.disabled = true; note.textContent = '核對中…';
    fetch(REDEEM_API, { method: 'POST', headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ code: code }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        btn.disabled = false;
        if (!d || !d.ok) {
          note.textContent = d && d.error === 'limit'
            ? '這組碼已經用滿裝置數上限。加 LINE 說一聲，我們人工看。'
            : '解鎖碼不對。加 LINE 傳截圖就會自動給你。';
          return;
        }
        unlocked.level = Number(d.level);
        try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocked)); } catch (e) {}
        if (Number(d.level) < NEED_LEVEL) {
          note.textContent = '這組碼是「' + (d.level === 1 ? '完成註冊' : '當月累計存款 2,000')
            + '」等級的。完整攻略需要 3,000 的那一組。';
          apply(); return;
        }
        if (typeof gtag === 'function') gtag('event', 'guide_unlock', { level: d.level });
        note.textContent = ''; apply();
      })
      .catch(function () { btn.disabled = false; note.textContent = '連線失敗，稍後再試一次。'; });
  }
  if (btn) btn.addEventListener('click', submit);
  if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });

  apply();
})();
