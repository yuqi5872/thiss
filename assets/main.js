/* RTP 研究室 — 互動 */
(function () {
  // FAQ accordion
  document.querySelectorAll('.faq-q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.faq-item');
      item.classList.toggle('open');
    });
  });

  // 點導覽連結後收合手機選單
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    a.addEventListener('click', function () {
      var nav = document.getElementById('nav');
      if (nav) nav.classList.remove('open');
    });
  });

  // 漂浮廣告：每次載入都顯示，關掉只隱藏當下這次（重新整理就會再出現）
  var floatAd = document.querySelector('.float-ad');
  var floatAdClose = document.querySelector('.float-ad-close');
  if (floatAdClose && floatAd) {
    floatAdClose.addEventListener('click', function () { floatAd.hidden = true; });
  }

  /* 導去平台的點擊回報。
     🔴 為什麼要補：站上 44 頁都有導去 ys89.bet 的 CTA（proxy=dvjhkv），
     但沒有任何一頁在點擊時送 GA4 事件——所以行銷儀表板的「點台」永遠是「未追蹤」，
     看起來像這站完全沒有轉化。實際上是量不到，不是沒有（2026-08-10 查出來的）。

     事件名固定用 outbound_click：那是儀表板 sites.json 裡設定要讀的名字，
     改成別的名字等於白埋。linkUrl 一定要帶完整網址，代理碼與 utm_content
     都在裡面，之後才分得出是哪一篇文章導出去的。

     用 pointerdown 而不是 click：按下去到瀏覽器跳走只有幾十毫秒，
     click 常常來不及把 beacon 送出去。 */
  var sentLinks = [];
  function reportOutbound(a) {
    var url = a.href || '';
    if (sentLinks.indexOf(url) !== -1) return;   // 同一條連結同一次瀏覽只記一次
    sentLinks.push(url);
    if (typeof window.gtag !== 'function') return;
    var m = url.match(/utm_content=([^&]+)/);
    window.gtag('event', 'outbound_click', {
      link_url: url,
      link_domain: 'ys89.bet',
      cta_position: m ? decodeURIComponent(m[1]) : 'unknown'
    });
  }
  document.querySelectorAll('a[href*="ys89.bet"]').forEach(function (a) {
    a.addEventListener('pointerdown', function () { reportOutbound(a); });
    a.addEventListener('click', function () { reportOutbound(a); });
  });
})();
