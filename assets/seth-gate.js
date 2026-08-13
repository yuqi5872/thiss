/*
 * 賽特工具台 — 試用次數閘門
 * 2026-08-11 建立
 *
 * 三個工具三級門檻（2026-08-11 改為階梯制）：
 *   ① 機制模擬器      免費 3 次 → 完成註冊解鎖        （L1）
 *   ② 戰局計算        免費 1 場 → 當月累計存款 2,000 解鎖（L2）
 *   ③ AI 選房數據助手  一開始就鎖 → 當月累計存款 3,000（L3）
 *
 * 階梯是往下相容的：拿到 L3 的碼等於 ①②③ 全開，不用再給前兩組。
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
 * 發碼由 LINE bot 負責：使用者加 LINE 傳截圖 → bot 跑 OCR 判定 →
 * 自動回覆對應等級的碼。程式在 /Users/user/Desktop/YS89-專案整理/seth-unlock-bot/。
 *
 * 🔴 2026-08-12：解鎖碼改成每人一組隨機碼，不再是這裡寫死的字串。
 * 貼碼會打 REDEEM_API 去後端核對（seth-unlock-bot 的 /api/redeem），
 * 通過才回傳等級。這是為了擋轉傳分享——固定字串一旦外流，
 * 任何人貼上都能解鎖，跟後端無關；隨機碼＋伺服器核對＋兌換次數上限
 * 才能讓「轉傳出去的碼」用滿次數就失效。
 */
