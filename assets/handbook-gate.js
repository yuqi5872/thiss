/* 賽特觀測手冊 — 內容閘門
 * 2026-08-13 建立
 *
 * 🔴 刻意跟 seth-gate.js 共用同一組 localStorage key 與同一支 REDEEM_API。
 *    已經拿過 L2／L3 碼的人打開這一頁會直接解鎖，不用再要一次碼。
 *    如果哪天改了 seth-gate.js 的 UNLOCK_KEY，這裡也要跟著改，否則
 *    使用者會在工具台是解鎖狀態、在手冊卻被鎖著——這種不一致最難查。
 *
 * 這是軟鎖不是防盜（理由同 seth-gate.js）。它的工作是在「已經覺得
 * 前面的免費內容有用」的那一刻，給一個去註冊／儲值的理由。
 *
 * 文案紅線：只講「這是會員內容」，不講任何跟輸贏、勝率、獲利有關的話。
 */
(function () {
  'use strict';

  var UNLOCK_KEY = 'seth-gate-unlock-v1';
  var LEGACY_AI_KEY = 'seth-room-unlocked';
  var REDEEM_API = 'https://seth-unlock-bot.ysyyds1688.workers.dev/api/redeem';
  var NEED_LEVEL = 2;                       // 手冊門檻：當月累計存款 2,000
  var LINE_URL = 'https://line.me/R/ti/p/@806ugpjh';   // 發碼的 bot 在這個帳號（2026-08-14 從小夜 @128zirab 搬過來）

  function read() {
    try { return JSON.parse(localStorage.getItem(UNLOCK_KEY)) || {}; } catch (e) { return {}; }
  }
  function write(v) {
    try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(v)); } catch (e) {}
  }

  var u = read();
  try { if (localStorage.getItem(LEGACY_AI_KEY) === '1') u.level = 3; } catch (e) {}
  if (u.dep) u.level = 3;
  else if (u.reg && !u.level) u.level = 2;

  function level() { return Number(u.level || 0); }
  function track(n, p) { if (typeof window.gtag === 'function') window.gtag('event', n, p || {}); }

  function apply() {
    var open = level() >= NEED_LEVEL;
    document.querySelectorAll('[data-hb-locked]').forEach(function (el) {
      el.style.display = open ? '' : 'none';
    });
    var gate = document.getElementById('hb-gate');
    if (gate) gate.style.display = open ? 'none' : '';
    var badge = document.getElementById('hb-badge');
    if (badge) badge.textContent = open ? '已解鎖' : '會員內容';
  }

  function redeem(code) {
    return fetch(REDEEM_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code })
    }).then(function (r) {
      return r.json().then(function (d) { return { status: r.status, data: d }; });
    }).then(function (res) {
      if (res.data && res.data.ok) return { ok: true, level: Number(res.data.level) };
      return { ok: false, error: (res.data && res.data.error) || 'invalid' };
    }).catch(function () { return { ok: false, error: 'network' }; });
  }

  function msg(err) {
    if (err === 'limit') return '這組碼已經用滿裝置數上限。如果是你自己換裝置，加 LINE 說一聲，我們人工看。';
    if (err === 'network') return '連線失敗，稍後再試一次。';
    return '解鎖碼不對。加 LINE 傳截圖就會自動給你。';
  }

  document.addEventListener('DOMContentLoaded', function () {
    apply();

    var line = document.getElementById('hb-line');
    if (line) { line.href = LINE_URL; line.addEventListener('click', function () { track('line_intent', { source: 'handbook' }); }); }

    var input = document.getElementById('hb-code');
    var btn = document.getElementById('hb-submit');
    var note = document.getElementById('hb-note');
    if (!input || !btn) return;

    function submit() {
      var code = (input.value || '').trim().toLowerCase();
      if (!code) { note.textContent = '請先貼上解鎖碼。'; return; }
      btn.disabled = true; note.textContent = '核對中…';
      redeem(code).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { note.textContent = msg(r.error); track('handbook_redeem_fail', { reason: r.error }); return; }
        if (r.level < NEED_LEVEL) {
          note.textContent = '這組碼是「完成註冊」等級的。手冊需要「當月累計存款 2,000」的那一組。';
          u.level = r.level; write(u); apply(); return;
        }
        u.level = r.level; write(u); apply();
        note.textContent = '';
        track('handbook_unlock', { level: r.level });
        var t = document.getElementById('hb-top');
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  });
})();
