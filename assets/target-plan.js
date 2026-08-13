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
  syncMult(); render();
})();