(function () {
  'use strict';

  /* ── 可調參數：要改就改這一段 ───────────────────── */
  var LIMITS = { sim: 3, session: 1 };          // 免費次數
  var REDEEM_API = 'https://seth-unlock-bot.ysyyds1688.workers.dev/api/redeem';
  /* 解鎖碼分三段輸入，不用打「-」。
     🔴 這個長度必須跟 seth-unlock-bot 的 worker.js 的 SEG_LENS 一字不差，
     否則貼碼自動分配到三格時會切錯位置，兌換一定失敗。 */
  var SEG_LENS = [3, 3, 2];
  /* 各工具需要的等級。0 = 完全免費，不擋。
     2026-08-13：機制模擬器改成免費（原本要註冊），
     把「註冊」這道門讓給分注打法——那個才是使用者真正想要的東西，
     拿它換註冊比拿模擬器換有力得多。 */
  var NEED = { sim: 0, session: 2, summary: 2, ai: 3 };
  var LEVEL_NAME = { 1: '完成註冊', 2: '當月累計存款 2,000', 3: '當月累計存款 3,000' };
  var LINE_URL = 'https://line.me/R/ti/p/@128zirab';
  /* 🔴 2026-08-13 從 368 體驗金改指首充 100%。
     原因（官方活動頁條款確認，不是推測）：首充活動規則第 1 條寫著
     「若有領取體驗金，請先完成體驗金流水以及出款成功後，才可參與首存活動」。
     368 要跑 30 倍流水（368×30＝NT$11,040）、滾到 ≥1,000 才出得了款，
     多數人中途輸光 → 永久喪失首充 100%（存 1000 送 1000、只要 1 倍流水）。

     而這個工具台的閘門本身就是靠儲值解鎖的（L2 累計存款 2,000、L3 累計存款 3,000）。
     先把人送去領 368 等於讓他之後儲值時付全額，而不是拿到加倍額度——
     是在跟自己的閘門作對。所以這站一律指首充。 */
  var REG_BASE = 'https://ys89.bet/activity/entry?url=/activity/detail/firstDeposit/NTD' +
                 '&proxy=dvjhkv&utm_source=tsaishen888&utm_medium=tool_gate&utm_campaign=first_deposit';
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
  /* 舊版的解鎖狀態要繼續認，已經拿過碼的人不能因為改版被鎖回去：
     舊 seth-room-unlocked（AI 已解）→ 直接視為 L3
     舊 {dep:true} → L3；舊 {reg:true} → L2（舊註冊碼本來就解得開①②） */
  try { if (localStorage.getItem(LEGACY_AI_KEY) === '1') unlocked.level = 3; } catch (e) {}
  if (unlocked.dep) unlocked.level = 3;
  else if (unlocked.reg && !unlocked.level) unlocked.level = 2;

  function level() { return Number(unlocked.level || 0); }
  function isUnlocked(tool) { return level() >= (NEED[tool] || 1); }
  function used(tool) { return Number(uses[tool] || 0); }
  function spend(tool) { uses[tool] = used(tool) + 1; write(USE_KEY, uses); }

  /* 向後端核對解鎖碼。回傳 {ok, level} 或 {ok:false, error}。
     error: 'invalid'=碼不對、'limit'=用滿兌換次數上限、'network'=連不上。 */
  function redeem(code) {
    return fetch(REDEEM_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code })
    }).then(function (r) {
      return r.json().then(function (data) { return { status: r.status, data: data }; });
    }).then(function (res) {
      if (res.data && res.data.ok) return { ok: true, level: Number(res.data.level) };
      return { ok: false, error: (res.data && res.data.error) || 'invalid' };
    }).catch(function () { return { ok: false, error: 'network' }; });
  }

  function redeemMsg(err) {
    if (err === 'limit') return '這組碼已經用滿裝置數上限。如果是你自己換裝置，加 LINE 說一聲，我們人工看。';
    if (err === 'network') return '連線失敗，稍後再試一次。';
    return '解鎖碼不對。加 LINE 傳截圖就會自動給你。';
  }

  /* ── 三格解鎖碼輸入 ────────────────────────────────
     碼是 3-3-2 分段（例：vh4-2pk-9c），不要求使用者自己打「-」：
     打完一格自動跳下一格，backspace 在空格會跳回上一格，
     整串貼上（含或不含 -）也會自動拆進三格。
     🔴 貼上的東西如果長度對不上標準格式（例如舊版固定碼
     seth-open-4k9m 這種較長字串），就整串原樣送出、不拆格——
     否則會把舊碼的 dash 位置切壞，明明碼是對的卻兌換失敗。 */
  function buildCodeBoxes() {
    var wrap = document.createElement('div');
    wrap.className = 'seth-gate-codewrap';
    var boxRow = document.createElement('div');
    boxRow.className = 'seth-gate-codeboxes';
    var override = null;
    var boxes = SEG_LENS.map(function (len) {
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.autocomplete = 'off';
      inp.setAttribute('inputmode', 'text');
      inp.maxLength = len;
      inp.className = 'seth-gate-box';
      boxRow.appendChild(inp);
      return inp;
    });
    var total = SEG_LENS.reduce(function (a, b) { return a + b; }, 0);

    /* 🔴 手動輸入的退路：三格是設計給「整串貼上」用的，靠手打把長度不固定的
       舊碼拆成三段會被每格的 maxlength 卡住（打字打到滿就卡住，長碼永遠打不完）。
       2026-08-12 兩位使用者都卡在這裡才發現——加一個能切換的單一欄位當備案。 */
    var fallbackWrap = document.createElement('div');
    fallbackWrap.className = 'seth-gate-fallback';
    fallbackWrap.hidden = true;
    var fallbackInput = document.createElement('input');
    fallbackInput.type = 'text';
    fallbackInput.autocomplete = 'off';
    fallbackInput.placeholder = '貼上完整解鎖碼';
    fallbackInput.className = 'seth-gate-fallback-input';
    fallbackWrap.appendChild(fallbackInput);
    fallbackInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') wrap.dispatchEvent(new CustomEvent('seth-submit'));
    });

    var usingFallback = false;
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'seth-gate-toggle';
    var TOGGLE_TO_FALLBACK = '碼比較長、貼不進三格？點這裡改用單一欄位';
    var TOGGLE_TO_BOXES = '改回三格輸入';
    toggle.textContent = TOGGLE_TO_FALLBACK;
    toggle.addEventListener('click', function () {
      usingFallback = !usingFallback;
      boxRow.hidden = usingFallback;
      toggle.textContent = usingFallback ? TOGGLE_TO_BOXES : TOGGLE_TO_FALLBACK;
      fallbackWrap.hidden = !usingFallback;
      if (usingFallback) fallbackInput.focus(); else boxes[0].focus();
    });

    boxes.forEach(function (inp, idx) {
      inp.addEventListener('input', function () {
        /* 🔴 一旦使用者開始手打，就要把「長碼不拆格」那條路留下的狀態全部解掉。
           下面 paste 的 else 分支會把第 2、3 格設成 readOnly；沒有這一行的話，
           那個 readOnly 永遠不會被解除——使用者清掉第一格重打，
           後面兩格就再也打不進去，只能重整頁面。
           2026-08-13 實際卡住才發現。 */
        if (override !== null || boxes.some(function (b) { return b.readOnly; })) {
          boxes.forEach(function (b, i) {
            b.readOnly = false;
            if (i !== idx && b.value === '✓') b.value = '';
          });
        }
        override = null;
        inp.value = inp.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, SEG_LENS[idx]);
        if (inp.value.length >= SEG_LENS[idx] && boxes[idx + 1]) boxes[idx + 1].focus();
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !inp.value && boxes[idx - 1]) boxes[idx - 1].focus();
        if (e.key === 'Enter') wrap.dispatchEvent(new CustomEvent('seth-submit'));
      });
      inp.addEventListener('paste', function (e) {
        var raw = (e.clipboardData || window.clipboardData).getData('text').trim().toLowerCase();
        var clean = raw.replace(/[^a-z0-9]/g, '');
        e.preventDefault();
        if (clean.length === total) {
          var pos = 0;
          boxes.forEach(function (b, i) { b.value = clean.slice(pos, pos + SEG_LENS[i]); pos += SEG_LENS[i]; });
          override = null;
          boxes[boxes.length - 1].focus();
        } else {
          // 長度對不上標準格式：當作一組完整的碼直接用，不拆格
          override = raw;
          boxes.forEach(function (b, i) { b.value = i === 0 ? '✓' : ''; b.readOnly = i !== 0; });
        }
      });
    });

    wrap.appendChild(boxRow);
    wrap.appendChild(toggle);
    wrap.appendChild(fallbackWrap);

    wrap.getCode = function () {
      if (usingFallback) return fallbackInput.value.trim().toLowerCase();
      return override || boxes.map(function (b) { return b.value; }).join('-');
    };
    wrap.reset = function () {
      override = null;
      boxes.forEach(function (b) { b.value = ''; b.readOnly = false; });
      fallbackInput.value = '';
    };
    wrap.focusFirst = function () { boxes[0].focus(); };
    return wrap;
  }

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
    /* text-align 要自己指定：結算畫面是置中的，繼承下來會讓整段文字置中，
       多行內文置中很難讀。 */
    'border-radius:12px;padding:20px 22px;margin:14px 0;background:#0f1420;text-align:left}' +
    '.seth-gate[hidden]{display:none}' +
    '.seth-gate h4{margin:0 0 7px;font-size:16px;font-weight:800;line-height:1.4;color:' + CREAM + '}' +
    '.seth-gate p{margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(242,234,220,.72)}' +
    '.seth-gate b{color:' + CREAM + '}' +
    '.seth-gate-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center}' +
    '.seth-gate-go{display:inline-block;padding:11px 20px;border-radius:9px;background:' + GOLD + ';' +
    'color:#1a1206;font-weight:800;text-decoration:none;font-size:14.5px}' +
    '.seth-gate-line{display:inline-block;padding:11px 18px;border-radius:9px;background:#06c755;' +
    'color:#fff;font-weight:700;text-decoration:none;font-size:14px}' +
    '.seth-gate-have{display:block;margin:16px 0 7px;font-size:13px;color:rgba(242,234,220,.62)}' +
    '.seth-gate-code{display:flex;gap:10px;flex-wrap:wrap;align-items:center}' +
    '.seth-gate-codewrap{display:flex;flex-direction:column;gap:6px;flex:1;min-width:200px}' +
    '.seth-gate-codeboxes{display:flex;gap:7px;align-items:center}' +
    '.seth-gate-box{width:42px;height:40px;padding:0;text-align:center;' +
    'font-size:16px;font-weight:800;letter-spacing:.5px;text-transform:lowercase;' +
    'border:1px solid rgba(221,176,88,.35);border-radius:8px;' +
    'background:rgba(0,0,0,.35);color:' + CREAM + '}' +
    '.seth-gate-box:focus{outline:none;border-color:' + GOLD + '}' +
    '.seth-gate-toggle{background:none;border:0;padding:0;margin:0;text-align:left;' +
    'font-size:12px;color:rgba(242,234,220,.5);text-decoration:underline;' +
    'cursor:pointer;width:fit-content;font-family:inherit}' +
    '.seth-gate-fallback-input{height:40px;padding:0 13px;border:1px solid rgba(221,176,88,.35);' +
    'border-radius:8px;font-size:15px;background:rgba(0,0,0,.35);color:' + CREAM + ';' +
    'width:100%;max-width:260px}' +
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
      '</div>' +
      /* 🔴 輸入框一定要常駐，不要藏在「已經有解鎖碼」的切換後面。
         第一版藏起來了，結果是：使用者去加 LINE、拿到碼、回到頁面，
         畫面上找不到任何可以輸入的地方——整條轉化在最後一步斷掉，
         而且完全沒有錯誤訊息，我們也不會知道有人卡在這裡。 */
      '<span class="seth-gate-have">拿到解鎖碼了？貼在這裡</span>' +
      '<div class="seth-gate-code">' +
        '<span class="seth-gate-boxslot"></span>' +
        '<button type="button">解鎖</button>' +
      '</div>' +
      '<p class="seth-gate-msg" role="status"></p>' +
      '<p class="seth-gate-fine">本頁含合作連結。工具的計算結果不受此影響，也不會因為你有沒有註冊而改變。18 歲以上適用。</p>';

    var codeRow = box.querySelector('.seth-gate-code');
    var boxes = buildCodeBoxes();
    codeRow.querySelector('.seth-gate-boxslot').replaceWith(boxes);
    var msg = box.querySelector('.seth-gate-msg');

    var btn = codeRow.querySelector('button');
    function submit() {
      var v = boxes.getCode();
      if (!v) return;
      btn.disabled = true; btn.textContent = '核對中…';
      redeem(v).then(function (res) {
        btn.disabled = false; btn.textContent = '解鎖';
        if (!res.ok) { msg.textContent = redeemMsg(res.error); return; }
        var got = res.level;
        /* 等級不夠時要講清楚差在哪一級，不要只說「碼不對」——
           碼是我們發的，講「不對」會讓人以為系統壞了而不是等級不夠。 */
        if (got < NEED[cfg.tool]) {
          msg.textContent = '這組是「' + LEVEL_NAME[got] + '」的解鎖碼，只能解開前面的工具。' +
                            '這一項需要「' + LEVEL_NAME[NEED[cfg.tool]] + '」的那一組。';
        }
        boxes.reset();
        grant(got, cfg.tool);      // 還是要收下，該解的前面那幾項照解
      });
    }
    btn.addEventListener('click', submit);
    boxes.addEventListener('seth-submit', submit);

    return box;
  }

  function grant(lv, tool) {
    if (lv <= level()) { refresh(); return; }      // 不降級：已經 L3 的人貼 L1 的碼不該被降回去
    unlocked.level = lv;
    write(UNLOCK_KEY, unlocked);
    try { if (lv >= 3) localStorage.setItem(LEGACY_AI_KEY, '1'); } catch (e) {}
    track('tool_unlock', { tool_name: tool, unlock_level: lv });
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
     計次的是批次模擬與自動 50 轉這兩個「一次跑很多轉」的動作。
     單轉與買免遊不計次，但這不代表它們永遠免費——

     🔴 2026-08-11 修正：次數用完之後，模擬器的每一顆按鈕都要鎖。
     第一版只擋 SIM_HEAVY，結果閘門已經跳出來了，旋轉跟買免遊還能按，
     使用者一路轉到 103 轉——畫面上寫著「試用已用完」，手上卻還在用，
     那不是寬容，那是文案在說謊。
     所以計次範圍（SIM_HEAVY）跟封鎖範圍（SIM_ALL）是兩件事，分開列。 */
  var SIM_HEAVY = ['btn-batch', 'btn-auto'];                       // 這兩個會消耗次數
  var SIM_ALL = ['btn-batch', 'btn-auto', 'btn-spin', 'btn-buy',   // 用完後這些全鎖
                 'btn-reset', 'btn-apply'];

  function bindSim() {
    var host = document.querySelector('#pane-pre .batch-box');
    if (!host) return;
    gates.sim = panel({
      tool: 'sim', slug: 'gate-simulator',
      title: '模擬器免費試用已用完（' + LIMITS.sim + ' 次）',
      copy: '模擬器已經停用。下面的 800 萬轉實測統計、機制說明與常見問題不受影響，' +
            '照常看得到。在合作平台完成註冊後跟我們拿解鎖碼，就不再有次數限制。',
      cta: '前往註冊・首充送 1000', line: true
    });
    host.parentNode.insertBefore(gates.sim, host);

    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b || SIM_ALL.indexOf(b.id) === -1) return;
      if (isUnlocked('sim')) return;
      if (used('sim') >= LIMITS.sim) {
        // 攔在捕獲階段，seth-hub.js 綁在按鈕上的 onclick 才不會跑掉
        e.preventDefault();
        e.stopPropagation();
        show('sim');
        return;
      }
      if (SIM_HEAVY.indexOf(b.id) === -1) return;   // 單轉與買免遊放行，但不計次
      spend('sim');
      lockSim();
      hint('sim');
    }, true);
  }

  /* 次數用完就把按鈕變成停用的樣子。
     只擋點擊、按鈕看起來卻還是能按，使用者會以為是工具壞了而不是被鎖。 */
  function lockSim() {
    var off = !isUnlocked('sim') && used('sim') >= LIMITS.sim;
    SIM_ALL.forEach(function (id) {
      var b = $(id);
      if (!b) return;
      b.style.opacity = off ? '.4' : '';
      b.style.cursor = off ? 'not-allowed' : '';
      if (off) b.setAttribute('title', '免費試用已用完，註冊後解鎖');
      else b.removeAttribute('title');
      b.setAttribute('aria-disabled', off ? 'true' : 'false');
    });
    var msg = $('msg');
    if (off && msg) msg.textContent = '免費試用已用完，模擬器已停用。註冊後輸入解鎖碼即可繼續。';
  }

  /* ── ② 戰局計算：1 場 ─────────────────────────────
     計次點在「開始記錄這一場」的送出，不在結束。
     擋結束會讓人記到一半突然被鎖，資料還在畫面上卻動不了——
     那是最容易被罵詐騙的做法。第一場一定讓他完整跑完，含結算。

     ── 為什麼閘門主要放在結算畫面 ──────────────────
     這個工具跟模擬器不一樣：使用者是「正在真的玩」的時候在用它。
     價值最高的一秒是按下「結束本場」、螢幕出現「本場淨虧 $500、
     最大回撤 35%」的那一刻——那個數字是他自己輸入的，不是我們講的。
     所以 CTA 放在那裡，而不是等他隔幾天回來、填完一整張表才擋。

     舊做法（只擋送出）的實際動線是：按「開始新的場次」→ 回到表單 →
     把本金注額重填一次 → 按送出 → 才被告知不能用。
     填完表才被擋是最讓人火大的順序，所以改成按下去當場擋。
     送出那道攔截保留當後備，處理直接重整或還原場次的情況。 */
  var SUMMARY_COPY = {
    loss: {
      title: '這場的錢已經花掉了，下一場之前先把上限寫下來',
      copy: '工具能做的只有把數字算清楚：這場的最大回撤與停損使用率都在上面。' +
            '下一場開局前先決定輸到多少就停，並選擇有公開標示 RTP、出金流程透明的平台。'
    },
    win: {
      title: '要不要見好就收，是你的決定',
      copy: '這場的淨利是把回收扣掉本金與買免遊成本之後的真實數字，不是單次回收。' +
            '要繼續的話，記得下一場一樣先設好停損——上一場賺不會讓下一場比較容易。'
    },
    flat: {
      title: '打平也是結果，下一場記得先設停損',
      copy: '選擇有公開標示 RTP、出金流程透明的平台，並在開局前就把預算上限寫下來。'
    }
  };

  /* 依本場結果改寫結算卡片的文案。
     接著使用者剛看到的數字講，比通用廣告詞有說服力得多。 */
  function personalizeSummary() {
    var t = $('summary-cta-title'), c = $('summary-cta-copy'), r = $('summary-result');
    if (!t || !c || !r) return;
    var txt = r.textContent || '';
    var key = txt.indexOf('−') === 0 ? 'loss' : (/^\+\$?0(\.0+)?$/.test(txt) ? 'flat' : 'win');
    t.textContent = SUMMARY_COPY[key].title;
    c.textContent = SUMMARY_COPY[key].copy;
    track('session_summary_cta', { result_bucket: key });
  }

  function bindSession() {
    var form = $('setup-form');
    if (!form) return;
    gates.session = panel({
      tool: 'session', slug: 'gate-session',
      title: '戰局計算的免費試用是一場',
      copy: '你已經完整記錄過一場。想繼續記錄下一場，需要在合作平台<b>單月累計存款滿 2,000</b>——' +
            '加 LINE 傳一張後台截圖，系統核對後會自動給你解鎖碼。' +
            '已經記過的那一場資料還在你這台裝置上，不會消失。',
      cta: '前往註冊・首充送 1000', line: true
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
      if (isUnlocked('session')) return;
      if (used('session') >= LIMITS.session) {
        e.preventDefault();
        e.stopPropagation();
        show('session');
        return;
      }
      spend('session');
    }, true);

    /* 結算畫面：本場結果一出來就把 CTA 文案換成貼著這場數字講的版本，
       並在「開始新的場次」那顆鈕上擋——不要讓他回表單重填一次才被擋。 */
    gates.summary = panel({
      tool: 'summary', slug: 'gate-session-summary',
      title: '這一場是免費完整記錄的那一場',
      copy: '上面這場的數字會留在你這台裝置上，隨時回來都看得到。' +
            '要開始記錄新的一場，需要在合作平台<b>單月累計存款滿 2,000</b>——' +
            '加 LINE 傳一張後台截圖，系統核對後會自動給你解鎖碼。',
      cta: '前往註冊・首充送 1000', line: true
    });
    var reset = $('reset-session');
    reset.parentNode.insertBefore(gates.summary, reset);

    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b) return;
      if (b.id === 'end-session') {
        // 結算畫面是 endSession 同步畫好的，但保險起見等一個 tick 再讀
        setTimeout(personalizeSummary, 30);
        return;
      }
      if (b.id !== 'reset-session') return;
      if (isUnlocked('session')) return;
      if (used('session') >= LIMITS.session) {
        e.preventDefault();
        e.stopPropagation();
        show('summary');
      }
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
      '<h3 style="margin:0 0 10px;font-size:17px;color:' + CREAM + '">AI 選房數據助手・單月存款 3,000 開啟</h3>' +
      '<p style="margin:0 auto 16px;max-width:34em;font-size:14.5px;line-height:1.85;color:rgba(242,234,220,.72)">' +
        '這一項需要在合作平台完成註冊、且<b>單月累計存款滿 3,000</b> 之後開啟。' +
        '加 LINE 傳一張平台後台截圖，系統核對後會自動給你解鎖碼。<br>' +
        '上面的群體實測排行不需要解鎖，任何人都看得到。' +
      '</p>' +
      '<div style="display:flex;gap:9px;justify-content:center;flex-wrap:wrap">' +
        '<a class="seth-gate-go" href="' + REG_BASE + '&utm_content=gate-ai-assistant" ' +
          'data-cta="play" target="_blank" rel="nofollow sponsored noopener">前往註冊・首充送 1000 →</a>' +
        '<a class="seth-gate-line" href="' + LINE_URL + '" target="_blank" rel="noopener">加 LINE 拿解鎖碼</a>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:15px" id="claim-boxslot">' +
        '<button type="button" id="claim-submit" ' +
          'style="height:42px;padding:0 24px;border-radius:8px;border:0;background:' + GOLD + ';' +
          'color:#1a1206;font-weight:800;cursor:pointer">解鎖</button>' +
      '</div>' +
      '<p id="claim-msg" role="status" style="margin:11px 0 0;font-size:13.5px;min-height:1.2em;color:#ff9c9c"></p>' +
      '<p class="seth-gate-fine" style="text-align:center">本頁含合作連結。工具的計算結果不受此影響。18 歲以上適用。</p>';

    var btn = $('claim-submit'), msg = $('claim-msg');
    var boxes = buildCodeBoxes();
    $('claim-boxslot').insertBefore(boxes, btn);
    function submit() {
      var v = boxes.getCode();
      if (!v) return;
      btn.disabled = true; btn.textContent = '核對中…';
      redeem(v).then(function (res) {
        btn.disabled = false; btn.textContent = '解鎖';
        if (!res.ok) { msg.textContent = redeemMsg(res.error); return; }
        var got = res.level;
        if (got < NEED.ai) {
          msg.textContent = '這組是「' + LEVEL_NAME[got] + '」的解鎖碼，只能解開前面的工具。' +
                            '這一項需要「' + LEVEL_NAME[NEED.ai] + '」的那一組。';
        }
        boxes.reset();
        grant(got, 'ai');
      });
    }
    btn.addEventListener('click', submit);
    boxes.addEventListener('seth-submit', submit);
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
    tag.textContent = isUnlocked('sim') ? '' :
      (left > 0 ? '免費試用還剩 ' + left + ' 次（批次模擬與自動 50 轉計次，用完後模擬器會停用）'
                : '免費試用已用完，模擬器已停用');
  }

  function refresh() {
    Object.keys(gates).forEach(function (k) {
      if (isUnlocked(k)) gates[k].hidden = true;
    });
    var gate = $('claim-gate'), body = $('tool-body');
    if (gate && body && isUnlocked('ai')) { gate.hidden = true; body.hidden = false; }
    lockSim();
    hint('sim');
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindSim();
    bindSession();
    bindAi();
    refresh();
    track('tool_gate_state', {
      sim_used: used('sim'), session_used: used('session'),
      unlock_level: level()
    });
  });
})();
