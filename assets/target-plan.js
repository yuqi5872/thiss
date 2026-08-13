/* 分注打法產生器 — 共用邏輯
 * ─────────────────────────────────────────────
 * 🔴 這支同時被兩個地方用：
 *      /tools/target-plan/            （獨立頁，吃搜尋流量與廣告落地）
 *      /tools/storm-of-seth-session/  （三合一工具台的第 ⓪ 分頁）
 *    兩邊的 HTML 結構、element id、class 必須完全一致。要改就改這一支，
 *    不要在任何一頁另外複製一份——複製出來的兩份一定會漂移，
 *    然後同一個工具在兩個頁面給出不同建議。
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
  var NEED_LEVEL = 1;                                  // 完成註冊
  var LINE_URL = 'https://line.me/R/ti/p/@128zirab';   // 發碼的 bot 在這個帳號
  var REG_URL = 'https://ys89.bet/activity/entry?url=/activity/detail/RegistrationBonus/NTD'
              + '&proxy=dvjhkv&utm_source=tsaishen888&utm_medium=tool_gate'
              + '&utm_campaign=ys368&utm_content=target-plan';

  function readUnlock() {
    var u = {};
    try { u = JSON.parse(localStorage.getItem(UNLOCK_KEY)) || {}; } catch (e) {}
    try { if (localStorage.getItem(LEGACY_AI_KEY) === '1') u.level = 3; } catch (e) {}
    if (u.dep) u.level = 3; else if (u.reg && !u.level) u.level = 2;
    return u;
  }
  var unlocked = readUnlock();
  function lvl() { return Number(unlocked.level || 0); }
  function open_() { return lvl() >= NEED_LEVEL; }

  function buildGate() {
    var host = document.querySelector('.tp');
    if (!host || document.getElementById('tp-gate')) return;
    var g = document.createElement('div');
    g.className = 'tp-gate';
    g.id = 'tp-gate';
    g.innerHTML =
      '<h3>打法卡需要完成註冊才看得到</h3>'
    + '<p>在合作平台完成註冊之後，加 LINE 傳一張截圖，系統核對後會自動給你解鎖碼。'
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
          try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocked)); } catch (e) {}
          if (typeof gtag === 'function') gtag('event', 'target_plan_unlock', { level: d.level });
          applyGate(); note.textContent = '';
        })
        .catch(function () { btn.disabled = false; note.textContent = '連線失敗，稍後再試一次。'; });
    }
    btn.addEventListener('click', submit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }


  /* ══════════ 照打法追蹤（儲值 2,000 解鎖）══════════
     這一段跟前面的打法卡最大的差別：卡片是「開打前算一次」，
     追蹤是「開打之後每次更新餘額都重算」。
     核心價值是那個會動的達標率——它從你「現在的餘額」重算，
     所以打到一半你會看到自己的機率是漲還是掉，這是靜態卡片給不了的。

     🔴 達標率的算法跟卡片完全一樣，只是把 (本金, 目標) 換成
        (目前餘額, 目標)。不要另外發明一套算法，兩邊給不同數字最傷信任。 */
  var TRACK_LEVEL = 2;                       // 當月累計存款 2,000
  var SESS_KEY = 'seth-plan-session-v1';
  var HIST_KEY = 'seth-plan-history-v1';

  function loadJSON(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var sess = loadJSON(SESS_KEY, null);
  var hist = loadJSON(HIST_KEY, []);

  function trackOpen() { return lvl() >= TRACK_LEVEL; }

  function ensureTracker() {
    var host = document.querySelector('.tp');
    if (!host || document.getElementById('tp-track')) return;
    var box = document.createElement('div');
    box.className = 'tk';
    box.id = 'tp-track';
    var cmp = host.querySelector('.tp-cmp');
    if (cmp && cmp.nextSibling) host.insertBefore(box, cmp.nextSibling);
    else host.appendChild(box);
  }

  /* 🔴 cell() 只在「倍數」那一軸內插，分注份數必須剛好是表上的鍵
     （20/50/100/200/500/1000）。打法卡沒問題，因為卡片用的份數就是表上挑的；
     但追蹤時的份數是「目前餘額 ÷ 押注」，是任意數字——直接丟給 cell()
     會拿到 undefined，整個 render 當場拋錯，狀態存了但畫面不動。
     所以這裡要在份數那一軸也做內插。 */
  function cellAt(mult, ratio) {
    var R = RATIOS.slice().sort(function (a, b) { return a - b; });   // 由小到大
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

  /* 從「目前餘額」重算達標率與剩餘轉數 */
  function liveStats(bal, goal, bet) {
    if (!(bal > 0) || !(bet > 0) || !(goal > 0)) return null;
    if (bal >= goal) return { done: true, p: 1, med: 0, ratio: bal / bet };
    var mult = Math.min(5, Math.max(1.5, goal / bal));
    var c = cellAt(mult, bal / bet);
    if (!c) return null;
    return { done: false, p: c.p, med: c.med, ratio: bal / bet, mult: goal / bal };
  }

  function renderTracker() {
    ensureTracker();
    var box = document.getElementById('tp-track');
    if (!box) return;

    if (!trackOpen()) {
      box.innerHTML =
        '<div class="tk-hd"><span>照打法追蹤</span><span>當月累計存款 2,000</span></div>'
      + '<div class="tk-body"><div class="tk-start">'
      + '<p>打法卡是<b>開打前算一次</b>。追蹤是<b>開打之後每次更新餘額都重算</b>——'
      + '你會看到自己的達標率是漲還是掉、押注有沒有偏離、還要打幾轉。<br>'
      + '打完存起來，下次可以比對哪一場打得最好。</p>'
      + '<a class="tk-btn" href="' + LINE_URL + '" target="_blank" rel="noopener" data-cta="line-track">加 LINE 拿解鎖碼</a>'
      + '</div></div>';
      var a = box.querySelector('[data-cta="line-track"]');
      if (a) a.addEventListener('click', function () {
        if (typeof gtag === 'function') gtag('event', 'line_intent', { source: 'plan_tracker' });
      });
      return;
    }

    if (!sess) {
      var bank = parseFloat($('tp-bank').value), goal = parseFloat($('tp-goal').value);
      var okStart = bank > 0 && goal > bank;
      box.innerHTML =
        '<div class="tk-hd"><span>照打法追蹤</span><span>已解鎖</span></div>'
      + '<div class="tk-body"><div class="tk-start">'
      + '<p>按下去之後，每打一段就回來更新餘額。'
      + '工具會用<b>你現在的餘額</b>重算達標率，讓你知道自己還在不在軌道上。</p>'
      + (okStart
          ? '<button type="button" class="tk-btn" id="tk-begin">開始這一場</button>'
          : '<p style="color:#b45309"><b>先在上面填好本金與目標</b>，才能開始。</p>')
      + '</div>' + histHtml() + '</div>';
      var b = $('tk-begin');
      if (b) b.addEventListener('click', function () {
        var plan = pickPlan(Math.min(5, Math.max(1.5, goal / bank)));
        sess = { start: bank, goal: goal, bet: bank / plan.best.ratio, ratio: plan.best.ratio,
                 bal: bank, spins: 0, startP: plan.best.p, log: [] };
        saveJSON(SESS_KEY, sess);
        if (typeof gtag === 'function') gtag('event', 'plan_track_start', { bank: bank, goal: goal });
        renderTracker();
      });
      return;
    }

    /* 進行中
       🔴 達標率一定要用「使用者實際押的注」算，不是用建議押注。
          用建議押注算的話，他把注拉大 20 倍畫面上的數字也不會動——
          那整個追蹤就白做了，因為這個工具唯一要阻止的就是中途加注。 */
    var actualNow = sess.actualBet || sess.bet;
    var st = liveStats(sess.bal, sess.goal, actualNow);
    var stIdeal = liveStats(sess.bal, sess.goal, sess.bet);
    var pct = st ? Math.round(st.p * 100) : 0;
    var delta = st ? (st.p - sess.startP) * 100 : 0;
    var prog = Math.max(0, Math.min(100, (sess.bal - sess.start) / (sess.goal - sess.start) * 100));
    var dCls = delta > 1 ? 'tk-up' : delta < -1 ? 'tk-dn' : 'tk-flat';
    var dTxt = st && st.done ? '已達標'
             : (delta > 0 ? '↑ 比開打時高 ' : delta < 0 ? '↓ 比開打時低 ' : '跟開打時一樣 ')
               + (delta ? Math.abs(delta).toFixed(1) + ' 個百分點' : '');

    /* 押注偏離：使用者實際押的 vs 打法建議的 */
    var devHtml = '';
    var actual = actualNow;
    var times = actual / sess.bet;
    var lost = (stIdeal && st) ? (stIdeal.p - st.p) * 100 : 0;
    if (times >= 1.5) {
      devHtml = '<div class="tk-warn">你實際押 <b>' + betText(actual) + ' 元</b>，是建議的 <b>'
              + times.toFixed(1) + ' 倍</b>。'
              + (lost > 0.5
                  ? '照建議押 ' + betText(sess.bet) + ' 元會是 <b>' + Math.round(stIdeal.p * 100)
                    + '%</b>，你現在是 <b>' + Math.round(st.p * 100) + '%</b>——'
                    + '光是加注就少了 ' + lost.toFixed(1) + ' 個百分點。'
                  : '押大會把達標率往下拉。')
              + '這是這套打法最容易被自己毀掉的地方。</div>';
    } else if (times <= 0.9) {
      devHtml = '<div class="tk-warn ok">你押得比建議更小（' + betText(actual) + ' 元），'
              + '達標率比建議的再高一點，代價是要打更久。</div>';
    } else {
      devHtml = '<div class="tk-warn ok">押注還在打法內，繼續。</div>';
    }

    box.innerHTML =
      '<div class="tk-hd"><span>這一場・進行中</span><span>目標 ' + money(sess.goal) + ' 元</span></div>'
    + '<div class="tk-body"><div class="tk-live">'
    + '<div class="big"><div class="k">現在的達標率</div>'
    +   '<div class="v ' + (st && st.done ? 'tk-up' : '') + '">' + (st && st.done ? '達標' : pct + '%') + '</div>'
    +   '<div class="d ' + dCls + '">' + dTxt + '</div></div>'
    + '<div class="tk-bar"><i style="width:' + prog.toFixed(1) + '%"></i></div>'
    + '<div class="tk-barlab"><span>' + money(sess.start) + '</span>'
    +   '<span>現在 ' + money(sess.bal) + '（進度 ' + prog.toFixed(0) + '%）</span>'
    +   '<span>' + money(sess.goal) + '</span></div>'
    + '<div class="tk-cells">'
    +   '<div class="tk-cell"><div class="k">建議押注</div><div class="v">' + betText(sess.bet) + ' 元</div></div>'
    +   '<div class="tk-cell"><div class="k">從現在起還要打</div><div class="v">'
    +     (st && st.done ? '—' : '約 ' + money(st ? st.med : 0) + ' 轉') + '</div></div>'
    + '</div>'
    + devHtml
    + '<div class="tk-form">'
    +   '<div><label for="tk-bal">目前餘額</label><input id="tk-bal" type="number" inputmode="decimal" value="' + sess.bal + '"></div>'
    +   '<div><label for="tk-bet">實際押注</label><input id="tk-bet" type="number" inputmode="decimal" value="' + actual + '"></div>'
    +   '<button type="button" class="tk-btn" id="tk-update">更新</button>'
    + '</div>'
    + '<div class="tk-acts">'
    +   '<button type="button" class="tk-btn ghost" id="tk-end">結束這一場</button>'
    + '</div>'
    + '</div>' + histHtml() + '</div>';

    $('tk-update').addEventListener('click', function () {
      var nb = parseFloat($('tk-bal').value), nbet = parseFloat($('tk-bet').value);
      if (!(nb >= 0)) return;
      sess.bal = nb;
      if (nbet > 0) sess.actualBet = nbet;
      sess.log.push({ bal: nb, bet: sess.actualBet || sess.bet });
      saveJSON(SESS_KEY, sess);
      if (typeof gtag === 'function') gtag('event', 'plan_track_update', { pct: pct });
      renderTracker();
    });
    $('tk-end').addEventListener('click', function () {
      hist.unshift({ start: sess.start, goal: sess.goal, bet: sess.bet, end: sess.bal,
                     hit: sess.bal >= sess.goal, updates: sess.log.length });
      hist = hist.slice(0, 12);
      saveJSON(HIST_KEY, hist);
      sess = null; saveJSON(SESS_KEY, null);
      if (typeof gtag === 'function') gtag('event', 'plan_track_end', {});
      renderTracker();
    });
  }

  function histHtml() {
    if (!hist.length) return '';
    return '<div class="tk-hist"><h4>過去的場次</h4>'
      + hist.map(function (h) {
          return '<div class="row"><span>' + money(h.start) + ' → ' + money(h.goal) + '　押 ' + betText(h.bet) + '</span>'
               + '<span class="' + (h.hit ? 'ok' : 'no') + '">'
               + (h.hit ? '達標' : '收在 ' + money(h.end)) + '</span></div>';
        }).join('')
      + '</div>';
  }

  function applyGate() {
    var host = document.querySelector('.tp');
    if (!host) return;
    var ok = open_();
    host.classList.toggle('tp-locked', !ok);
    if (!ok) buildGate();
    var g = document.getElementById('tp-gate');
    if (g) g.style.display = ok ? 'none' : '';
    renderTracker();
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

  /* 🔴 最佳分注份數會隨目標倍數移動，不能寫死。
     實測：打 5 倍時切 1000 份（11.9%）反而輸給切 500 份（12.6%），
     因為分太細會在還沒摸到大分之前就把轉數耗光。所以要按目標挑。 */
  function pickPlan(mult) {
    var rows = RATIOS.map(function (r) {
      var c = cell(mult, r); return { ratio: r, p: c.p, med: c.med };
    });
    var best = rows.slice().sort(function (a, b) { return b.p - a.p; })[0];
    // 「兼顧時間」：在一場打得完的轉數內，達標率最高的那個
    var fits = rows.filter(function (x) { return x.med <= META.practicalSpins; })
                   .sort(function (a, b) { return b.p - a.p; });
    var quick = fits.length ? fits[0] : null;
    if (quick && quick.ratio === best.ratio) quick = null;
    return { best: best, quick: quick, rows: rows };
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
    var plan = pickPlan(multClamped);
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
    if (sr >= BEST) {
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
    if (bet < 1) {
      $('tp-cta').innerHTML = '<div class="tp-warn" style="text-align:left">'
        + '你的本金切成 500 份是每注 <b>' + betText(bet) + ' 元</b>，可能低於遊戲的最低押注。'
        + '要用到建議的分注份數，本金至少要 <b>' + money(BEST) + ' 元</b>。</div>'
        + '<a href="/line/?ch=plan&at=tool" data-cta="line-tp" style="margin-top:12px">加 LINE 拿完整打法對照表</a>';
      var a = $('tp-cta').querySelector('a');
      if (a) a.addEventListener('click', function () {
        if (typeof gtag === 'function') gtag('event', 'line_intent', { source: 'target_plan' });
      });
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