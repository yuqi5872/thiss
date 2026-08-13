/* 完整攻略分頁 — 閘門＋內容抓取
 * ─────────────────────────────────────────────
 * 🔴 正文不在這支裡，也不在 HTML 裡，只在 seth-unlock-bot 的 /api/guide。
 *    驗證解鎖碼通過才回傳。放在前端的話任何人 curl 就整篇拿走、
 *    Google 也會收錄，「儲值 3,000 才看得到」等於不存在。
 *    2026-08-13 實測過：搬進後端之前，未登入 curl 就抓得到全文。
 *
 * 🔴 副作用要知道：內容進了 API，Google 就看不到那些字，
 *    這一格的搜尋流量會掉。這是必然取捨——不可能同時要
 *    「被收錄」跟「只有付費看得到」。
 *
 * 解鎖碼存在 localStorage（跟站上其他工具共用同一組 key），
 * 回訪時用存著的碼自動再抓一次內容。
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var wrap = document.querySelector('#pane-guide .gd-wrap');
  if (!wrap) return;

  var UNLOCK_KEY = 'seth-gate-unlock-v1';
  var CODE_KEY = 'seth-gate-code-v1';          // 記住碼，回訪才抓得到內容
  var LEGACY_AI_KEY = 'seth-room-unlocked';
  var API = 'https://seth-unlock-bot.ysyyds1688.workers.dev';
  var NEED_LEVEL = 3;                                   // 當月累計存款 3,000
  var LINE_URL = 'https://line.me/R/ti/p/@128zirab';    // 發碼的 bot 在這個帳號
  var REG_URL = 'https://ys89.bet/activity/entry?url=/activity/detail/RegistrationBonus/NTD'
              + '&proxy=dvjhkv&utm_source=tsaishen888&utm_medium=tool_gate'
              + '&utm_campaign=ys368&utm_content=full-guide';

  function savedCode() { try { return localStorage.getItem(CODE_KEY) || ''; } catch (e) { return ''; } }
  function saveCode(c) { try { localStorage.setItem(CODE_KEY, c); } catch (e) {} }

  var unlocked = (function () {
    var u = {};
    try { u = JSON.parse(localStorage.getItem(UNLOCK_KEY)) || {}; } catch (e) {}
    try { if (localStorage.getItem(LEGACY_AI_KEY) === '1') u.level = 3; } catch (e) {}
    if (u.dep) u.level = 3; else if (u.reg && !u.level) u.level = 2;
    return u;
  })();

  /* 只是把畫面切到「已解鎖」樣式；內容有沒有真的拿到看 render() */
  function setLocked(locked) {
    wrap.classList.toggle('gd-locked', locked);
    var g = $('gd-gate'); if (g) g.hidden = !locked;
  }

  function render(guide) {
    $('gd-list').innerHTML = guide.items.map(function (x) {
      return '<li class="gd-item"><h3>' + x.title + '</h3>'
        + '<p class="do">' + x.do + '</p>'
        + '<p class="why">' + x.why
        + (x.src ? '<span class="src">' + x.src + '</span>' : '') + '</p></li>';
    }).join('');
    var b = $('gd-bonus');
    if (b && guide.bonus) {
      b.innerHTML = '<h3>' + guide.bonus.title + '</h3><p>' + guide.bonus.body + '</p>';
      b.hidden = false;
    }
    setLocked(false);
  }

  /* 拿內容。code 不對／等級不夠都回 false，畫面維持鎖著。 */
  function fetchGuide(code) {
    return fetch(API + '/api/guide', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code })
    }).then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.guide) return d || { ok: false, error: 'invalid' };
        unlocked.level = Number(d.level);
        try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocked)); } catch (e) {}
        saveCode(code);
        render(d.guide);
        return d;
      })
      .catch(function () { return { ok: false, error: 'network' }; });
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
  function msg(err, lv) {
    if (err === 'level') return '這組碼是「' + (lv === 1 ? '完成註冊' : '當月累計存款 2,000')
      + '」等級的。完整攻略需要 3,000 的那一組。';
    if (err === 'network') return '連線失敗，稍後再試一次。';
    return '解鎖碼不對。加 LINE 傳截圖就會自動給你。';
  }
  function submit() {
    var code = (inp.value || '').trim().toLowerCase();
    if (!code) { note.textContent = '請先貼上解鎖碼。'; return; }
    btn.disabled = true; note.textContent = '核對中…';
    fetchGuide(code).then(function (d) {
      btn.disabled = false;
      if (d && d.ok) {
        note.textContent = '';
        if (typeof gtag === 'function') gtag('event', 'guide_unlock', { level: d.level });
      } else {
        note.textContent = msg(d && d.error, d && d.level);
      }
    });
  }
  if (btn) btn.addEventListener('click', submit);
  if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });

  /* 回訪：有存過碼就直接抓內容。抓失敗（碼被撤銷、網路斷）就維持鎖著，
     不要假裝解鎖——那會顯示空白清單，比鎖著更像壞掉。 */
  setLocked(true);
  var c = savedCode();
  if (c && Number(unlocked.level || 0) >= NEED_LEVEL) fetchGuide(c);
})();
