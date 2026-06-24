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
})();
