(function () {
  // Public shop page: open the WhatsApp APP (not the website) when the app is installed.
  var links = document.querySelectorAll('a[data-wa]');
  Array.prototype.forEach.call(links, function (a) {
    a.addEventListener('click', function (e) {
      var num = a.getAttribute('data-wa'), msg = a.getAttribute('data-msg') || '';
      var q = encodeURIComponent(msg), web = 'https://wa.me/' + num + '?text=' + q;
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return; // normal link opens the app on iPhone
      e.preventDefault();
      var left = false; function onv() { if (document.hidden) left = true; }
      document.addEventListener('visibilitychange', onv);
      window.location.href = 'whatsapp://send?phone=' + num + '&text=' + q;
      setTimeout(function () { document.removeEventListener('visibilitychange', onv); if (!left && !document.hidden) window.open(web, '_blank'); }, 1800);
    });
  });
})();
