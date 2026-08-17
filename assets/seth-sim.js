/* 戰神賽特機制模擬器 — 核心邏輯
 * 這不是 ATG 官方遊戲，也不是原版程式碼。
 * 賠率表與觸發條件取自公開資料（見 /tools/seth-simulator/ 頁面的資料來源段），
 * 但「符號出現權重」官方從未公開，下面的 WEIGHTS 是我們自己設定後
 * 用蒙地卡羅回推校準到接近官方標示 RTP 的結果。
 * 同一份檔案同時被瀏覽器與 node 使用，確保頁面上跑的跟我們公布的實測數字是同一套邏輯。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SethSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLS = 6, ROWS = 5, CELLS = COLS * ROWS;
  var MIN_MATCH = 8;

  // 賠率表：[8~9 個, 10~11 個, 12 個以上]
  var SYMBOLS = [
    { key: 'H1', name: '荷魯斯之眼', tier: 'high', pay: [200, 500, 1000], weight: 10 },
    { key: 'H2', name: '權杖', tier: 'high', pay: [50, 200, 500], weight: 10.5 },
    { key: 'H3', name: '弓箭', tier: 'high', pay: [40, 100, 300], weight: 11 },
    { key: 'H4', name: '彎刀', tier: 'high', pay: [30, 40, 240], weight: 11.5 },
    { key: 'L1', name: '黃寶石', tier: 'low', pay: [20, 30, 200], weight: 12 },
    { key: 'L2', name: '紅寶石', tier: 'low', pay: [16, 24, 160], weight: 12.5 },
    { key: 'L3', name: '紫寶石', tier: 'low', pay: [10, 20, 100], weight: 13 },
    { key: 'L4', name: '藍寶石', tier: 'low', pay: [8, 18, 80], weight: 13.5 },
    { key: 'L5', name: '綠寶石', tier: 'low', pay: [5, 15, 40], weight: 14 }
  ];

  // SCATTER：3 個以上觸發免費遊戲；4/5/6 個另有賠付
  var SCATTER = { key: 'SC', name: '聖甲蟲', pay: { 4: 60, 5: 100, 6: 2000 }, weight: 1.25 };
  // 倍數球：本身不計分，結算時加總後乘上該轉累積贏分
  var MULT = { key: 'MX', name: '倍數球', weight: 0.95 };
  var MULT_TABLE = [
    { v: 2, w: 300 }, { v: 3, w: 220 }, { v: 5, w: 150 }, { v: 8, w: 90 },
    { v: 10, w: 70 }, { v: 15, w: 40 }, { v: 20, w: 28 }, { v: 25, w: 18 },
    { v: 50, w: 9 }, { v: 100, w: 4 }, { v: 200, w: 1.4 }, { v: 500, w: 0.35 }
  ];

  var FG_SPINS = { 3: 10, 4: 12, 5: 15, 6: 20 }; // 依觸發數量給予的免費回合
  var FG_RETRIGGER = 5;   // 免費遊戲中再觸發追加回合
  // 直接購買免費遊戲的成本（以「單注」為單位）。
  // 第三方攻略記載原版約為當前押注的 100 倍；本模擬器校準為 88 倍，
  // 目的是讓「用買的」與「自然等待」的長期期望值一致——真實老虎機的購買功能
  // 設計上也是 RTP 中性的。這是本模擬器的設定，不是官方數字。
  /* 🔴 2026-08-14 從 88 改成 100。依據是 user 的實際螢幕錄影：
     押注 1 時每轉扣 20 點、買特色扣 2,000 點，兩支影片七次購買都是這個數字。
     88 是先前的估計值，會讓模擬結果比真實情況樂觀——工具算出來的
     「買特色划不划算」會偏向鼓勵購買，那是我們自己在騙使用者。 */
  var BUY_COST = 100;
  // 自然觸發時 3/4/5/6 個 SCATTER 的實測占比（本模擬器 800 萬轉統計）
  var BUY_MIX = { 3: 0.9196, 4: 0.0743, 5: 0.0060, 6: 0.0002 };
  var PAY_DIVISOR = 20;   // 官方公式：贏分 =（單次投注額 ÷ 20）× 賠率

  // ---- 亂數（可注入種子，讓批次模擬可重現）----
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function buildPool(inFree) {
    var pool = [], i, s;
    for (i = 0; i < SYMBOLS.length; i++) {
      s = SYMBOLS[i];
      pool.push({ key: s.key, w: s.weight });
    }
    // 免費遊戲中倍數球出現率提高，這是本模擬器的設定，非官方數據
    pool.push({ key: SCATTER.key, w: inFree ? SCATTER.weight * 0.6 : SCATTER.weight });
    pool.push({ key: MULT.key, w: inFree ? MULT.weight * 5.5 : MULT.weight });
    var total = 0;
    for (i = 0; i < pool.length; i++) total += pool[i].w;
    return { pool: pool, total: total };
  }

  function pick(poolObj, rnd) {
    var r = rnd() * poolObj.total, acc = 0, i;
    for (i = 0; i < poolObj.pool.length; i++) {
      acc += poolObj.pool[i].w;
      if (r < acc) return poolObj.pool[i].key;
    }
    return poolObj.pool[poolObj.pool.length - 1].key;
  }

  function pickMult(rnd) {
    var total = 0, i;
    for (i = 0; i < MULT_TABLE.length; i++) total += MULT_TABLE[i].w;
    var r = rnd() * total, acc = 0;
    for (i = 0; i < MULT_TABLE.length; i++) {
      acc += MULT_TABLE[i].w;
      if (r < acc) return MULT_TABLE[i].v;
    }
    return 2;
  }

  var SYM_BY_KEY = {};
  SYMBOLS.forEach(function (s) { SYM_BY_KEY[s.key] = s; });

  function payFor(key, count) {
    var s = SYM_BY_KEY[key];
    if (!s || count < MIN_MATCH) return 0;
    var idx = count >= 12 ? 2 : (count >= 10 ? 1 : 0);
    return s.pay[idx];
  }

  function newGrid(poolObj, rnd) {
    var g = new Array(CELLS), i;
    for (i = 0; i < CELLS; i++) {
      var k = pick(poolObj, rnd);
      g[i] = k === MULT.key ? { key: k, mult: pickMult(rnd) } : { key: k };
    }
    return g;
  }

  function countKeys(grid) {
    var c = {}, i;
    for (i = 0; i < CELLS; i++) {
      var k = grid[i].key;
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }

  /* 跑一轉（含所有連消輪次）。
   * 回傳 { win, steps, mults, tumbles, scatters }
   * win 以「單注 = 1」為單位。 */
  function spinOnce(bet, inFree, rnd, wantSteps, accMult) {
    var poolObj = buildPool(inFree);
    var grid = newGrid(poolObj, rnd);
    var steps = wantSteps ? [] : null;
    var roundWin = 0, tumbles = 0;
    var counts = countKeys(grid);
    var scatters = counts[SCATTER.key] || 0;

    while (true) {
      counts = countKeys(grid);
      var winners = [], key;
      for (key in counts) {
        if (SYM_BY_KEY[key] && counts[key] >= MIN_MATCH) winners.push(key);
      }
      if (wantSteps) steps.push({ grid: grid.map(function (c) { return { key: c.key, mult: c.mult }; }), winners: winners.slice() });
      if (!winners.length) break;

      var stepWin = 0, i;
      for (i = 0; i < winners.length; i++) {
        stepWin += payFor(winners[i], counts[winners[i]]);
      }
      roundWin += stepWin * bet / PAY_DIVISOR;
      tumbles++;

      // 消除中獎符號，上方掉落補位（倍數球與 SCATTER 不參與消除）
      var removed = {};
      winners.forEach(function (k) { removed[k] = true; });
      var col, colCells, r2;
      for (col = 0; col < COLS; col++) {
        colCells = [];
        for (r2 = ROWS - 1; r2 >= 0; r2--) {
          var cell = grid[r2 * COLS + col];
          if (!removed[cell.key]) colCells.push(cell);
        }
        while (colCells.length < ROWS) {
          var k2 = pick(poolObj, rnd);
          colCells.push(k2 === MULT.key ? { key: k2, mult: pickMult(rnd) } : { key: k2 });
        }
        for (r2 = 0; r2 < ROWS; r2++) grid[(ROWS - 1 - r2) * COLS + col] = colCells[r2];
      }
      var newCounts = countKeys(grid);
      scatters = Math.max(scatters, newCounts[SCATTER.key] || 0);
    }

    // 盤面消不動時：倍數球加總。
    // 主遊戲每轉歸零；免費遊戲中倍數會累積（官方說明的重觸發／累積機制），
    // 所以本轉贏分要乘上「先前累積 + 本轉新增」的總倍數。
    var multSum = 0, j;
    for (j = 0; j < CELLS; j++) if (grid[j].key === MULT.key) multSum += grid[j].mult;
    var applied = inFree ? (accMult || 0) + multSum : multSum;
    if (applied > 0 && roundWin > 0) roundWin *= applied;

    // SCATTER 賠付
    var scPay = SCATTER.pay[Math.min(scatters, 6)];
    if (scPay) roundWin += scPay * bet / PAY_DIVISOR;

    return { win: roundWin, steps: steps, multSum: multSum, tumbles: tumbles, scatters: scatters };
  }

  /* 跑一次完整下注：主遊戲一轉，若觸發則把免費遊戲一起跑完。
   * 回傳 { win, cost, freeTriggered, freeSpins, freeWin, tumbles } */
  function playRound(bet, rnd, opts) {
    opts = opts || {};
    var cost = bet, total = 0, freeTriggered = false, freeSpins = 0, freeWin = 0, tumbles = 0;

    if (opts.buy) {
      // 購買時的觸發規模，依「自然觸發時各 SCATTER 數量的實際分布」抽樣，
      // 避免直接給固定回合數造成購買比自然等待划算的假象
      cost = bet * BUY_COST;
      freeTriggered = true;
      var rr = rnd(), sc;
      if (rr < BUY_MIX[3]) sc = 3;
      else if (rr < BUY_MIX[3] + BUY_MIX[4]) sc = 4;
      else if (rr < BUY_MIX[3] + BUY_MIX[4] + BUY_MIX[5]) sc = 5;
      else sc = 6;
      freeSpins = FG_SPINS[sc];
    } else {
      var main = spinOnce(bet, false, rnd, false);
      total += main.win;
      tumbles += main.tumbles;
      if (main.scatters >= 3) {
        freeTriggered = true;
        freeSpins = FG_SPINS[Math.min(main.scatters, 6)] || FG_SPINS[3];
      }
    }

    if (freeTriggered) {
      var remaining = freeSpins, played = 0, acc = 0;
      while (remaining > 0 && played < 500) {
        remaining--; played++;
        var f = spinOnce(bet, true, rnd, false, acc);
        acc += f.multSum;              // 倍數在免費遊戲中持續累積
        freeWin += f.win;
        tumbles += f.tumbles;
        if (f.scatters >= 3) remaining += FG_RETRIGGER; // 重觸發延長回合
      }
      freeSpins = played;
      total += freeWin;
    }

    return { win: total, cost: cost, freeTriggered: freeTriggered, freeSpins: freeSpins, freeWin: freeWin, tumbles: tumbles };
  }

  /* 批次模擬：跑 n 次下注，回傳統計 */
  function batch(n, opts) {
    opts = opts || {};
    var bet = opts.bet || 1;
    var rnd = opts.seed != null ? mulberry32(opts.seed) : Math.random;
    var staked = 0, returned = 0, freeCount = 0, freeReturn = 0, biggest = 0;
    var gaps = [], sinceFree = 0, tumbleTotal = 0;
    var buckets = { '0': 0, '0-1': 0, '1-5': 0, '5-20': 0, '20-100': 0, '100+': 0 };

    for (var i = 0; i < n; i++) {
      var r = playRound(bet, rnd, { buy: !!opts.buy });
      staked += r.cost;
      returned += r.win;
      tumbleTotal += r.tumbles;
      if (r.win > biggest) biggest = r.win;
      var x = r.win / bet;
      if (x === 0) buckets['0']++;
      else if (x < 1) buckets['0-1']++;
      else if (x < 5) buckets['1-5']++;
      else if (x < 20) buckets['5-20']++;
      else if (x < 100) buckets['20-100']++;
      else buckets['100+']++;
      if (r.freeTriggered) {
        freeCount++; freeReturn += r.freeWin;
        gaps.push(sinceFree + 1); sinceFree = 0;
      } else sinceFree++;
    }

    gaps.sort(function (a, b) { return a - b; });
    return {
      spins: n,
      staked: staked,
      returned: returned,
      rtp: staked ? returned / staked * 100 : 0,
      freeCount: freeCount,
      freeRate: n ? freeCount / n : 0,
      freeShare: returned ? freeReturn / returned * 100 : 0,
      avgGap: gaps.length ? gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length : null,
      medianGap: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
      p90Gap: gaps.length ? gaps[Math.floor(gaps.length * 0.9)] : null,
      maxGap: gaps.length ? gaps[gaps.length - 1] : null,
      biggestX: biggest / bet,
      avgTumbles: n ? tumbleTotal / n : 0,
      buckets: buckets
    };
  }

  return {
    COLS: COLS, ROWS: ROWS, MIN_MATCH: MIN_MATCH,
    SYMBOLS: SYMBOLS, SCATTER: SCATTER, MULT: MULT, MULT_TABLE: MULT_TABLE,
    FG_SPINS: FG_SPINS, BUY_COST: BUY_COST, PAY_DIVISOR: PAY_DIVISOR,
    mulberry32: mulberry32, spinOnce: spinOnce, playRound: playRound, batch: batch
  };
});
