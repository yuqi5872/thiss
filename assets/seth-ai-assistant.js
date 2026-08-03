(function(){
  'use strict';
  /*
   * 戰神賽特｜AI 快速數據助手
   * 所有判斷都是寫死的公式，不是丟給語言模型自由發揮——
   * 這樣才能保證「永遠區分歷史數據表現與下一局中獎機率」這條核心原則不會被模型的自由發揮打破，
   * 也讓每一個數字都能被使用者自己對照公式驗算，跟站上其他工具的「可驗證」路線一致。
   */

  var STORAGE_KEY = 'tsaishen888-seth-ai-assistant-v1';
  var el = function(id){ return document.getElementById(id); };
  var money = function(v){ return new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0}).format(Math.round(v||0)); };
  var track = function(name, params){ if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); };

  // ---------- 資料模型 ----------
  var rooms = [];
  var roomSeq = 0;
  var bankroll = { starting: 0, stopLoss: 0 }; // 選填：全域本金與停損（section 五 資金管理）
  var mode = 'quick'; // 'quick' | 'detail'

  function newRoom(){
    roomSeq += 1;
    return {
      id: roomSeq,
      roomNo: '',
      currentBet: 0,
      spins: 0,
      totalBet: 0,
      totalReturn: 0,
      naturalFeatureCount: 0,
      featurePayout: 0,
      maxDrySpins: 0,
      recent20: null, // 選填：最近20轉回收
      recent50: null,
      recent100: null,
    };
  }

  // ---------- 核心計算（每一步都寫死公式，不用模型猜） ----------

  // 回收率：section 二-2。只有投入>0才有意義。
  function payoutRate(room){
    if (room.totalBet <= 0) return null;
    return (room.totalReturn / room.totalBet) * 100;
  }

  function netResult(room){
    return room.totalReturn - room.totalBet;
  }

  /*
   * 信心分數：section 四。代表「對資料描述的可靠程度」，跟樣本量（已玩轉數）掛鉤，
   * 跟中獎機率完全無關——這條界線寫死在公式裡，不會因為回收率高就自動加分。
   * 分段對應規格書自己舉的例子：10轉→低，100~300轉→可以提高，300轉以上封頂95（永遠留5%不確定）。
   */
  function confidenceScore(spins){
    if (spins <= 0) return 0;
    if (spins < 10)  return Math.round(spins * 1.5);            // 0~14
    if (spins < 30)  return Math.round(15 + (spins - 10) * 1.0); // 15~34
    if (spins < 100) return Math.round(35 + (spins - 30) * 0.5); // 35~69
    if (spins < 300) return Math.round(70 + (spins - 100) * 0.1);// 70~89
    return Math.min(95, Math.round(90 + (spins - 300) * 0.01));  // 90~95，永遠不到滿分
  }

  /*
   * 數據評分（多台比較排序用，section 六）：以「回收率相對100%的落差」與「樣本可靠度」
   * 兩項組成，最長乾旱轉數過長會扣分（這不是說機率變了，是提醒目前這一輪的風險曝險比較高）。
   * 門檻 400 轉取自模擬器頁面自己跑的 800 萬轉實測：平均免遊間隔192轉、第90百分位434轉，
   * 用同一份自己的數據當基準，不是憑感覺訂數字。
   */
  var DRY_SPIN_WARN_THRESHOLD = 400;
  function dataScore(room){
    var rate = payoutRate(room);
    var base = 50;
    var rateComponent = rate === null ? 0 : Math.max(-35, Math.min(35, (rate - 100) * 0.5));
    var sampleComponent = confidenceScore(room.spins) * 0.15; // 最多加約14分，樣本越大越可信但不會反客為主
    var droughtPenalty = room.maxDrySpins >= DRY_SPIN_WARN_THRESHOLD
      ? Math.min(20, (room.maxDrySpins - DRY_SPIN_WARN_THRESHOLD) / 50 + 8)
      : 0;
    return Math.max(0, Math.min(100, Math.round(base + rateComponent + sampleComponent - droughtPenalty)));
  }

  /*
   * 狀態判斷：section 三。四種狀態，門檻寫死，任何人都能對照公式檢查。
   * 停損永遠優先判斷——這是規格書「資金管理是最高優先規則」的直接體現。
   */
  function roomStatus(room){
    var rate = payoutRate(room);
    var net = netResult(room);

    if (bankroll.stopLoss > 0 && net <= -bankroll.stopLoss) {
      return { code: 'stop', label: '🔴 建議停止' };
    }
    if (room.spins >= 30 && rate !== null && rate < 60) {
      return { code: 'high', label: '🟠 高風險' };
    }
    if (room.maxDrySpins >= DRY_SPIN_WARN_THRESHOLD) {
      return { code: 'high', label: '🟠 高風險' };
    }
    if (room.spins >= 30 && rate !== null && rate >= 100) {
      return { code: 'good', label: '🟢 資料表現較佳' };
    }
    return { code: 'watch', label: '🟡 繼續觀察' };
  }

  function riskLevel(room, status){
    if (status.code === 'stop' || status.code === 'high') return '高';
    if (confidenceScore(room.spins) < 35) return '中';
    return '低';
  }

  /*
   * 判斷句（1~3句）：規則模板組出來的，不是自由生成文字。
   * 每一句只要碰到「表現較佳」就強制帶一句「不代表下一局會中」——這是規格書
   * 「除非有可靠證據證明機制會依歷史結果改變機率，否則不得暗示下一局結果」的直接落實，
   * 不是我事後補的免責文字，是判斷邏輯本身的一部分。
   */
  function judgmentText(room, status){
    var rate = payoutRate(room);
    var rateTxt = rate === null ? '尚未輸入投入金額' : rate.toFixed(1) + '%';
    var sentences = [];

    if (status.code === 'stop') {
      sentences.push('已達到你設定的停損金額，目前資料不支持繼續加碼。');
    } else if (status.code === 'high') {
      if (room.maxDrySpins >= DRY_SPIN_WARN_THRESHOLD) {
        sentences.push('最大連續未中已達 ' + room.maxDrySpins + ' 轉，屬於這場的風險升溫階段。');
      } else {
        sentences.push('目前回收率 ' + rateTxt + '，偏低，屬於這場的風險升溫階段。');
      }
    } else if (status.code === 'good') {
      sentences.push('目前累積回收率 ' + rateTxt + '，樣本數 ' + room.spins + ' 轉，相對其他候選台或自己的停損條件較佳。');
      sentences.push('這只反映你輸入的歷史紀錄，不代表下一局會中。');
    } else {
      sentences.push(rate === null ? '資料還不足以計算回收率，建議先補上投入與回收。' : '目前回收率 ' + rateTxt + '，落在正常波動範圍內，建議持續記錄以累積樣本。');
    }
    return sentences;
  }

  // ---------- Rooms 讀寫 ----------
  function readRoomFromForm(node){
    var g = function(name){ return node.querySelector('[data-field="' + name + '"]'); };
    var num = function(name){ var f = g(name); return f ? Math.max(0, Number(f.value) || 0) : 0; };
    var room = {
      id: Number(node.dataset.roomId),
      roomNo: (g('roomNo') && g('roomNo').value || '').trim(),
      currentBet: num('currentBet'),
      spins: num('spins'),
      totalBet: num('totalBet'),
      totalReturn: num('totalReturn'),
      naturalFeatureCount: num('naturalFeatureCount'),
      featurePayout: num('featurePayout'),
      maxDrySpins: num('maxDrySpins'),
      recent20: g('recent20') && g('recent20').value !== '' ? Number(g('recent20').value) : null,
      recent50: g('recent50') && g('recent50').value !== '' ? Number(g('recent50').value) : null,
      recent100: g('recent100') && g('recent100').value !== '' ? Number(g('recent100').value) : null,
    };
    return room;
  }

  function syncRoomsFromDOM(){
    rooms = Array.prototype.map.call(document.querySelectorAll('.room-card'), readRoomFromForm);
  }

  // ---------- 渲染：輸入表單 ----------
  /*
   * 重要：renderRoomList() 每次都會整段重寫 .room-card 的 innerHTML（例如新增下一台時），
   * 如果這裡生成的 <input> 沒有把 rooms[] 裡已經存的值寫回 value，畫面上舊資料就會
   * 憑空消失，使用者根本不會發現，直到下一次計算才發現數字全部歸零——這是實測抓到的真bug，
   * 不是假設，所以每個欄位都要從 room 物件把值帶回去，不能只在初次輸入時才顯示。
   */
  function esc(v){
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  }
  function roomFieldRow(label, field, room, placeholder){
    var raw = room[field];
    var val = (raw === null || raw === undefined || raw === 0) ? '' : raw;
    return '<label><span>' + label + '</span><input type="number" min="0" inputmode="numeric" data-field="' + field + '" value="' + esc(val) + '" placeholder="' + (placeholder || '0') + '"></label>';
  }

  function renderRoomCard(room){
    return (
      '<div class="room-card" data-room-id="' + room.id + '">' +
        '<div class="room-card-head">' +
          '<label class="room-no"><span>房號 / 標籤</span><input type="text" data-field="roomNo" value="' + esc(room.roomNo) + '" placeholder="例：3812"></label>' +
          '<button type="button" class="room-remove" data-remove="' + room.id + '" aria-label="移除這一台">✕</button>' +
        '</div>' +
        '<div class="room-fields">' +
          roomFieldRow('目前下注金額', 'currentBet', room) +
          roomFieldRow('已玩轉數', 'spins', room) +
          roomFieldRow('總投入', 'totalBet', room) +
          roomFieldRow('總回收', 'totalReturn', room) +
          roomFieldRow('自然免遊次數', 'naturalFeatureCount', room) +
          roomFieldRow('免遊派彩合計', 'featurePayout', room) +
          roomFieldRow('最大連續未中次數', 'maxDrySpins', room) +
        '</div>' +
        '<details class="room-recent">' +
          '<summary>選填：最近表現（有資料才比較，沒有就留空）</summary>' +
          '<div class="room-fields">' +
            roomFieldRow('最近20轉回收', 'recent20', room) +
            roomFieldRow('最近50轉回收', 'recent50', room) +
            roomFieldRow('最近100轉回收', 'recent100', room) +
          '</div>' +
        '</details>' +
      '</div>'
    );
  }

  function renderRoomList(){
    el('room-list').innerHTML = rooms.map(renderRoomCard).join('');
    bindRoomInputs();
  }

  function bindRoomInputs(){
    document.querySelectorAll('.room-card input').forEach(function(input){
      input.addEventListener('input', function(){
        syncRoomsFromDOM();
      });
    });
    document.querySelectorAll('[data-remove]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = Number(btn.dataset.remove);
        rooms = rooms.filter(function(r){ return r.id !== id; });
        renderRoomList();
        renderOutput();
        track('ai_assistant_remove_room');
      });
    });
  }

  function addRoom(){
    var room = newRoom();
    rooms.push(room);
    renderRoomList();
    track('ai_assistant_add_room');
  }

  // ---------- 渲染：輸出 ----------
  function medal(index){
    return index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : (index + 1) + '.';
  }

  function renderComparisonTable(){
    if (rooms.length < 2) { el('compare-output').innerHTML = ''; return; }
    var scored = rooms.map(function(room){
      return { room: room, status: roomStatus(room), score: dataScore(room) };
    }).sort(function(a, b){ return b.score - a.score; });

    var rowsHtml = scored.map(function(item, index){
      var name = item.room.roomNo || ('房 ' + item.room.id);
      return '<div class="compare-row">' +
        '<span class="compare-medal">' + medal(index) + '</span>' +
        '<span class="compare-name">' + name + '</span>' +
        '<span class="compare-status">' + item.status.label + '</span>' +
        '<span class="compare-score">數據評分 ' + item.score + '</span>' +
      '</div>';
    }).join('');

    var top = scored[0];
    var topName = top.room.roomNo || ('房 ' + top.room.id);
    var note = topName + ' 最近歷史回收較高，但這不代表下一段具有較高中獎機率。';

    el('compare-output').innerHTML =
      '<h3>多台比較</h3>' + rowsHtml + '<p class="compare-note">' + note + '</p>';
  }

  function renderQuickCard(room){
    var status = roomStatus(room);
    var confidence = confidenceScore(room.spins);
    var net = netResult(room);
    var name = room.roomNo || ('房 ' + room.id);
    var judgment = judgmentText(room, status).join('');

    return '<div class="output-card status-' + status.code + '">' +
      '<div class="output-head"><span class="output-name">' + name + '</span>' +
        '<span class="output-status">' + status.label + '｜信心 ' + confidence + '</span></div>' +
      '<div class="output-grid">' +
        '<div><span>投入</span><b>' + money(room.totalBet) + '</b></div>' +
        '<div><span>回收</span><b>' + money(room.totalReturn) + '</b></div>' +
        '<div><span>損益</span><b class="' + (net >= 0 ? 'positive' : 'negative') + '">' + (net >= 0 ? '+' : '') + money(net) + '</b></div>' +
        '<div><span>自然免遊</span><b>' + room.naturalFeatureCount + ' 次</b></div>' +
      '</div>' +
      '<p class="output-judgment">結論：' + judgment + '</p>' +
    '</div>';
  }

  function renderDetailCard(room){
    var status = roomStatus(room);
    var confidence = confidenceScore(room.spins);
    var rate = payoutRate(room);
    var net = netResult(room);
    var risk = riskLevel(room, status);
    var name = room.roomNo || ('房 ' + room.id);
    var judgment = judgmentText(room, status).join(' ');

    var recentRows = ['recent20', 'recent50', 'recent100'].map(function(key, i){
      var v = room[key];
      var label = ['20轉', '50轉', '100轉'][i];
      return '<div><span>' + label + '</span><b>' + (v === null ? '未提供' : money(v)) + '</b></div>';
    }).join('');

    return '<div class="output-card detail status-' + status.code + '">' +
      '<div class="output-head"><span class="output-name">【' + name + '】</span>' +
        '<span class="output-status">' + status.label + '</span></div>' +
      '<h4>數據</h4>' +
      '<div class="output-grid dense">' +
        '<div><span>轉數</span><b>' + room.spins + '</b></div>' +
        '<div><span>投入</span><b>' + money(room.totalBet) + '</b></div>' +
        '<div><span>回收</span><b>' + money(room.totalReturn) + '</b></div>' +
        '<div><span>損益</span><b class="' + (net >= 0 ? 'positive' : 'negative') + '">' + (net >= 0 ? '+' : '') + money(net) + '</b></div>' +
        '<div><span>回收率</span><b>' + (rate === null ? '—' : rate.toFixed(1) + '%') + '</b></div>' +
        '<div><span>自然免遊</span><b>' + room.naturalFeatureCount + ' 次</b></div>' +
        '<div><span>最大連續未中</span><b>' + room.maxDrySpins + ' 轉</b></div>' +
      '</div>' +
      '<h4>近期</h4>' +
      '<div class="output-grid dense">' + recentRows + '</div>' +
      '<h4>判斷</h4><p class="output-judgment">' + judgment + '</p>' +
      '<div class="output-foot"><span>風險：<b>' + risk + '</b></span><span>信心：<b>' + confidence + ' / 100</b></span></div>' +
    '</div>';
  }

  function renderBankrollPanel(){
    if (bankroll.starting <= 0) { el('bankroll-output').innerHTML = ''; return; }
    var totalNet = rooms.reduce(function(sum, r){ return sum + netResult(r); }, 0);
    var currentBalance = bankroll.starting + totalNet;
    var stopGap = bankroll.stopLoss > 0 ? Math.max(0, bankroll.stopLoss + totalNet) : null;
    el('bankroll-output').innerHTML =
      '<h3>資金管理</h3>' +
      '<div class="output-grid">' +
        '<div><span>目前本金</span><b>' + money(bankroll.starting) + '</b></div>' +
        '<div><span>目前總損益</span><b class="' + (totalNet >= 0 ? 'positive' : 'negative') + '">' + (totalNet >= 0 ? '+' : '') + money(totalNet) + '</b></div>' +
        '<div><span>估計餘額</span><b>' + money(currentBalance) + '</b></div>' +
        (stopGap !== null ? '<div><span>距離停損</span><b>' + money(stopGap) + '</b></div>' : '') +
      '</div>';
  }

  function renderOutput(){
    syncRoomsFromDOM();
    renderBankrollPanel();
    renderComparisonTable();

    var container = el('room-output');
    if (rooms.length === 0) {
      container.innerHTML = '<p class="empty-state">先在上面加入至少一台的資料。</p>';
      return;
    }
    container.innerHTML = rooms.map(function(room){
      return mode === 'quick' ? renderQuickCard(room) : renderDetailCard(room);
    }).join('');

    track('ai_assistant_render', { mode: mode, room_count: rooms.length });
  }

  // ---------- 事件綁定 ----------
  function bindModeButtons(){
    document.querySelectorAll('[data-mode]').forEach(function(btn){
      btn.addEventListener('click', function(){
        mode = btn.dataset.mode;
        document.querySelectorAll('[data-mode]').forEach(function(b){ b.classList.toggle('active', b === btn); });
        renderOutput();
      });
    });
  }

  function bindBankrollInputs(){
    el('bankroll-starting').addEventListener('input', function(){
      bankroll.starting = Math.max(0, Number(this.value) || 0);
      renderOutput();
    });
    el('bankroll-stoploss').addEventListener('input', function(){
      bankroll.stopLoss = Math.max(0, Number(this.value) || 0);
      renderOutput();
    });
  }

  function init(){
    el('add-room').addEventListener('click', function(){ addRoom(); renderOutput(); });
    el('calc-all').addEventListener('click', function(){ renderOutput(); track('ai_assistant_calculate', { room_count: rooms.length }); });
    bindModeButtons();
    bindBankrollInputs();
    addRoom();
    renderOutput();
    track('ai_assistant_open');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
