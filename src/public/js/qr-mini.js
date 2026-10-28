/* Tiny QR encoder (byte mode, error level M, versions 1-6 = up to 106 characters).
   Used only for the printable order label. No network, no library. */
(function (root) {
  'use strict';
  var NB = [0, 1, 1, 1, 2, 2, 4];            // blocks per version (level M)
  var EC = [0, 10, 16, 26, 18, 24, 16];       // EC codewords per block
  var RAW = [0, 26, 44, 70, 100, 134, 172];   // total codewords
  var ALIGN = [0, 0, 18, 22, 26, 30, 34];    // alignment centre (v2..v6)

  function mul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 255; }
  function divisor(deg) {
    var r = []; for (var i = 0; i < deg - 1; i++) r.push(0); r.push(1);
    var root = 1;
    for (i = 0; i < deg; i++) {
      for (var j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = mul(root, 2);
    }
    return r;
  }
  function remainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift(); r.push(0);
      div.forEach(function (c, i) { r[i] ^= mul(c, f); });
    });
    return r;
  }
  function utf8(s) { return Array.prototype.slice.call(unescape(encodeURIComponent(s))).map(function (c) { return c.charCodeAt(0); }); }

  function encode(text) {
    var bytes = utf8(String(text || ''));
    var ver = 0, i;
    for (i = 1; i <= 6; i++) { if (bytes.length <= RAW[i] - NB[i] * EC[i] - 2) { ver = i; break; } }
    if (!ver) { ver = 6; bytes = bytes.slice(0, RAW[6] - NB[6] * EC[6] - 2); }
    var dataCap = RAW[ver] - NB[ver] * EC[ver];
    var bits = [];
    function put(v, n) { for (var k = n - 1; k >= 0; k--) bits.push((v >>> k) & 1); }
    put(4, 4); put(bytes.length, 8); bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, dataCap * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    var data = [];
    for (i = 0; i < bits.length; i += 8) { var v = 0; for (var k = 0; k < 8; k++) v = (v << 1) | bits[i + k]; data.push(v); }
    for (var pad = 0xEC; data.length < dataCap; pad ^= 0xEC ^ 0x11) data.push(pad);

    // split into blocks, add Reed-Solomon, interleave
    var nb = NB[ver], ecl = EC[ver], raw = RAW[ver];
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), blocks = [], div = divisor(ecl), off = 0;
    for (i = 0; i < nb; i++) {
      var len = shortLen - ecl + (i < nShort ? 0 : 1);
      var d = data.slice(off, off + len); off += len;
      blocks.push({ d: d, e: remainder(d, div) });
    }
    var out = [];
    for (i = 0; i < shortLen - ecl + 1; i++) blocks.forEach(function (b, j) { if (i !== shortLen - ecl || j >= nShort) out.push(b.d[i]); });
    for (i = 0; i < ecl; i++) blocks.forEach(function (b) { out.push(b.e[i]); });

    var size = ver * 4 + 17, m = [], fn = [], y, x;
    for (y = 0; y < size; y++) { m.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function setF(xx, yy, dark) { m[yy][xx] = !!dark; fn[yy][xx] = true; }
    for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var xx = c[0] + dx, yy = c[1] + dy; if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        var dist = Math.max(Math.abs(dx), Math.abs(dy)); setF(xx, yy, dist !== 2 && dist !== 4);
      }
    });
    if (ver >= 2) { var a = ALIGN[ver]; for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) setF(a + ax, a + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1); }
    function formatBits(mask) {
      var dd = (0 << 3) | mask, rem = dd; // level M = 0
      for (var q = 0; q < 10; q++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      return ((dd << 10) | rem) ^ 0x5412;
    }
    function drawFormat(mask) {
      var b = formatBits(mask); function g(n) { return ((b >>> n) & 1) !== 0; }
      for (var q = 0; q <= 5; q++) setF(8, q, g(q));
      setF(8, 7, g(6)); setF(8, 8, g(7)); setF(7, 8, g(8));
      for (q = 9; q < 15; q++) setF(14 - q, 8, g(q));
      for (q = 0; q < 8; q++) setF(size - 1 - q, 8, g(q));
      for (q = 8; q < 15; q++) setF(8, size - 15 + q, g(q));
      setF(8, size - 8, true);
    }
    drawFormat(0);
    // place data
    var n = 0, total = out.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (var j = 0; j < 2; j++) {
        var xx = right - j, up = ((right + 1) & 2) === 0, yy = up ? size - 1 - vert : vert;
        if (!fn[yy][xx] && n < total) { m[yy][xx] = ((out[n >>> 3] >>> (7 - (n & 7))) & 1) !== 0; n++; }
      }
    }
    function applyMask(mask) {
      for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) {
        var inv;
        switch (mask) {
          case 0: inv = (xx + yy) % 2 === 0; break;
          case 1: inv = yy % 2 === 0; break;
          case 2: inv = xx % 3 === 0; break;
          case 3: inv = (xx + yy) % 3 === 0; break;
          case 4: inv = (Math.floor(xx / 3) + Math.floor(yy / 2)) % 2 === 0; break;
          case 5: inv = xx * yy % 2 + xx * yy % 3 === 0; break;
          case 6: inv = (xx * yy % 2 + xx * yy % 3) % 2 === 0; break;
          default: inv = ((xx + yy) % 2 + xx * yy % 3) % 2 === 0;
        }
        if (!fn[yy][xx] && inv) m[yy][xx] = !m[yy][xx];
      }
    }
    function penalty() {
      var p = 0, r, c, run, k;
      for (r = 0; r < size; r++) { run = 1; for (c = 1; c < size; c++) { if (m[r][c] === m[r][c - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (c = 0; c < size; c++) { run = 1; for (r = 1; r < size; r++) { if (m[r][c] === m[r - 1][c]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) { var v = m[r][c]; if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3; }
      var dark = 0; for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (m[r][c]) dark++;
      k = Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1; p += Math.max(0, k) * 10;
      return p;
    }
    var best = 0, bestP = Infinity;
    for (var mk = 0; mk < 8; mk++) {
      applyMask(mk); drawFormat(mk); var pp = penalty();
      if (pp < bestP) { bestP = pp; best = mk; }
      applyMask(mk); // undo
    }
    applyMask(best); drawFormat(best);
    return m;
  }
  root.SGM_QR = { matrix: encode };
})(typeof window !== 'undefined' ? window : globalThis);
