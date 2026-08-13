/* 領回饋試算 — 邏輯
 * ─────────────────────────────────────────────
 * 這是站上唯一一個「答案是確定金額、不是機率」的工具：
 * 返水按投注量給、首充按存款給，兩個都不含運氣成分。
 *
 * 依賴 assets/bonus-data.js（條款）與 assets/bonus-calc.css。
 * 宿主頁沒有 #bc-turnover 就靜默跳過。
 *
 * 🔴 所有數字一律從 BONUS_DATA 讀，不要在這支裡寫死任何金額或倍數。
 *    條款改了只改資料檔，這支不用動。
 */
(function () {
  'use strict';
  var D = window.BONUS_DATA;
  var $ = function (id) { return document.getElementById(id); };
  if (!D || !$('bc-turnover')) return;

  var EDGE = 1 - D.rtp;                        // 莊家優勢：多打 1 元的期望損失
  var money = function (n) { return Math.round(n).toLocaleString('en-US'); };

  /* 目前投注量落在哪一檔（回傳 {cash, tier} ；沒到最低檔回 cash 0） */
  function currentTier(t) {
    var got = { cash: 0, turnover: 0 };
    D.rebate.tiers.forEach(function (x) { if (t >= x.turnover) got = x; });
    return got;
  }
  function nextTier(t) {
    for (var i = 0; i < D.rebate.tiers.length; i++) {
      if (t < D.rebate.tiers[i].turnover) return D.rebate.tiers[i];
    }
    return null;                                // 已經在最高檔
  }

  function renderRebate() {
    var t = parseFloat($('bc-turnover').value);
    var out = $('bc-rebate-out');
    if (!(t >= 0)) { out.innerHTML = '<p class="bc-hint">填今天已經打了多少投注。</p>'; return; }

    var now = currentTier(t), nxt = nextTier(t);
    var html = '';

    /* 現在能領多少 */
    if (now.cash > 0) {
      var net = now.cash - (now.cash * D.rebate.wagerMultiple * EDGE);   // 扣掉 3 倍流水的期望損失
      html += '<div class="bc-big"><div class="k">今天現在能領</div>'
        + '<div class="v ok">' + money(now.cash) + ' 元</div>'
        + '<div class="n">投注 ' + money(t) + ' 已達 ' + money(now.turnover) + ' 這一檔'
        + '　·　實際回饋率 ' + (now.cash / t * 100).toFixed(3) + '%</div></div>';
      html += '<div class="bc-note">領到的彩金要完成 <b>' + D.rebate.wagerMultiple
        + ' 倍流水</b>才能提款，那段流水的期望損失約 '
        + money(now.cash * D.rebate.wagerMultiple * EDGE) + ' 元——'
        + '<b>實際到手約 ' + money(net) + ' 元</b>。</div>';
    } else {
      html += '<div class="bc-big"><div class="k">今天現在能領</div>'
        + '<div class="v zero">0 元</div>'
        + '<div class="n">最低一檔是投注 ' + money(D.rebate.tiers[0].turnover) + '</div></div>';
    }

    /* 離下一檔多遠、值不值得打過去 */
    if (nxt) {
      var gap = nxt.turnover - t;
      var gain = nxt.cash - now.cash;
      var cost = gap * EDGE;
      var worth = cost < gain;
      var breakeven = gain / EDGE;
      html += '<div class="bc-call ' + (worth ? 'go' : 'stop') + '">'
        + '<b>離下一檔還差 ' + money(gap) + ' 元投注</b>（打過去多拿 ' + money(gain) + ' 元）<br>'
        + '多打這 ' + money(gap) + ' 的期望損失約 <b>' + money(cost) + ' 元</b>——'
        + (worth
            ? '<b class="ok">划算，打過去。</b>'
            : '<b class="stop">不划算，多打的比多拿的還多。</b>')
        + '<br><span class="bc-sub">這一檔的臨界距離是 ' + money(breakeven)
        + ' 元：差得比這少就值得打過去，差得比這多就不要硬追。</span></div>';
    } else {
      html += '<div class="bc-call go"><b>已經在最高檔。</b>再打不會有更多回饋。</div>';
    }

    /* 完整級距表，標出你現在在哪 */
    html += '<div class="bc-tbl"><table><thead><tr><th>日投注</th><th>回饋</th><th>實際回饋率</th></tr></thead><tbody>'
      + D.rebate.tiers.map(function (x) {
          var me = (x.turnover === now.turnover && now.cash > 0) ? ' class="me"' : '';
          var next = (nxt && x.turnover === nxt.turnover) ? ' class="nx"' : '';
          return '<tr' + (me || next) + '><td>' + money(x.turnover) + '</td>'
            + '<td data-l="回饋">' + money(x.cash) + '</td>'
            + '<td data-l="回饋率">' + (x.cash / x.turnover * 100).toFixed(3) + '%</td></tr>';
        }).join('')
      + '</tbody></table></div>';

    out.innerHTML = html;
    if (typeof gtag === 'function') gtag('event', 'bonus_rebate_calc', { turnover: Math.round(t) });
  }

  /* 首充：流水只要 1 倍，所以贈金幾乎全部是淨得 */
  function renderFirst() {
    var out = $('bc-first-out');
    out.innerHTML = D.firstDeposit.tiers.map(function (x) {
      var total = x.deposit + x.bonus;
      var need = total * D.firstDeposit.wagerMultiple;
      var cost = need * EDGE;
      var net = x.bonus - cost;
      return '<div class="bc-fd">'
        + '<div class="hd">存 ' + money(x.deposit) + ' 送 ' + money(x.bonus) + '</div>'
        + '<div class="bd">帳戶變 ' + money(total) + '，流水要求 ' + money(need)
        + '（' + D.firstDeposit.wagerMultiple + ' 倍）<br>'
        + '打完那些流水的期望損失約 ' + money(cost) + ' 元'
        + '<div class="net">淨得約 <b>' + money(net) + ' 元</b></div></div></div>';
    }).join('');
  }

  /* 368 體驗金：講清楚它是什麼，不要當成「白拿 368」 */
  function renderTrial() {
    var T = D.trialBonus;
    var need = T.amount * T.wagerMultiple;
    $('bc-trial-out').innerHTML =
      '<div class="bc-call stop">'
      + '<b>它不是白拿 ' + money(T.amount) + ' 元。</b>'
      + '打碼要求 ' + T.wagerMultiple + ' 倍＝<b>' + money(need) + ' 元投注</b>，'
      + '而 ' + money(T.amount) + ' 元本金平均只能撐出約 ' + money(T.amount / EDGE) + ' 元的投注量——'
      + '<b>門檻剛好卡在這筆錢的極限上</b>。<br>'
      + '<span class="bc-sub">我們用站上模擬引擎跑 ' + money(T.simPlayers) + ' 個玩家（押最低 '
      + D.game.minBet + ' 元）：完成流水的 <b>' + (T.simCompleteRate * 100).toFixed(1) + '%</b>，'
      + '最終餘額達提款門檻 ' + money(T.withdrawMin) + ' 的 <b>'
      + (T.simWithdrawRate * 100).toFixed(1) + '%</b>。提款上限 ' + money(T.withdrawMax) + ' 元。</span><br>'
      + '<b>正確的理解：一張 ' + (T.simWithdrawRate * 100).toFixed(1) + '% 中獎、獎金 '
      + money(T.withdrawMin) + '～' + money(T.withdrawMax) + ' 的免費彩券。</b>'
      + '期望值仍然是正的（因為完全免費），但跟「送你 ' + money(T.amount) + '」是兩回事。'
      + '</div>';
  }

  /* 買免遊划不划算：看本金倍數，不是看手感 */
  function renderBuy() {
    var bank = parseFloat($('bc-bank').value), bet = parseFloat($('bc-bet').value);
    var out = $('bc-buy-out');
    if (!(bank > 0) || !(bet >= D.game.minBet)) {
      out.innerHTML = '<p class="bc-hint">填本金與單注（最低 ' + D.game.minBet + ' 元）。</p>';
      return;
    }
    var cost = bet * D.game.buyCost;
    var times = bank / cost;
    var ratio = bank / bet;
    var cls = times >= 5 ? 'go' : times >= 3 ? '' : 'stop';
    out.innerHTML = '<div class="bc-call ' + cls + '">'
      + '買一次免遊要 <b>' + money(cost) + ' 元</b>（' + D.game.buyCost + ' 倍單注），'
      + '你的本金買得起 <b>' + times.toFixed(1) + ' 次</b>。<br>'
      + (times < 3
          ? '<b class="stop">本金買不到 3 次，等於把整場壓在一兩次結果上。</b>建議先把單注降到 '
            + money(bank / (D.game.buyCost * 5)) + ' 元以上再考慮，或乾脆平轉。'
          : times < 5
            ? '勉強可以，但買完剩下的本金會很薄。'
            : '<b class="ok">本金撐得住。</b>買或不買長期期望值一樣，差別只在快慢與波動。')
      + '<br><span class="bc-sub">你的本金是單注的 ' + Math.round(ratio) + ' 倍。'
      + '自然觸發免遊平均要 ' + D.game.freeAvgSpins + ' 轉，'
      + '平轉打完 ' + D.game.buyCost + ' 注的錢只走了 ' + D.game.buyCost + ' 轉——'
      + '買的是時間，不是機率。</span></div>';
  }

  ['bc-turnover'].forEach(function (id) { $(id).addEventListener('input', renderRebate); });
  ['bc-bank', 'bc-bet'].forEach(function (id) { $(id).addEventListener('input', renderBuy); });
  var stamp = $('bc-asof'); if (stamp) stamp.textContent = D.asOf;

  renderRebate(); renderFirst(); renderTrial(); renderBuy();
})();
