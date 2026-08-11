/*
 * 賽特工具台 — 試用次數閘門
 * 2026-08-11 建立
 *
 * 三個工具三種門檻：
 *   ① 機制模擬器      免費 3 次 → 註冊後解鎖
 *   ② 戰局計算        免費 1 場 → 註冊後解鎖
 *   ③ AI 選房數據助手  首儲 2,000 後開啟
 *
 * ── 這是軟鎖，不是防盜 ────────────────────────────
 * 次數存在 localStorage，清掉就重來，會看原始碼的人一秒繞過。
 * 它的工作不是擋住所有人，是在「已經覺得工具有用」的那一刻
 * 給一個去註冊的理由。真的想繞的人本來就不會註冊，擋他沒有收益。
 * 所以不要為了防繞過去做裝置指紋——那會傷到正常使用者，
 * 而且擋不住真的想繞的人。
 *
 * ── 三條刻意的設計 ────────────────────────────────
 * 1. 只鎖互動，不鎖內容。800 萬轉統計、常見問題、機制說明全部照常顯示。
 *    整頁遮起來會同時失去搜尋流量與信任，而那才是這站真正的資產。
 * 2. 閘門是頁面內的一塊面板，不是彈窗。彈窗會被當成廣告直接關掉。
 * 3. 文案只講「這是會員功能」，不講任何跟輸贏、勝率、獲利有關的話。
 *    博弈內容的 YMYL 紅線：工具可以要求註冊，不可以暗示註冊會贏。
 *
 * ── 解鎖碼怎麼發 ──────────────────────────────────
 * 站是純靜態的，沒有後端可以查對方到底有沒有註冊或儲值。
 * 所以流程是人工的：使用者加 LINE → 你在 ys89.bet 後台用代理碼
 * dvjhkv 查到這個人 → 把對應的碼給他。碼要換就改下面 CODES，
 * 重新部署即可（舊碼會立刻失效，已解鎖的人不受影響）。
 */
