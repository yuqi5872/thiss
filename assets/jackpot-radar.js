/* 彩金水位判讀 — 邏輯
 * 依賴 assets/jackpot-log.js（觀測資料）與 assets/jackpot-radar.css。
 * 宿主頁面沒有 #jr-go 就靜默跳過，不影響其他分頁。
 */
(function () {
  'use strict';
  var L = window.JACKPOT_LOG;
  if (!L || !document.getElementById('jr-go')) return;   // 宿主頁沒放這個工具就跳過
  var $ = function (id) { return document.getElementById(id); };
  var n = function (v) { return v == null ? '—'
    : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var sgn = function (v) { return v == null ? '—' : (v > 0 ? '+' : '') + n(v); };

  /* ── 觀測到的區間 ──────────────────────────────
     🔴 只有「我們親眼看過重置」的池子才算得出有意義的高低點。
        GRAND 與 MAJOR 在整個觀測期間一次都沒重置過，所以它們的
        「最低」只是我們開始記錄的那一刻，不是真正的底。
        這種情況要誠實講「還沒看過重置」，不能假裝算得出位置。 */
  var POOLS = [
    { k: 'grand', nm: 'GRAND', cls: 'g' },
    { k: 'major', nm: 'MAJOR', cls: 'a' },
    { k: 'minor', nm: 'MINOR', cls: 'i' },
    { k: 'mini',  nm: 'MINI',  cls: 'm' }
  ];
  var SEEN_RESET = { minor: true, mini: true };   // 觀測期內看過重置的池子

  function band(k) {
    var v = L.snapshots.map(function (x) { return x[k]; }).filter(function (x) { return x != null; });
    if (!v.length) return null;
    return { lo: Math.min.apply(null, v), hi: Math.max.apply(null, v), n: v.length };
  }

  function judge(k, val) {
    var b = band(k);
    if (!b) return { known: false };
    if (!SEEN_RESET[k]) {
      /* 沒看過重置：只能講「比我們記錄過的高／低」，不能講在區間哪裡 */
      return { known: false, aboveMax: val > b.hi, hi: b.hi, lo: b.lo };
    }
    var lo = b.lo, hi = Math.max(b.hi, val);
    var pos = hi > lo ? (val - lo) / (hi - lo) : 1;
    return { known: true, pos: pos, lo: lo, hi: hi };
  }


  /* 還要多久才會回到我們看過的高點。
     四池以每小時約 187 元累積（由「四池都沒重置」的觀測區間實測），
     所以差額除以速度就是時數。這是這頁最實用的一句話——
     它把一次性判讀變成「幾點回來看」。
     🔴 這是「以目前累積速度推算」，不是預測誰會中。
        中途被人打掉就重來，畫面上要講清楚。 */
  function eta(cur, hi, nm) {
    var gap = hi - cur;
    if (gap <= 0) return '';
    var hrs = gap / L.ratePerHour;
    var txt = hrs < 1 ? Math.round(hrs * 60) + ' 分鐘'
            : hrs < 48 ? hrs.toFixed(1) + ' 小時'
            : (hrs / 24).toFixed(1) + ' 天';
    return '<br><br><b>以目前每小時約 ' + L.ratePerHour.toLocaleString('en-US') + ' 元的累積速度算，'
         + nm + ' 大約再 ' + txt + ' 會回到我們看過的高點</b>（還差 ' + n(gap) + '）。'
         + '中途被人打掉就會重來，所以這是下限不是保證。';
  }


  /* ── 儲值 3,000 解鎖 ──────────────────────────────
     🔴 跟站上其他工具共用同一組 localStorage key 與 REDEEM_API，
        已經拿過等級 3 的碼就直接開。
     刻意讓「輸入四個數字」保持免費：他打完數字才撞到門，
     那時候已經投入了，比一進來就擋住有力得多。 */
  var UNLOCK_KEY = 'seth-gate-unlock-v1';
  var LEGACY_AI_KEY = 'seth-room-unlocked';
  var REDEEM_API = 'https://seth-unlock-bot.ysyyds1688.workers.dev/api/redeem';
  var NEED_LEVEL = 3;
  var LINE_URL = 'https://line.me/R/ti/p/@806ugpjh';
  var REG_URL = 'https://ys89.bet/activity/entry?url=/activity/detail/firstDeposit/NTD'
              + '&proxy=dvjhkv&utm_source=tsaishen888&utm_medium=tool_gate'
              + '&utm_campaign=first_deposit&utm_content=jackpot-radar';

  var unlocked = (function () {
    var u = {};
    try { u = JSON.parse(localStorage.getItem(UNLOCK_KEY)) || {}; } catch (e) {}
    try { if (localStorage.getItem(LEGACY_AI_KEY) === '1') u.level = 3; } catch (e) {}
    if (u.dep) u.level = 3; else if (u.reg && !u.level) u.level = 2;
    return u;
  })();
  /* ── 免費判讀一次 ────────────────────────────────
     跟 seth-gate.js 共用同一個計次 key，全站的「用過幾次」一致。
     按下「判讀」而且真的算出結果才算用掉一次，不是打開頁面就算。
     🔴 軟鎖，清 localStorage 就重來——擋的是猶豫的人，不是決心繞過的人。 */
  var USE_KEY = 'seth-gate-uses-v1';
  var TRIAL = 1;
  function uses() { try { return JSON.parse(localStorage.getItem(USE_KEY)) || {}; } catch (e) { return {}; } }
  function usedCount() { return Number(uses().jr || 0); }
  function spendTrial() {
    var u = uses(); u.jr = (Number(u.jr) || 0) + 1;
    try { localStorage.setItem(USE_KEY, JSON.stringify(u)); } catch (e) {}
    if (typeof gtag === 'function') gtag('event', 'radar_trial', { used: u.jr });
  }
  function paid() { return Number(unlocked.level || 0) >= NEED_LEVEL; }
  function opened() { return paid() || usedCount() < TRIAL; }

  function showGate() {
    if ($('jr-gate')) { $('jr-gate').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    var g = document.createElement('div');
    g.className = 'jr-gate'; g.id = 'jr-gate';
    g.innerHTML =
      '<h3>判讀需要當月累計存款 3,000</h3>'
    + '<p>這是站上唯一能告訴你「現在該不該打」的東西，也是我們自己每天在累積的資料。'
    + '完成註冊、當月累計存款滿 3,000 之後，加 LINE 傳一張截圖就會自動給你解鎖碼。</p>'
    + '<div class="btns">'
    +   '<a class="reg" href="' + REG_URL + '" target="_blank" rel="nofollow sponsored noopener">前往平台註冊 →</a>'
    +   '<a class="line" href="' + LINE_URL + '" target="_blank" rel="noopener">加 LINE 拿解鎖碼</a>'
    + '</div>'
    + '<div class="row"><input id="jr-code" type="text" autocomplete="off" placeholder="貼上解鎖碼">'
    +   '<button type="button" id="jr-unlock">解鎖</button></div>'
    + '<p class="note" id="jr-gate-note"></p>';
    $('jr-out').parentNode.insertBefore(g, $('jr-out'));

    g.querySelector('.reg').addEventListener('click', function () {
      if (typeof gtag === 'function') gtag('event', 'reg_intent', { source: 'jackpot_radar_gate' });
    });
    g.querySelector('.line').addEventListener('click', function () {
      if (typeof gtag === 'function') gtag('event', 'line_intent', { source: 'jackpot_radar_gate' });
    });
    var inp = $('jr-code'), btn = $('jr-unlock'), note = $('jr-gate-note');
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
          if (Number(d.level) < NEED_LEVEL) {
            note.textContent = '這組碼是「' + (d.level === 1 ? '完成註冊' : '當月累計存款 2,000')
              + '」等級的。彩金判讀需要 3,000 的那一組。';
            return;
          }
          if (typeof gtag === 'function') gtag('event', 'radar_unlock', { level: d.level });
          g.remove(); note.textContent = ''; run();
        })
        .catch(function () { btn.disabled = false; note.textContent = '連線失敗，稍後再試一次。'; });
    }
    btn.addEventListener('click', submit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    g.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function readAll() {
    var o = {};
    POOLS.forEach(function (p) { o[p.k] = parseFloat($('in-' + p.k).value); });
    return o;
  }

  function run() {
    var vals = readAll();
    var filled = POOLS.filter(function (p) { return vals[p.k] > 0; });
    if (!filled.length) { alert('至少填一個數字。遊戲畫面最上面那排就是。'); return; }
    if (!opened()) {
      try { localStorage.setItem('seth-jp-last', JSON.stringify(vals)); } catch (e) {}
      if (typeof gtag === 'function') gtag('event', 'radar_gate_hit', {});
      showGate(); return;
    }

    /* 判讀每一個池子 */
    var rows = filled.map(function (p) {
      var j = judge(p.k, vals[p.k]);
      return { p: p, val: vals[p.k], j: j };
    });

    /* 主結論：在「看得出位置」的池子裡挑位置最高的那個 */
    var ranked = rows.filter(function (r) { return r.j.known; })
                     .sort(function (a, b) { return b.j.pos - a.j.pos; });
    var verdict, why, cls;
    if (ranked.length && ranked[0].j.pos >= 0.6) {
      var t = ranked[0];
      cls = 'go'; verdict = '值得打';
      why = '<b>' + t.p.nm + ' 現在 ' + n(t.val) + '</b>，在我們記錄過的區間偏高的位置'
          + '（我們看過的最低是 ' + n(t.j.lo) + '）。四個池子裡它離爆點最近——要追就追這個。'
          + (t.val < t.j.hi ? eta(t.val, t.j.hi, t.p.nm) : '');
    } else if (ranked.length) {
      var b0 = ranked[0];
      cls = 'wait'; verdict = '現在打會拿得比較少';
      why = '看得出位置的池子都偏低。<b>' + b0.p.nm + ' 現在 ' + n(b0.val)
          + '</b>，我們記錄過最高到 ' + n(b0.j.hi) + '——現在中了，拿到的彩金會小很多。'
          + eta(b0.val, b0.j.hi, b0.p.nm);
    } else {
      cls = 'wait'; verdict = '還判讀不出來';
      why = '你填的池子我們都還沒觀測到重置，算不出高低位置。'
          + '填 MINOR 或 MINI 看看——那兩個我們有完整的重置紀錄。';
    }

    /* GRAND 特別提示：它從沒被打掉過 */
    if (vals.grand > 0) {
      var g = judge('grand', vals.grand);
      why += '<br><br><b>GRAND ' + n(vals.grand) + '：</b>'
           + (g.aboveMax
               ? '比我們記錄過的最高（' + n(g.hi) + '）還高。我們觀測期間它一次都沒被打掉，一直在漲。'
               : '我們記錄過的範圍是 ' + n(g.lo) + ' ～ ' + n(g.hi) + '，觀測期間沒看過它被打掉。')
           + '它的重置底值目前全網沒有人知道，我們還在累積。';
    }

    $('jr-call2').innerHTML = '<div class="verdict ' + cls + '">' + verdict + '</div>'
                            + '<p class="why">' + why + '</p>';

    $('jr-bars').innerHTML = rows.map(function (r) {
      var j = r.j;
      var pos = j.known ? Math.max(0, Math.min(1, j.pos)) : (j.aboveMax ? 1 : 0.5);
      var lab = j.known
        ? '我們看過的區間 ' + n(j.lo) + ' ～ ' + n(j.hi)
        : '尚未觀測到重置，這條只代表「跟我們記錄過的比」';
      return '<div class="jr-brow ' + r.p.cls + '">'
        + '<div class="jr-btop"><span class="nm">' + r.p.nm + '</span><b>' + n(r.val) + '</b></div>'
        + '<div class="jr-track"><i style="width:' + (pos * 100).toFixed(1) + '%"></i></div>'
        + '<div class="jr-blab">' + lab + '</div></div>';
    }).join('');

    $('jr-out-note').innerHTML = '判讀基準來自我們目前累積的 ' + L.snapshots.length
      + ' 筆實測紀錄（觀測 ' + L.observedHours + ' 小時）。<b>你每填一次，基準就更準一點。</b>'
      + '四個池子各自以每小時約 ' + L.ratePerHour.toLocaleString('en-US') + ' 元累積。';

    $('jr-out').hidden = false;

    /* 試用中：算出結果才扣次數，並講清楚下次就鎖了 */
    if (!paid()) {
      spendTrial();
      var t = $('jr-trial');
      if (!t) {
        t = document.createElement('div');
        t.className = 'jr-trialbar'; t.id = 'jr-trial';
        $('jr-out').parentNode.insertBefore(t, $('jr-out').nextSibling);
      }
      t.innerHTML = '<b>這是免費判讀的一次。</b>下次再按就會鎖起來——'
        + '要一直用得到，需要在合作平台<b>當月累計存款滿 3,000</b>。';
    }

    /* 把讀數留下來：本機記住＋送進 GA4，之後就有真實的水位分布可以算 */
    try { localStorage.setItem('seth-jp-last', JSON.stringify(vals)); } catch (e) {}
    if (typeof gtag === 'function') {
      gtag('event', 'jackpot_reading', {
        grand: Math.round(vals.grand || 0), major: Math.round(vals.major || 0),
        minor: Math.round(vals.minor || 0), mini: Math.round(vals.mini || 0),
        verdict: cls
      });
    }
    $('jr-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('jr-go').addEventListener('click', run);
  POOLS.forEach(function (p) {
    $('in-' + p.k).addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
  });
  /* 帶回上次填的，回訪不用重打 */
  try {
    var last = JSON.parse(localStorage.getItem('seth-jp-last'));
    if (last) POOLS.forEach(function (p) { if (last[p.k] > 0) $('in-' + p.k).value = last[p.k]; });
  } catch (e) {}

  /* ── 下面是原有的觀測紀錄，維持不變 ── */
  document.getElementById('jr-intervals').innerHTML = L.intervals.map(function (v) {
    var period = v.from.slice(5) + ' → ' + v.to.slice(5);
    return '<tr><td>' + period + '</td>'
      + '<td data-l="GRAND">' + sgn(v.grand) + '</td>'
      + '<td data-l="MAJOR">' + sgn(v.major) + '</td>'
      + '<td data-l="MINOR">' + sgn(v.minor) + '</td>'
      + '<td data-l="MINI">' + sgn(v.mini) + '</td></tr>';
  }).join('');

  document.getElementById('jr-resets').innerHTML = '<b>已確認的重置事件：</b><br>'
    + L.resets.map(function (r) {
        return '・' + r.pool + '　' + r.window
             + (r.drop != null ? '　掉落 <b>' + n(r.drop) + '</b>' : '')
             + '<br>　<span style="font-size:13px;opacity:.8">' + r.method + '</span>';
      }).join('<br>');

  var a = document.querySelector('[data-cta="line-radar"]');
  if (a) a.addEventListener('click', function () {
    if (typeof gtag === 'function') gtag('event', 'line_intent', { source: 'jackpot_radar' });
  });
})();