/* 來源記號 — 決定註冊算誰的功勞
 * 2026-08-17 建立
 * ─────────────────────────────────────────────
 * 平台後台只認代理碼，而代理碼寫死在每個註冊連結上（全站 79 條）。
 * 廣告和水軍最後都會走到這個站，人混在一起，事後分不出誰帶來的。
 *
 * 做法：LINE 機器人發給「廣告來的人」的解鎖連結會帶 ?src=ad。
 * 這支收到就記住，之後他點任何註冊連結，代理碼自動換成廣告那組。
 *
 * 🔴 為什麼是「點擊時改寫」不是「載入時掃一遍」：
 *    註冊連結有些是閘門長出來的，載入時還不存在（seth-gate / target-plan /
 *    guide-pane / jackpot-radar / handbook-gate 五支都會動態生）。
 *    掃一次一定會漏，而漏掉的那幾條會靜靜記到錯的代理碼上——錯帳比沒帳難查。
 *    改成在 document 上攔截，不管連結什麼時候生出來都吃得到。
 *
 * 🔴 為什麼這次的 localStorage 靠得住：
 *    他是在 LINE 裡點機器人發的連結，直接開在 LINE 的內建瀏覽器；
 *    之後用圖文選單開工具站也是同一個瀏覽器，記憶帶得過去。
 *    （先前想在「看廣告→跳去 LINE App」之間傳來源，那是跨 App 會斷的，
 *      所以改成由機器人在 LINE 這一端才發記號。）
 *
 * 🔴 只升不降（first-touch）：蓋過章就不洗掉。
 *    他之後從水軍貼文再進站一次，功勞仍算廣告——第一次是廣告花錢買來的。
 */
(function () {
  'use strict';

  /* 代理碼。對照表在 .claude/skills/paid-acquisition/data/proxy_map.json。
     🔴 代理碼名稱（fu003）跟網址參數（dvjhkv）是兩回事，不要混用。 */
  var PROXY = { ad: 'd83wfg' };          // fu005 落地頁面品牌曝光
  var KEY = 'seth-src-v1';

  function saved() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }

  var m = /[?&]src=([a-z]{2,12})/.exec(location.search);
  if (m && !saved()) {
    try { localStorage.setItem(KEY, m[1]); } catch (e) {}
  }
  /* 記完就把 src 從網址上清掉：留著的話他分享網址等於把別人也算成廣告來的。 */
  if (m) {
    try {
      var u = new URL(location.href);
      u.searchParams.delete('src');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  }

  var code = PROXY[saved()];
  if (!code) return;                      // 沒蓋章就什麼都不做，維持頁面上寫死的自然線代理碼

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('ys89.bet') === -1) return;
    try {
      var u = new URL(href, location.href);
      u.searchParams.set('proxy', code);
      a.setAttribute('href', u.toString());
    } catch (err) { /* 網址壞掉就維持原樣，寧可記到自然線也不要讓他點不出去 */ }
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'reg_click', { attrib_src: saved(), proxy_code: code });
    }
  }, true);
})();