(function () {
  'use strict';

  /* ── 可調參數：要改就改這一段 ───────────────────── */
  var LIMITS = { sim: 3, session: 1 };          // 免費次數
  var CODES = {
    reg: 'seth-vip-2608',                        // 註冊後給 → 解鎖 ①②
    dep: 'seth-pro-2608'                         // 首儲 2,000 後給 → 解鎖 ③
  };
  var LINE_URL = 'https://line.me/R/ti/p/@128zirab';
  var REG_BASE = 'https://ys89.bet/activity/entry?url=/activity/detail/RegistrationBonus/NTD' +
                 '&proxy=dvjhkv&utm_source=tsaishen888&utm_medium=tool_gate&utm_campaign=ys368';
  /* ──────────────────────────────────────────────── */

  var USE_KEY = 'seth-gate-uses-v1';
  var UNLOCK_KEY = 'seth-gate-unlock-v1';
  var LEGACY_AI_KEY = 'seth-room-unlocked';   // 舊版 AI 解鎖旗標，要繼續認

  var $ = function (id) { return document.getElementById(id); };
  var track = function (name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  };

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  var uses = read(USE_KEY, {});
  var unlocked = read(UNLOCK_KEY, {});
  // 舊版只鎖 AI，已經拿過碼的人不能因為這次改版被鎖回去
  try { if (localStorage.getItem(LEGACY_AI_KEY) === '1') unlocked.dep = true; } catch (e) {}

  function isUnlocked(scope) {
    // 首儲碼位階比註冊碼高，解了 ③ 等於 ①② 也解開
    return scope === 'dep' ? !!unlocked.dep : !!(unlocked.reg || unlocked.dep);
  }
  function used(tool) { return Number(uses[tool] || 0); }
  function spend(tool) { uses[tool] = used(tool) + 1; write(USE_KEY, uses); }

  /* ── 樣式 ─────────────────────────────────────────
     前綴 seth-gate 獨佔，不會跟站上既有 class 打架。

     🔴 顏色一律寫死，不要用 var(--ink-soft, 淺色) 這種寫法。
     工具台這頁只定義了 --line，--ink-soft／--ink-mute／--bg-soft 全都不存在，
     fallback 會直接生效——第一版就因此做出「近白底＋米白字」的面板：
     元素在、版面對、CSS 沒報錯，但字根本看不見。
     這頁是深色的（body 文字 #f2eadc），所以整組色票照深色配。 */
  var GOLD = '#d4af37', CREAM = '#f2eadc';
  var css =
    '.seth-gate{border:1px solid rgba(221,176,88,.28);border-left:3px solid ' + GOLD + ';' +
        /* 背景要不透明。半透明會讓底下的 h1／盤面透出來跟文字疊在一起。 */
    'border-radius:12px;padding:20px 22px;margin:14px 0;background:#0f1420}' +
    '.seth-gate[hidden]{display:none}' +
    '.seth-gate h4{margin:0 0 7px;font-size:16px;font-weight:800;line-height:1.4;color:' + CREAM + '}' +
    '.seth-gate p{margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(242,234,220,.72)}' +
    '.seth-gate b{color:' + CREAM + '}' +
    '.seth-gate-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center}' +
    '.seth-gate-go{display:inline-block;padding:11px 20px;border-radius:9px;background:' + GOLD + ';' +
    'color:#1a1206;font-weight:800;text-decoration:none;font-size:14.5px}' +
    '.seth-gate-line{display:inline-block;padding:11px 18px;border-radius:9px;background:#06c755;' +
    'color:#fff;font-weight:700;text-decoration:none;font-size:14px}' +
    '.seth-gate-have{background:none;border:0;padding:0;font-size:13.5px;color:rgba(242,234,220,.62);' +
    'text-decoration:underline;cursor:pointer;font-family:inherit}' +
    '.seth-gate-code{display:none;gap:8px;margin-top:13px;flex-wrap:wrap}' +
    '.seth-gate-code.on{display:flex}' +
    '.seth-gate-code input{height:40px;padding:0 13px;border:1px solid rgba(221,176,88,.35);' +
    'border-radius:8px;font-size:15px;min-width:170px;background:rgba(0,0,0,.35);color:' + CREAM + '}' +
    '.seth-gate-code input::placeholder{color:rgba(242,234,220,.4)}' +
    '.seth-gate-code button{height:40px;padding:0 20px;border-radius:8px;border:0;' +
    'background:' + GOLD + ';color:#1a1206;font-weight:800;cursor:pointer;font-size:14px}' +
    '.seth-gate-msg{margin:9px 0 0;font-size:13px;min-height:1.2em;color:#ff9c9c}' +
    '.seth-gate-fine{margin:12px 0 0;font-size:12.5px;line-height:1.65;color:rgba(242,234,220,.45)}' +
    '.seth-gate-left{margin-top:10px;font-size:13px;color:rgba(242,234,220,.62)}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ── 產生一塊閘門面板 ─────────────────────────── */
  function panel(cfg) {
    var box = document.createElement('div');
    box.className = 'seth-gate';
    box.hidden = true;
    box.innerHTML =
      '<h4>' + cfg.title + '</h4>' +
      '<p>' + cfg.copy + '</p>' +
      '<div class="seth-gate-actions">' +
        '<a class="seth-gate-go" href="' + REG_BASE + '&utm_content=' + cfg.slug + '" ' +
          'data-cta="play" target="_blank" rel="nofollow sponsored noopener">' + cfg.cta + ' →</a>' +
        (cfg.line ? '<a class="seth-gate-line" href="' + LINE_URL + '" target="_blank" rel="noopener">加 LINE 拿解鎖碼</a>' : '') +
        '<button type="button" class="seth-gate-have">已經有解鎖碼</button>' +
      '</div>' +
      '<div class="seth-gate-code">' +
        '<input type="text" autocomplete="off" placeholder="輸入解鎖碼">' +
        '<button type="button">解鎖</button>' +
      '</div>' +
      '<p class="seth-gate-msg" role="status"></p>' +
      '<p class="seth-gate-fine">本頁含合作連結。工具的計算結果不受此影響，也不會因為你有沒有註冊而改變。18 歲以上適用。</p>';

    var codeRow = box.querySelector('.seth-gate-code');
    var input = codeRow.querySelector('input');
    var msg = box.querySelector('.seth-gate-msg');

    box.querySelector('.seth-gate-have').addEventListener('click', function () {
      codeRow.classList.add('on');
      input.focus();
    });
    function submit() {
      var v = input.value.trim().toLowerCase();
      if (v === CODES.dep) { grant('dep', cfg.tool); return; }
      if (v === CODES.reg && cfg.scope === 'reg') { grant('reg', cfg.tool); return; }
      msg.textContent = v === CODES.reg
        ? '這是註冊解鎖碼，這一項需要首儲後才會給的那一組。'
        : '解鎖碼不對。加 LINE 跟我們要。';
    }
    codeRow.querySelector('button').addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });

    return box;
  }

  function grant(scope, tool) {
    unlocked[scope] = true;
    write(UNLOCK_KEY, unlocked);
    try { if (scope === 'dep') localStorage.setItem(LEGACY_AI_KEY, '1'); } catch (e) {}
    track('tool_unlock', { tool_name: tool, unlock_scope: scope });
    refresh();
  }

  var gates = {};

  function show(tool) {
    var g = gates[tool];
    if (!g) return;
    g.hidden = false;
    track('tool_gate_hit', { tool_name: tool, free_uses: used(tool) });
    g.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ── ① 機制模擬器：3 次 ───────────────────────────
     什麼算「一次」：批次模擬與自動 50 轉。
     單轉、買免遊、重設不計次——那是看懂機制必要的操作，
     鎖掉的話這頁就從教學工具變成純廣告，反而留不住人。
     要改成連單轉也計次，把 id 加進下面這個陣列即可。 */
  var SIM_HEAVY = ['btn-batch', 'btn-auto'];

  function bindSim() {
    var host = document.querySelector('#pane-pre .batch-box');
    if (!host) return;
    gates.sim = panel({
      tool: 'sim', scope: 'reg', slug: 'gate-simulator',
      title: '模擬器免費試用已用完（' + LIMITS.sim + ' 次）',
      copy: '批次模擬與自動 50 轉是免費試用的部分，你已經用完 ' + LIMITS.sim + ' 次。' +
            '單轉、買免遊、以及下面的 800 萬轉實測統計不受影響，照常可以用。' +
            '在合作平台完成註冊後跟我們拿解鎖碼，就不再有次數限制。',
      cta: '前往平台註冊', line: true
    });
    host.parentNode.insertBefore(gates.sim, host);

    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b || SIM_HEAVY.indexOf(b.id) === -1) return;
      if (isUnlocked('reg')) return;
      if (used('sim') >= LIMITS.sim) {
        // 攔在捕獲階段，seth-hub.js 綁在按鈕上的 onclick 才不會跑掉
        e.preventDefault();
        e.stopPropagation();
        show('sim');
        return;
      }
      spend('sim');
      hint('sim');
    }, true);
  }

  /* ── ② 戰局計算：1 場 ─────────────────────────────
     計次點在「開始記錄這一場」的送出，不在結束。
     擋結束會讓人記到一半突然被鎖，資料還在畫面上卻動不了——
     那是最容易被罵詐騙的做法。第一場一定讓他完整跑完。 */
  function bindSession() {
    var form = $('setup-form');
    if (!form) return;
    gates.session = panel({
      tool: 'session', scope: 'reg', slug: 'gate-session',
      title: '戰局計算的免費試用是一場',
      copy: '你已經完整記錄過一場。想繼續記錄下一場，在合作平台完成註冊後跟我們拿解鎖碼。' +
            '已經記過的那一場資料還在你這台裝置上，不會消失。',
      cta: '前往平台註冊', line: true
    });
    /* 🔴 放進表單裡面，不要插在 form 前面。
       #setup-view 是雙欄格線（左文案／右表單），在它底下多塞一個子元素
       會多出一格，實測結果是面板疊在 h1 上、標題從半透明背景後面透出來。
       擺在送出鈕正上方也比較合理：擋的就是那顆鈕。 */
    form.insertBefore(gates.session, form.querySelector('button[type="submit"]'));

    /* 🔴 一定要綁在 document 而不是 form 上。
       submit 事件的 target 就是 form 本身，這種「at-target」情況下
       捕獲與冒泡兩種監聽器是依註冊順序執行的，捕獲不會比較早。
       seth-session.js 在頂層就綁好了，比這裡（DOMContentLoaded）早，
       綁在 form 上的話它會先跑完 startSession，攔截等於沒作用。
       綁在祖先節點才會進入真正的捕獲階段，stopPropagation 才擋得住。 */
    document.addEventListener('submit', function (e) {
      if (e.target !== form) return;
      if (isUnlocked('reg')) return;
      if (used('session') >= LIMITS.session) {
        e.preventDefault();
        e.stopPropagation();
        show('session');
        return;
      }
      spend('session');
    }, true);
  }

  /* ── ③ AI 選房：首儲 2,000 ────────────────────────
     這裡接管頁面上原本就有的 #claim-gate。
     🔴 seth-hub.js 裡的 bindGate() 必須同時拿掉——
     兩支程式搶同一個 #claim-submit，後綁的會蓋掉前面的，
     結果是舊碼還能解、新規則形同虛設，而且畫面上看不出任何異常。 */
  function bindAi() {
    var gate = $('claim-gate'), body = $('tool-body');
    if (!gate || !body) return;

    gate.innerHTML =
      '<div style="font-size:32px;line-height:1;margin-bottom:10px" aria-hidden="true">🔒</div>' +
      '<h3 style="margin:0 0 10px;font-size:17px;color:' + CREAM + '">AI 選房數據助手・首儲會員功能</h3>' +
      '<p style="margin:0 auto 16px;max-width:34em;font-size:14.5px;line-height:1.85;color:rgba(242,234,220,.72)">' +
        '這一項需要在合作平台完成註冊、並首次儲值滿 <b>2,000</b> 之後開啟。' +
        '加 LINE 報你的平台帳號，我們核對後給你解鎖碼。<br>' +
        '上面的群體實測排行不需要解鎖，任何人都看得到。' +
      '</p>' +
      '<div style="display:flex;gap:9px;justify-content:center;flex-wrap:wrap">' +
        '<a class="seth-gate-go" href="' + REG_BASE + '&utm_content=gate-ai-assistant" ' +
          'data-cta="play" target="_blank" rel="nofollow sponsored noopener">前往平台註冊 →</a>' +
        '<a class="seth-gate-line" href="' + LINE_URL + '" target="_blank" rel="noopener">加 LINE 拿解鎖碼</a>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:15px">' +
        '<input id="claim-code" class="seth-gate-input" type="text" autocomplete="off" placeholder="輸入解鎖碼" ' +
          'style="height:42px;padding:0 14px;border:1px solid rgba(221,176,88,.35);border-radius:8px;' +
          'font-size:15px;min-width:180px;background:rgba(0,0,0,.35);color:' + CREAM + '">' +
        '<button type="button" id="claim-submit" ' +
          'style="height:42px;padding:0 24px;border-radius:8px;border:0;background:' + GOLD + ';' +
          'color:#1a1206;font-weight:800;cursor:pointer">解鎖</button>' +
      '</div>' +
      '<p id="claim-msg" role="status" style="margin:11px 0 0;font-size:13.5px;min-height:1.2em;color:#ff9c9c"></p>' +
      '<p class="seth-gate-fine" style="text-align:center">本頁含合作連結。工具的計算結果不受此影響。18 歲以上適用。</p>';

    var btn = $('claim-submit'), inp = $('claim-code'), msg = $('claim-msg');
    function submit() {
      var v = inp.value.trim().toLowerCase();
      if (v === CODES.dep) { grant('dep', 'ai'); return; }
      msg.textContent = v === CODES.reg
        ? '這組是註冊解鎖碼，只能解開模擬器與戰局計算。這一項要首儲後的那一組。'
        : '解鎖碼不對。加 LINE 傳「AI助手」跟我們要。';
    }
    btn.addEventListener('click', submit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }

  /* 剩幾次的提示。放在按鈕旁邊，不另外跳訊息——
     「還剩 1 次」比事後才說「已用完」更早促成決定。 */
  function hint(tool) {
    var host = tool === 'sim' ? document.querySelector('#pane-pre .batch-box') : null;
    if (!host) return;
    var left = Math.max(0, LIMITS.sim - used('sim'));
    var tag = host.querySelector('.seth-gate-left');
    if (!tag) {
      tag = document.createElement('div');
      tag.className = 'seth-gate-left';
      host.appendChild(tag);
    }
    tag.textContent = isUnlocked('reg') ? '' :
      (left > 0 ? '免費試用還剩 ' + left + ' 次（單轉與買免遊不計次）' : '免費試用已用完');
  }

  function refresh() {
    Object.keys(gates).forEach(function (k) {
      var scope = k === 'ai' ? 'dep' : 'reg';
      if (isUnlocked(scope)) gates[k].hidden = true;
    });
    var gate = $('claim-gate'), body = $('tool-body');
    if (gate && body && isUnlocked('dep')) { gate.hidden = true; body.hidden = false; }
    hint('sim');
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindSim();
    bindSession();
    bindAi();
    refresh();
    track('tool_gate_state', {
      sim_used: used('sim'), session_used: used('session'),
      unlocked_scope: unlocked.dep ? 'deposit' : (unlocked.reg ? 'register' : 'none')
    });
  });
})();
