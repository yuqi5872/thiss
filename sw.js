/*
 * Service Worker — 刻意什麼都不快取
 * 2026-08-11 建立
 *
 * 🔴 為什麼有這支、又為什麼它是空的
 *
 * Android Chrome 要跳出「安裝應用程式」的原生提示，條件是
 * 「有 manifest」＋「有註冊 service worker 且它有 fetch 監聽器」。
 * 所以這支的唯一任務是滿足那個條件，讓使用者裝得起來。
 *
 * 它不做離線快取，是想過之後的決定，不是偷懶：
 * 這個站已經有三層快取（Cloudflare、瀏覽器、以及 assets 的 ?v= 版號），
 * 光是 main.js 的版號就要一次改 45 頁才不會拿到舊檔。
 * 再疊一層 service worker 快取，一旦快取策略寫錯，
 * 使用者的裝置會鎖在舊版 HTML 上——而且是我們完全看不到的舊版，
 * 清 CDN 沒用、改版號沒用，只有他自己清瀏覽器資料才會好。
 *
 * 離線能用是「有更好」，被鎖在舊版是「會出事」。所以先只換裝得起來，
 * 真的要做離線再回來，而且要先想清楚怎麼強制更新。
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 純轉手，不介入。有這個監聽器才算「可安裝」。
self.addEventListener('fetch', () => {});
