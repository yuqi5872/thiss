/*
 * 「加到主畫面」引導
 * 2026-08-11 建立
 *
 * 為什麼只在工具台這頁做：戰局計算是「人正在玩的時候」在用的工具，
 * 桌面圖示省掉的是「那個網站叫什麼來著」這一步。評測文章不需要圖示。
 *
 * ── 三個刻意的設計 ────────────────────────────────
 * 1. 不在一進站就跳。沒用過工具的人不知道自己要不要留著它，
 *    這時候跳提示只是廣告。等他真的用過一次再問。
 * 2. iOS 跟 Android 走完全不同的路。Android 有原生安裝提示可以觸發，
 *    iOS 沒有 API，只能教他按「分享 → 加入主畫面」。
 *    寫成同一套會有一半的人看到做不到的指示。
 * 3. 🔴 一定要講「解鎖碼要再貼一次」。
 *    iOS 從主畫面開啟的網頁是獨立的儲存空間，Safari 裡的 localStorage
 *    不會帶過去——已經解鎖的人裝完 App 會發現工具又鎖上了。
 *    不先講，那就是我們自己製造的客訴。碼沒有失效，重貼就好。
 */
(function () {
  'use strict';
  var VISIT_KEY = 'seth-pwa-visits';
  var HIDE_KEY = 'seth-pwa-dismissed';
  var NOTE_KEY = 'seth-pwa-storage-note';
  var USE_KEY = 'seth-gate-uses-v1';
  var UNLOCK_KEY = 'seth-gate-unlock-v1';

  var track = function (n, p) { if (typeof window.gtag === 'function') window.gtag('event', n, p || {}); };
  var read = function (k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };

  var standalone = window.matchMedia('(display-mode: standalone)').matches ||
                   window.navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var isMobile = isIOS || /android/i.test(navigator.userAgent);

  /* 註冊 service worker。它什麼都不快取，只是讓 Android 認得這是可安裝的網站——
     理由寫在 /sw.js 開頭。 */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () { /* 失敗就只是裝不了，不影響工具 */ });
  }

  /* 🔴 樣式要在這裡注入，不能放到下面「還在瀏覽器」那段裡。
     standalone 分支會呼叫 note() 之後直接 return，如果樣式還沒進 head，
     那段提醒就會變成一段沒有樣式的裸文字黏在頁尾——元素在、文字在、
     沒有任何錯誤，只是看起來像網頁壞掉。App 模式又剛好是最不容易
     被我們自己看到的情境。 */
  var css =
    '.seth-pwa-bar,.seth-pwa-note{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;' +
    'background:#0f1420;border:1px solid rgba(221,176,88,.32);border-left:3px solid #d4af37;' +
    'border-radius:12px;padding:15px 16px;color:#f2eadc;box-shadow:0 10px 30px rgba(0,0,0,.45);' +
    'font-size:14px;line-height:1.7;max-width:520px;margin:0 auto}' +
    '.seth-pwa-bar b,.seth-pwa-note b{display:block;font-size:15px;margin-bottom:4px}' +
    '.seth-pwa-bar span,.seth-pwa-note span{display:block;color:rgba(242,234,220,.72);font-size:13px;margin-bottom:11px}' +
    '.seth-pwa-bar ol{margin:0 0 11px;padding-left:1.3em;color:rgba(242,234,220,.82);font-size:13px}' +
    '.seth-pwa-actions{display:flex;gap:8px;flex-wrap:wrap}' +
    '.seth-pwa-bar button,.seth-pwa-note button{border:0;border-radius:8px;padding:9px 16px;' +
    'font-weight:800;font-size:13.5px;cursor:pointer;background:#d4af37;color:#1a1206;font-family:inherit}' +
    '.seth-pwa-bar .ghost{background:none;color:rgba(242,234,220,.55);font-weight:500;padding:9px 6px}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ── 已經是 App 模式 ───────────────────────────── */
  if (standalone) {
    track('pwa_open');
    // 從主畫面開啟、但這個儲存空間裡沒有解鎖狀態 → 先講清楚，不要讓他以為工具壞了
    var lv = Number(read(UNLOCK_KEY, {}).level || 0);
    if (!lv && !localStorage.getItem(NOTE_KEY)) {
      try { localStorage.setItem(NOTE_KEY, '1'); } catch (e) {}
      setTimeout(function () { note(); }, 900);
    }
    return;
  }

  function note() {
    var el = document.createElement('div');
    el.className = 'seth-pwa-note';
    el.innerHTML =
      '<b>從主畫面開啟是獨立的儲存空間</b>' +
      '<span>你之前在瀏覽器裡貼過的解鎖碼不會跟著過來，要再貼一次。' +
      '碼沒有失效，貼原本那一組就好。</span>' +
      '<button type="button">知道了</button>';
    document.body.appendChild(el);
    el.querySelector('button').onclick = function () { el.remove(); };
  }

  /* ── 還在瀏覽器：判斷要不要邀請他安裝 ──────────── */
  if (!isMobile) return;                                   // 桌機裝了沒意義
  if (localStorage.getItem(HIDE_KEY)) return;              // 關掉過就不再煩

  var visits = Number(localStorage.getItem(VISIT_KEY) || 0) + 1;
  try { localStorage.setItem(VISIT_KEY, String(visits)); } catch (e) {}

  var uses = read(USE_KEY, {});
  var usedSomething = Number(uses.sim || 0) > 0 || Number(uses.session || 0) > 0;
  // 用過工具、或第二次以上造訪，才值得問
  if (!usedSomething && visits < 2) return;

  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
  });


  function show() {
    var bar = document.createElement('div');
    bar.className = 'seth-pwa-bar';
    bar.innerHTML =
      '<b>把工具台放到主畫面</b>' +
      '<span>下次玩的時候一按就開，不用再找網址。工具照樣免費，內容完全一樣。</span>' +
      (isIOS && !deferred
        ? '<ol><li>按下面那排的「分享」<span style="display:inline">⬆︎</span></li>' +
          '<li>往下滑，選「加入主畫面」</li></ol>' +
          '<div class="seth-pwa-actions"><button type="button" data-act="ok">知道了</button>' +
          '<button type="button" class="ghost" data-act="no">不用了</button></div>'
        : '<div class="seth-pwa-actions"><button type="button" data-act="install">加到主畫面</button>' +
          '<button type="button" class="ghost" data-act="no">不用了</button></div>');
    document.body.appendChild(bar);
    track('pwa_prompt_shown', { platform: isIOS ? 'ios' : 'android' });

    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var act = b.dataset.act;
      if (act === 'install' && deferred) {
        deferred.prompt();
        deferred.userChoice.then(function (c) {
          track('pwa_install_choice', { outcome: c && c.outcome });
        });
      }
      if (act === 'no') {
        try { localStorage.setItem(HIDE_KEY, '1'); } catch (err) {}
        track('pwa_prompt_dismiss');
      }
      bar.remove();
    });
  }

  // 等一下再出現，不要跟頁面載入搶注意力
  setTimeout(show, 2500);
})();
