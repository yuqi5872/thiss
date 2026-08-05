/*
 * 賽特工具台 — 分頁切換 ＋ 模擬器介面 ＋ AI 選房解鎖閘門
 *
 * 這支只做「介面」，不重寫任何演算法：
 *   模擬器的數學全部呼叫 window.SethSim（/assets/seth-sim.js，跟 /tools/seth-simulator/ 同一份）
 *   AI 選房的判定全部由 /assets/seth-ai-assistant.js 處理，這裡只提供它要的 DOM
 * 這樣三個工具在兩個地方顯示，但邏輯只有一份，不會各自漂移。
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 分頁切換 ---------- */
  var PANES = ['pre', 'live', 'pick'];
  var tabs = $('tool-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-pane]');
      if (!b) return;
      var want = b.dataset.pane;
      tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      PANES.forEach(function (k) {
        var el = k === 'live' ? $('pane-live') : $('pane-' + k);
        if (el) el.hidden = (k !== want);
      });
      // 記住上次看的那一格，回訪不用重選
      try { localStorage.setItem('sethHubPane', want); } catch (err) {}
    });
    try {
      var last = localStorage.getItem('sethHubPane');
      if (last && last !== 'live') {
        var btn = tabs.querySelector('button[data-pane="' + last + '"]');
        if (btn) btn.click();
      }
    } catch (err) {}
  }

  /* ---------- ① 機制模擬器 ---------- */
  // 以下整段原封不動取自 /tools/seth-simulator/ 的頁內程式。
  // 不重寫、不簡化——那頁的符號標籤、盤面畫法、批次統計都在這裡面，
  // 兩邊要改就一起改，不要各自演化。
  (function(){
    var S = window.SethSim;
    var LABEL = { H1:'眼', H2:'杖', H3:'弓', H4:'刀', L1:'黃', L2:'紅', L3:'紫', L4:'藍', L5:'綠', SC:'甲', MX:'' };
    var HIGH = { H1:1, H2:1, H3:1, H4:1 };
    var gridEl = document.getElementById('grid');
    var bal = 2000, bet = 10, spins = 0, staked = 0, returned = 0, busy = false;
    var startBal = 2000;   // 使用者自訂的起始點數，重設時回到這裡而不是寫死的 2000
    var rnd = Math.random;
  
    function cellHtml(c){
      var cls = 'cell';
      if (c.key === 'SC') cls += ' sc';
      else if (c.key === 'MX') cls += ' mx';
      else if (HIGH[c.key]) cls += ' h';
      var txt = c.key === 'MX' ? ('×' + c.mult) : LABEL[c.key];
      return '<div class="' + cls + '">' + txt + '</div>';
    }
    function draw(grid, winners){
      var w = {}; (winners||[]).forEach(function(k){ w[k]=1; });
      gridEl.innerHTML = grid.map(function(c){
        var h = cellHtml(c);
        if (w[c.key]) h = h.replace('class="cell', 'class="cell win');
        return h;
      }).join('');
    }
    function blank(){
      var g = [], i;
      for (i=0;i<30;i++) g.push({key:'L'+(1+i%5)});
      draw(g, []);
    }
    function fmt(n){ return Math.round(n).toLocaleString('en-US'); }
    function sync(){
      document.getElementById('s-bal').textContent = fmt(bal);
      document.getElementById('s-bet').textContent = bet;
      document.getElementById('s-spins').textContent = fmt(spins);
      document.getElementById('s-rtp').textContent = staked ? (returned/staked*100).toFixed(1)+'%' : '—';
    }
    function setMsg(t){ document.getElementById('msg').textContent = t; }
  
    function animate(steps, done){
      var i = 0;
      (function next(){
        if (i >= steps.length){ done(); return; }
        var st = steps[i];
        draw(st.grid, st.winners);
        i++;
        setTimeout(next, st.winners.length ? 340 : 120);
      })();
    }
  
    function playOne(isBuy, quiet, after){
      var cost = isBuy ? bet * S.BUY_COST : bet;
      if (bal < cost){ setMsg('點數不夠了，按「重設點數」再來。'); if(after) after(); return; }
      busy = true;
      bal -= cost; staked += cost; spins++;
      document.getElementById('sim-mode').textContent = isBuy ? '購買免費遊戲' : '主遊戲';
  
      if (isBuy){
        var r = S.playRound(bet, rnd, { buy:true });
        bal += r.win; returned += r.win;
        document.getElementById('s-win').textContent = fmt(r.win);
        document.getElementById('s-mult').textContent = '—';
        setMsg('買了免費遊戲（' + r.freeSpins + ' 回合）：回收 ' + fmt(r.win) + ' 點，成本 ' + fmt(cost) + ' 點。' + (r.win >= cost ? '這次賺了。' : '這次虧了——76.5% 的購買都是這樣。'));
        sync(); busy = false; if(after) after(); return;
      }
  
      var main = S.spinOnce(bet, false, rnd, true);
      animate(main.steps, function(){
        var win = main.win, note = '';
        document.getElementById('s-mult').textContent = main.multSum ? '×' + main.multSum : '—';
        if (main.scatters >= 3){
          document.getElementById('sim-mode').textContent = '免費遊戲';
          var spinsN = S.FG_SPINS[Math.min(main.scatters,6)] || S.FG_SPINS[3];
          var acc = 0, fw = 0, played = 0, remaining = spinsN;
          while (remaining > 0 && played < 300){
            remaining--; played++;
            var f = S.spinOnce(bet, true, rnd, false, acc);
            acc += f.multSum; fw += f.win;
            if (f.scatters >= 3) remaining += 5;
          }
          win += fw;
          note = ' 觸發免費遊戲！' + played + ' 回合、累積倍數 ×' + acc + '，共 ' + fmt(fw) + ' 點。';
        }
        bal += win; returned += win;
        document.getElementById('s-win').textContent = fmt(win);
        if (!quiet) setMsg(win > 0 ? ('贏 ' + fmt(win) + ' 點。' + note) : '沒中。約 86.7% 的轉都是這樣。');
        sync(); busy = false; if(after) after();
      });
    }
  
    document.getElementById('btn-spin').onclick = function(){ if(!busy) playOne(false,false); };
    document.getElementById('btn-buy').onclick = function(){ if(!busy) playOne(true,false); };
    document.getElementById('btn-reset').onclick = function(){
      bal = startBal; spins = 0; staked = 0; returned = 0;
      document.getElementById('s-win').textContent = '0';
      document.getElementById('s-mult').textContent = '—';
      setMsg('點數已重設為 2,000。'); sync(); blank();
    };
    document.getElementById('btn-auto').onclick = function(){
      if (busy) return;
      var left = 50, free = 0, best = 0, start = bal;
      (function loop(){
        if (left <= 0 || bal < bet){
          setMsg('自動 50 轉結束：淨' + (bal-start >= 0 ? '賺 ' : '虧 ') + fmt(Math.abs(bal-start)) + ' 點' + (free ? '，觸發 ' + free + ' 次免費遊戲。' : '，一次免費遊戲都沒進——平均要 192 轉才會進一次。'));
          return;
        }
        left--;
        var before = bal;
        playOne(false, true, function(){
          if (bal - before > bet * 20) free++;
          setMsg('自動轉動中… 剩 ' + left + ' 轉');
          setTimeout(loop, 60);
        });
      })();
    };
  
    document.getElementById('btn-batch').onclick = function(){
      var n = +document.getElementById('batch-n').value;
      var out = document.getElementById('batch-out');
      out.innerHTML = '<span style="color:var(--ink-mute)">模擬中…' + (n >= 50000 ? '（' + n.toLocaleString('en-US') + ' 轉可能要幾秒）' : '') + '</span>';
      setTimeout(function(){
        var r = S.batch(n, {});
        var pct = function(v){ return (v/n*100).toFixed(2) + '%'; };
        out.innerHTML =
          '<div class="t-scroll"><table><thead><tr><th>指標</th><th>這次 ' + n.toLocaleString('en-US') + ' 轉的結果</th></tr></thead><tbody>' +
          '<tr><td>回收率</td><td class="num">' + r.rtp.toFixed(2) + '%</td></tr>' +
          '<tr><td>完全沒中的轉</td><td class="num">' + pct(r.buckets['0']) + '</td></tr>' +
          '<tr><td>贏 100 倍以上</td><td class="num">' + pct(r.buckets['100+']) + '</td></tr>' +
          '<tr><td>免費遊戲觸發次數</td><td class="num">' + r.freeCount + ' 次</td></tr>' +
          '<tr><td>平均觸發間隔</td><td class="num">' + (r.avgGap ? r.avgGap.toFixed(0) + ' 轉' : '這次一次都沒觸發') + '</td></tr>' +
          '<tr><td>最長乾旱期</td><td class="num">' + (r.maxGap ? r.maxGap + ' 轉' : '—') + '</td></tr>' +
          '<tr><td>免費遊戲佔總回報</td><td class="num">' + r.freeShare.toFixed(1) + '%</td></tr>' +
          '<tr><td>單次最大贏分</td><td class="num">' + r.biggestX.toFixed(0) + ' 倍</td></tr>' +
          '</tbody></table></div>' +
          '<p style="margin-top:10px;font-size:13.5px;color:var(--ink-mute);">' +
          (n < 50000 ? '轉數還太少，這個回收率的誤差很大——我們跑 100 萬轉，每次結果仍然會差 ±1.84 個百分點。多按幾次看看數字跳多兇。' : '轉數夠多了，回收率應該開始靠近 97% 上下。但注意最長乾旱期那一列——那才是真錢時會發生在你身上的事。') +
          '</p>';
      }, 30);
    };
  
    window.__sethSimApply = function (newBal, newBet) {
      startBal = newBal; bal = newBal; bet = newBet;
      spins = 0; staked = 0; returned = 0;
      blank(); sync();
      document.getElementById('msg').textContent =
        '已套用：起始點數 ' + newBal.toLocaleString('zh-TW') + '、單注 ' + newBet + '。';
    };

    blank(); sync();
  })();

  /* ---------- ① 模擬器：起始點數與單注可自訂 ---------- */
  // 原版是寫死 2000/10。這裡讓使用者自己設，跟 tab ② 的「開場本金／注額」對得起來，
  // 三個工具用同一組數字，換分頁不用重打。
  document.addEventListener('DOMContentLoaded', function () {
    var apply = $('btn-apply');
    if (!apply) return;
    apply.onclick = function () {
      var b = Math.max(100, +$('set-bal').value || 2000);
      var t = Math.max(1, +$('set-bet').value || 10);
      // 借用 tab ② 已填的本金／注額當預設，兩邊不用重打
      $('set-bal').value = b; $('set-bet').value = t;
      window.__sethSimApply && window.__sethSimApply(b, t);
    };
    var srcBank = $('starting-bankroll'), srcBet = $('starting-bet');
    if (srcBank && srcBank.value) $('set-bal').value = srcBank.value;
    if (srcBet && srcBet.value) $('set-bet').value = Math.max(1, Math.round(+srcBet.value)) || 10;
  });

  /* ---------- ③ AI 選房：解鎖閘門 ---------- */
  // 軟鎖：會翻原始碼的人繞得過去，但那種人本來就不會儲值。
  // 它的工作是製造一個非去 LINE 不可的理由。換碼改下面這一行、重新部署即可。
  var CLAIM_CODE = 'seth-unlock-2608';
  var CLAIM_KEY = 'seth-room-unlocked';

  function bindGate() {
    var gate = $('claim-gate'), body = $('tool-body');
    if (!gate || !body) return;
    function open_() { gate.hidden = true; body.hidden = false; }
    try { if (localStorage.getItem(CLAIM_KEY) === '1') open_(); } catch (e) {}
    var btn = $('claim-submit'), inp = $('claim-code'), msg = $('claim-msg');
    if (!btn || !inp) return;
    btn.onclick = function () {
      if (inp.value.trim().toLowerCase() === CLAIM_CODE) {
        try { localStorage.setItem(CLAIM_KEY, '1'); } catch (e) {}
        open_();
      } else if (msg) {
        msg.textContent = '解鎖碼不對。加 LINE 傳「領取工具」就會給你。';
      }
    };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') btn.click(); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindGate();
  });
})();
