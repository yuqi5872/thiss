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
})();
