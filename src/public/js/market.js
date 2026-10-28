(function () {
  var uid = ''; try { uid = localStorage.getItem('sgm_uid') || ''; if (!uid) { uid = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(36).slice(2); localStorage.setItem('sgm_uid', uid); } } catch (e) { uid = 'anon-' + Math.random().toString(36).slice(2, 12); }
  var H = { 'x-uid': uid };
  var feed = document.getElementById('feed'), empty = document.getElementById('empty');
  function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }
  function fmt(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n); }
  var io = new IntersectionObserver(function (es) { es.forEach(function (x) { var v = x.target.querySelector('video'); if (x.isIntersecting) v.play().catch(function () {}); else v.pause(); }); }, { threshold: 0.65 });
  function card(v) {
    var c = el('section', 'mk-card'); c.dataset.id = v.id; c.dataset.shop = v.shopSlug;
    var vid = el('video'); vid.src = v.url; vid.loop = true; vid.muted = true; vid.playsInline = true; vid.preload = 'metadata';
    vid.addEventListener('click', function () { vid.muted = false; vid.paused ? vid.play() : vid.pause(); });
    var rail = el('div', 'mk-rail');
    var like = el('button', v.liked ? 'liked' : ''); like.dataset.like = v.id; like.innerHTML = '<b>♥</b>'; like.appendChild(el('span', '', fmt(v.likes)));
    like.onclick = function () { fetch('/market/api/videos/' + v.id + '/like', { method: 'POST', headers: H }).then(function (r) { return r.json(); }).then(function (d) { if (d.error) return; like.classList.toggle('liked', d.liked); setLikes(v.id, d.likes); }); };
    var share = el('button'); share.innerHTML = '<b>➦</b>'; share.appendChild(el('span', '', 'Share'));
    share.onclick = function () { var u = location.origin + '/market'; if (navigator.share) navigator.share({ title: v.title, url: u }).catch(function () {}); else if (navigator.clipboard) { navigator.clipboard.writeText(u); share.lastChild.textContent = 'Copied'; } };
    rail.append(like, share);
    var info = el('div', 'mk-info'), shop = el('div', 'mk-shop');
    shop.appendChild(el('span', '', v.shop));
    var fc = el('span', 'f'); fc.dataset.followers = v.shopSlug; fc.textContent = fmt(v.followers) + ' followers'; shop.appendChild(fc);
    var fol = el('button', 'mk-fol' + (v.following ? ' on' : ''), v.following ? 'Following' : 'Follow'); fol.dataset.follow = v.shopSlug;
    fol.onclick = function () { fetch('/market/api/shops/' + v.shopSlug + '/follow', { method: 'POST', headers: H }).then(function (r) { return r.json(); }).then(function (d) { if (d.error) return; document.querySelectorAll('[data-follow="' + v.shopSlug + '"]').forEach(function (b) { b.classList.toggle('on', d.following); b.textContent = d.following ? 'Following' : 'Follow'; }); setFollowers(v.shopSlug, d.followers); }); };
    shop.appendChild(fol);
    var ship = el('div', 'mk-ship'), ct = el('div', 'mk-ctry');
    var n = v.countries.length; ct.innerHTML = '📦 Parcels reached <b></b>'; ct.querySelector('b').textContent = n + (n === 1 ? ' country' : ' countries'); if (n) ct.title = v.countries.join(', ');
    var a = el('a', 'mk-shopnow', 'Shop Now'); a.href = v.link || '/book-parcel'; if (v.link) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    ship.append(ct, a);
    info.append(shop, el('div', 'mk-title', v.title), el('div', 'mk-tags', v.tags.join(' ')), ship);
    c.append(vid, rail, info); io.observe(c); return c;
  }
  function setLikes(id, n) { document.querySelectorAll('[data-like="' + id + '"] span').forEach(function (s) { s.textContent = fmt(n); }); }
  function setFollowers(s, n) { document.querySelectorAll('[data-followers="' + s + '"]').forEach(function (e) { e.textContent = fmt(n) + ' followers'; }); }
  function add(v, top) { if (empty) { empty.remove(); empty = null; } var c = card(v); top ? feed.prepend(c) : feed.appendChild(c); }
  fetch('/market/api/videos', { headers: H }).then(function (r) { return r.json(); }).then(function (d) {
    if (!d.videos.length) empty.textContent = 'No videos yet. Tap + to upload the first one!'; else d.videos.forEach(function (v) { add(v); });
  }).catch(function () { empty.textContent = 'Could not load videos.'; });
  function live() {
    var es = new EventSource('/market/api/stream');
    es.onmessage = function (m) { var d = JSON.parse(m.data);
      if (d.type === 'like') setLikes(d.id, d.likes); else if (d.type === 'follow') setFollowers(d.slug, d.followers);
      else if (d.type === 'online') document.getElementById('online').textContent = d.count;
      else if (d.type === 'video' && !feed.querySelector('[data-id="' + d.video.id + '"]')) add(d.video, true); };
  }
  live();
  var dlg = document.getElementById('up'), form = document.getElementById('up-form'), msg = document.getElementById('up-msg');
  document.getElementById('open-upload').onclick = function () { dlg.showModal(); };
  ['up-close', 'up-cancel'].forEach(function (i) { document.getElementById(i).onclick = function () { dlg.close(); }; });
  form.video.onchange = function () { document.getElementById('file-name').textContent = form.video.files[0] ? form.video.files[0].name : 'Tap to record / choose video'; };
  form.onsubmit = function (e) { e.preventDefault(); msg.textContent = 'Uploading…';
    fetch('/market/api/videos', { method: 'POST', headers: H, body: new FormData(form) }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) { msg.textContent = d.error; return; }
      form.reset(); msg.textContent = ''; dlg.close(); if (!feed.querySelector('[data-id="' + d.video.id + '"]')) add(d.video, true); feed.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function () { msg.textContent = 'Upload failed. Try a smaller video.'; }); };
})();
