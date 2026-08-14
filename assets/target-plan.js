/* 分注打法產生器 — 共用邏輯
 * ─────────────────────────────────────────────
 * 🔴 這支同時被兩個地方用：
 *      /tools/storm-of-seth-session/  （工具台的第 ⓪ 分頁，唯一的所在地）
 *    2026-08-13：原本還有一個 /tools/target-plan/ 獨立頁，內容一模一樣。
 *    同一個工具兩個網址沒有意義，已刪除並 301 導到工具台 #plan。
 *    以後要加新的擺放位置之前先想清楚：多一個網址就多一份會漂移的東西。
 *
 * 依賴：assets/target-grid.js 先載入（TARGET_GRID / TARGET_META）
 *       assets/target-plan.css 提供 .tp-* 樣式
 * 找不到 #tp-bank 就靜默跳過，不影響宿主頁面其他功能。
 */
(function () {
  'use strict';
  var G = window.TARGET_GRID;                 // { 倍數: { 分注份數: {p, med} } }
  var RATIOS = [1000, 500, 200, 100, 50, 20]; // 滑桿由細到粗
  var MULTS = [1.5, 2, 3, 5];
  var SAVE = 'seth-target-plan-v1';


  /* ── 註冊閘門 ──────────────────────────────────────
     🔴 跟 seth-gate.js / handbook-gate.js 共用同一組 localStorage key
        與同一支 REDEEM_API。已經拿過任何等級的碼就直接開，不用再要一次。
     2026-08-13：分注打法從「免費」改成「註冊解鎖」，機制模擬器則改成免費。
     理由是這個才是使用者真正想要的東西，拿它換註冊比拿模擬器換有力。 */
  var UNLOCK_KEY = 'seth-gate-unlock-v1';
  var LEGACY_AI_KEY = 'seth-room-unlocked';
  var REDEEM_API = 'https://seth-unlock-bot.ysyyds1688.workers.dev/api/redeem';
  var NEED_LEVEL = 2;                                  // 當月累計存款 2,000
  var LINE_URL = 'https://line.me/R/ti/p/@806ugpjh';   // 發碼的 bot 在這個帳號（2026-08-14 從小夜 @128zirab 搬過來）
  var REG_URL = 'https://ys89.bet/activity/entry?url=/activity/detail/firstDeposit/NTD'
              + '&proxy=dvjhkv&utm_source=tsaishen888&utm_medium=tool_gate'
              + '&utm_campaign=first_deposit&utm_content=target-plan';

  function readUnlock() {
    var u = {};
    try { u = JSON.parse(localStorage.getItem(UNLOCK_KEY)) || {}; } catch (e) {}
    try { if (localStorage.getItem(LEGACY_AI_KEY) === '1') u.level = 3; } catch (e) {}
    if (u.dep) u.level = 3; else if (u.reg && !u.level) u.level = 2;
    return u;
  }
  var unlocked = readUnlock();
  function lvl() { return Number(unlocked.level || 0); }

  /* ── 免費試用一次 ────────────────────────────────
     跟 seth-gate.js 共用同一個計次 key，所以「用過幾次」是全站一致的。
     計次時機＝第一次真的把打法卡算出來的那一刻（含重新整理都算用掉），
     所以使用者會完整看到一次結果，下次再來才鎖。
     🔴 這是軟鎖：清 localStorage 就重來。它的工作不是擋住所有人，
        是在「已經看過一次覺得有用」的那一刻給一個去儲值的理由。 */
  var USE_KEY = 'seth-gate-uses-v1';
  var TRIAL = 1;
  function uses() { try { return JSON.parse(localStorage.getItem(USE_KEY)) || {}; } catch (e) { return {}; } }
  function usedCount() { return Number(uses().tp || 0); }
  function spendTrial() {
    var u = uses(); u.tp = (Number(u.tp) || 0) + 1;
    try { localStorage.setItem(USE_KEY, JSON.stringify(u)); } catch (e) {}
    if (typeof gtag === 'function') gtag('event', 'target_plan_trial', { used: u.tp });
  }
  var trialSpent = false;
  function open_() {
    if (lvl() >= NEED_LEVEL) return true;
    if (usedCount() < TRIAL) {
      if (!trialSpent) { trialSpent = true; spendTrial(); }
      return true;                       // 試用中：完整顯示
    }
    return false;
  }
  function inTrial() { return lvl() < NEED_LEVEL; }

  function buildGate() {
    var host = document.querySelector('.tp');
    if (!host || document.getElementById('tp-gate')) return;
    var g = document.createElement('div');
    g.className = 'tp-gate';
    g.id = 'tp-gate';
    g.innerHTML =
      '<h3>打法卡需要當月累計存款 2,000 才看得到</h3>'
    + '<p>在合作平台完成註冊、且當月累計存款滿 2,000 之後，加 LINE 傳一張截圖，'
    + '系統核對後會自動給你解鎖碼。'
    + '已經拿過解鎖碼的人，貼上就直接開。</p>'
    + '<div class="btns">'
    +   '<a class="reg" href="' + REG_URL + '" target="_blank" rel="nofollow sponsored noopener">前往平台註冊 →</a>'
    +   '<a class="line" href="' + LINE_URL + '" target="_blank" rel="noopener">加 LINE 拿解鎖碼</a>'
    + '</div>'
    + '<div class="row"><input id="tp-code" type="text" autocomplete="off" placeholder="貼上解鎖碼">'
    +   '<button type="button" id="tp-unlock">解鎖</button></div>'
    + '<p class="note" id="tp-gate-note"></p>';
    var card = host.querySelector('.tp-card');
    if (card) host.insertBefore(g, card); else host.appendChild(g);

    g.querySelector('.reg').addEventListener('click', function () {
      if (typeof gtag === 'function') gtag('event', 'reg_intent', { source: 'target_plan_gate' });
    });
    g.querySelector('.line').addEventListener('click', function () {
      if (typeof gtag === 'function') gtag('event', 'line_intent', { source: 'target_plan_gate' });
    });

    var inp = document.getElementById('tp-code');
    var btn = document.getElementById('tp-unlock');
    var note = document.getElementById('tp-gate-note');
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
          try {
            localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocked));
            localStorage.setItem('seth-gate-code-v1', code);   // 完整攻略要靠這個碼跟後端要內容
          } catch (e) {}
          if (typeof gtag === 'function') gtag('event', 'target_plan_unlock', { level: d.level });
          applyGate(); note.textContent = '';
        })
        .catch(function () { btn.disabled = false; note.textContent = '連線失敗，稍後再試一次。'; });
    }
    btn.addEventListener('click', submit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }



  /* ── 給戰局計算用的達標率 ───────────────────────────
     🔴 分注打法算完之後，把「本金／目標／建議押注」交給戰局計算，
        讓它在使用者更新餘額時即時重算達標率。
        算法跟打法卡完全一樣，只是把 (本金, 目標) 換成 (目前餘額, 目標)——
        不要另外發明一套，兩邊給不同數字最傷信任。

     cell() 只在倍數那一軸內插，分注份數必須是表上的鍵。
     戰局計算傳進來的是「餘額÷押注」的任意數字，所以要二維內插。 */
  function cellAt(mult, ratio) {
    var R = RATIOS.slice().sort(function (a, b) { return a - b; });
    if (ratio <= R[0]) return cell(mult, R[0]);
    if (ratio >= R[R.length - 1]) return cell(mult, R[R.length - 1]);
    for (var i = 0; i < R.length - 1; i++) {
      if (ratio >= R[i] && ratio <= R[i + 1]) {
        var a = cell(mult, R[i]), b = cell(mult, R[i + 1]);
        var f = (ratio - R[i]) / (R[i + 1] - R[i]);
        return { p: a.p + (b.p - a.p) * f, med: Math.round(a.med + (b.med - a.med) * f) };
      }
    }
    return cell(mult, R[R.length - 1]);
  }

  window.SethPlan = {
    MIN_BET: MIN_BET,
    /* 目前餘額 bal、目標 goal、實際押注 bet → { p, med }；算不出來回 null */
    liveOdds: function (bal, goal, bet) {
      if (!(bal > 0) || !(bet > 0) || !(goal > bal)) return null;
      var c = cellAt(Math.min(5, Math.max(1.5, goal / bal)), bal / bet);
      return c ? { p: c.p, med: c.med } : null;
    },
    /* 打法卡目前算出來的配置，給戰局計算當預設值 */
    current: function () {
      var bank = parseFloat($('tp-bank').value), goal = parseFloat($('tp-goal').value);
      if (!(bank > 0) || !(goal > bank)) return null;
      var plan = pickPlan(Math.min(5, Math.max(1.5, goal / bank)), bank);
      return { bank: bank, goal: goal, bet: Math.max(MIN_BET, bank / plan.best.ratio),
               ratio: plan.best.ratio, p: plan.best.p };
    }
  };

  function applyGate() {
    var host = document.querySelector('.tp');
    if (!host) return;
    var ok = open_();
    host.classList.toggle('tp-locked', !ok);
    if (!ok) buildGate();
    var g = document.getElementById('tp-gate');
    if (g) g.style.display = ok ? 'none' : '';

    /* 試用中就講清楚這是試用，不要讓人以為本來就免費、下次回來才發現被鎖 */
    var b = document.getElementById('tp-trial');
    if (ok && inTrial()) {
      if (!b) {
        b = document.createElement('div');
        b.className = 'tp-warn'; b.id = 'tp-trial';
        var card = host.querySelector('.tp-card');
        if (card) host.insertBefore(b, card);
      }
      b.innerHTML = '<b>這是免費試用的一次。</b>離開這一頁之後就會鎖起來——'
        + '要一直用得到，需要在合作平台<b>當月累計存款滿 2,000</b>。';
      b.style.display = '';
    } else if (b) { b.style.display = 'none'; }

  }

  var $ = function (id) { return document.getElementById(id); };
  if (!G || !$('tp-bank') || !$('tp-goal')) return;   // 宿主頁沒放這個工具就跳過
  var money = function (n) { return Math.round(n).toLocaleString('en-US'); };
  var betText = function (n) { return n >= 10 ? money(n) : (Math.round(n * 10) / 10).toString(); };

  /* 在兩個相鄰倍數之間內插；超出 1.5～5 倍就夾住不外推 */
  function cell(mult, ratio) {
    var lo = MULTS[0], hi = MULTS[MULTS.length - 1];
    if (mult <= lo) return G[lo][ratio];
    if (mult >= hi) return G[hi][ratio];
    for (var i = 0; i < MULTS.length - 1; i++) {
      var a = MULTS[i], b = MULTS[i + 1];
      if (mult >= a && mult <= b) {
        var f = (mult - a) / (b - a);
        return { p: G[a][ratio].p + (G[b][ratio].p - G[a][ratio].p) * f,
                 med: Math.round(G[a][ratio].med + (G[b][ratio].med - G[a][ratio].med) * f) };
      }
    }
    return G[hi][ratio];
  }

  var META = window.TARGET_META;

  /* 🔴 遊戲的最低押注。2026-08-13 user 實測回報：戰神賽特最低就是 10 元。
     這個限制會直接卡死「本金能切多少份」——本金 1,000 最多只能切 100 份，
     要切到 500 份得有 5,000 元。之前沒有這個限制，工具會建議押 1 元，
     那是遊戲根本按不下去的數字，整張打法卡等於廢的。
     如果之後遊戲改了最低押注，只要改這一個數字。 */
  var MIN_BET = 10;

  /* 🔴 最佳分注份數會隨目標倍數移動，不能寫死。
     實測：打 5 倍時切 1000 份（11.9%）反而輸給切 500 份（12.6%），
     因為分太細會在還沒摸到大分之前就把轉數耗光。所以要按目標挑。 */
  function pickPlan(mult, bank) {
    var maxRatio = bank > 0 ? bank / MIN_BET : Infinity;   // 本金最多切幾份
    var rows = RATIOS.filter(function (r) { return r <= maxRatio; }).map(function (r) {
      var c = cell(mult, r); return { ratio: r, p: c.p, med: c.med };
    });
    if (!rows.length) {          // 本金連最粗的分注都切不出來
      var r0 = RATIOS.slice().sort(function (a, b) { return a - b; })[0];
      var c0 = cell(mult, r0);
      return { best: { ratio: r0, p: c0.p, med: c0.med }, quick: null, rows: [], tooSmall: true };
    }
    var best = rows.slice().sort(function (a, b) { return b.p - a.p; })[0];
    // 「兼顧時間」：在一場打得完的轉數內，達標率最高的那個
    var fits = rows.filter(function (x) { return x.med <= META.practicalSpins; })
                   .sort(function (a, b) { return b.p - a.p; });
    var quick = fits.length ? fits[0] : null;
    if (quick && quick.ratio === best.ratio) quick = null;
    return { best: best, quick: quick, rows: rows, maxRatio: maxRatio };
  }

  function render() {
    var bank = parseFloat($('tp-bank').value);
    var goal = parseFloat($('tp-goal').value);
    if (!(bank > 0) || !(goal > bank)) {
      $('tp-bet').textContent = '—'; $('tp-rate').textContent = '目標要大於本金';
      $('tp-spins').textContent = '—'; $('tp-take').textContent = '—'; $('tp-stop').textContent = '—';
      $('tp-cmp').innerHTML = ''; $('tp-cta').innerHTML = ''; return;
    }
    var mult = goal / bank;
    var multClamped = Math.min(5, Math.max(1.5, mult));

    /* ── 打法卡：按目標挑最佳分注 ── */
    var plan = pickPlan(multClamped, bank);
    var BEST = plan.best.ratio;
    var bet = bank / BEST;
    var c = { p: plan.best.p, med: plan.best.med };
    $('tp-bet').innerHTML = betText(bet) + ' <small>元／轉</small>';
    $('tp-rate').textContent = '達標率 ' + (c.p * 100).toFixed(1) + '%';
    $('tp-spins').innerHTML = '約 ' + money(c.med) + ' 轉'
      + (c.med >= 1000 ? '<br><span style="font-size:12.5px;font-weight:700;color:#b45309">這是一場長仗，撐住不加注就是打法本身</span>' : '');
    $('tp-take').textContent = money(goal) + ' 元';
    $('tp-stop').textContent = money(bank * 0.2) + ' 元';
    $('tp-tag').textContent = '本金切 ' + BEST + ' 份';

    var alt = $('tp-alt');
    if (plan.quick) {
      alt.style.display = '';
      alt.innerHTML = '<b>沒那麼多時間？</b>改押 <b>' + betText(bank / plan.quick.ratio) + ' 元</b>'
        + '（切 ' + plan.quick.ratio + ' 份），約 ' + money(plan.quick.med) + ' 轉就會分出結果，'
        + '達標率 <b>' + (plan.quick.p * 100).toFixed(1) + '%</b>。';
    } else { alt.style.display = 'none'; }

    /* ── 滑桿：換分注份數看達標率怎麼變 ── */
    var si = parseInt($('tp-slider').value, 10);
    var sr = RATIOS[si];
    var sb = bank / sr;
    var sc = cell(multClamped, sr);
    $('tp-sl-bet').textContent = betText(sb);
    var w = $('tp-warn');
    if (sb < MIN_BET) {
      w.className = 'tp-warn';
      w.innerHTML = '切成 ' + sr + ' 份是每注 <b>' + betText(sb) + ' 元</b>，'
        + '低於遊戲最低押注 ' + MIN_BET + ' 元，<b>按不下去</b>。'
        + '要用這個份數，本金需要 ' + money(sr * MIN_BET) + ' 元。';
    } else if (sr >= BEST) {
      w.className = 'tp-warn ok';
      w.innerHTML = '押 <b>' + betText(sb) + ' 元</b>（本金切 ' + sr + ' 份）→ 達標率 <b>'
        + (sc.p * 100).toFixed(1) + '%</b>。這是最好的那一區。';
    } else {
      var drop = ((c.p - sc.p) / c.p * 100);
      w.className = 'tp-warn';
      w.innerHTML = '押 <b>' + betText(sb) + ' 元</b>（本金切 ' + sr + ' 份）→ 達標率掉到 <b>'
        + (sc.p * 100).toFixed(1) + '%</b>，比建議押注<b>少 ' + drop.toFixed(0) + '%</b>。';
    }

    /* ── 對照表 ── */
    $('tp-cmp-sub').textContent = '本金 ' + money(bank) + ' 元，目標 ' + money(goal)
      + ' 元（' + (Math.round(mult * 10) / 10) + ' 倍）'
      + (mult > 5 ? '　※ 超過 5 倍的部分用 5 倍的模擬值' : mult < 1.5 ? '　※ 低於 1.5 倍的部分用 1.5 倍的模擬值' : '');
    $('tp-cmp').innerHTML = RATIOS.map(function (r) {
      var x = cell(multClamped, r);
      var me = (r === BEST) ? ' class="me"' : '';
      return '<tr' + me + '><td>' + betText(bank / r) + ' 元</td>'
        + '<td data-l="切幾份">' + r + ' 份</td>'
        + '<td data-l="達標率">' + (x.p * 100).toFixed(1) + '%</td>'
        + '<td data-l="中位數轉數">' + money(x.med) + ' 轉</td></tr>';
    }).join('');

    /* ── 本金切不到 500 份就提醒（真實遊戲有最低押注） ── */
    /* 本金被最低押注卡住時，講清楚差多少錢、差多少達標率。
       這不是話術，是這個遊戲的實際限制：最低押注 10 元，
       所以本金決定你能切多細，而切多細直接決定達標率。 */
    var ideal = RATIOS.map(function (r) { return { r: r, p: cell(multClamped, r).p }; })
                  .sort(function (a, b) { return b.p - a.p; })[0];
    if (ideal && ideal.r > BEST) {
      var needBank = ideal.r * MIN_BET;
      var gain = (ideal.p - c.p) * 100;
      $('tp-cta').innerHTML = '<div class="tp-warn" style="text-align:left">'
        + '<b>你的本金 ' + money(bank) + ' 元、最低押注 ' + MIN_BET + ' 元，最多只能切成 '
        + Math.floor(bank / MIN_BET) + ' 份。</b><br>'
        + '這個目標最好的分注是 <b>' + ideal.r + ' 份</b>（達標率 ' + (ideal.p * 100).toFixed(1) + '%），'
        + '要切到那麼細，本金需要 <b>' + money(needBank) + ' 元</b>——'
        + '差距是 <b>' + gain.toFixed(1) + ' 個百分點</b>。</div>';
    } else { $('tp-cta').innerHTML = ''; }

    try { localStorage.setItem(SAVE, JSON.stringify({ bank: bank, goal: goal })); } catch (e) {}
    if (typeof gtag === 'function') gtag('event', 'target_plan_calc', { mult: Math.round(mult * 10) / 10, bank: bank });
  }

  /* 倍數快捷鍵 */
  $('tp-mult').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var bank = parseFloat($('tp-bank').value) || 1000;
    $('tp-goal').value = Math.round(bank * parseFloat(b.getAttribute('data-m')));
    syncMult(); render();
  });
  function syncMult() {
    var bank = parseFloat($('tp-bank').value), goal = parseFloat($('tp-goal').value);
    var m = (bank > 0) ? goal / bank : 0;
    document.querySelectorAll('#tp-mult button').forEach(function (b) {
      b.classList.toggle('on', Math.abs(parseFloat(b.getAttribute('data-m')) - m) < 0.01);
    });
  }
  ['tp-bank', 'tp-goal'].forEach(function (id) {
    $(id).addEventListener('input', function () { syncMult(); render(); });
  });
  $('tp-slider').addEventListener('input', render);

  try {
    var s = JSON.parse(localStorage.getItem(SAVE));
    if (s && s.bank > 0 && s.goal > s.bank) { $('tp-bank').value = s.bank; $('tp-goal').value = s.goal; }
  } catch (e) {}
  syncMult(); render(); applyGate();
})();