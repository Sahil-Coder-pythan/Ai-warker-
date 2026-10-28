
setTimeout(function(){ try{ setAvatar(null);}catch(e){} },0);
function setAvatar(user){
  // Profile lives only in the bottom bar. The top-right icon stays a plain bell (no letter).
  var av = document.getElementById('top-avatar');
  if (!av) return;
  var svg = av.querySelector('svg');
  var letter = av.querySelector('.am-avatar-letter');
  if (svg) svg.hidden = false;
  if (letter) letter.hidden = true;
  av.classList.remove('is-signed-in');
  av.setAttribute('aria-label', 'Notifications');
  av.title = 'Notifications';
}
(function () {
  var CATS = ['All', 'Mobiles', 'Fashion', 'Electronics', 'Home', 'Deals'];
  var CAT_ICO = {
    All: '▦', Mobiles: '📱', Fashion: '👕', Electronics: '⚡', Home: '🔌',
    Deals: '🏷', Laptops: '💻', TV: '📺', Women: '👗', Kids: '🧸', Footwear: '👟',
    Watches: '⌚', Jewellery: '💍', Beauty: '💄', Health: '💊', Furniture: '🛋',
    Garden: '🌿', Grocery: '🛒', Sports: '⚽', Automotive: '🚗', Tools: '🔧',
    Books: '📚', Movies: '🎬', Gaming: '🎮', Toys: '🎯', Pet: '🐾', Office: '📎',
    Luggage: '🧳', Handmade: '✋', Pharmacy: '💉', Other: '📦'
  };
  var all = [], cat = 'All', cart = {}, me = null, after = null;
  var productOffset = 0, productsHasMore = false, productsLoadingMore = false, productLoadToken = 0, productLoadRetries = 0, visibleProductLimit = 40;
  try { cart = JSON.parse(localStorage.getItem('sgm_cart') || '{}') || {}; } catch (e) { cart = {}; }
  var $ = function (i) { return document.getElementById(i); };
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function isHi() { return window.SGM_I18N && window.SGM_I18N.lang() === 'hi'; }
  function T(en, hi) { return window.SGM_I18N ? window.SGM_I18N.t(en, hi) : en; }
  function productCacheKey(country) { return 'sgm_products_cache_v1_' + (country || 'ALL'); }
  function saveProductCache(country, items) {
    try { localStorage.setItem(productCacheKey(country), JSON.stringify({ savedAt: Date.now(), products: items })); } catch (e) {}
  }
  function readProductCache(country) {
    try {
      var d = JSON.parse(localStorage.getItem(productCacheKey(country)) || 'null');
      return d && Array.isArray(d.products) ? d.products : [];
    } catch (e) { return []; }
  }
  function toast(m) {
    var t = el('div', ''); t.textContent = m;
    t.style.cssText = 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);background:#111;color:#fff;padding:10px 16px;border-radius:99px;font-size:13px;z-index:99999;max-width:86vw;text-align:center';
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
  }
  // Subtle luxury feedback: every interactive control visibly acknowledges a tap.
  (function installTapFeedback() {
    if (document.getElementById('sgm-tap-feedback-style')) return;
    var style = document.createElement('style'); style.id = 'sgm-tap-feedback-style';
    style.textContent = '.sgm-tap-feedback{filter:brightness(.88);transform:translateY(1px) scale(.985)!important;box-shadow:0 0 0 2px rgba(213,154,66,.42),0 5px 16px rgba(0,0,0,.12)!important;transition:filter .12s ease,transform .12s ease,box-shadow .12s ease!important} button:focus-visible,a:focus-visible,[role="button"]:focus-visible{outline:2px solid #d59a42!important;outline-offset:3px}';
    document.head.appendChild(style);
    document.addEventListener('click', function (e) {
      var target = e.target && e.target.closest && e.target.closest('button,a,[role="button"],input[type="button"],input[type="submit"]');
      if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
      target.classList.add('sgm-tap-feedback');
      window.setTimeout(function () { target.classList.remove('sgm-tap-feedback'); }, 420);
    }, true);
  })();
  function detectCountry() {
    try {
      var tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || '';
      if (/Kolkata|Calcutta/.test(tz)) return 'IN';
      var r = (navigator.language || '').split('-')[1];
      if (r) return r.toUpperCase();
    } catch (e) {}
    return 'IN';
  }
  function money(n, c) { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: c || 'INR', maximumFractionDigits: 0 }).format(n); } catch (e) { return '₹' + n; } }
  function showDeleteDialog(title, onConfirm) {
    var old = document.getElementById('am-delete-dialog'); if (old) old.remove();
    var overlay = el('div', 'am-delete-overlay'); overlay.id = 'am-delete-dialog';
    var box = el('div', 'am-delete-dialog'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    var icon = el('div', 'am-delete-icon', '⌫');
    var heading = el('h2', 'am-delete-title', 'Delete this listing?');
    var message = el('p', 'am-delete-message', '“' + (title || 'This product') + '” will be removed from your shop. This action cannot be undone.');
    var actions = el('div', 'am-delete-actions');
    var cancel = el('button', 'am-delete-cancel', 'Keep listing'); cancel.type = 'button';
    var del = el('button', 'am-delete-confirm', 'Delete listing'); del.type = 'button';
    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    cancel.onclick = close; overlay.onclick = function (e) { if (e.target === overlay) close(); };
    del.onclick = function () { close(); onConfirm(); };
    actions.append(cancel, del); box.append(icon, heading, message, actions); overlay.appendChild(box); document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey); cancel.focus();
  }
  function api(url, opt) {
    opt = opt || {};
    opt.headers = Object.assign({ 'x-sgm': '1' }, opt.headers || {});
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 60000);
    opt.signal = ctrl.signal;
    return fetch(url, opt).then(function (r) {
      clearTimeout(t);
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(T(d.error || 'Something went wrong. Try again.'));
        return d;
      });
    }).catch(function (e) {
      clearTimeout(t);
      if (e.name === 'AbortError') throw new Error('Server is waking up or slow. Please wait and refresh.');
      throw e;
    });
  }
  function jpost(url, body, method) { return api(url, { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  function saveCart() {
    try { localStorage.setItem('sgm_cart', JSON.stringify(cart)); } catch (e) {}
    var n = Object.keys(cart).reduce(function (s, k) { return s + cart[k]; }, 0);
    if ($('cart-n')) $('cart-n').textContent = n;
    var b = $('cart-n2');
    if (b) { b.textContent = n; b.setAttribute('data-zero', n ? '0' : '1'); }
  }
  function addCart(id) { cart[id] = Math.min((cart[id] || 0) + 1, 10); saveCart(); }
  function needLogin(fn) { if (me) return fn(); after = fn; authScreen('login'); }
  function tabs() {
    var t = $('tabs'); if (!t) return; t.textContent = '';
    CATS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'am-chip' + (c === cat ? ' on' : '');
      b.setAttribute('data-c', c);
      var ico = document.createElement('span');
      ico.className = 'chip-ico';
      ico.textContent = CAT_ICO[c] || '•';
      b.appendChild(ico);
      b.appendChild(document.createTextNode(c === 'Home' ? 'Home' : c));
      b.onclick = function () { cat = c; tabs(); render(); };
      t.appendChild(b);
    });
  }
  var single = null;
  function buyNow(p) {
    needLogin(function () {
      single = [{ id: p.id, qty: 1 }];
      var f = $('co-form');
      if (me) {
        if (!f.name.value) f.name.value = me.name || '';
        if (!f.phone.value && me.phone) f.phone.value = me.phone;
      }
      $('co-msg').textContent = '';
      $('co-item').textContent = p.title + ' — ' + money(p.price, p.currency);
      $('co-item').hidden = false;
      coOpen();
    });
  }
  var viewedNow = {};
  function pingView(p) {
    if (!p || !p.id || viewedNow[p.id]) return;
    viewedNow[p.id] = 1;
    try { api('/shop/api/products/' + p.id + '/view', { method: 'POST' }).catch(function () {}); } catch (e) {}
  }
  // ================= Stratic Market Chat (buyer <-> seller) =================
  var chatDlg = null, chatBody, chatFoot, chatTitle, chatSub, chatBack, chatMenuBtn, chatMenu, chatTimer = null, chatState = { tid: null, last: '' };
  function chatTime(iso) {
    try { return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }); } catch (e) { return ''; }
  }
  function chatBuild() {
    if (chatDlg) return;
    chatDlg = el('dialog', 'smc'); chatDlg.setAttribute('aria-label', 'Stratic Market Chat');
    var hd = el('div', 'smc-hd');
    chatBack = el('button', 'smc-ib', '←'); chatBack.type = 'button'; chatBack.setAttribute('aria-label', 'Back');
    var tw = el('div', 'smc-tw'); chatTitle = el('div', 'smc-t', 'Stratic Market Chat'); chatSub = el('div', 'smc-s', '');
    tw.append(chatTitle, chatSub);
    chatMenuBtn = el('button', 'smc-ib', '⋯'); chatMenuBtn.type = 'button'; chatMenuBtn.hidden = true;
    var cl = el('button', 'smc-ib', '✕'); cl.type = 'button'; cl.setAttribute('aria-label', 'Close');
    hd.append(chatBack, tw, chatMenuBtn, cl);
    chatMenu = el('div', 'smc-menu'); chatMenu.hidden = true;
    chatBody = el('div', 'smc-bd'); chatFoot = el('div', 'smc-ft');
    chatDlg.append(hd, chatMenu, chatBody, chatFoot);
    document.body.appendChild(chatDlg);
    cl.onclick = function () { chatStop(); chatDlg.close(); chatBadge(); };
    chatBack.onclick = function () { chatInbox(); };
    chatMenuBtn.onclick = function () { chatMenu.hidden = !chatMenu.hidden; };
    chatDlg.addEventListener('close', chatStop);
  }
  function chatStop() { if (chatTimer) { clearInterval(chatTimer); chatTimer = null; } chatState.tid = null; chatState.add = null; chatState.repaint = null; }
  var chatES = null;
  function chatBadgeSet(n) { var b = $('chat-badge'); if (!b) return; b.textContent = n > 9 ? '9+' : String(n); b.hidden = !n; }
  // One live connection (Server-Sent Events): new messages appear instantly, no refreshing.
  function chatConnect() {
    if (!me || chatES || !window.EventSource) return;
    try {
      chatES = new EventSource('/shop/api/chat/stream');
      chatES.addEventListener('chat', function (e) {
        var d; try { d = JSON.parse(e.data); } catch (x) { return; }
        if (typeof d.unread === 'number') chatBadgeSet(chatDlg && chatDlg.open && d.threadId && chatState.tid === d.threadId ? 0 : d.unread);
        if (d.threadId && chatState.tid === d.threadId && chatState.add) { chatState.add(d.message); return; }
        if (d.threadId && chatState.repaint) chatState.repaint();
      });
      chatES.addEventListener('busy', function () { try { chatES.close(); } catch (x) {} chatES = null; });
    } catch (x) { chatES = null; }
  }
  function chatBadge() {
    chatConnect();
    var b = $('chat-badge'); if (!b) return;
    if (!me) { b.hidden = true; return; }
    api('/shop/api/chat/unread').then(function (d) { var n = (d && d.unread) || 0; b.textContent = n > 9 ? '9+' : String(n); b.hidden = !n; }).catch(function () {});
  }
  function chatInbox() {
    chatBuild(); chatStop();
    chatTitle.textContent = 'Stratic Market Chat'; chatSub.textContent = T('Your conversations', 'आपकी बातचीत');
    chatBack.hidden = true; chatMenuBtn.hidden = true; chatMenu.hidden = true; chatFoot.textContent = ''; chatFoot.hidden = true;
    function paint() {
      api('/shop/api/chat/threads').then(function (d) {
        if (chatState.tid) return;
        chatBody.textContent = '';
        var l = (d && d.threads) || [];
        if (!l.length) {
          var em = el('div', 'smc-empty');
          em.append(el('div', 'smc-empty-i', '💬'), el('b', '', T('No conversations yet', 'अभी कोई बातचीत नहीं')), el('p', '', T('Open any product and tap "Stratic Market Chat" to ask the seller a question. When buyers message you, they appear here.', 'किसी प्रोडक्ट पर "Stratic Market Chat" दबाकर सेलर से सवाल पूछें। जब कोई खरीदार आपको मैसेज करेगा तो यहीं दिखेगा।')));
          chatBody.appendChild(em); return;
        }
        l.forEach(function (t) {
          var r = el('button', 'smc-row'); r.type = 'button';
          var av = el('span', 'smc-av', (t.otherName || '?').trim().charAt(0).toUpperCase());
          var mid = el('span', 'smc-mid');
          mid.append(el('b', '', t.otherName || '—'), el('em', '', t.productTitle || ''), el('i', '', t.lastText || T('Say hello 👋', 'नमस्ते कहें 👋')));
          var rt = el('span', 'smc-rt'); rt.appendChild(el('small', '', t.lastText ? chatTime(t.lastAt) : ''));
          if (t.unread) rt.appendChild(el('span', 'smc-un', String(t.unread)));
          r.append(av, mid, rt); r.onclick = function () { chatOpen(t); }; chatBody.appendChild(r);
        });
      }).catch(function () {});
    }
    chatState.repaint = paint; paint(); chatTimer = setInterval(paint, 15000); chatConnect();
    if (!chatDlg.open) chatDlg.showModal();
  }
  function chatOpen(t) {
    chatBuild(); chatStop(); chatState.tid = t.id; chatState.last = '';
    chatTitle.textContent = t.otherName || 'Chat'; chatSub.textContent = (t.productTitle || '');
    chatBack.hidden = false; chatMenuBtn.hidden = false; chatMenu.hidden = true;
    chatBody.textContent = ''; chatFoot.textContent = ''; chatFoot.hidden = false;
    var note = el('div', 'smc-note', T('Be polite. Never share OTPs or passwords. Pay only through the seller QR on the product page.', 'विनम्र रहें। OTP या पासवर्ड कभी न बताएँ। पेमेंट सिर्फ़ प्रोडक्ट पेज के सेलर QR से करें।'));
    chatBody.appendChild(note);
    var ta = el('textarea', 'smc-in'); ta.rows = 1; ta.maxLength = 1000; ta.placeholder = T('Type a message…', 'मैसेज लिखें…');
    var sb = el('button', 'smc-send', '➤'); sb.type = 'button'; sb.setAttribute('aria-label', 'Send');
    chatFoot.append(ta, sb);
    function setBlocked(th) {
      var bl = th.blocked; ta.disabled = bl; sb.disabled = bl;
      ta.placeholder = bl ? T('This chat is blocked', 'ये चैट ब्लॉक है') : T('Type a message…', 'मैसेज लिखें…');
      chatMenu.textContent = '';
      var b1 = el('button', '', th.blockedByMe ? T('Unblock', 'अनब्लॉक करें') : T('Block this chat', 'ये चैट ब्लॉक करें')); b1.type = 'button';
      b1.onclick = function () { chatMenu.hidden = true; jpost('/shop/api/chat/threads/' + t.id + '/block', {}).then(function (d) { setBlocked(d.thread); }).catch(function (e) { toast(e.message); }); };
      var b2 = el('button', '', T('Report', 'रिपोर्ट करें')); b2.type = 'button';
      b2.onclick = function () { chatMenu.hidden = true; var why = window.prompt(T('What is the problem?', 'क्या समस्या है?'), ''); if (why === null) return; jpost('/shop/api/chat/threads/' + t.id + '/report', { reason: why }).then(function () { toast(T('Reported. Thank you.', 'रिपोर्ट हो गई। धन्यवाद।')); }).catch(function (e) { toast(e.message); }); };
      chatMenu.append(b1, b2);
    }
    setBlocked(t);
    var seen = {};
    function addMsg(m) {
      if (!m || seen[m.id]) return; seen[m.id] = 1;
      var h = chatBody.querySelector('.smc-hello'); if (h) h.remove();
      var b = el('div', 'smc-m ' + (m.mine ? 'me' : 'ot'));
      b.appendChild(el('div', 'smc-tx', m.text)); b.appendChild(el('small', '', chatTime(m.at)));
      chatBody.appendChild(b);
      if (String(m.at) > String(chatState.last)) chatState.last = m.at;
      chatBody.scrollTop = chatBody.scrollHeight;
    }
    chatState.add = function (m) { addMsg(m); jpost('/shop/api/chat/threads/' + t.id + '/read', {}).then(function (d) { chatBadgeSet((d && d.unread) || 0); }).catch(function () {}); };
    function pull(first) {
      if (chatState.tid !== t.id) return;
      api('/shop/api/chat/threads/' + t.id + (chatState.last ? '?after=' + encodeURIComponent(chatState.last) : '')).then(function (d) {
        if (chatState.tid !== t.id) return;
        setBlocked(d.thread);
        var ms = d.messages || [];
        if (!ms.length && first) { chatBody.appendChild(el('div', 'smc-hello', T('Say hello 👋 and ask about this product.', 'नमस्ते कहें 👋 और इस प्रोडक्ट के बारे में पूछें।'))); }
        if (ms.length) { var h = chatBody.querySelector('.smc-hello'); if (h) h.remove(); }
        var stick = chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight < 90 || first;
        ms.forEach(function (m) { addMsg(m); });
        if (ms.length && stick) chatBody.scrollTop = chatBody.scrollHeight;
      }).catch(function () {});
    }
    function send() {
      var v = ta.value.trim(); if (!v || ta.disabled) return;
      sb.disabled = true;
      jpost('/shop/api/chat/threads/' + t.id + '/messages', { text: v }).then(function (d) { ta.value = ''; ta.style.height = ''; sb.disabled = false; if (d && d.message) addMsg(d.message); ta.focus(); })
        .catch(function (e) { sb.disabled = false; toast(e.message); });
    }
    sb.onclick = send;
    ta.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
    ta.oninput = function () { ta.style.height = 'auto'; ta.style.height = Math.min(110, ta.scrollHeight) + 'px'; };
    pull(true); chatTimer = setInterval(function () { pull(false); }, 12000); chatConnect();
    if (!chatDlg.open) chatDlg.showModal();
  }
  function openChatFor(p) {
    needLogin(function () {
      jpost('/shop/api/chat/start', { productId: p.id }).then(function (d) {
        var g = $('gal'); try { if (g && g.open) g.close(); } catch (e) {}
        chatBuild(); chatOpen(d.thread);
      }).catch(function (e) { toast(e.message); });
    });
  }
  function openChatInbox() { needLogin(function () { chatInbox(); }); }

  // Opens the WhatsApp APP directly (whatsapp:// link); if the app is not installed the web link opens instead.
  function openWhatsApp(num, msg) {
    var q = encodeURIComponent(msg), web = 'https://wa.me/' + num + '?text=' + q;
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) { window.location.href = web; return; }
    var left = false; function onv() { if (document.hidden) left = true; }
    document.addEventListener('visibilitychange', onv);
    window.location.href = 'whatsapp://send?phone=' + num + '&text=' + q;
    setTimeout(function () { document.removeEventListener('visibilitychange', onv); if (!left && !document.hidden) window.open(web, '_blank'); }, 1800);
  }
  // Product page only: if the photo has a wide empty (white / transparent) border, crop it away on screen
  // so the product fills the frame like on Amazon. The stored photo is never changed or deleted.
  function fillFrame(im, done) {
    done = done || function () {};
    try {
      var W = im.naturalWidth, H = im.naturalHeight; if (!W || !H || W < 200 || H < 200) { done(); return; }
      var k = Math.min(1, 360 / Math.max(W, H)), aw = Math.max(1, Math.round(W * k)), ah = Math.max(1, Math.round(H * k));
      var c = document.createElement('canvas'); c.width = aw; c.height = ah;
      var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, aw, ah);
      var d = x.getImageData(0, 0, aw, ah).data, minX = aw, minY = ah, maxX = -1, maxY = -1;
      // Background = the photo's own border colour when the border is one plain colour, else plain white.
      var R = 0, G = 0, B = 0, n = 0, e;
      function edge(xx, yy) { var o = (yy * aw + xx) * 4; R += d[o]; G += d[o + 1]; B += d[o + 2]; n++; }
      for (e = 0; e < aw; e++) { edge(e, 0); edge(e, ah - 1); } for (e = 1; e < ah - 1; e++) { edge(0, e); edge(aw - 1, e); }
      R /= n; G /= n; B /= n;
      var near = 0;
      function dist(o) { return Math.abs(d[o] - R) + Math.abs(d[o + 1] - G) + Math.abs(d[o + 2] - B); }
      for (e = 0; e < aw; e++) { if (dist(e * 4) < 60) near++; if (dist(((ah - 1) * aw + e) * 4) < 60) near++; }
      for (e = 1; e < ah - 1; e++) { if (dist(e * aw * 4) < 60) near++; if (dist((e * aw + aw - 1) * 4) < 60) near++; }
      var plain = near / n >= 0.9;
      for (var yy = 0; yy < ah; yy++) for (var xx = 0; xx < aw; xx++) {
        var o = (yy * aw + xx) * 4;
        var blank = d[o + 3] < 20 || (plain ? dist(o) < 45 : (d[o] > 238 && d[o + 1] > 238 && d[o + 2] > 238));
        if (!blank) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy; }
      }
      if (maxX < 0) { done(); return; }
      var padX = Math.round(aw * 0.03), padY = Math.round(ah * 0.03);
      minX = Math.max(0, minX - padX); minY = Math.max(0, minY - padY); maxX = Math.min(aw - 1, maxX + padX); maxY = Math.min(ah - 1, maxY + padY);
      var bw = maxX - minX + 1, bh = maxY - minY + 1, frac = (bw * bh) / (aw * ah);
      if (frac > 0.8 || frac < 0.12) { done(); return; } // already fills the frame, or nothing sensible to crop
      var sx = minX / aw * W, sy = minY / ah * H, sw = bw / aw * W, sh = bh / ah * H;
      var m = Math.min(1, 1600 / Math.max(sw, sh)), ow = Math.round(sw * m), oh = Math.round(sh * m);
      var oc = document.createElement('canvas'); oc.width = ow; oc.height = oh;
      var ox = oc.getContext('2d'); ox.fillStyle = plain ? 'rgb(' + Math.round(R) + ',' + Math.round(G) + ',' + Math.round(B) + ')' : '#fff'; ox.fillRect(0, 0, ow, oh); ox.drawImage(im, sx, sy, sw, sh, 0, 0, ow, oh);
      oc.toBlob(function (b) {
        if (!b) { done(); return; }
        im.onload = function () { im.onload = null; done(); };
        im.onerror = function () { done(); };
        im.src = URL.createObjectURL(b);
      }, 'image/jpeg', 0.92);
    } catch (e2) { done(); } // cross-origin or any problem: keep the original photo
  }
  function openGallery(p) {
    pingView(p);
    var g = $('gal'), pg = $('gal-page'); if (!g || !pg) return;
    pg.textContent = '';
    $('gal-title').textContent = p.title;
    var list = (p.imgs && p.imgs.length) ? p.imgs : [p.img];
    // 1) big swipe photos (full width, like Amazon)
    var car = el('div', 'gp-car'), dots = el('div', 'gp-dots');
    list.forEach(function (u, i) {
      var im = el('img'); im.alt = p.title; if (i) im.loading = 'lazy'; im.draggable = false;
      im.style.opacity = '0'; im.style.transition = 'opacity .28s ease';
      var shown = false, reveal = function () { if (shown) return; shown = true; im.style.opacity = '1'; };
      setTimeout(reveal, 1800);
      im.onload = function () { im.onload = null; fillFrame(im, reveal); };
      im.onerror = reveal;
      im.src = u;
      var sl = el('div', 'gp-slide'); sl.appendChild(im); car.appendChild(sl);
      dots.appendChild(el('i', i === 0 ? 'on' : ''));
    });
    car.onscroll = function () {
      var k = Math.round(car.scrollLeft / Math.max(1, car.clientWidth));
      Array.prototype.forEach.call(dots.children, function (d, j) { d.className = j === k ? 'on' : ''; });
    };
    pg.appendChild(car);
    if (list.length > 1) pg.appendChild(dots);
    // 2) title + price block
    var box = el('div', 'gp-box');
    box.appendChild(el('div', 'gp-store', T('Visit the ', 'देखें: ') + p.seller + T(' store', ' की दुकान')));
    var tt = el('h1', 'gp-title', p.title); tt.setAttribute('data-notr', '1'); box.appendChild(tt);
    var meta = el('div', 'gp-meta', '♥ ' + (p.likes || 0) + ' ' + T('likes', 'लाइक') + (p.city ? '  ·  📍 ' + p.city : '')); box.appendChild(meta);
    var pr = el('div', 'gp-price');
    if (p.mrp && p.mrp > p.price) pr.appendChild(el('span', 'gp-off', '-' + Math.round((1 - p.price / p.mrp) * 100) + '%'));
    pr.appendChild(el('b', '', money(p.price, p.currency)));
    box.appendChild(pr);
    if (p.mrp && p.mrp > p.price) box.appendChild(el('div', 'gp-mrp', 'M.R.P.: ' + money(p.mrp, p.currency)));
    box.appendChild(el('div', 'gp-tax', T('Inclusive of all taxes', 'सभी टैक्स शामिल')));
    // 3) delivery + trust info (only things that are real in this app)
    var inf = el('div', 'gp-info');
    inf.appendChild(el('div', '', '🚚 ' + T('Delivery in ', 'डिलीवरी ') + (p.days || 5) + T(' days', ' दिन में')));
    inf.appendChild(el('div', '', '💵 ' + T('Cash on Delivery available (₹49 delivery fee)', 'कैश ऑन डिलीवरी उपलब्ध (₹49 डिलीवरी फीस)')));
    if (p.hasQr) inf.appendChild(el('div', '', '📲 ' + T('Pay online with UPI / QR — no delivery fee', 'UPI / QR से ऑनलाइन पेमेंट — डिलीवरी फीस नहीं')));
    inf.appendChild(el('div', '', '✅ ' + T('Easy cancellation within 24 hours', '24 घंटे में आसान कैंसिल')));
    box.appendChild(inf);
    // 4) buttons — only here, after the person opened the product
    var bt = el('div', 'gp-btns');
    var add = el('button', 'am-pb d', T('Add to Cart', 'कार्ट में डालें')), buy = el('button', 'am-pb y', T('Buy Now', 'अभी खरीदें'));
    add.type = buy.type = 'button';
    var ownMsg = el('div', '', T('You cannot buy your own product from this Gmail. Log in with another Gmail to buy it.', 'आप इसी जीमेल से अपना प्रोडक्ट नहीं खरीद सकते। दूसरी जीमेल आईडी से लॉगिन करें।'));
    ownMsg.style.cssText = 'color:#b00020;font-weight:700;font-size:13px;margin:8px 2px 0;display:none';
    ownMsg.setAttribute('role', 'alert');
    var showOwn = function () { ownMsg.style.display = 'block'; };
    add.onclick = function () { if (p.mine) { showOwn(); return; } addCart(p.id); add.textContent = 'Added ✓'; setTimeout(function () { add.textContent = T('Add to Cart', 'कार्ट में डालें'); }, 900); };
    buy.onclick = function () { if (p.mine) { showOwn(); return; } g.close(); buyNow(p); };
    bt.append(add, buy);
    var waDigits = String(p.phone || '').replace(/\D/g, '');
    if (!p.mine && waDigits.length >= 10) {
      var wb = el('a', 'am-pb gp-wa', '💬 ' + T('Ask seller on WhatsApp', 'विक्रेता से WhatsApp पर पूछें'));
      var wnum = waDigits.length === 10 ? '91' + waDigits : waDigits;
      var wmsg = T('Hi, I saw', 'नमस्ते, मैंने देखा') + ' "' + p.title + '" (' + money(p.price, p.currency) + ') ' + T('on Stratic Market. Is it available?', 'Stratic Market पर। क्या ये उपलब्ध है?') + ' ' + location.origin + '/shop/?p=' + p.id;
      wb.href = 'https://wa.me/' + wnum + '?text=' + encodeURIComponent(wmsg); wb.target = '_blank'; wb.rel = 'noopener';
      wb.onclick = function (e) { e.preventDefault(); openWhatsApp(wnum, wmsg); };
      bt.appendChild(wb);
    }
    if (!p.mine) {
      var cb = el('button', 'am-pb gp-chat', '✦ ' + T('Stratic Market Chat', 'Stratic Market चैट') + ' — ' + T('ask the seller here', 'सेलर से यहीं पूछें')); cb.type = 'button';
      cb.onclick = function () { openChatFor(p); };
      bt.appendChild(cb);
    }
    box.appendChild(bt); box.appendChild(ownMsg);
    var sold = el('div', 'gp-sold');
    sold.append(el('div', '', T('Sold by', 'विक्रेता') + ': ' + p.seller), el('div', '', T('Ships from', 'यहाँ से भेजा जाएगा') + ': ' + (p.city || '—')));
    box.appendChild(sold);
    pg.appendChild(box);
    // 5) product details
    var det = el('div', 'gp-box');
    det.appendChild(el('h2', 'gp-h', T('Product details', 'प्रोडक्ट की जानकारी')));
    var tb = el('div', 'gp-tbl');
    function row(k, v) { if (v) { tb.append(el('span', 'k', k), el('span', 'v', v)); } }
    row(T('Category', 'कैटेगरी'), p.category);
    row(T('Product ID', 'प्रोडक्ट ID'), p.productCode);
    row(T('Seller', 'विक्रेता'), p.seller);
    row(T('City', 'शहर'), p.city);
    row(T('Listed on', 'लिस्ट हुआ'), p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '');
    det.appendChild(tb);
    if (p.description) { var ds = el('p', 'gp-desc', p.description); ds.setAttribute('data-notr', '1'); det.appendChild(ds); }
    pg.appendChild(det);
    // 6) similar products: same category only, loads more while scrolling
    var sim = all.filter(function (x) { return x.id !== p.id && x.category === p.category; });
    if (sim.length) {
      var sb = el('div', 'gp-box');
      sb.appendChild(el('h2', 'gp-h', T('Similar products', 'ऐसे ही और प्रोडक्ट')));
      var sg = el('div', 'gp-sim'); sb.appendChild(sg); pg.appendChild(sb);
      var shown = 0, sent = el('div', 'gp-sent'); sb.appendChild(sent);
      function more() {
        sim.slice(shown, shown + 8).forEach(function (x) {
          var c = el('div', 'gp-card'), im = el('img'); im.src = x.img; im.alt = x.title; im.loading = 'lazy';
          var t = el('div', 'gp-ct', x.title); t.setAttribute('data-notr', '1');
          var pp = el('div', 'gp-cp'); pp.appendChild(el('b', '', money(x.price, x.currency)));
          if (x.mrp && x.mrp > x.price) { pp.appendChild(el('s', '', money(x.mrp, x.currency))); pp.appendChild(el('em', '', Math.round((1 - x.price / x.mrp) * 100) + '% off')); }
          c.append(im, t, pp); c.onclick = function () { openGallery(x); g.scrollTop = 0; };
          sg.appendChild(c);
        });
        shown += 8;
        if (shown >= sim.length && sentObs) { sentObs.disconnect(); sent.remove(); }
      }
      var sentObs = null;
      more();
      if (shown < sim.length && 'IntersectionObserver' in window) {
        sentObs = new IntersectionObserver(function (en) { if (en[0].isIntersecting) more(); }, { root: g, rootMargin: '400px' });
        sentObs.observe(sent);
      } else { while (shown < sim.length) more(); }
    }
    if (!g.open) g.showModal();
    g.scrollTop = 0;
  }
  function openBuy(p) {
    pingView(p);
    var d = $('buy');
    $('buy-title').textContent = p.title;
    $('buy-price').textContent = money(p.price, p.currency);
    $('buy-seller').textContent = p.seller + (p.city ? ' · ' + p.city : '');
    var ph = p.phone || '';
    $('buy-phone').textContent = ph || 'Not shared';
    $('buy-call').href = ph ? ('tel:' + ph.replace(/\s/g, '')) : '#';
    $('buy-call').style.display = ph ? '' : 'none';
    $('buy-wa').href = ph ? ('https://wa.me/' + ph.replace(/\D/g, '')) : '#';
    $('buy-wa').style.display = ph ? '' : 'none';
    if (!d.open) d.showModal();
  }
  // ---- Launch zone: real product/lifestyle photographs only ----
  var PROMO = [
    { k: 'girl', en: "Women's Fashion", hi: 'महिलाओं का फैशन' },
    { k: 'kitchen', en: 'Home & Kitchen', hi: 'घर और किचन' },
    { k: 'mobiles', en: 'Mobiles & Electronics', hi: 'मोबाइल और इलेक्ट्रॉनिक्स' },
    { k: 'footwear', en: 'Footwear', hi: 'जूते-चप्पल' },
    { k: 'beauty', en: 'Beauty & Care', hi: 'ब्यूटी और केयर' },
    { k: 'watches', en: 'Watches & Accessories', hi: 'घड़ियाँ और एक्सेसरीज़' },
    { k: 'books', en: 'Books & Learning', hi: 'किताबें और पढ़ाई' },
    { k: 'toys', en: 'Toys & Games', hi: 'खिलौने और खेल' },
    { k: 'grocery', en: 'Grocery & Food', hi: 'किराना और खाना' },
    { k: 'sports', en: 'Sports & Fitness', hi: 'खेल और फिटनेस' },
    { k: 'bags', en: 'Bags & Luggage', hi: 'बैग और सामान' },
    { k: 'computers', en: 'Computers & Office', hi: 'कंप्यूटर और ऑफिस' }
  ];
  function openSellFromPromo() { var b = $('open-sell'); if (b) b.click(); }
  function promoZone() {
    var z = el('section', 'pz'); z.style.gridColumn = '1 / -1';
    var top = el('div', 'pz-top');
    top.append(el('span', 'pz-l', '🪔 ' + T('YOUR SHOP ZONE', 'आपकी दुकान ज़ोन') + ' ✨'));
    z.appendChild(top);
    var gr = el('div', 'pz-grid');
    PROMO.forEach(function (it) {
      var t = el('button', 'pz-tile'); t.type = 'button';
      var art = el('div', 'pz-art');
      var ph = new Image(); ph.alt = it.en; ph.className = 'pz-photo'; ph.loading = 'lazy'; ph.decoding = 'async';
      ph.onerror = function () { art.classList.add('pz-photo-missing'); ph.remove(); };
      ph.src = '/static/img/promo/' + it.k + '.jpg'; art.appendChild(ph);
      t.append(el('span', 'pz-badge', T('SELL HERE', 'यहाँ बेचें')), art, el('span', 'pz-name', T(it.en, it.hi)));
      t.onclick = openSellFromPromo;
      gr.appendChild(t);
    });
    z.appendChild(gr);
    var cta = el('button', 'pz-cta', '＋ ' + T('Upload your first product', 'अपना पहला प्रोडक्ट अपलोड करें')); cta.type = 'button'; cta.onclick = openSellFromPromo;
    z.appendChild(cta);
    return z;
  }
  function refreshPromoHeroLanguage() {
    var h = document.getElementById('pz-hero');
    if (!h) return;
    var set = function (sel, en, hi) { var n = h.querySelector(sel); if (n) n.textContent = T(en, hi); };
    set('.pz-kicker', 'YOUR BUSINESS. YOUR BIG MOMENT.', 'दुकानदारों के नाम एक पैग़ाम');
    set('.pz-h1', 'Small shop. Big dreams. Unlimited possibilities.');
    set('.pz-h2', 'Reach customers across India—from big cities to small towns.', 'भारत के बड़े शहरों से छोटे कस्बों तक—अपने प्रोडक्ट नए ग्राहकों तक पहुँचाने की शुरुआत करें।');
    set('.pz-motto', '100% India-wide opportunity. Bring your shop online today.', 'भारतभर में नए ग्राहकों तक पहुँचने का मौका—अपनी दुकान आज ही ऑनलाइन लाएँ!');
    var b = h.querySelector('.pz-hb'); if (b) b.textContent = '✦  ' + T('Bring your shop online', 'अपनी दुकान ऑनलाइन लाएँ') + '  →';
  }
  window.addEventListener('sgm:language-changed', refreshPromoHeroLanguage);
  function promoHero() {
    var t = $('tabs'); if (!t || document.getElementById('pz-hero')) return;
    var h = el('section', 'pz-hero'); h.id = 'pz-hero';
    h.append(
      el('div', 'pz-kicker', T('YOUR BUSINESS. YOUR BIG MOMENT.', 'दुकानदारों के नाम एक पैग़ाम')),
      el('div', 'pz-h1', T('Small shop. Big dreams. Unlimited possibilities.')),
      el('div', 'pz-h2', T('Reach customers across India—from big cities to small towns.', 'भारत के बड़े शहरों से छोटे कस्बों तक—अपने प्रोडक्ट नए ग्राहकों तक पहुँचाने की शुरुआत करें।')),
      el('div', 'pz-motto', T('100% India-wide opportunity. Bring your shop online today.', 'भारतभर में नए ग्राहकों तक पहुँचने का मौका—अपनी दुकान आज ही ऑनलाइन लाएँ!'))
    );
    var b = el('button', 'pz-hb', '✦  ' + T('Bring your shop online', 'अपनी दुकान ऑनलाइन लाएँ') + '  →'); b.type = 'button'; b.onclick = openSellFromPromo; h.appendChild(b);
    t.parentNode.insertBefore(h, t);
  }
  promoHero();
  refreshPromoHeroLanguage();

  // "Shops in your city": real cities and shop counts from live listings; tap a city to see only those shops.
  var cityPick = ''; try { cityPick = localStorage.getItem('sgm_city') || ''; } catch (e) {}
  function cityStrip() {
    var host = $('city-strip'); if (!host) return;
    var map = {};
    all.forEach(function (p) {
      var c = String(p.city || '').trim(); if (!c) return;
      var k = c.toLowerCase(); if (!map[k]) map[k] = { name: c, sellers: {} };
      map[k].sellers[p.seller || p.id] = 1;
    });
    var keys = Object.keys(map).sort(function (a, b) { return Object.keys(map[b].sellers).length - Object.keys(map[a].sellers).length; });
    if (cityPick && !map[cityPick]) cityPick = '';
    host.textContent = ''; host.hidden = !keys.length; if (!keys.length) return;
    host.appendChild(el('div', 'cs-h', '📍 ' + T('Shops in your city', 'आपके शहर की दुकानें')));
    var row = el('div', 'cs-row');
    function chip(label, key) {
      var b = el('button', 'cs-chip' + (cityPick === key ? ' on' : ''), label); b.type = 'button';
      b.onclick = function () { cityPick = key; try { localStorage.setItem('sgm_city', key); } catch (e) {} render(); };
      row.appendChild(b);
    }
    chip(T('All cities', 'सभी शहर'), '');
    keys.slice(0, 30).forEach(function (k) { var n = Object.keys(map[k].sellers).length; chip(map[k].name + ' · ' + n + ' ' + (n > 1 ? T('shops', 'दुकानें') : T('shop', 'दुकान')), k); });
    host.appendChild(row);
  }
  function render() {
    var q = $('q').value.trim().toLowerCase(), s = $('sort').value;
    cityStrip();
    var l = all.filter(function (p) {
      return (cat === 'All' || (cat === 'Deals' ? p.off > 0 : p.category === cat)) &&
        (!cityPick || String(p.city || '').trim().toLowerCase() === cityPick) &&
        (!q || (p.title + ' ' + p.seller + ' ' + (p.description || '')).toLowerCase().indexOf(q) > -1);
    });
    if (s === 'lo') l.sort(function (a, b) { return a.price - b.price; });
    else if (s === 'hi') l.sort(function (a, b) { return b.price - a.price; });
    $('head').textContent = cat === 'All' ? 'All products' : cat;
    var g = $('grid'); g.textContent = '';
    if (!all.length) { g.appendChild(promoZone()); return; }
    if (!l.length) {
      var box = document.createElement('div');
      box.className = 'am-empty-box';
      box.innerHTML = all.length
        ? '<h2 class="empty-title">No matches</h2><p class="empty-sub">Try another search or category</p>'
        : '<div class="empty-illu" aria-hidden="true"><svg width="300" height="250" viewBox="0 0 300 250" fill="none"><g stroke="#28211b" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"><path d="M75 92 151 51 230 84 153 126Z" fill="#d8c3a8"/><path d="M75 92 42 58 131 28 151 51Z" fill="#dfccb4"/><path d="M151 51 176 25 266 53 230 84Z" fill="#e3d1b9"/><path d="M75 92 46 126 113 157 153 126Z" fill="#d6bea0"/><path d="M230 84 263 125 190 157 153 126Z" fill="#d8c3a8"/><path d="M75 92 153 126 230 84" fill="#bfa98d"/><path d="M75 92 75 190 153 222 153 126Z" fill="#d9c4a8"/><path d="M153 126 230 84 230 184 153 222Z" fill="#cbb697"/><path d="M42 58 58 61M69 54l15-4M186 44l57 18M61 133l50 21M199 145l42-19" stroke-width="1.5"/><path d="M85 100 135 122M168 128l48-29M85 182l1 7M94 192l8 3M215 190l-7 3M169 213l34-13" stroke-width="1.5"/><path d="M153 126v96" stroke-width="1.5"/></g></svg></div><h2 class="empty-title">Your Bazaar is Empty</h2><p class="empty-sub">Be the first to sell from your city to the World</p><button type="button" class="am-cta" id="empty-sell">Sell Your First Product +</button>';
      g.appendChild(box);
      if (productsHasMore) {
        var moreEmpty = el('button', 'am-btn', productsLoadingMore ? 'Loading…' : 'Load more products');
        moreEmpty.type = 'button';
        moreEmpty.style.cssText = 'display:block;margin:16px auto;min-height:42px';
        moreEmpty.disabled = productsLoadingMore;
        moreEmpty.onclick = loadMoreProducts;
        g.appendChild(moreEmpty);
      }
      var es = document.getElementById('empty-sell');
      if (es) es.onclick = function () { var s = $('open-sell'); if (s) s.click(); };
      return;
    }
    // Keep the DOM bounded on low-memory phones even if the seller catalogue grows.
    // The complete fetched list remains in memory for cart/search; only a small window renders.
    var visible = l.slice(0, visibleProductLimit);
    visible.forEach(function (p) {
      var c = el('div', 'am-card'), im = el('img');
      im.src = p.img || p.image || ''; im.alt = p.title; im.loading = 'lazy';
      var pr = el('div', 'am-price');
      pr.appendChild(el('b', '', money(p.price, p.currency)));
      if (p.mrp && p.mrp > p.price) {
        pr.appendChild(el('s', '', money(p.mrp, p.currency)));
        var off = Math.round((1 - p.price / p.mrp) * 100);
        pr.appendChild(el('em', '', off + '% off'));
      }
      var bt = el('div', 'am-btns');
      var a = el('button', 'am-pb d', 'Add to Cart');
      var b = el('button', 'am-pb y', 'Buy Now');
      a.onclick = function () { addCart(p.id); a.textContent = 'Added ✓'; setTimeout(function () { a.textContent = 'Add to Cart'; }, 900); };
      b.onclick = function () { buyNow(p); };
      if (p.mine) { a.disabled = b.disabled = true; a.style.opacity = b.style.opacity = '.4'; }
      bt.append(a, b);
      var top = el('div', 'am-card-top');
      top.appendChild(im);
      if (p.imgs && p.imgs.length > 1) { top.appendChild(el('span', 'am-multi', '▦ ' + p.imgs.length)); }
      im.style.cursor = 'zoom-in';
      im.onclick = function () { openGallery(p); };
      var lk = el('button', 'am-like' + (p.liked ? ' on' : ''), (p.liked ? '♥ ' : '♡ ') + (p.likes || 0));
      lk.type = 'button';
      if (p.mine) lk.classList.add('own');
      lk.onclick = function (e) {
        e.stopPropagation();
        if (p.mine) { alert('You cannot like your own product from this Gmail. Log in with another Gmail to like it.'); return; }
        if (!me) { authScreen('login'); return; }
        lk.disabled = true;
        api('/shop/api/products/' + p.id + '/like', { method: 'POST' }).then(function (r) {
          p.likes = r.count; p.liked = r.liked;
          lk.className = 'am-like' + (r.liked ? ' on' : '');
          lk.textContent = (r.liked ? '♥ ' : '♡ ') + r.count;
          lk.disabled = false;
        }).catch(function (er) { lk.disabled = false; alert(er.message); });
      };
      top.appendChild(lk);
      if (p.mine) {
        var menu = el('button', 'am-dots', '⋮');
        menu.type = 'button';
        menu.onclick = function (e) {
          e.stopPropagation();
          openOwnerMenu(menu, p);
        };
        top.appendChild(menu);
      }
      var body = el('div', 'am-card-body');
      var ttl = el('div', 't', p.title); ttl.setAttribute('data-notr', '1'); body.appendChild(ttl);
      body.appendChild(el('div', 'am-s', p.seller + (p.city ? ' · ' + p.city : '')));
      body.appendChild(pr);
      body.appendChild(el('div', 'am-s', '🚚 ' + (p.days || 5) + ' ' + T('days')));
      c.style.cursor = 'pointer'; c.onclick = function () { openGallery(p); };
      c.append(top, body);
      g.appendChild(c);
    });
    if (cat === 'All' && !q) g.appendChild(promoZone());
    if (l.length > visibleProductLimit || productsHasMore) {
      var canRevealLoaded = l.length > visibleProductLimit;
      var more = el('button', 'am-btn', productsLoadingMore ? 'Loading…' : (canRevealLoaded ? 'Show more products' : 'Load more products'));
      more.type = 'button';
      more.style.cssText = 'display:block;margin:16px auto;min-height:42px';
      more.disabled = productsLoadingMore;
      more.onclick = function () {
        if (canRevealLoaded) { visibleProductLimit += 40; render(); }
        else loadMoreProducts();
      };
      g.appendChild(more);
    }
  }
  // ---- Owner menu (⋮): Delete, Edit ----
  function openOwnerMenu(anchor, p) {
    var old = document.getElementById('am-owner-menu'); if (old) { old.remove(); }
    var m = el('div', 'am-omenu'); m.id = 'am-owner-menu';
    var d = el('button', 'am-omi del', '🗑  ' + T('Delete', 'डिलीट')); d.type = 'button';
    var ed = el('button', 'am-omi', '✏️  ' + T('Edit', 'एडिट')); ed.type = 'button';
    function close() { m.remove(); document.removeEventListener('click', close); }
    d.onclick = function (e) { e.stopPropagation(); close(); showDeleteDialog(p.title, function () { api('/shop/api/products/' + p.id, { method: 'DELETE' }).then(load).catch(function (err) { alert(err.message); }); }); };
    ed.onclick = function (e) { e.stopPropagation(); close(); openEdit(p); };
    m.append(d, ed);
    anchor.parentNode.appendChild(m);
    setTimeout(function () { document.addEventListener('click', close); }, 0);
  }
  function prepPhoto(file) {
    return new Promise(function (ok, no) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        URL.revokeObjectURL(u);
        var sc = Math.min(1, 2560 / Math.max(im.width, im.height)), w = Math.round(im.width * sc), h = Math.round(im.height * sc);
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        var cx = cv.getContext('2d'); if ('filter' in cx) cx.filter = 'contrast(1.05) saturate(1.1) brightness(1.02)';
        cx.drawImage(im, 0, 0, w, h);
        cv.toBlob(function (b) { if (b && b.size > 3.8 * 1024 * 1024) cv.toBlob(ok, 'image/jpeg', 0.8); else ok(b); }, 'image/jpeg', 0.92);
      };
      im.onerror = function () { URL.revokeObjectURL(u); no(new Error('Could not read this photo.')); };
      im.src = u;
    });
  }
  function openEdit(p) {
    var old = document.getElementById('am-edit'); if (old) old.remove();
    var dlg = document.createElement('dialog'); dlg.id = 'am-edit'; dlg.className = 'am-edit';
    var f = document.createElement('form');
    function field(label, node) { var l = document.createElement('label'); l.append(label, node); return l; }
    function inp(name, val, attrs) { var i = document.createElement('input'); i.name = name; i.value = val == null ? '' : val; Object.keys(attrs || {}).forEach(function (k) { i.setAttribute(k, attrs[k]); }); return i; }
    var head = el('div', 'am-row'); head.append(el('h2', '', T('Edit product', 'प्रोडक्ट एडिट करें')));
    var x = el('button', 'am-x', '✕'); x.type = 'button'; x.onclick = function () { dlg.close(); }; head.appendChild(x);
    f.appendChild(head);
    // photos
    var keep = (p.imgs && p.imgs.length ? p.imgs : [p.img]).map(function (u, i) { return { idx: i, url: u }; });
    var added = [];
    var pwrap = el('div', 'am-ephotos');
    function drawPhotos() {
      pwrap.textContent = '';
      keep.forEach(function (k, i) {
        var t = el('div', 'am-eph'), im = el('img'); im.src = k.url; var rm = el('button', 'am-eph-x', '✕'); rm.type = 'button';
        rm.onclick = function () { keep.splice(i, 1); drawPhotos(); }; t.append(im, rm); pwrap.appendChild(t);
      });
      added.forEach(function (a, i) {
        var t = el('div', 'am-eph'), im = el('img'); im.src = a.url; var rm = el('button', 'am-eph-x', '✕'); rm.type = 'button';
        rm.onclick = function () { added.splice(i, 1); drawPhotos(); }; t.append(im, el('span', 'am-eph-new', 'NEW'), rm); pwrap.appendChild(t);
      });
      if (keep.length + added.length < 12) {
        var add = el('label', 'am-eph am-eph-add'); add.append(el('span', '', '＋'), el('small', '', T('Add photo', 'फ़ोटो जोड़ें')));
        var fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true; fi.hidden = true;
        fi.onchange = function () {
          var files = Array.prototype.slice.call(fi.files || []).slice(0, 12 - keep.length - added.length);
          msg.textContent = T('Preparing photos…', 'फ़ोटो तैयार हो रही हैं…');
          files.reduce(function (pr, file) { return pr.then(function () { return prepPhoto(file).then(function (b) { added.push({ blob: b, url: URL.createObjectURL(b) }); }); }); }, Promise.resolve())
            .then(function () { msg.textContent = ''; drawPhotos(); }).catch(function (er) { msg.textContent = er.message; });
        };
        add.appendChild(fi); pwrap.appendChild(add);
      }
    }
    var msg = el('p', 'am-emsg', '');
    f.appendChild(el('div', 'am-elabel', T('Photos (tap ✕ to remove, ＋ to add)', 'फ़ोटो (हटाने के लिए ✕, जोड़ने के लिए ＋)')));
    f.appendChild(pwrap); drawPhotos();
    f.appendChild(field(T('Product name', 'प्रोडक्ट का नाम'), inp('title', p.title, { maxlength: 140, required: 'required' })));
    var two = el('div', 'am-2');
    two.append(field(T('Price', 'कीमत'), inp('price', p.price, { type: 'number', min: 1, step: 'any', required: 'required' })), field('MRP', inp('mrp', p.mrp || '', { type: 'number', min: 1, step: 'any' })));
    f.appendChild(two);
    var cs = document.createElement('select'); cs.name = 'category';
    var srcSel = document.querySelector('#sell-form select[name=category]');
    if (srcSel) Array.prototype.forEach.call(srcSel.options, function (o) { var op = document.createElement('option'); op.textContent = o.textContent; cs.appendChild(op); });
    cs.value = p.category || 'Other';
    f.appendChild(field(T('Category', 'कैटेगरी'), cs));
    var ta = document.createElement('textarea'); ta.name = 'description'; ta.rows = 3; ta.maxLength = 500; ta.value = p.description || '';
    f.appendChild(field(T('Description', 'विवरण'), ta));
    var cityRow = el('div', 'am-2');
    cityRow.append(field(T('City / Town', 'शहर'), inp('city', p.city, { maxlength: 80, required: 'required' })), field(T('District', 'ज़िला'), inp('district', p.district || '', { maxlength: 80 })));
    f.appendChild(cityRow);
    var ad = document.createElement('textarea'); ad.name = 'address'; ad.rows = 2; ad.maxLength = 300; ad.required = true; ad.value = p.address || '';
    f.appendChild(field(T('Full shop address', 'पूरा पता'), ad));
    f.appendChild(field(T('Expiry date (if any)', 'एक्सपायरी तारीख़'), inp('expiresAt', p.expiresAt ? String(p.expiresAt).slice(0, 10) : '', { type: 'date' })));
    if (p.hasQr) {
      var q = document.createElement('input'); q.type = 'file'; q.accept = 'image/png,image/jpeg,image/webp'; q.name = 'qrfile';
      f.appendChild(field(T('Replace payment QR (optional)', 'पेमेंट QR बदलें (ज़रूरी नहीं)'), q));
    }
    f.appendChild(msg);
    var act = el('div', 'am-eact'); var cn = el('button', 'am-btn', T('Cancel', 'रद्द करें')); cn.type = 'button'; cn.onclick = function () { dlg.close(); };
    var sv = el('button', 'am-btn y', T('Save changes', 'बदलाव सेव करें')); sv.type = 'submit'; act.append(cn, sv); f.appendChild(act);
    f.onsubmit = function (e) {
      e.preventDefault();
      if (!keep.length && !added.length) { msg.textContent = T('Keep or add at least one photo.', 'कम से कम एक फ़ोटो रखें।'); return; }
      var fd = new FormData();
      ['title', 'price', 'mrp', 'category', 'description', 'city', 'district', 'address', 'expiresAt'].forEach(function (k) { fd.append(k, f.elements[k].value); });
      fd.append('keep', JSON.stringify(keep.map(function (k) { return k.idx; })));
      added.forEach(function (a, i) { fd.append('extra', a.blob, 'e' + i + '.jpg'); });
      var qf = f.elements.qrfile && f.elements.qrfile.files && f.elements.qrfile.files[0]; if (qf) fd.append('qr', qf, 'qr.jpg');
      sv.disabled = true; sv.textContent = T('Saving…', 'सेव हो रहा है…'); msg.textContent = '';
      api('/shop/api/products/' + p.id + '/edit', { method: 'POST', body: fd }).then(function () { dlg.close(); load(); })
        .catch(function (er) { msg.textContent = er.message; sv.disabled = false; sv.textContent = T('Save changes', 'बदलाव सेव करें'); });
    };
    dlg.appendChild(f); document.body.appendChild(dlg); dlg.addEventListener('close', function () { dlg.remove(); });
    dlg.showModal();
  }

  function load() {
    var token = ++productLoadToken;
    var c = (me && me.country) || localStorage.getItem('sgm_country') || detectCountry();
    productOffset = 0; productsHasMore = false; productsLoadingMore = false; visibleProductLimit = 40;
    if (!all.length) {
      var cachedProducts = readProductCache(c);
      if (cachedProducts.length) { all = cachedProducts; render(); }
    } else { render(); }
    var url = '/shop/api/products?limit=20&offset=0' + (c ? ('&country=' + encodeURIComponent(c)) : '');
    api(url).then(function (d) {
      if (token !== productLoadToken) return;
      all = d.products || [];
      productLoadRetries = 0;
      saveProductCache(c, all);
      productOffset = Number(d.nextOffset) || all.length;
      productsHasMore = !!d.hasMore;
      // A page is not the complete catalog: do not discard cart items just because
      // their products are on a later page.
      Object.keys(cart).forEach(function (id) {
        var qty = Number(cart[id]);
        if (!Number.isFinite(qty) || qty < 1) delete cart[id];
        else cart[id] = Math.min(Math.floor(qty), 10);
      });
      saveCart();
      render();
      checkNewOrders();
    }).catch(function (e) {
      if (token !== productLoadToken) return;
      // Keep the last successful catalog visible during temporary network/API failures.
      if (!all.length) {
        all = readProductCache(c);
        if (all.length) render();
        else {
          if ($('grid')) $('grid').textContent = e.message || 'Could not load';
          // Retry brief connection failures automatically without clearing any visible catalog.
          if (productLoadRetries < 3) {
            productLoadRetries++;
            window.setTimeout(function () { if (token === productLoadToken) load(); }, 2500);
          }
        }
      }
    });
  }
  function loadMoreProducts() {
    if (productsLoadingMore || !productsHasMore) return;
    productsLoadingMore = true; render();
    var token = productLoadToken;
    var c = (me && me.country) || localStorage.getItem('sgm_country') || detectCountry();
    var url = '/shop/api/products?limit=20&offset=' + encodeURIComponent(productOffset) + (c ? ('&country=' + encodeURIComponent(c)) : '');
    api(url).then(function (d) {
      if (token !== productLoadToken) return;
      var seen = Object.create(null);
      all.forEach(function (p) { seen[String(p.id)] = true; });
      (d.products || []).forEach(function (p) { if (!seen[String(p.id)]) { seen[String(p.id)] = true; all.push(p); } });
      productOffset = Number(d.nextOffset) || (productOffset + (d.products || []).length);
      saveProductCache(c, all);
      productsHasMore = !!d.hasMore;
      productsLoadingMore = false;
      render();
    }).catch(function (e) {
      productsLoadingMore = false;
      render();
      toast(e.message || 'Could not load more products');
    });
  }
  function openCart() {
    var l = $('cart-list'); l.textContent = '';
    var tot = {}, n = 0, units = 0;
    Object.keys(cart).forEach(function (id) {
      var p = all.find(function (x) { return x.id === id; });
      if (!p) return; n++; units += cart[id];
      tot[p.currency] = (tot[p.currency] || 0) + p.price * cart[id];
      var r = el('div', 'ct-item'), im = el('img', 'ct-img'); im.src = p.img || p.image || ''; im.alt = p.title; im.loading = 'lazy';
      var d = el('div', 'ct-info');
      d.appendChild(el('div', 'ct-title', p.title));
      d.appendChild(el('div', 'ct-seller', T('Sold by', 'विक्रेता') + ': ' + (p.seller || '—')));
      d.appendChild(el('div', 'ct-price', money(p.price, p.currency)));
      var q = el('div', 'ct-qty');
      var mi = el('button', 'ct-qb', '−'); mi.type = 'button'; mi.setAttribute('aria-label', 'Decrease');
      var qn = el('span', 'ct-qn', String(cart[id]));
      var pl = el('button', 'ct-qb', '+'); pl.type = 'button'; pl.setAttribute('aria-label', 'Increase');
      mi.disabled = cart[id] <= 1; pl.disabled = cart[id] >= 10;
      mi.onclick = function () { if (cart[id] > 1) { cart[id]--; saveCart(); openCart(); } };
      pl.onclick = function () { if (cart[id] < 10) { cart[id]++; saveCart(); openCart(); } };
      q.append(mi, qn, pl);
      var rm = el('button', 'ct-rm', T('Remove', 'हटाएँ')); rm.type = 'button';
      rm.onclick = function () { delete cart[id]; saveCart(); openCart(); };
      var ln = el('div', 'ct-line'); ln.append(q, rm);
      d.appendChild(ln);
      r.append(im, d); l.appendChild(r);
    });
    if (!n) {
      var em = el('div', 'ct-empty');
      em.append(el('div', 'ct-empty-i', '🛒'), el('b', '', T('Your cart is empty', 'आपका कार्ट खाली है')), el('p', '', T('Tap "Add to Cart" on any product to save it here and buy several items together.', 'किसी भी प्रोडक्ट पर "कार्ट में डालें" दबाएँ, वो यहाँ सेव हो जाएगा और आप कई चीज़ें साथ में खरीद सकते हैं।')));
      l.appendChild(em);
    } else {
      var sm = el('div', 'ct-sum');
      var r1 = el('div', 'ct-row'); r1.append(el('span', '', T('Items', 'आइटम') + ' (' + units + ')'), el('b', '', Object.keys(tot).map(function (c) { return money(tot[c], c); }).join(' + ')));
      var r2 = el('div', 'ct-row ct-tot'); r2.append(el('span', '', T('Subtotal', 'कुल')), el('b', '', Object.keys(tot).map(function (c) { return money(tot[c], c); }).join(' + ')));
      sm.append(r1, el('div', 'ct-note', T('Delivery fee is added at checkout: ₹49 for Cash on Delivery, free with online payment.', 'डिलीवरी फीस चेकआउट पर जुड़ेगी: कैश ऑन डिलीवरी में ₹49, ऑनलाइन पेमेंट में फ्री।')), r2);
      l.appendChild(sm);
      var ck = el('button', 'am-btn y', T('Checkout', 'चेकआउट') + ' · ' + Object.keys(tot).map(function (c) { return money(tot[c], c); }).join(' + '));
      ck.style.width = '100%'; ck.type = 'button';
      ck.onclick = function () { needLogin(function () {
        single = null; $('co-item').hidden = true; $('co-msg').textContent = '';
        var f = $('co-form');
        if (me) { if (!f.name.value) f.name.value = me.name || ''; if (!f.phone.value && me.phone) f.phone.value = me.phone; }
        $('cart').close(); coOpen();
      }); };
      l.appendChild(ck);
    }
    if (!$('cart').open) $('cart').showModal();
  }
  $('open-cart').onclick = $('open-cart2').onclick = function (e) { e.preventDefault(); openCart(); };
  $('cart-close').onclick = function () { $('cart').close(); };
  $('buy-close').onclick = function () { $('buy').close(); };
  if ($('gal-close')) $('gal-close').onclick = function () { $('gal').close(); };
  $('q').oninput = render; $('sort').onchange = render;

  var scr = $('auth');
  function authScreen(mode) {
    var reg = mode === 'register';
    var scr = $('auth');
    scr.hidden = false;
    scr.dataset.mode = mode;
    $('au-h').textContent = reg ? 'Create account' : 'Sign in';
    $('au-name-l').hidden = !reg;
    if ($('au-phone-l')) $('au-phone-l').hidden = !reg;
    if ($('au-country-l')) $('au-country-l').hidden = !reg;
    if ($('au-lang-l')) $('au-lang-l').hidden = !reg;
    $('au-go').textContent = reg ? 'Create account' : 'Sign in';
    $('au-sw').textContent = reg ? 'Already have an account? Sign in' : 'Create your account';
    $('au-m').textContent = '';
  }
  function authClose() { scr.hidden = true; document.body.style.overflow = ''; }
  if ($('au-sw')) $('au-sw').onclick = function (e) { e.preventDefault(); authScreen(scr.dataset.mode === 'login' ? 'register' : 'login'); };
  $('au-skip').onclick = function (e) { e.preventDefault(); try { sessionStorage.setItem('sgm_skip', '1'); } catch (x) {} after = null; authClose(); };
  $('au-form').onsubmit = function (e) {
    e.preventDefault();
    var f = e.target, reg = $('auth').dataset.mode === 'register';
    var body = { email: f.email.value, password: f.password.value };
    if (reg) {
      body.name = f.name.value;
      body.phone = f.phone.value;
      body.country = f.country.value;
      body.lang = f.lang.value;
      if (!body.phone) { $('au-m').textContent = 'Mobile number required.'; return; }
    }
    $('au-m').textContent = reg ? 'Creating…' : 'Signing in…';
    jpost(reg ? '/shop/api/register' : '/shop/api/login', body).then(function (d) {
      me = d.user; setAvatar(d.user);
      try { localStorage.setItem('sgm_country', me.country || ''); if (!localStorage.getItem('sgm_lang') && me.lang && window.SGM_I18N) window.SGM_I18N.setLang(me.lang); } catch (x) {}
      $('auth').hidden = true; document.body.style.overflow = '';
      if (after) { var fn = after; after = null; fn(); } else load();
    }).catch(function (er) { $('au-m').textContent = er.message; });
  };
  function accView() {
    if (!me) { authScreen('login'); return; }
    var b = $('acc-body'); b.textContent = '';
    b.appendChild(el('p', '', 'Signed in as ' + me.name + ' (' + (me.email || '') + ')'));
    b.appendChild(el('p', 'am-s', '📱 ' + (me.phone || '—') + ' · ' + (me.country || 'IN') + ' · ' + (me.lang || 'en')));
    [['My Product Information', '🏷️', 'product-info', function () { showOrders('sell'); }],
     ['My orders', '🧾', 'orders', function () { showOrders('mine'); }],
     ['My Product', '📦', 'products', function () {
       $('acc').close(); $('ord-h').textContent = 'Your products uploaded'; $('ord-body').textContent = 'Loading your products…';
       if (!$('ord').open) $('ord').showModal();
       Promise.all([api('/shop/api/my-products'), api('/shop/api/seller-orders')]).then(function (res) {
         var d = res[0], sellerOrders = res[1].orders || []; var b = $('ord-body'); b.textContent = '';
         var total = el('div','oc'); total.appendChild(el('b','','Products uploaded: ' + d.products.length)); b.appendChild(total); var productGrid = el('div','product-manage-grid');
         if (!d.products.length) { b.appendChild(el('p', 'am-empty', 'You have not uploaded any products yet.')); return; }
         d.products.forEach(function (p) { var c = el('div', 'oc product-manage-card'), im = el('img', 'manage-photo'); im.src = p.img; im.alt = p.title; var meta = el('div', 'manage-meta'); meta.append(el('b', '', p.title), el('div', '', money(p.price, p.currency)), el('div', 'manage-id', 'Product ID: #' + (p.productCode || ('SM-' + String(p.id).slice(0,8).toUpperCase()))), el('div', 'am-s', 'Uploaded: ' + new Date(p.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })), el('div', 'am-s', '♥ ' + (p.likes || 0) + ' likes')); var matched = sellerOrders.filter(function(o){return (o.items||[]).some(function(it){return (it.id||it.productId)===p.id;});}); meta.appendChild(el('div','am-s',matched.length ? 'Order ID' + (matched.length>1?'s':'') + ': ' + matched.map(function(o){return '#'+o.ref;}).join(', ') : 'Order ID: No orders yet')); c.append(im, meta); var del = el('button', 'am-btn', 'Delete listing'); del.style.marginTop = '8px'; del.onclick = function () { showDeleteDialog(p.title, function () { api('/shop/api/products/' + p.id, { method: 'DELETE' }).then(function () { load(); api('/shop/api/my-products').then(function (x) { del.closest('.oc').remove(); if (!x.products.length) $('ord-body').appendChild(el('p', 'am-empty', 'You have not uploaded any products yet.')); }).catch(function(e){alert(e.message);}); }).catch(function(e){alert(e.message);}); }); }; c.appendChild(del); productGrid.appendChild(c); }); b.appendChild(productGrid);
       }).catch(function (e) { $('ord-body').textContent = e.message; });
     }],
     ['My Product Dashboard', '📊', 'dashboard', function () {
       $('acc').close(); $('ord-h').textContent = 'My Product Dashboard'; $('ord-body').textContent = 'Loading sales and likes…';
       if (!$('ord').open) $('ord').showModal();
       api('/shop/api/product-dashboard').then(function (d) {
         var b = $('ord-body'); b.textContent = '';
         if (!d.products.length) { b.appendChild(el('p', 'am-empty', 'Upload a product to start your dashboard.')); return; }
         var CN = { IN: 'India', US: 'United States', GB: 'United Kingdom', AE: 'UAE', OTHER: 'Other' };
         function cname(c) { return T(CN[c] || c); }
         var grid = el('div', ''); grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px';
         [['Products', d.totalProducts], ['Views', d.totalViews], ['Likes', d.totalLikes], ['Buyers', d.totalBuyers], ['Orders', d.totalOrders], ['Online paid', d.totalOnline], ['Cash on Delivery orders', d.totalCod], ['Cancelled', d.totalCancelled], ['Units sold', d.totalSold]].forEach(function (x) {
           var t = el('div', 'oc'); t.style.margin = '0';
           t.appendChild(el('div', 'am-s', x[0])); var n = el('b', '', String(x[1] || 0)); n.style.fontSize = '22px'; t.appendChild(n); grid.appendChild(t);
         });
         b.appendChild(grid);
         function bars(title, rows, color) {
           var box = el('div', 'oc'); box.appendChild(el('b', '', title));
           var mx = Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([1]));
           if (!rows.length) box.appendChild(el('div', 'am-s', '—'));
           rows.forEach(function (r) {
             var line = el('div', 'gr-line'), lab = el('span', 'gr-l', r.l), tr = el('span', 'gr-t'), fi = el('i', 'gr-f'), val = el('b', 'gr-v', String(r.v));
             fi.style.width = Math.max(r.v ? 4 : 0, Math.round(r.v / mx * 100)) + '%'; fi.style.background = r.c || color;
             tr.appendChild(fi); line.append(lab, tr, val); box.appendChild(line);
           });
           b.appendChild(box);
         }
         var short = function (t) { return t.length > 14 ? t.slice(0, 13) + '…' : t; };
         bars(T('❤️ Likes per product'), d.products.map(function (p) { return { l: short(p.title), v: p.likes || 0 }; }), '#e11d48');
         bars(T('👁 Views per product'), d.products.map(function (p) { return { l: short(p.title), v: p.views || 0 }; }), '#2563eb');
         bars(T('🛒 Units sold per product'), d.products.map(function (p) { return { l: short(p.title), v: p.unitsSold || 0 }; }), '#16a34a');
         var dk = Object.keys(d.daily || {});
         bars(T('📈 Orders in the last 7 days'), dk.map(function (k) { return { l: k.slice(5), v: d.daily[k] }; }), '#f45b08');
         var sk = Object.keys(d.states || {}).sort(function (a, b2) { return d.states[b2] - d.states[a]; });
         bars(T('📍 Orders by state'), sk.map(function (k) { return { l: short(k), v: d.states[k] }; }), '#7c3aed');
         var cb = Object.keys(d.countriesBought || {});
         var cc = el('div', 'oc');
         cc.appendChild(el('b', '', T('Countries')));
         cc.appendChild(el('div', 'am-s', cb.length ? T('Bought from') + ': ' + cb.map(function (c) { return cname(c) + ' (' + d.countriesBought[c] + ')'; }).join(', ') : T('Bought from') + ': —'));
         cc.appendChild(el('div', 'am-s', T('No purchase from') + ': ' + ((d.countriesNotBought || []).length ? d.countriesNotBought.map(cname).join(', ') : '—')));
         b.appendChild(cc);
         d.products.forEach(function (p) {
           var c = el('div', 'oc');
           var h = el('div', ''); h.style.cssText = 'display:flex;justify-content:space-between;gap:8px';
           h.append(el('b', '', p.title), el('b', '', money(p.price, p.currency))); c.appendChild(h);
           c.appendChild(el('div', 'am-s', '👁 ' + T('Views') + ': ' + (p.views || 0) + ' · ♥ ' + T('Likes') + ': ' + (p.likes || 0)));
           c.appendChild(el('div', 'am-s', T('Orders') + ': ' + (p.orderCount || 0) + ' · ' + T('Units sold') + ': ' + (p.unitsSold || 0) + ' · ' + T('Cancelled') + ': ' + (p.cancelledCount || 0)));
           c.appendChild(el('div', 'am-s', T('Online paid') + ': ' + (p.onlineCount || 0) + ' · ' + T('Cash on Delivery orders') + ': ' + (p.codCount || 0)));
           c.appendChild(el('div', 'am-s', '⏳ ' + T('Waiting for payment') + ': ' + (p.waitingCount || 0)));
           var pays = p.payments || [];
           if (pays.length) {
             var pw = el('div', ''); pw.style.cssText = 'margin-top:8px;border-top:1px solid #eee;padding-top:6px';
             pw.appendChild(el('b', '', T('Orders & payments')));
             pays.forEach(function (o) {
               var st = o.method === 'COD' ? '💵 ' + T('Cash on Delivery') : (o.pay === 'PAID' ? '✅ ' + T('Paid online') : (o.pay === 'REJECTED' ? '❌ ' + T('Payment not received') : '⏳ ' + T('Online payment - waiting')));
               var when = ''; try { when = new Date(o.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST'; } catch (e) {}
               var row = el('div', 'am-s', '#' + o.ref + ' · ' + (o.buyer || '—') + ' · ' + money(o.amount, o.currency) + ' · ' + st + ' · ' + (o.status === 'CANCELLED' ? T('Cancelled') : o.status === 'PAYMENT_PENDING' ? T('Not confirmed') : T('Confirmed')) + ' · ' + [o.city, o.state].filter(Boolean).join(', ') + ' · ' + when);
               row.style.marginTop = '5px'; pw.appendChild(row);
             });
             c.appendChild(pw);
           }
           var pc = Object.keys(p.countries || {});
           c.appendChild(el('div', 'am-s', pc.length ? T('Bought from') + ': ' + pc.map(function (k) { return cname(k) + ' (' + p.countries[k] + ')'; }).join(', ') : T('No orders yet.')));
           b.appendChild(c);
         });
       }).catch(function (e) { $('ord-body').textContent = e.message; });
     }],
     ['Chat', '💬', 'chat', function () { openChatInbox(); }],
     ['My shop link', '🔗', 'shoplink', function () {
       api('/shop/api/my-shop').then(function (d) {
         if (!d.url) { toast(T('Upload your first product to get your shop link.', 'अपना पहला प्रोडक्ट डालें, फिर आपकी दुकान की लिंक मिलेगी।')); return; }
         var txt = T('Visit my shop', 'मेरी दुकान देखें') + ' "' + d.name + '" ' + T('on Stratic Market', 'Stratic Market पर');
         // text and url are passed separately so apps add the link only once
         if (navigator.share) { navigator.share({ title: d.name, text: txt, url: d.url }).catch(function () {}); return; }
         try { navigator.clipboard.writeText(d.url); toast(T('Shop link copied', 'दुकान की लिंक कॉपी हो गई') + ': ' + d.url); }
         catch (e) { window.prompt(T('Copy your shop link', 'अपनी दुकान की लिंक कॉपी करें'), d.url); }
       }).catch(function (e) { toast(e.message); });
     }],
     ['Language', '🌐', 'language', function () { langDialog(); }],
     ['Help', '❔', 'help', function () { $('acc').close(); if ($('help-dlg')) $('help-dlg').showModal(); }],
     ['Sign out', '↪', 'signout', function () {
       api('/shop/api/logout', { method: 'POST' }).then(function () {
         me = null; try { sessionStorage.removeItem('sgm_skip'); } catch (x) {}
         $('acc').close(); load(); authScreen('login');
       });
     }]].forEach(function (x) {
      var k = el('button', 'account-action', ''); k.type = 'button'; k.dataset.profileAction = x[2];
      var ico = el('span', 'account-action-icon', x[1]);
      var copy = el('span', 'account-action-copy', ''); copy.appendChild(el('strong', '', x[0]));
      var desc = {orders:'Track purchases and delivery updates',products:'View products you have uploaded',dashboard:'Sales, likes and buyer locations',chat:'Messages from buyers and sellers',shoplink:'Share your own shop link on WhatsApp or Instagram',language:'Choose your language',help:'Learn how to use the marketplace',signout:'Securely sign out of this account'}[x[2]];
      copy.appendChild(el('small', '', desc));
      k.append(ico, copy, el('span', 'account-action-arrow', '›')); k.onclick = x[3]; b.appendChild(k);
    });
    var assistant = el('button', 'account-assistant-entry', ''); assistant.type = 'button'; assistant.onclick = function () { $('acc').close(); openAssistant(); };
    assistant.append(el('span', 'account-assistant-mark', '✦'));
    var assistantCopy = el('span', 'account-action-copy', ''); assistantCopy.appendChild(el('strong', '', 'AI Assistant')); assistantCopy.appendChild(el('small', '', 'Get help finding any feature'));
    assistant.append(assistantCopy, el('span', 'account-action-arrow', '›')); b.appendChild(assistant);
    if (!$('acc').open) $('acc').showModal();
  }
  $('open-acc').onclick = function (e) { e.preventDefault(); accView(); };
  // The small top-right avatar opens the same real account/profile panel.
  $('acc-close').onclick = function () { $('acc').close(); };

  // ---- Checkout (Amazon-style): payment choice, price details, seller QR, trust points, more products ----
  var COD_FEE = 49;
  function coItems() {
    var items = single || Object.keys(cart).map(function (id) { return { id: id, qty: cart[id] }; });
    return items.map(function (it) {
      var p = all.find(function (x) { return x.id === (it.id || it.productId); });
      return p ? { p: p, qty: Math.min(Math.max(Number(it.qty) || 1, 1), 10) } : null;
    }).filter(Boolean);
  }
  function coRefresh() {
    var f = $('co-form'), its = coItems(), pay = (f.pay && f.pay.value) || 'COD';
    var sellersForPay = Array.from(new Set(its.map(function(x){return x.p.seller;}))); var canOnline = its.length === 1 && !!its[0].p.hasQr && sellersForPay.length === 1; $('co-online-l').hidden = !canOnline; if (!canOnline && f.pay.value === 'ONLINE') f.pay.value = 'COD'; pay = f.pay.value || 'COD';
    $('co-on-s').textContent = T('Exact product price. No extra charge');
    $('co-pay-h').textContent = T('Payment method');
    $('co-cod-t').textContent = T('Cash on Delivery');
    $('co-cod-s').textContent = T('Pay when the parcel arrives · +₹49 delivery fee per order');
    $('co-on-t').textContent = T('Pay online (UPI / QR)');
    // price details
    var sellers = {}, itemsTotal = {}, fee = 0, units = 0;
    its.forEach(function (x) {
      sellers[x.p.seller + '|' + x.p.id.slice(0, 0)] = 1;
      itemsTotal[x.p.currency] = (itemsTotal[x.p.currency] || 0) + x.p.price * x.qty; units += x.qty;
    });
    var bySeller = {};
    its.forEach(function (x) { bySeller[x.p.seller] = x.p.currency; });
    Object.keys(bySeller).forEach(function (k) { if (pay === 'COD' && bySeller[k] === 'INR') fee += COD_FEE; });
    var sum = $('co-sum'); sum.textContent = '';
    sum.appendChild(el('b', '', T('Price details')));
    function row(a, b2, strong) { var r = el('div', 'co-row' + (strong ? ' tot' : '')); r.append(el('span', '', a), el('span', '', b2)); sum.appendChild(r); }
    var cur = Object.keys(itemsTotal);
    row(T('Items') + ' (' + units + ')', cur.map(function (c) { return money(itemsTotal[c], c); }).join(' + ') || '—');
    row(T('Delivery fee'), pay === 'COD' ? (fee ? money(fee, 'INR') : '—') : T('FREE'));
    var totals = cur.map(function (c) { return money(itemsTotal[c] + (c === 'INR' ? fee : 0), c); }).join(' + ') || '—';
    row(T('Total to pay'), totals, true);
    if (its.length) sum.appendChild(el('div', 'am-s', '🚚 ' + T('Delivery in') + ' ' + Math.max.apply(null, its.map(function (x) { return x.p.days || 5; })) + ' ' + T('days')));
    // Online payment uses the selected seller's uploaded QR, never the platform's payment QR.
    var q = $('co-qr'); q.hidden = pay !== 'ONLINE';
    var qt = $('co-qr-top'); qt.textContent = '';
    if (pay === 'ONLINE') {
      qt.appendChild(el('p', 'am-s', T('Scan this QR with any UPI app and pay the exact total amount.')));
      var amt = el('div', 'co-amt'); amt.append(el('span', '', T('Amount to pay')), el('b', '', totals)); qt.appendChild(amt);
      var qrProduct = its.length === 1 ? its[0].p : null;
      if (canOnline && qrProduct && qrProduct.hasQr) { var im = el('img'); var qrTries = 0; im.alt = 'Seller payment QR'; im.referrerPolicy = 'no-referrer'; im.onerror = function () { if (qrTries++ < 2) { setTimeout(function () { im.src = '/shop/api/products/' + encodeURIComponent(qrProduct.id) + '/payment-qr?r=' + Date.now(); }, 800); } else { var em = el('p', 'am-s', T('Seller QR could not load. Please try again in a moment or choose Cash on Delivery.', 'सेलर का QR नहीं खुल पाया। थोड़ी देर बाद फिर कोशिश करें या कैश ऑन डिलीवरी चुनें।')); em.style.color = '#b00020'; if (im.parentNode) im.parentNode.replaceChild(em, im); } }; im.src = '/shop/api/products/' + encodeURIComponent(qrProduct.id) + '/payment-qr'; qt.appendChild(im); } else { qt.appendChild(el('p','am-s','Online payment is unavailable for this cart. Use Cash on Delivery or order one seller product at a time with a seller payment QR.')); }
      $('co-txn-t').textContent = T('Transaction ID / UTR (from your payment app)');
    }
    var tr = $('co-trust'); tr.textContent = '';
    [T('✅ Easy cancellation within 24 hours'), T('🔒 Safe & secure ordering'), T('📞 Seller will call to confirm your order')].forEach(function (t) { tr.appendChild(el('li', '', t)); });
    // more products
    var ids = {}; its.forEach(function (x) { ids[x.p.id] = 1; });
    var more = all.filter(function (x) { return !ids[x.id] && !x.mine; }).slice(0, 8);
    var mw = $('co-more-w'), mb = $('co-more'); mb.textContent = ''; mw.hidden = !more.length;
    $('co-more-h').textContent = T('More products you may like');
    more.forEach(function (x) {
      var c = el('div', 'co-mc'), im = el('img'); im.src = x.img; im.alt = x.title; im.loading = 'lazy';
      var ad = el('button', 'am-pb d', T('Add to Cart')); ad.type = 'button';
      ad.onclick = function () { addCart(x.id); toast(T('Added to cart')); };
      c.append(im, el('div', 'co-mt', x.title), el('b', '', money(x.price, x.currency)), ad); mb.appendChild(c);
    });
    $('co-place').textContent = pay === 'ONLINE' ? T('I have paid · Place order') : T('Place order');
    $('co-cancel').textContent = T('Cancel');
  }
  function coOpen() {
    var f = $('co-form'); if (f.pay) f.pay.value = 'COD';
    coRefresh(); $('co').showModal();
  }
  Array.prototype.forEach.call($('co-form').querySelectorAll('input[name=pay]'), function (r) { r.onchange = coRefresh; });
  $('co-cancel').onclick = function () { single = null; $('co').close(); };
  var okSubOrig = $('ok-sub') ? $('ok-sub').innerHTML : '';
  function okMode(pending) {
    if (!$('ok-title')) return;
    $('ok-title').textContent = pending ? T('Payment verification pending', 'पेमेंट की जाँच बाकी है') : T('Order confirmed!');
    if ($('ok-circle')) $('ok-circle').classList.toggle('pending', !!pending);
    if ($('ok-order')) $('ok-order').classList.toggle('pending', !!pending);
    if (pending) $('ok-sub').textContent = T('We are checking your payment (exact amount and Transaction ID). Your order is confirmed automatically after the payment is verified. Track it in Profile → My orders.', 'हम आपका पेमेंट (सही रकम और ट्रांज़ैक्शन ID) जाँच रहे हैं। जाँच के बाद आपका ऑर्डर कन्फर्म हो जाएगा। Profile → My orders में देखें।');
    else $('ok-sub').innerHTML = okSubOrig;
  }

  // ---- Cancel order dialog (reason required, only within 24 hours) ----
  function cancelDialog(o, done) {
    var d = document.createElement('dialog'); d.className = 'cx-dlg';
    var reasons = [T('Ordered by mistake', 'गलती से ऑर्डर हो गया'), T('Found a better price', 'कहीं और सस्ता मिला'), T('Delivery is too slow', 'डिलीवरी में देरी'), T('Want to change product / address', 'प्रोडक्ट या पता बदलना है'), T('Other', 'दूसरा कारण')];
    d.appendChild(el('h2', '', T('Cancel order', 'ऑर्डर कैंसिल करें')));
    d.appendChild(el('p', 'am-s', o.ref));
    var lab = el('label', '', T('Why are you cancelling?', 'आप कैंसिल क्यों कर रहे हैं?'));
    var sel = document.createElement('select'); reasons.forEach(function (r) { var op = document.createElement('option'); op.textContent = r; sel.appendChild(op); });
    lab.appendChild(sel); d.appendChild(lab);
    var ta = document.createElement('textarea'); ta.rows = 2; ta.maxLength = 150; ta.placeholder = T('Write your reason (needed for Other)', 'अपना कारण लिखें (दूसरा कारण चुनने पर ज़रूरी)'); d.appendChild(ta);
    var m = el('p', 'am-s', ''); m.style.color = '#b12704'; d.appendChild(m);
    var row = el('div', 'co-actions');
    var no = el('button', 'am-btn dark', T('Keep order', 'ऑर्डर रखें')); no.type = 'button'; no.onclick = function () { d.close(); d.remove(); };
    var yes = el('button', 'am-btn y', T('Cancel order', 'कैंसिल करें')); yes.type = 'button';
    yes.onclick = function () {
      var reason = sel.value === reasons[4] ? ta.value.trim() : (sel.value + (ta.value.trim() ? ' - ' + ta.value.trim() : ''));
      if (!reason) { m.textContent = T('Please write your reason.', 'कृपया कारण लिखें।'); return; }
      yes.disabled = true;
      jpost('/shop/api/orders/' + o.ref + '/status', { status: 'CANCELLED', reason: reason }, 'PATCH').then(function () { d.close(); d.remove(); done(); toast(T('Order cancelled', 'ऑर्डर कैंसिल हो गया')); }).catch(function (e) { yes.disabled = false; m.textContent = e.message; });
    };
    row.append(no, yes); d.appendChild(row);
    document.body.appendChild(d); d.showModal();
  }

  // ---- Luxury message dialog (replaces the plain browser alert) ----
  function luxDialog(msg, act) {
    var old = document.getElementById('lux-dlg'); if (old) old.remove();
    var d = document.createElement('dialog'); d.id = 'lux-dlg'; d.className = 'lux-dlg';
    var ic = el('div', 'lux-ic', act ? '🛍' : '✦');
    var tx = el('p', 'lux-tx', T(String(msg == null ? '' : msg)));
    var row = el('div', 'lux-row');
    var ok = el('button', 'lux-ok', T('OK')); ok.type = 'button';
    ok.onclick = function () { d.close(); d.remove(); };
    if (act) {
      var go = el('button', 'lux-go', T(act.label)); go.type = 'button';
      go.onclick = function () { d.close(); d.remove(); act.fn(); };
      ok.className = 'lux-ok ghost'; row.append(ok, go);
    } else row.appendChild(ok);
    d.append(ic, tx, row);
    document.body.appendChild(d); d.showModal();
    if (window.SGM_I18N) window.SGM_I18N.apply();
  }
  function alert(msg) { luxDialog(msg); }

  // ---- Product ID / label ----
  function pcode(id) { return 'PID-' + String(id || '').slice(0, 10).toUpperCase(); }
  function wrapText(x, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur); return lines.slice(0, 4);
  }
  function drawLabel(o) {
    var W = 900, H = 1270, c = cvs(W, H), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.lineWidth = 10; x.strokeStyle = '#000'; x.strokeRect(10, 10, W - 20, H - 20);
    x.fillStyle = '#000'; x.textBaseline = 'alphabetic'; x.font = '800 48px Arial, sans-serif'; x.fillText('STRATIC MARKET', 50, 95);
    x.font = '500 26px Arial, sans-serif'; x.fillText('SHIPPING LABEL · KEEP VISIBLE ON PARCEL', 50, 135); x.fillRect(50, 160, W - 100, 4);
    var y = 225; function line(k, v) { x.font = '700 30px Arial, sans-serif'; var kw=x.measureText(k+': ').width; x.fillText(k+': ',50,y); x.font='500 30px Arial, sans-serif'; var ls=wrapText(x,String(v||'—'),W-100-kw); ls.forEach(function(t,i){x.fillText(t,50+kw,y+i*38);}); y += 48 + (ls.length-1)*38; }
    line('Order ID', '#' + o.ref);
    line('Customer', o.buyer && o.buyer.name);
    line('Phone', o.buyer && o.buyer.phone);
    line('Deliver to', [o.buyer && o.buyer.address, o.buyer && o.buyer.city, o.buyer && o.buyer.district, o.buyer && o.buyer.state, o.buyer && o.buyer.pincode, o.buyer && o.buyer.country].filter(Boolean).join(', '));
    line('Seller', o.seller && o.seller.shop);
    line('Items', (o.items||[]).map(function(it){return (it.qty||1)+' × '+it.title;}).join(', '));
    x.font = '500 24px Arial, sans-serif'; (function(){ var pid = 'Product ID(s): ' + (o.items||[]).map(function(it){return pcode(it.id);}).join(', '); var kw = 0; wrapText(x, pid, W-100).forEach(function(t,i){ x.fillText(t, 50, y+i*30); y += 30; }); y += 18; })();
    line('Payment', o.payment === 'ONLINE' ? 'Online payment · verify before dispatch' : 'Cash on Delivery');
    if (o.payment !== 'ONLINE') line('Collect', 'INR ' + (o.total || 0));
    y += 12; x.fillRect(50,y,W-100,3); y += 28;
    var payload = location.origin + '/shop/l/' + o.ref; if (payload.length > 100) payload = 'STRATIC MARKET | ORDER ID #' + o.ref;
    var m = window.SGM_QR ? window.SGM_QR.matrix(payload) : null;
    var box = 320, bx=(W-box)/2, by=Math.min(y, H-box-180); x.lineWidth=6; x.strokeRect(bx,by,box,box);
    if(m){var n=m.length,q=3,cell=Math.floor((box-28)/(n+q*2)),size=cell*(n+q*2),ox=bx+(box-size)/2,oy=by+(box-size)/2;x.fillStyle='#fff';x.fillRect(ox,oy,size,size);x.fillStyle='#000';for(var r=0;r<n;r++)for(var k=0;k<n;k++)if(m[r][k])x.fillRect(ox+(k+q)*cell,oy+(r+q)*cell,cell,cell);}
    x.fillStyle='#000';x.textAlign='center';x.font='600 26px Arial, sans-serif';x.fillText('Scan to see full order & product details',W/2,by+box+42);x.font='500 24px Arial, sans-serif';x.fillText('#'+o.ref,W/2,by+box+76);x.fillStyle='#666';x.fillText('Stratic Market · Order reference only · Not a payment QR',W/2,by+box+112);x.textAlign='left'; return c;
  }
  function labelDialog(o) {
    var old = document.getElementById('lbl-dlg'); if (old) old.remove();
    var d = document.createElement('dialog'); d.id = 'lbl-dlg'; d.className = 'lbl-dlg';
    var cv = drawLabel(o); cv.className = 'lbl-cv';
    var row = el('div', 'lbl-btns');
    var pr = el('button', 'lux-go', '🖨 ' + T('Print')); pr.type = 'button';
    pr.onclick = function () { document.body.classList.add('lbl-printing'); setTimeout(function () { window.print(); setTimeout(function () { document.body.classList.remove('lbl-printing'); }, 400); }, 50); };
    var sv = el('button', 'lux-ok ghost', '⬇ ' + T('Save image')); sv.type = 'button';
    sv.onclick = function () { cv.toBlob(function (bb) { var a = document.createElement('a'); a.href = URL.createObjectURL(bb); a.download = 'label-' + o.ref + '.png'; document.body.appendChild(a); a.click(); a.remove(); }, 'image/png'); };
    var cl = el('button', 'lux-ok ghost', T('Close')); cl.type = 'button'; cl.onclick = function () { d.close(); d.remove(); };
    row.append(pr, sv, cl);
    d.append(el('h3', 'lbl-h', '🏷 ' + T('Shipping label')), cv, row);
    document.body.appendChild(d); d.showModal();
  }

  // ---- New order notification for sellers (bell dot + message) ----
  var notifiedFor = '';
  function seenKey() { return 'sgm_seen_' + ((me && (me.id || me.email)) || 'x'); }
  function markOrdersSeen(list) {
    try {
      var mx = (list || []).reduce(function (a, o) { return o.confirmedAt && o.confirmedAt > a ? o.confirmedAt : a; }, localStorage.getItem(seenKey()) || '');
      localStorage.setItem(seenKey(), mx);
    } catch (e) {}
    var bell = document.getElementById('top-avatar'); if (bell) bell.classList.remove('has-new');
  }
  function checkNewOrders() {
    if (!me) return;
    api('/shop/api/seller-orders').then(function (d) {
      var seen = ''; try { seen = localStorage.getItem(seenKey()) || ''; } catch (e) {}
      var fresh = (d.orders || []).filter(function (o) { return o.status !== 'CANCELLED' && o.confirmedAt && o.confirmedAt > seen; });
      var bell = document.getElementById('top-avatar'); if (bell) bell.classList.toggle('has-new', fresh.length > 0);
      if (fresh.length && notifiedFor !== fresh[0].confirmedAt) {
        notifiedFor = fresh[0].confirmedAt;
        luxDialog(fresh.length === 1 ? 'You have a new order! Open Orders received to see it and print its label.' : 'You have ' + fresh.length + ' new orders! Open Orders received to see them and print labels.',
          { label: 'View orders', fn: function () { showOrders('sell'); } });
      }
    }).catch(function () {});
  }
  (function () { var bell = document.getElementById('top-avatar'); if (bell) bell.onclick = function () { if (!me) { authScreen('login'); return; } showOrders('sell'); }; })();

  // ---- Language dialog: every text in the app changes to the chosen language ----
  function langDialog() {
    var I = window.SGM_I18N; if (!I) return;
    var chosen = I.lang(), d = $('lang-dlg');
    if (d) d.remove();
    d = document.createElement('dialog'); d.id = 'lang-dlg'; d.className = 'lg-dlg';
    var ico = el('div', 'lg-ico', '🌐'), h = el('h2', '', 'Choose language'), sub = el('p', 'lg-sub', 'This changes the app language only on this device.');
    var list = el('div', 'lg-list');
    function paint() {
      list.textContent = '';
      I.langs.forEach(function (L) {
        var b = el('button', 'lg-item' + (L[0] === chosen ? ' on' : ''), ''); b.type = 'button';
        b.appendChild(el('span', 'lg-n', L[1] + (L[0] === 'en' ? '' : ' · ' + L[2])));
        b.appendChild(el('span', 'lg-c', L[0].toUpperCase()));
        if (L[0] === chosen) b.appendChild(el('span', 'lg-ok', '✓'));
        b.setAttribute('data-notr', '1');
        b.onclick = function () { chosen = L[0]; paint(); };
        list.appendChild(b);
      });
    }
    paint();
    var row = el('div', 'lg-row');
    var no = el('button', 'lg-btn', 'Cancel'); no.type = 'button'; no.onclick = function () { d.close(); d.remove(); };
    var ok = el('button', 'lg-btn pri', 'Save'); ok.type = 'button';
    ok.onclick = function () {
      I.setLang(chosen);
      d.close(); d.remove();
      if (me) { api('/shop/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-sgm': '1' }, body: JSON.stringify({ lang: chosen }) }).then(function (r) { if (r && r.user) me = r.user; }).catch(function () {}); }
      tabs(); load(); try { if ($('acc').open) accView(); } catch (e) {}
      setTimeout(function () { I.apply(); }, 60);
    };
    row.append(no, ok);
    d.append(ico, h, sub, list, row);
    document.body.appendChild(d); d.showModal(); I.apply();
  }

  var STAT = ['CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
  function showOrders(kind, note) {
    var sell = kind === 'sell', b = $('ord-body');
    $('ord-h').textContent = sell ? 'Orders received' : 'My orders';
    b.textContent = 'Loading…';
    $('acc').close(); $('co').close(); $('cart').close();
    if (!$('ord').open) $('ord').showModal();
    api('/shop/api/' + (sell ? 'seller-orders' : 'orders')).then(function (d) {
      b.textContent = '';
      if (sell) markOrdersSeen(d.orders);
      if (note) b.appendChild(el('div', 'am-ok', note));
      if (!d.orders.length) b.appendChild(el('p', 'am-note', 'No orders yet.'));
      d.orders.forEach(function (o) {
        var c = el('div', 'oc');
        c.appendChild(el('span', 'st' + (o.status === 'PAYMENT_PENDING' ? ' pend' : ''), o.status === 'PAYMENT_PENDING' ? T('Awaiting payment confirmation', 'पेमेंट की पुष्टि का इंतज़ार') : o.status));
        c.appendChild(el('b', '', '#' + o.ref));
        c.appendChild(el('div', 'am-s', new Date(o.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' · ' + (o.payment === 'ONLINE' ? T('Online payment') + ' · ' + (o.paymentStatus === 'AWAITING' ? T('Payment verification pending', 'पेमेंट की जाँच बाकी है') : o.paymentStatus === 'REJECTED' ? T('Payment not received', 'पेमेंट नहीं मिला') : T('Paid ✓')) : T('Cash on Delivery') + ' · ' + T('Pay on delivery'))));
        o.items.forEach(function (i) { c.appendChild(el('div', '', i.qty + ' × ' + i.title + ' — ' + money(i.price, o.currency))); });
        if (o.deliveryCharge) c.appendChild(el('div', 'am-s', T('Delivery fee') + ': ' + money(o.deliveryCharge, o.currency)));
        c.appendChild(el('b', '', 'Total: ' + money(o.total, o.currency)));
        if (o.status === 'CANCELLED' && o.cancelReason) c.appendChild(el('div', 'am-s', T('Cancel reason') + ': ' + o.cancelReason));
        if (!sell && o.seller && o.seller.phone) c.appendChild(el('div', 'am-s', 'Seller: ' + o.seller.shop + ' · ' + o.seller.phone));
        if (!sell) { var tk = el('a', 'am-btn y', '📦 ' + T('Track order', 'ऑर्डर ट्रैक करें')); tk.href = '/shop/track?ref=' + encodeURIComponent(o.ref); tk.target = '_blank'; tk.style.display = 'block'; tk.style.textAlign = 'center'; tk.style.textDecoration = 'none'; tk.style.marginTop = '8px'; c.appendChild(tk); }
        if (sell) {
          var box = el('div', 'buy-box');
          box.appendChild(el('div', 'buy-label', 'Buyer details (new order)'));
          box.appendChild(el('div', '', o.buyer.name));
          box.appendChild(el('div', 'buy-phone', o.buyer.phone));
          box.appendChild(el('div', 'am-s', [o.buyer.address, o.buyer.city, o.buyer.district, o.buyer.state, o.buyer.pincode, o.buyer.country].filter(Boolean).join(', ')));
          var links = el('div', 'am-btns');
          var call = el('a', 'am-btn y', '📞 Call buyer');
          call.href = 'tel:' + String(o.buyer.phone).replace(/\s/g, '');
          call.style.textAlign = 'center'; call.style.textDecoration = 'none';
          var wa = el('a', 'am-btn', 'WhatsApp');
          wa.href = 'https://wa.me/' + String(o.buyer.phone).replace(/\D/g, '');
          wa.target = '_blank';
          wa.style.background = '#25d366'; wa.style.color = '#fff';
          wa.style.textAlign = 'center'; wa.style.textDecoration = 'none';
          links.appendChild(call); links.appendChild(wa);
          box.appendChild(links);
          c.appendChild(box);
        }
        var ac = el('div', 'ac'), done = o.status === 'DELIVERED' || o.status === 'CANCELLED';
        function setS(s) { jpost('/shop/api/orders/' + o.ref + '/status', { status: s }, 'PATCH').then(function () { showOrders(kind); }).catch(function (e) { alert(e.message); }); }
        if (sell && !done) STAT.forEach(function (s) {
          if (s !== o.status) { var k = el('button', '', s[0] + s.slice(1).toLowerCase()); k.onclick = function () { setS(s); }; ac.appendChild(k); }
        });
        if (!sell && o.status === 'CONFIRMED') {
          var dots = el('button', 'ord-dots', '⋮'); dots.type = 'button';
          var menu = el('div', 'ord-menu'); menu.hidden = true;
          if (o.canCancel) {
            var hrs = Math.max(0, Math.ceil((new Date(o.cancelBy).getTime() - Date.now()) / 3600000));
            var cb = el('button', '', T('Cancel order', 'ऑर्डर कैंसिल करें')); cb.type = 'button';
            cb.onclick = function () { menu.hidden = true; cancelDialog(o, function () { showOrders(kind); }); };
            menu.appendChild(cb); menu.appendChild(el('small', '', T('Cancel allowed for ' + hrs + 'h more', 'अभी ' + hrs + ' घंटे और कैंसिल कर सकते हैं')));
          } else menu.appendChild(el('small', '', T('Cancellation time (24 hours) is over', 'कैंसिल का समय (24 घंटे) खत्म हो गया')));
          dots.onclick = function () { menu.hidden = !menu.hidden; };
          c.style.position = 'relative'; c.append(dots, menu);
        }
        if (sell && o.status !== 'CANCELLED') {
          var lb = el('button', 'am-btn y lbl-open', '🏷 ' + T('Shipping label')); lb.type = 'button'; lb.style.marginTop = '8px'; lb.style.width = '100%';
          lb.onclick = function () { labelDialog(o); }; c.appendChild(lb);
        }
        if (ac.children.length) c.appendChild(ac);
        b.appendChild(c);
      });
    }).catch(function (e) { b.textContent = e.message; });
  }
  $('ord-close').onclick = function () { $('ord').close(); };
  $('co-close').onclick = function () { single = null; $('co').close(); };
  $('co-form').onsubmit = function (e) {
    e.preventDefault();
    var f = e.target, m = $('co-msg');
    m.textContent = T('Loading…');
    var items = single || Object.keys(cart).map(function (id) { return { id: id, qty: cart[id] }; });
    if (!items.length) { m.textContent = T('Your cart is empty.'); return; }
    if (f.pay && f.pay.value === 'ONLINE' && !/^[A-Za-z0-9]{8,30}$/.test((f.txn.value || '').replace(/\s/g, ''))) { m.textContent = T('Enter the Transaction ID shown in your payment app after paying.'); return; }
    jpost('/shop/api/orders', {
      name: f.name.value, phone: f.phone.value, address: f.address.value,
      city: f.city.value, district: f.district.value, state: f.state.value, pincode: f.pincode.value, country: f.country.value, items: items, paymentMethod: (f.pay && f.pay.value) || 'COD', txnId: (f.txn && f.txn.value || '').replace(/\s/g, '')
    }).then(function (d) {
      if (!single) { cart = {}; saveCart(); }
      single = null; f.reset(); f.country.value = 'India'; m.textContent = '';
      $('co').close();
      if (d.orders && d.orders[0] && d.orders[0].buyer) { me = Object.assign({}, me, { phone: me.phone || d.orders[0].buyer.phone }); }
      var refs = (d.orders || []).map(function (o) { return o.ref; }).join(', ');
      if ($('ok-ref')) $('ok-ref').textContent = refs ? ('Order ID: #' + refs.replace(/, /g, ', #')) : 'Order placed successfully';
      var pend = (d.orders || []).some(function (o) { return o.status === 'PAYMENT_PENDING'; });
      okMode(pend);
      var okEl = $('ok-order');
      if (okEl) { okEl.hidden = false; document.body.style.overflow = 'hidden'; }
      else showOrders('mine', 'Order placed!');
      load();
    }).catch(function (er) { m.textContent = er.message; });
  };

  // Product photos: sellers choose each photo themselves; no synthetic variants are generated.
  var blob = null, extras = [], prepping = false, payQrFile = null, payQrChecking = false;
  function loadImg(f) { return new Promise(function (ok, no) { var u = URL.createObjectURL(f), i = new Image(); i.onload = function () { URL.revokeObjectURL(u); ok(i); }; i.onerror = no; i.src = u; }); }
  function cvs(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function studio(img, remove) {
    var sc = Math.min(1, (remove ? 1400 : 2560) / Math.max(img.width, img.height)), w = Math.round(img.width * sc), h = Math.round(img.height * sc), n = w * h;
    var c = cvs(w, h), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
    var id = x.getImageData(0, 0, w, h), d = id.data, bg = new Uint8Array(n), ok = false, minX = 0, minY = 0, maxX = w - 1, maxY = h - 1;
    if (remove) {
      var R = 0, G = 0, B = 0, k = 0, i, o;
      function border(f) { for (var xx = 0; xx < w; xx++) { f(xx); f((h - 1) * w + xx); } for (var yy = 1; yy < h - 1; yy++) { f(yy * w); f(yy * w + w - 1); } }
      border(function (j) { o = j * 4; R += d[o]; G += d[o + 1]; B += d[o + 2]; k++; }); R /= k; G /= k; B /= k;
      var q = new Int32Array(n), qt = 0, qh = 0;
      function far(j, r, g, b) { var p = j * 4; return Math.abs(d[p] - r) + Math.abs(d[p + 1] - g) + Math.abs(d[p + 2] - b); }
      border(function (j) { if (!bg[j] && far(j, R, G, B) < 110) { bg[j] = 1; q[qt++] = j; } });
      while (qh < qt) {
        i = q[qh++]; o = i * 4; var r = d[o], g = d[o + 1], b = d[o + 2], px = i % w, nb = [];
        if (px > 0) nb.push(i - 1); if (px < w - 1) nb.push(i + 1); if (i >= w) nb.push(i - w); if (i < n - w) nb.push(i + w);
        for (var t = 0; t < nb.length; t++) { var j = nb[t]; if (!bg[j] && far(j, r, g, b) <= 22 && far(j, R, G, B) <= 150) { bg[j] = 1; q[qt++] = j; } }
      }
      var frac = qt / n; ok = frac > 0.12 && frac < 0.92;
    }
    var bright = 1, turned = 0;
    if (ok) {
      for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) { if (bg[yy * w + xx]) d[(yy * w + xx) * 4 + 3] = 0; }
      x.putImageData(id, 0, 0);
      var sm = cvs(w, h), sx = sm.getContext('2d'); if ('filter' in sx) sx.filter = 'blur(0.7px)'; sx.drawImage(c, 0, 0); c = sm;
      // Keep the uploaded image orientation unchanged; never auto-rotate the user's product.
      var cd = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, cw = c.width, ch = c.height;
      minX = cw; minY = ch; maxX = 0; maxY = 0;
      for (var y2 = 0; y2 < ch; y2++) for (var x2 = 0; x2 < cw; x2++) {
        if (cd[(y2 * cw + x2) * 4 + 3] > 40) {
          if (x2 < minX) minX = x2; if (x2 > maxX) maxX = x2;
          if (y2 < minY) minY = y2; if (y2 > maxY) maxY = y2;
        }
      }
    }
    if (!remove) {
      // Keep the photo exactly as taken: same shape, no white padding, never shrunk below 2560px, light auto-enhance.
      var o2 = cvs(w, h), x2c = o2.getContext('2d');
      if ('filter' in x2c) x2c.filter = 'contrast(1.05) saturate(1.1) brightness(1.02)';
      x2c.drawImage(c, 0, 0, w, h);
      return new Promise(function (res) {
        o2.toBlob(function (bb) {
          function done(b2) { res({ blob: b2, removed: false, turned: 0, cut: c, box: [0, 0, w, h] }); }
          if (bb && bb.size > 3.8 * 1024 * 1024) o2.toBlob(done, 'image/jpeg', 0.8); else done(bb);
        }, 'image/jpeg', 0.92);
      });
    }
    var S = 1400, out = cvs(S, S), ox = out.getContext('2d');
    ox.fillStyle = '#fff'; ox.fillRect(0, 0, S, S);
    var bw = maxX - minX + 1, bh = maxY - minY + 1, f = Math.min(Math.round(S * 0.94) / bw, Math.round(S * 0.94) / bh), dw = bw * f, dh = bh * f;
    if ('filter' in ox) ox.filter = 'contrast(1.08) saturate(1.12) brightness(' + (1.04 * bright).toFixed(2) + ')';
    if (ok) { ox.shadowColor = 'rgba(0,0,0,.2)'; ox.shadowBlur = Math.round(22 * S / 640); ox.shadowOffsetY = Math.round(12 * S / 640); }
    ox.drawImage(c, minX, minY, bw, bh, (S - dw) / 2, (S - dh) / 2 - (ok ? 6 : 0), dw, dh);
    return new Promise(function (res) { out.toBlob(function (b) { res({ blob: b, removed: ok, turned: turned, cut: c, box: [minX, minY, bw, bh] }); }, 'image/jpeg', 0.9); });
  }
  function toBlob(cv) { return new Promise(function (res) { cv.toBlob(res, 'image/jpeg', 0.9); }); }
  function filt(x, extra) { if ('filter' in x) x.filter = 'contrast(1.05) saturate(1.08) brightness(1.03)' + (extra || ''); }
  var shots = [], autos = [], tok = 0;
  function hint() { var n = shots.length; $('sp-hint').textContent = !n ? T('Add product photos from Camera or Gallery.', 'कैमरा या गैलरी से प्रोडक्ट की फ़ोटो डालें।') : T(n + ' photos selected (maximum 12)', n + ' फ़ोटो चुनीं (अधिकतम 12)'); }
  function strip() {
    var st = $('prev-strip'); st.textContent = '';
    shots.forEach(function (sh, i) {
      var w = el('div', 'sp-th'), im = el('img'); im.alt = ''; if (sh.blob) im.src = URL.createObjectURL(sh.blob);
      w.appendChild(im);
      w.appendChild(el('span', 'sp-tag', i === 0 ? T('Main', 'मुख्य') : String(i + 1)));
      var x = el('button', 'sp-x', '✕'); x.type = 'button'; x.title = T('Remove', 'हटाएँ');
      x.onclick = function () { shots.splice(i, 1); rebuild(); };
      w.appendChild(x); st.appendChild(w);
    });
    if (shots.length && shots.length < 12) {
      var plus = el('button', 'sp-th sp-plus', '+'); plus.type = 'button'; plus.title = T('Add another photo', 'दूसरी फ़ोटो जोड़ें');
      plus.onclick = function () { $('photo-gal').click(); };
      st.appendChild(plus);
    }
    st.hidden = !shots.length;
  }
  function rebuild() {
    var my = ++tok; prepping = true; autos = []; blob = null; extras = [];
    hint(); strip();
    if (!shots.length) { prepping = false; $('proc').textContent = ''; return; }
    $('proc').textContent = T('Preparing photos…', 'फ़ोटो तैयार हो रही हैं…');
    var rm = $('rm').checked;
    var chain = Promise.resolve();
    shots.forEach(function (sh) {
      if (sh.blob && sh.rm === rm) return;
      chain = chain.then(function () { return loadImg(sh.file); }).then(function (img) { return studio(img, rm); }).then(function (r) { sh.r = r; sh.blob = r.blob; sh.rm = rm; });
    });
    chain.then(function () {
      if (my !== tok) return;
      strip();
      return [];
    }).then(function (arr) {
      if (my !== tok) return;
      autos = [];
      blob = shots[0].blob;
      extras = shots.slice(1).map(function (x) { return x.blob; });
      prepping = false; strip(); hint();
      var r0 = shots[0].r;
      $('proc').textContent = !rm ? T('Original background kept.', 'असली बैकग्राउंड रखा गया।')
        : r0.removed ? T('White background ✓ · studio look ready', 'सफ़ेद बैकग्राउंड ✓ · स्टूडियो लुक तैयार') : T('Could not separate background. Use a plain, well-lit background.', 'बैकग्राउंड अलग नहीं हो पाया। सादा और रोशनी वाला बैकग्राउंड रखें।');
    }).catch(function () { if (my !== tok) return; prepping = false; $('proc').textContent = T('Could not read this photo.', 'यह फ़ोटो पढ़ी नहीं जा सकी।'); shots.pop(); rebuild(); });
  }
  function addFiles(list) {
    var arr = [].slice.call(list || []), room = 12 - shots.length;
    if (!room) { toast(T('Maximum 12 photos', 'अधिकतम 12 फ़ोटो')); return; }
    arr.slice(0, room).forEach(function (f) { shots.push({ file: f, blob: null, r: null, rm: null }); });
    if (arr.length > room) toast(T('Only 12 photos allowed', 'सिर्फ़ 12 फ़ोटो ही डाल सकते हैं'));
    rebuild();
  }
  ['photo-cam', 'photo-gal'].forEach(function (i) {
    $(i).onchange = function () { var fl = this.files; addFiles(fl); this.value = ''; };
  });

  if ($('pay-qr-upload')) $('pay-qr-upload').onchange = function () {
    var input = this, f = input.files && input.files[0];
    var pv = $('pay-qr-preview'), qrStatus = $('pay-qr-status');
    payQrFile = null; payQrChecking = false;
    if (qrStatus) { qrStatus.hidden = true; qrStatus.classList.remove('ok', 'error'); qrStatus.textContent = ''; }
    if (pv) { pv.hidden = true; pv.removeAttribute('src'); }
    function rejectQR(message) {
      payQrChecking = false; payQrFile = null; input.value = '';
      if (pv) { pv.hidden = true; pv.removeAttribute('src'); }
      if (qrStatus) {
        qrStatus.textContent = '✕ ' + message;
        qrStatus.hidden = false;
        qrStatus.classList.remove('ok');
        qrStatus.classList.add('error');
      }
      toast(message);
    }
    if (!f) return;
    if (!f.type || ['image/jpeg','image/png','image/webp'].indexOf(f.type.toLowerCase()) < 0 || f.size > 4 * 1024 * 1024) {
      rejectQR('Only a clear UPI payment QR image (JPG, PNG or WebP, under 4 MB) is allowed.');
      return;
    }
    if (!window.BarcodeDetector || !window.createImageBitmap) {
      rejectQR('QR verification is not supported by this browser. Please use an updated Chrome browser.');
      return;
    }
    payQrChecking = true;
    if (qrStatus) {
      qrStatus.textContent = 'Checking QR code…';
      qrStatus.hidden = false;
      qrStatus.classList.remove('ok', 'error');
    }
    var detector;
    try { detector = new BarcodeDetector({ formats: ['qr_code'] }); }
    catch (e) { rejectQR('This browser cannot verify QR codes. Please use updated Chrome.'); return; }

    // Decode the actual image, not the File object. This is required by many Android browsers.
    createImageBitmap(f).then(function (bitmap) {
      return detector.detect(bitmap).then(function (codes) {
        try { bitmap.close(); } catch (e) {}
        var code = codes && codes.find(function (item) {
          var raw = String(item.rawValue || '');
          return /upi:\/\/pay/i.test(raw) || /(?:^|[?&])pa=[^&\s]+/i.test(raw);
        });
        if (!code) {
          rejectQR('Only QR Code Uploaded Payment. Please choose a scannable UPI payment QR; other photos and QR links are not allowed.');
          return;
        }
        var u = URL.createObjectURL(f), image = new Image();
        image.onload = function () {
          try {
            var iw = image.naturalWidth, ih = image.naturalHeight;
            var bounds = code.boundingBox || null, bx = 0, by = 0, bw = iw, bh = ih;
            if (bounds && bounds.width > 0 && bounds.height > 0) {
              var scaleX = iw / (bounds.imageWidth || iw), scaleY = ih / (bounds.imageHeight || ih);
              bx = Math.max(0, Math.floor(bounds.x * scaleX));
              by = Math.max(0, Math.floor(bounds.y * scaleY));
              bw = Math.min(iw - bx, Math.ceil(bounds.width * scaleX));
              bh = Math.min(ih - by, Math.ceil(bounds.height * scaleY));
              var pad = Math.ceil(Math.max(bw, bh) * 0.045);
              bx = Math.max(0, bx - pad); by = Math.max(0, by - pad);
              bw = Math.min(iw - bx, bw + pad * 2); bh = Math.min(ih - by, bh + pad * 2);
            }
            var side = Math.max(bw, bh), cv = document.createElement('canvas');
            cv.width = side; cv.height = side;
            var cx = cv.getContext('2d');
            cx.fillStyle = '#fff'; cx.fillRect(0, 0, side, side);
            cx.drawImage(image, bx, by, bw, bh, Math.floor((side - bw) / 2), Math.floor((side - bh) / 2), bw, bh);
            cv.toBlob(function (bb) {
              URL.revokeObjectURL(u);
              if (!bb) { rejectQR('Could not prepare this QR image. Please choose another clear UPI payment QR.'); return; }
              try { payQrFile = new File([bb], 'seller-payment-qr.jpg', { type: 'image/jpeg' }); }
              catch (e) { payQrFile = f; }
              if (pv) { pv.src = URL.createObjectURL(payQrFile); pv.hidden = false; }
              payQrChecking = false;
              if (qrStatus) {
                qrStatus.textContent = '✓ Valid UPI payment QR verified. It will be saved when you publish this product.';
                qrStatus.hidden = false; qrStatus.classList.remove('error'); qrStatus.classList.add('ok');
              }
            }, 'image/jpeg', 0.96);
          } catch (e) {
            URL.revokeObjectURL(u);
            rejectQR('Could not verify this QR image. Please choose a clear UPI payment QR.');
          }
        };
        image.onerror = function () {
          URL.revokeObjectURL(u);
          rejectQR('Could not read this QR image. Please choose another UPI payment QR.');
        };
        image.src = u;
      });
    }).catch(function () {
      rejectQR('Could not verify this QR. Please choose a clear, scannable UPI payment QR.');
    });
  };

  function rmLabel() { $('rm-t').textContent = T('Auto white background') + ': ' + ($('rm').checked ? T('ON') : T('OFF')); }
  $('rm').onchange = function () { rmLabel(); shots.forEach(function (x) { x.blob = null; }); rebuild(); };
  function sellTexts() {
    $('sp-cam-t').textContent = T('Camera', 'कैमरा'); $('sp-gal-t').textContent = T('Gallery', 'गैलरी');
    rmLabel(); hint();
  }

  var dlg = $('sell'), form = $('sell-form'), msg = $('sell-msg');
  function prefill() {
    try {
      var sv = JSON.parse(localStorage.getItem('sgm_seller') || '{}');
      ['seller', 'phone', 'address'].forEach(function (k) { if (sv[k] && !form[k].value) form[k].value = sv[k]; });
    } catch (x) {}
  }
  function openSellForCategory(category) {
    needLogin(function () {
      prefill(); sellTexts();
      if (category) {
        var categorySelect = form.querySelector('[name=category]');
        if (categorySelect) {
          var wanted = String(category).toLowerCase();
          var option = Array.prototype.find.call(categorySelect.options, function (o) { return o.value.toLowerCase() === wanted || o.textContent.trim().toLowerCase() === wanted; });
          if (option) categorySelect.value = option.value;
        }
      }
      dlg.showModal();
    });
  }
  $('open-sell').onclick = function () { openSellForCategory(''); };
  document.querySelectorAll('.sm-photo-card').forEach(function (card) {
    card.addEventListener('click', function () { openSellForCategory(card.getAttribute('data-c') || ''); });
  });
  ['sell-close', 'sell-cancel'].forEach(function (i) { $(i).onclick = function () { dlg.close(); }; });
  form.onsubmit = function (e) {
    e.preventDefault();
    if (!blob) { msg.textContent = T('Add a product photo first (Camera or Gallery).', 'पहले प्रोडक्ट की फ़ोटो डालें (कैमरा या गैलरी)।'); return; }
    if (payQrChecking) { msg.textContent = 'Payment QR is still being checked. Please wait a moment.'; return; }
    if (prepping) { msg.textContent = 'Photos are still being prepared, wait a second…'; return; }
    var exp = form.expiresAt && form.expiresAt.value;
    if (exp) {
      var ed = new Date(exp); ed.setHours(23, 59, 59, 999);
      if (ed < new Date()) {
        msg.textContent = 'EXPIRED PRODUCT REJECTED. Do not list expired items.';
        return;
      }
    }
    var btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }
    var fd = new FormData(form);
    fd.append('photo', blob, 'product.jpg');
    if (payQrFile) fd.append('qr', payQrFile, 'seller-payment-qr.jpg');
    extras.forEach(function (eb, i) { fd.append('extra', eb, 'p' + (i + 1) + '.jpg'); });
    msg.textContent = 'Posting product…';
    msg.style.color = '#0f1111';
    api('/shop/api/products', { method: 'POST', body: fd }).then(function (d) {
      try { localStorage.setItem('sgm_seller', JSON.stringify({ seller: form.seller.value, phone: form.phone.value, address: form.address.value })); } catch (x) {}
      form.reset(); blob = null; extras = []; shots = []; autos = []; payQrFile = null; payQrChecking = false; if ($('pay-qr-preview')) { $('pay-qr-preview').hidden = true; $('pay-qr-preview').removeAttribute('src'); } tok++;
      if ($('prev-strip')) { $('prev-strip').hidden = true; $('prev-strip').textContent = ''; }
      $('proc').textContent = ''; msg.textContent = ''; hint();
      if (btn) { btn.disabled = false; btn.textContent = 'Post product'; }
      dlg.close();
      cat = 'All'; tabs();
      // optimistic show
      if (d && d.product) { all.unshift(d.product); render(); }
      load();
    }).catch(function (er) {
      msg.textContent = er.message || 'Upload failed. Try again.';
      msg.style.color = '#b12704';
      if (btn) { btn.disabled = false; btn.textContent = 'Post product'; }
    });
  };

  // Stratic Market in-app guide: deterministic, API-free, and connected to real shop controls/data.
  var assistantDialog = $('ai-assistant'), assistantHindi = false, assistantExplicitLang = '';
  var assistantCategories = [
    {key:'All', label:'All products', terms:['all','all products','सभी','सभी प्रोडक्ट']},
    {key:'Mobiles', label:'Mobiles & Accessories', terms:['mobile','mobiles','phone','phones','मोबाइल','फोन']},
    {key:'Laptops', label:'Laptops & Computers', terms:['laptop','laptops','computer','computers','pc','लैपटॉप','कंप्यूटर']},
    {key:'Electronics', label:'Electronics', terms:['electronics','electronic','technology','tech','इलेक्ट्रॉनिक','टेक्नोलॉजी','इलेक्ट्रॉनिक्स']},
    {key:'TV', label:'TV & Appliances', terms:['tv','television','appliances','टीवी','टेलीविजन']},
    {key:'Fashion', label:"Men's Fashion", terms:['fashion','men clothes','clothes','कपड़े','फैशन']},
    {key:'Women', label:"Women's Fashion", terms:['women','women fashion','ladies','महिलाओं के कपड़े']},
    {key:'Kids', label:'Kids & Baby', terms:['kids','baby','children','बच्चों']},
    {key:'Footwear', label:'Footwear', terms:['footwear','shoes','sandals','जूते','चप्पल']},
    {key:'Watches', label:'Watches', terms:['watch','watches','घड़ी','घड़ियां']},
    {key:'Jewellery', label:'Jewellery', terms:['jewellery','jewelry','gold chain','गहने','ज्वेलरी']},
    {key:'Beauty', label:'Beauty & Personal Care', terms:['beauty','cosmetics','makeup','ब्यूटी','मेकअप']},
    {key:'Health', label:'Health & Household', terms:['health','household','हेल्थ']},
    {key:'Home', label:'Home & Kitchen', terms:['home','kitchen','home items','घर का सामान','किचन']},
    {key:'Furniture', label:'Furniture', terms:['furniture','sofa','chair','table','फर्नीचर']},
    {key:'Garden', label:'Garden & Outdoor', terms:['garden','outdoor','बागवानी']},
    {key:'Grocery', label:'Grocery & Gourmet', terms:['grocery','groceries','food','किराना','खाने का सामान']},
    {key:'Sports', label:'Sports & Fitness', terms:['sports','fitness','खेल','फिटनेस']},
    {key:'Automotive', label:'Cars & Motorbike', terms:['car','cars','bike','motorbike','ऑटो','बाइक']},
    {key:'Tools', label:'Tools & Home Improvement', terms:['tools','tool','home improvement','औजार']},
    {key:'Books', label:'Books', terms:['book','books','बुक','किताब','किताबें']},
    {key:'Movies', label:'Movies & Music', terms:['movie','movies','music','फिल्म','म्यूजिक']},
    {key:'Gaming', label:'Video Games', terms:['gaming','game','games','वीडियो गेम']},
    {key:'Toys', label:'Toys & Games', terms:['toy','toys','खिलौने']},
    {key:'Pet', label:'Pet Supplies', terms:['pet','pets','पालतू']},
    {key:'Office', label:'Office Products', terms:['office','stationery','ऑफिस','स्टेशनरी']},
    {key:'Industrial', label:'Industrial & Scientific', terms:['industrial','scientific','इंडस्ट्रियल']},
    {key:'Luggage', label:'Luggage & Bags', terms:['luggage','bag','bags','बैग']},
    {key:'Handmade', label:'Handmade', terms:['handmade','हैंडमेड']},
    {key:'Deals', label:"Today's Deals", terms:['deal','deals','discount','offers','डील','ऑफर','छूट']},
    {key:'New', label:'New Releases', terms:['new releases','new arrivals','नए प्रोडक्ट']},
    {key:'Prime', label:'Best Sellers', terms:['best sellers','bestseller','बेस्ट सेलर']},
    {key:'Gift', label:'Gift Cards', terms:['gift card','gift cards','giftcard','giftcards','गिफ्ट कार्ड','उपहार कार्ड']},
    {key:'Subscribe', label:'Subscribe & Save', terms:['subscribe','subscription','सब्सक्रिप्शन']},
    {key:'Coupons', label:'Coupons', terms:['coupon','coupons','कूपन']},
    {key:'Customer', label:'Customer Service', terms:['customer service','support','कस्टमर सर्विस','सहायता']},
    {key:'Sell', label:'Sell on Stratic', terms:['sell on stratic','sell','seller','बेचने','बेचना']},
    {key:'Registry', label:'Gift Registry', terms:['gift registry','registry']},
    {key:'Pharmacy', label:'Pharmacy', terms:['pharmacy','medicine','दवा']},
    {key:'Other', label:'Other', terms:['other','अन्य']}
  ];
  function assistantMessage(text, who) {
    var chat = $('assistant-chat'); if (!chat) return;
    var row = el('div', 'assistant-message ' + (who === 'user' ? 'from-user' : 'from-assistant'), text);
    chat.appendChild(row); chat.scrollTop = chat.scrollHeight;
  }
  function assistantAction(label, command) {
    var b = el('button', 'assistant-action', label); b.type = 'button';
    b.onclick = function () { assistantRun(command); };
    $('assistant-chat').appendChild(b); $('assistant-chat').scrollTop = $('assistant-chat').scrollHeight;
  }
  function assistantLang() {
    var lang = assistantExplicitLang || (me && me.lang) || '';
    try { lang = lang || localStorage.getItem('sgm_lang') || ''; } catch (e) {}
    if (!lang) lang = document.documentElement.lang || 'en';
    return String(lang).toLowerCase().split('-')[0];
  }
  function assistantSay(en, hi, who, pa) {
    var lang = assistantLang();
    var reply = lang === 'hi' ? (hi || en) : lang === 'pa' ? (pa || hi || en) : en;
    assistantMessage(reply, who || 'assistant');
  }
  function assistantOpenCategory(key) {
    cat = key; tabs(); render();
    Array.prototype.forEach.call(document.querySelectorAll('#cat-list [data-c]'), function (x) { x.classList.toggle('on', x.getAttribute('data-c') === key); });
    if ($('cats-dlg') && $('cats-dlg').open) $('cats-dlg').close();
    if ($('grid')) $('grid').scrollIntoView({behavior:'smooth', block:'start'});
  }
  function assistantSearch(query) {
    cat = 'All'; tabs();
    if ($('q')) { $('q').value = query; render(); $('q').focus(); }
    if ($('grid')) $('grid').scrollIntoView({behavior:'smooth', block:'start'});
  }
  function assistantCategoryFromQuestion(q) {
    var norm = String(q || '').toLowerCase();
    // Match longer phrases first so "gift card" is not mistaken for generic gifts.
    var sorted = assistantCategories.slice().sort(function(a,b){
      var al = Math.max.apply(null, a.terms.map(function(t){return t.length;}));
      var bl = Math.max.apply(null, b.terms.map(function(t){return t.length;})); return bl-al;
    });
    for (var i=0;i<sorted.length;i++) {
      var item=sorted[i];
      for (var j=0;j<item.terms.length;j++) if (norm.indexOf(item.terms[j]) >= 0) return item;
    }
    return null;
  }
  function assistantStats(kind) {
    if (!me) { assistantSay('Please sign in to securely check your own product statistics. I can show your real numbers only from your account.', 'अपने असली प्रोडक्ट आँकड़े देखने के लिए कृपया अपने अकाउंट में साइन इन करें। मैं केवल आपके अकाउंट से वास्तविक आँकड़े दिखा सकता हूँ।'); assistantAction('Sign in', 'signin'); return; }
    assistantMessage(assistantLang()==='hi' ? 'आपके अकाउंट के वास्तविक आँकड़े सुरक्षित रूप से देख रहा हूँ…' : 'Checking the real statistics from your account…', 'assistant');
    api('/shop/api/product-dashboard').then(function(d) {
      var products = Number(d.totalProducts || 0), sold = Number(d.totalSold || 0), orders = Number(d.totalOrders || 0), likes = Number(d.totalLikes || 0);
      var txt;
      var perProduct = (d.products || []).map(function(p){ return '• ' + p.title + ': ' + (Number(p.unitsSold)||0) + ' sold, ' + (Number(p.likes)||0) + ' likes'; }).join('\n');
      if (assistantLang()==='hi') {
        txt = 'आपके वास्तविक प्रोडक्ट आँकड़े\n\n• अपलोड किए गए प्रोडक्ट: ' + products + '\n• बिके हुए यूनिट: ' + sold + '\n• ऑर्डर: ' + orders + '\n• कुल लाइक्स: ' + likes + (perProduct ? '\n\nप्रोडक्ट के हिसाब से\n' + perProduct : '') + '\n\nये आँकड़े आपके अकाउंट के डैशबोर्ड से लिए गए हैं।';
      } else {
        txt = 'Your verified product statistics\n\n• Products uploaded: ' + products + '\n• Units sold: ' + sold + '\n• Orders: ' + orders + '\n• Total likes: ' + likes + (perProduct ? '\n\nProduct breakdown\n' + perProduct : '') + '\n\nThese numbers came from your account dashboard.';
      }
      assistantMessage(txt, 'assistant');
      if (kind === 'likes') assistantAction('View product-wise likes', 'go-dashboard');
      else if (kind === 'sold') assistantAction('View sales details', 'go-dashboard');
      else assistantAction('Open My Product Dashboard', 'go-dashboard');
    }).catch(function(){ assistantSay('I could not load your live statistics right now. Please try again in a moment.', 'अभी आपके लाइव आँकड़े नहीं खुल पाए। कृपया थोड़ी देर बाद फिर कोशिश करें।'); });
  }
  function assistantRun(command) {
    if (command.indexOf('category:') === 0) {
      var key = command.slice(9); var item = assistantCategories.find(function(c){return c.key===key;});
      var label = item ? item.label : key;
      assistantSay('I found the ' + label + ' category. Tap the button below to open it. If no products appear, sellers may not have listed items in this category yet.', 'मुझे ' + label + ' कैटेगरी मिल गई है। इसे खोलने के लिए नीचे दिए बटन पर टैप करें। अगर प्रोडक्ट नहीं दिखते, तो हो सकता है विक्रेताओं ने अभी इस कैटेगरी में सामान लिस्ट न किया हो।');
      assistantAction('Open ' + label, 'go-category:' + key); return;
    }
    if (command.indexOf('go-category:') === 0) { assistantDialog.close(); assistantOpenCategory(command.slice(12)); return; }
    if (command.indexOf('search:') === 0) {
      var term = command.slice(7);
      assistantSay('Search for “' + term + '”. I have placed the words in the search box. Available matches depend on products currently listed by sellers.', '“' + term + '” खोजें। मैंने ये शब्द सर्च बॉक्स में डाल दिए हैं। परिणाम इस बात पर निर्भर करेंगे कि विक्रेताओं ने कौन-से प्रोडक्ट लिस्ट किए हैं।');
      assistantAction('Show search results', 'go-search:' + term); return;
    }
    if (command.indexOf('go-search:') === 0) { assistantDialog.close(); assistantSearch(command.slice(10)); return; }
    if (command === 'dashboard' || command === 'products' || command === 'orders') {
      if (!me) { assistantSay('Please sign in first so I can open your private account section.', 'अपना निजी अकाउंट खोलने के लिए पहले साइन इन करें।'); assistantAction('Sign in', 'signin'); return; }
      assistantSay(command === 'dashboard' ? 'Your product dashboard includes your uploaded products, sales, orders, likes and available buyer-location details.' : command === 'products' ? 'Your uploaded products are shown here.' : 'Your placed orders are shown here.', command === 'dashboard' ? 'आपके प्रोडक्ट डैशबोर्ड में अपलोड किए गए प्रोडक्ट, बिक्री, ऑर्डर, लाइक्स और उपलब्ध खरीदार-लोकेशन दिखती हैं।' : command === 'products' ? 'आपके अपलोड किए हुए प्रोडक्ट यहाँ दिखेंगे।' : 'आपके किए हुए ऑर्डर यहाँ दिखेंगे।');
      assistantAction(command === 'dashboard' ? 'Open My Product Dashboard' : command === 'products' ? 'Open My Product' : 'Open My Orders', command === 'dashboard' ? 'go-dashboard' : command === 'products' ? 'go-products' : 'go-orders'); return;
    }
    if (command === 'stats' || command === 'likes-stats' || command === 'sold-stats' || command === 'product-count') { assistantStats(command === 'likes-stats' ? 'likes' : command === 'sold-stats' ? 'sold' : 'all'); return; }
    if (command === 'go-dashboard' || command === 'go-products' || command === 'go-orders') {
      assistantDialog.close(); accView();
      var key2 = command === 'go-dashboard' ? 'dashboard' : command === 'go-products' ? 'products' : 'orders';
      var target = document.querySelector('[data-profile-action="' + key2 + '"]'); if (target) target.click(); return;
    }
    if (command === 'signin') { assistantDialog.close(); authScreen('login'); return; }
    if (command === 'electronics') { assistantSay('To find electronics, use Categories → Electronics. You can also search for a specific item such as “wireless headphones”, “charger” or “keyboard”. I can open the category now.', 'इलेक्ट्रॉनिक्स के लिए Categories → Electronics चुनें। किसी खास चीज़ के लिए “wireless headphones”, “charger” या “keyboard” सर्च कर सकते हैं। मैं अभी कैटेगरी खोल सकता हूँ।'); assistantAction('Open Electronics', 'category:Electronics'); return; }
    if (command === 'upload') { assistantSay('How to upload a product\n1. Tap the orange + button at the bottom.\n2. Choose a clear product photo.\n3. Enter the product name, price, description and category.\n4. Add the required seller/contact details.\n5. Review everything, then tap Post product.\n\nNever list illegal or restricted goods, expired items, counterfeit/stolen products, or anything you are not legally allowed to sell.', 'प्रोडक्ट अपलोड करने का तरीका\n1. नीचे नारंगी + बटन दबाएँ।\n2. प्रोडक्ट की साफ़ फोटो चुनें।\n3. नाम, कीमत, विवरण और कैटेगरी भरें।\n4. ज़रूरी विक्रेता/संपर्क जानकारी भरें।\n5. सब जाँचकर Post product दबाएँ।\n\nगैरकानूनी या प्रतिबंधित सामान, एक्सपायरी, नकली या चोरी का सामान अपलोड न करें।'); assistantAction('Open product upload', 'go-upload'); return; }
    if (command === 'go-upload') { assistantDialog.close(); if (!me) { needLogin(function () { prefill(); dlg.showModal(); }); } else { prefill(); dlg.showModal(); } return; }
    if (command === 'likes') { assistantStats('likes'); return; }
    if (command === 'home') { assistantSay('To return to the home page, tap Home at the bottom. I can also show all products now.', 'होम पेज पर लौटने के लिए नीचे Home दबाएँ। मैं अभी सभी प्रोडक्ट भी दिखा सकता हूँ।'); assistantAction('Show all products', 'category:All'); return; }
    if (command === 'search-help') { assistantSay('Where to search\n1. The search box is near the top of the page, below the Stratic Market header.\n2. Tap it and type a product name, brand or model.\n3. Examples: “wireless headphones”, “rice cooker”, “Python programming book”, “phone charger”.\n4. Press Search/Enter on your keyboard.\n\nI can put an example search in the box for you.', 'सर्च कहाँ करें\n1. Stratic Market हेडर के ठीक नीचे ऊपर सर्च बॉक्स है।\n2. उस पर टैप करके प्रोडक्ट, ब्रांड या मॉडल लिखें।\n3. उदाहरण: “wireless headphones”, “rice cooker”, “Python programming book”, “phone charger”.\n4. कीबोर्ड पर Search/Enter दबाएँ।\n\nमैं आपके लिए उदाहरण सर्च बॉक्स में डाल सकता हूँ।'); assistantAction('Focus search box', 'go-search-focus'); assistantAction('Search Python books', 'search:Python book'); assistantAction('Search home products', 'search:home kitchen'); assistantAction('Search electronics', 'search:electronics'); return; }
    if (command === 'safety') { assistantSay('Safety rules\n• Do not upload illegal or restricted goods.\n• Never list expired products.\n• Do not list counterfeit, stolen, dangerous or misleading items.\n• Check local laws and the marketplace rules before listing.', 'सुरक्षा नियम\n• गैरकानूनी या प्रतिबंधित सामान अपलोड न करें।\n• एक्सपायरी सामान कभी लिस्ट न करें।\n• नकली, चोरी का, खतरनाक या भ्रामक सामान न बेचें।\n• लिस्ट करने से पहले स्थानीय कानून और मार्केटप्लेस के नियम जाँचें।'); return; }
    if (command === 'hello') { assistantSay('Hi! 👋 I can help you use Stratic Market. Ask me to find a category, search for a product, upload a listing, check orders, or see your product statistics.', 'नमस्ते! 👋 मैं Stratic Market इस्तेमाल करने में मदद कर सकता हूँ। कैटेगरी ढूँढने, प्रोडक्ट सर्च करने, सामान अपलोड करने, ऑर्डर या बिक्री के आँकड़े देखने के लिए पूछें।', 'assistant', 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! 👋 ਮੈਂ Stratic Market ਵਰਤਣ ਵਿੱਚ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ।'); return; }
    if (command === 'language') { assistantSay('I will follow the language selected in your Stratic Market account. You can also ask me “Hindi mein baat karo” or “Speak English”.', 'मैं आपके Stratic Market अकाउंट में चुनी गई भाषा में जवाब दूँगा। आप “Speak English” या “हिंदी में बात करो” भी कह सकते हैं।'); return; }
    if (command === 'founder') { assistantSay('Stratic Market is a project of StraticSoft. The founder and CEO is Sahil. The app build date provided by the owner is 20 October 2026, and the owner says development took about one month. I cannot share private contact details or a personal address.', 'Stratic Market, StraticSoft का प्रोजेक्ट है। इसके फाउंडर और CEO साहिल हैं। मालिक द्वारा बताई गई ऐप की निर्माण तारीख 20 अक्टूबर 2026 है और इसे बनाने में लगभग एक महीना लगा। मैं निजी फोन नंबर या घर का पता साझा नहीं कर सकता।'); return; }
    if (command === 'go-search-focus') { assistantDialog.close(); if ($('q')) { $('q').scrollIntoView({behavior:'smooth',block:'center'}); $('q').focus(); } return; }
    if (command === 'unknown') { assistantSay('I can help you navigate Stratic Market. Tell me a product name to search, or ask for a category, upload steps, your orders, or your real product statistics.', 'मैं Stratic Market इस्तेमाल करने में मदद कर सकता हूँ। सर्च करने के लिए प्रोडक्ट का नाम लिखें, या कैटेगरी, अपलोड करने के तरीके, ऑर्डर या अपने वास्तविक प्रोडक्ट आँकड़ों के बारे में पूछें।'); assistantAction('Find a category', 'open-categories'); assistantAction('Show search instructions', 'search-help'); return; }
    if (command === 'open-categories') { $('cats-dlg').showModal(); return; }
  }
  function openAssistant() {
    if (!assistantDialog) return;
    if (!assistantDialog.open) assistantDialog.showModal();
    if (!$('assistant-chat').children.length) assistantSay('Hi! How can I help you use Stratic Market today?', 'नमस्ते! आज मैं Stratic Market इस्तेमाल करने में आपकी कैसे मदद करूँ?');
    $('assistant-input').focus();
  }
  function assistantIntent(raw) {
    var q = String(raw || '').toLowerCase().trim();
    if (/\b(speak|talk|reply|answer).{0,12}\b(english|hindi|punjabi|tamil|telugu|bengali|marathi|gujarati|urdu)\b|\b(english|hindi|punjabi|tamil|telugu|bengali|marathi|gujarati|urdu)\s+(mein|in|language)|हिंदी में|अंग्रेजी में|पंजाबी में/.test(q)) {
      if (/hindi|हिंदी/.test(q)) assistantExplicitLang='hi'; else if (/punjabi|ਪੰਜਾਬੀ|ਪੰਜਾਬੀ/.test(q)) assistantExplicitLang='pa'; else if (/english|अंग्रेजी/.test(q)) assistantExplicitLang='en';
      return 'language';
    }
    if (/^(hi|hello|hey|namaste|नमस्ते|हेलो|ਸਤ ਸ੍ਰੀ ਅਕਾਲ)\b/.test(q)) return 'hello';
    if (/who (made|built|created|is the founder|is the ceo)|founder|ceo|owner|when.{0,20}(app|built|created|made)|कब.{0,20}(बना|बनाया)|किसने बनाया|फाउंडर|सीईओ|मालिक|कंपनी का नाम|app name|app कब बना|build date/.test(q)) return 'founder';
    if (/\b(how many|total|count|कितने|कितनी|कुल|number of)\b.*(like|likes|लाइक|पसंद)/.test(q) || /(like|likes|लाइक|पसंद).*(कितने|कितनी|total|count|how many)/.test(q)) return 'likes-stats';
    if (/\b(how many|total|count|कितने|कितनी|कुल|number of)\b.*(sold|sale|sales|बिके|बिका|खरीदे|बिक्री|units)/.test(q) || /(sold|sales|बिके|बिक्री).*(कितने|कितनी|total|count|how many)/.test(q)) return 'sold-stats';
    if (/\b(how many|total|count|कितने|कितनी|कुल|number of)\b.*(product|products|प्रोडक्ट|उत्पाद)/.test(q)) return 'product-count';
    if (/dashboard|डैशबोर्ड|sales|बिक्री|seller dashboard/.test(q)) return 'dashboard';
    if (/my product|my products|uploaded product|मेरे प्रोडक्ट|अपलोड.*प्रोडक्ट|product list/.test(q)) return 'products';
    if (/order|ऑर्डर|खरीदा/.test(q)) return 'orders';
    if (/upload|अपलोड|बेचना|sell a product|product कैसे/.test(q)) return 'upload';
    if (/like|लाइक|heart|पसंद/.test(q)) return 'likes';
    if (/illegal|expired|expiry|expiry date|प्रतिबंधित|एक्सपायरी|कानूनी|सुरक्षा/.test(q)) return 'safety';
    if (/python|पायथन/.test(q) && /book|books|बुक|किताब/.test(q)) return 'search:Python book';
    var directCategory = assistantCategoryFromQuestion(q);
    if (directCategory && !/(search|sarch|सर्च|खोज)/.test(q) && /(where|kahan|kaha|kidhar|dhundh|dhoondh|category|कैटेगरी|option|ऑप्शन|खोल|निकाल)/.test(q)) return 'category:' + directCategory.key;
    if (/search|sarch|सर्च|खोज|ढूँढ|ढूंढ|dhoondh|dhundh|find product|look for/.test(q)) {
      if (/(where|kahan|kaha|kidhar|कहाँ|किधर|option|ऑप्शन|search box|सर्च बॉक्स)/.test(q) && !/(what should|kya likh|क्या लिख|write|लिखूं|लिखूँ|लिखना|search for|सर्च में|सर्च कर)/.test(q)) return 'search-help';
      var term = '';
      if (/python|पायथन/.test(q) && /book|books|बुक|किताब/.test(q)) term='Python book';
      else if (/gift.?card|गिफ्ट कार्ड/.test(q)) term='gift card';
      else if (/electronic|technology|टेक्नोलॉजी|इलेक्ट्रॉनिक/.test(q)) term='electronics';
      else if (/home|house|घर|किचन|kitchen/.test(q)) term='home kitchen';
      else { term = String(raw).replace(/(search|सर्च|खोज|ढूँढ|ढूंढ|where|कहाँ|किधर|option|ऑप्शन|please|करो|करना है|कैसे|how do i|how to|find|product|प्रोडक्ट)/ig,' ').trim(); }
      return 'search:' + (term || '');
    }
    if (/category|categories|कैटेगरी|श्रेणी|option|ऑप्शन/.test(q)) {
      var c = assistantCategoryFromQuestion(q);
      if (c) return 'category:' + c.key;
      return 'open-categories';
    }
    var matched = assistantCategoryFromQuestion(q);
    if (matched && /(where|kahan|kaha|kidhar|dhundh|dhoondh|find|show|category|कैटेगरी|option|ऑप्शन|खोल|निकाल|chahiye|चाहिए)/.test(q)) return 'category:' + matched.key;
    if (/electronic|technology|टेक्नोलॉजी|इलेक्ट्रॉनिक/.test(q)) return 'electronics';
    if (/home page|homepage|होम पेज/.test(q)) return 'home';
    if (/simple|simplify|सरल|आसान भाषा|सिंपल/.test(q)) { assistantExplicitLang = assistantLang(); return 'unknown'; }
    return 'unknown';
  }
  if ($('assistant-close')) $('assistant-close').onclick = function () { assistantDialog.close(); };
  if ($('open-assistant-fab')) $('open-assistant-fab').onclick = openAssistant;
  if ($('assistant-form')) $('assistant-form').onsubmit = function (e) {
    e.preventDefault(); var input = $('assistant-input'), value = input.value.trim(); if (!value) return;
    assistantHindi = /[\u0900-\u097F]/.test(value) || /\b(kahan|kaise|mera|meri|mujhe|dikhao|kya|hai|karo|karu|chahiye)\b/i.test(value);
    assistantMessage(value, 'user'); input.value = ''; var intent = assistantIntent(value); assistantRun(intent);
  };
  if ($('assistant-quick')) $('assistant-quick').onclick = function (e) {
    var b = e.target.closest('[data-assist]'); if (!b) return;
    assistantMessage(b.textContent, 'user'); assistantRun(b.getAttribute('data-assist'));
  };
  tabs(); saveCart();
  if ($('empty-sell')) $('empty-sell').onclick = function () { var s = $('open-sell'); if (s) s.click(); };
  // chip row click (static fallback chips in HTML)
  if ($('tabs')) $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-c]');
    if (!b || !$('tabs').contains(b)) return;
    cat = b.getAttribute('data-c') || 'All';
    tabs(); render();
  });
  var gQuery = location.search || '';
  function showGoogleErr() {
    if (gQuery.indexOf('gerr=') < 0) return;
    try {
      authScreen('login');
      var ge = (gQuery.match(/gerr=([^&]+)/) || [])[1] || '';
      $('au-m').textContent = 'Google login failed (' + decodeURIComponent(ge) + '). Check GOOGLE_CLIENT_ID, SECRET, REDIRECT_URI match Google Console exactly.';
    } catch (e) {}
  }
  function finishAuthBoot() {
    load();
    if (me) {
      try { $('auth').hidden = true; } catch (e) {}
      try { document.body.style.overflow = ''; } catch (e) {}
      setAvatar(me);
      return;
    }
    if (gQuery.indexOf('needphone=1') >= 0) return;
    var sk = false; try { sk = sessionStorage.getItem('sgm_skip'); } catch (x) {}
    if (!sk) authScreen('login');
    showGoogleErr();
  }
  // After Google redirect ?ok=1 — force session read + clean URL
  if (location.search.indexOf('ok=1') >= 0 || location.search.indexOf('needphone=1') >= 0 || location.search.indexOf('gerr=') >= 0) {
    try { history.replaceState({}, '', '/shop'); } catch (e) {}
  }
  function readMe(retries) {
    api('/shop/api/me').then(function (d) {
      me = d && d.user ? d.user : null;
      if (!me && retries > 0 && gQuery.indexOf('ok=1') >= 0) { setTimeout(function () { readMe(retries - 1); }, 700); return; }
      setAvatar(me);
      finishAuthBoot();
    }).catch(function () {
      if (retries > 0) { setTimeout(function () { readMe(retries - 1); }, 700); return; }
      me = null; setAvatar(null); finishAuthBoot();
    });
  }
  readMe(2);
  if ($('open-chat')) $('open-chat').onclick = openChatInbox;
  setInterval(chatBadge, 20000); setTimeout(chatBadge, 2500);
  if ($('promise-sell')) $('promise-sell').onclick = function () { var sb = $('open-sell'); if (sb) sb.click(); };
  // Opened from a shared product / shop link: /shop/?p=<productId>
  try {
    var dpid = new URLSearchParams(location.search).get('p');
    if (dpid && /^[a-f0-9]{8,32}$/i.test(dpid)) {
      setTimeout(function () {
        api('/shop/api/product/' + dpid).then(function (d) { if (d && d.product) openGallery(d.product); }).catch(function () {});
      }, 900);
    }
  } catch (e) {}

  // Categories dialog + shopping nav (inside IIFE)
  if ($('nav-cats')) {
    $('nav-cats').onclick = function (e) {
      e.preventDefault();
      if ($('cats-dlg') && $('cats-dlg').showModal) $('cats-dlg').showModal();
    };
  }
  if ($('cats-close')) $('cats-close').onclick = function () { $('cats-dlg').close(); };
  if ($('cat-list')) {
    $('cat-list').onclick = function (e) {
      var btn = e.target.closest('[data-c]');
      if (!btn) return;
      cat = btn.getAttribute('data-c') || 'All';
      Array.prototype.forEach.call($('cat-list').querySelectorAll('.cat-item'), function (x) {
        x.classList.toggle('on', x.getAttribute('data-c') === cat);
      });
      tabs(); render();
      if ($('cats-dlg')) $('cats-dlg').close();
    };
  }
  function okHide() { var o = $('ok-order'); if (o) o.hidden = true; document.body.style.overflow = ''; }
  if ($('ok-close')) $('ok-close').onclick = okHide;
  if ($('ok-view')) $('ok-view').onclick = function () { okHide(); showOrders('mine'); };
  if ($('nav-home')) {
    $('nav-home').onclick = function (e) {
      e.preventDefault();
      cat = 'All'; tabs(); render();
    };
  }


  if ($('open-help')) $('open-help').onclick = function () { if ($('help-dlg')) $('help-dlg').showModal(); };
  if ($('help-close')) $('help-close').onclick = function () { $('help-dlg').close(); };
  if ($('gphone-form')) {
    $('gphone-form').onsubmit = function (e) {
      e.preventDefault();
      var f = e.target;
      $('gphone-msg').textContent = '';
      jpost('/shop/api/google/complete', { name: f.name.value, phone: f.phone.value, country: f.country.value, lang: f.lang.value })
        .then(function (d) { me = d.user; try { localStorage.setItem('sgm_phone', f.phone.value); } catch (x) {} try { $('auth').hidden = true; document.body.style.overflow = ''; } catch (x) {} setAvatar(d.user); $('gphone').close(); load(); })
        .catch(function (er) { $('gphone-msg').textContent = er.message; });
    };
  }
  if ($('gphone')) $('gphone').addEventListener('cancel', function (e) { e.preventDefault(); });
  if (gQuery.indexOf('needphone=1') >= 0 && $('gphone')) {
    api('/shop/api/google/pending').then(function (d) { if (d && d.name && $('gphone-form').name && !$('gphone-form').name.value) $('gphone-form').name.value = d.name; }).catch(function () {});
    try { var sp = localStorage.getItem('sgm_phone'); if (sp && $('gphone-form').phone && !$('gphone-form').phone.value) $('gphone-form').phone.value = sp; } catch (x) {}
    $('gphone').showModal();
  }


  setInterval(load, 45000);
})();
