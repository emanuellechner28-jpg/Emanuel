/* Mini-3D für die Übungs-Anleitung: kleine WebGL-Engine, keine Bibliothek nötig.
   window.Tut3D.mount(container, ex, {caption, label}) -> { dispose } | null (wenn WebGL fehlt) */
(function () {
  'use strict';
  var D = 2.8; // Sekunden pro Wiederholung

  // Schlüsselposen (Seitenansicht, Pixel): [x_oben, y_oben, x_unten, y_unten]
  var KF = {
    pushup: { F: [285, 138, 285, 138], S: [163, 100, 157, 124], E: [165, 119, 176, 129], H: [160, 138, 160, 138], HD: [147, 95, 141, 127] },
    squat:  { A: [230, 138, 230, 138], K: [232, 108, 250, 114], P: [230, 76, 221, 116], S: [230, 38, 210, 80], H: [258, 40, 238, 84], HD: [230, 26, 206, 69] },
    situp:  { F: [250, 138, 250, 138], K: [225, 104, 225, 104], P: [200, 134, 200, 134], S: [187, 86, 148, 134], H: [213, 92, 160, 127], HD: [184, 74, 134, 132] },
    plank:  { F: [290, 136, 290, 136], S: [160, 106, 160, 106], E: [160, 136, 160, 136], H: [128, 136, 128, 136], HD: [146, 100, 146, 100] }
  };
  var SHADOW = { pushup: [5.3, 2.2, 0.55], squat: [5.7, 0.9, 0.5], situp: [4.6, 1.7, 0.5], plank: [5.7, 2.2, 0.5] };
  // Kamera pro Übung: [Zielpunkt x, Zielpunkt y, Abstand, Augenhöhe]
  var CAM = { pushup: [4.7, 0.6, 6.3, 2.0], squat: [5.0, 1.5, 7.3, 2.4], situp: [4.3, 0.65, 6.0, 1.9], plank: [4.8, 0.6, 6.3, 2.0] };
  var FIGURE_X = { pushup: 3.6, squat: 4.9, situp: 3.3, plank: 3.4 }; // vorderste Stelle der Figur (für Abstandsmarke)

  function pt(a, p) { var x = a[0] + (a[2] - a[0]) * p, y = a[1] + (a[3] - a[1]) * p; return [x / 40, (140 - y) / 40 + 0.08, 0]; }
  function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0]; }
  function skeleton(ex, p) {
    var k = KF[ex], s;
    if (ex === 'pushup' || ex === 'plank') {
      var F = pt(k.F, p), S = pt(k.S, p);
      s = { ank: F, knee: lerp3(F, S, 0.2), hip: lerp3(F, S, 0.42), sh: S, elb: pt(k.E, p), hand: pt(k.H, p), head: pt(k.HD, p) };
    } else if (ex === 'squat') {
      var S2 = pt(k.S, p), H2 = pt(k.H, p);
      s = { ank: pt(k.A, p), knee: pt(k.K, p), hip: pt(k.P, p), sh: S2, elb: lerp3(S2, H2, 0.5), hand: H2, head: pt(k.HD, p) };
    } else {
      var S3 = pt(k.S, p), H3 = pt(k.H, p);
      s = { ank: pt(k.F, p), knee: pt(k.K, p), hip: pt(k.P, p), sh: S3, elb: lerp3(S3, H3, 0.5), hand: H3, head: pt(k.HD, p) };
    }
    var M = ex === 'squat' ? 11.4 : (ex === 'situp' ? 9.6 : 0);
    if (M) for (var k2 in s) s[k2] = [M - s[k2][0], s[k2][1], 0];
    return s;
  }

  /* ---- kleine Mathe ---- */
  function v3(x, y, z) { return [x, y, z]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function norm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function perspective(fovy, asp, n, f) {
    var t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m;
  }
  function lookAt(e, c, up) {
    var z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x), m = new Float32Array(16);
    m[0] = x[0]; m[1] = y[0]; m[2] = z[0]; m[4] = x[1]; m[5] = y[1]; m[6] = z[1]; m[8] = x[2]; m[9] = y[2]; m[10] = z[2];
    m[12] = -dot(x, e); m[13] = -dot(y, e); m[14] = -dot(z, e); m[15] = 1; return m;
  }
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
    }
    return o;
  }
  function rgb(hex) { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; }
  function parseCss(c, fb) {
    var m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c || '');
    if (m) return [m[1] / 255, m[2] / 255, m[3] / 255];
    m = /^#([0-9a-f]{6})$/i.exec((c || '').trim());
    if (m) return rgb(parseInt(m[1], 16));
    return fb;
  }

  /* ---- Geometrie ---- */
  function sphereMesh() {
    var P = [], N = [], I = [], la = 14, lo = 24, i, j;
    for (i = 0; i <= la; i++) { var th = i * Math.PI / la; for (j = 0; j <= lo; j++) { var ph = j * 2 * Math.PI / lo;
      var x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph); P.push(x, y, z); N.push(x, y, z); } }
    for (i = 0; i < la; i++) for (j = 0; j < lo; j++) { var a = i * (lo + 1) + j, b = a + lo + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
    return { P: P, N: N, I: I };
  }
  function cylMesh() {
    var P = [], N = [], I = [], n = 24, j;
    for (j = 0; j <= n; j++) { var ph = j * 2 * Math.PI / n, x = Math.cos(ph), z = Math.sin(ph);
      P.push(x, -0.5, z, x, 0.5, z); N.push(x, 0, z, x, 0, z); }
    for (j = 0; j < n; j++) { var a = j * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    return { P: P, N: N, I: I };
  }
  function cubeMesh() {
    var P = [], N = [], I = [], F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    F.forEach(function (n, f) {
      var u = Math.abs(n[1]) > 0.5 ? [1, 0, 0] : [0, 1, 0], v = cross(n, u), b = P.length / 3;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
        P.push(n[0] * 0.5 + u[0] * q[0] * 0.5 + v[0] * q[1] * 0.5, n[1] * 0.5 + u[1] * q[0] * 0.5 + v[1] * q[1] * 0.5, n[2] * 0.5 + u[2] * q[0] * 0.5 + v[2] * q[1] * 0.5);
        N.push(n[0], n[1], n[2]);
      });
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    return { P: P, N: N, I: I };
  }

  var VS = 'attribute vec3 aP;attribute vec3 aN;uniform mat4 uVP;uniform mat4 uM;uniform mat3 uN;varying vec3 vN;varying vec3 vW;' +
    'void main(){vec4 w=uM*vec4(aP,1.0);vW=w.xyz;vN=uN*aN;gl_Position=uVP*w;}';
  var FS = 'precision mediump float;varying vec3 vN;varying vec3 vW;uniform vec3 uC;uniform vec3 uCam;uniform float uA;uniform float uU;' +
    'void main(){vec3 col;if(uU>0.5){col=uC;}else{vec3 n=normalize(vN);vec3 L=normalize(vec3(0.4,0.9,0.6));vec3 V=normalize(uCam-vW);' +
    'vec3 base=pow(uC,vec3(2.2));float d=max(dot(n,L),0.0);vec3 amb=mix(vec3(0.34,0.35,0.38),vec3(0.62,0.64,0.68),n.y*0.5+0.5);' +
    'float rim=pow(1.0-max(dot(n,V),0.0),3.0)*0.22;float sp=pow(max(dot(reflect(-L,n),V),0.0),28.0)*0.22;' +
    'vec3 lin=base*(amb+vec3(0.85)*d)+vec3(rim+sp);col=pow(lin,vec3(1.0/2.2));}gl_FragColor=vec4(col*uA,uA);}';

  function mount(box, ex, opts) {
    opts = opts || {};
    if (!KF[ex]) return null;
    var canvas = document.createElement('canvas');
    canvas.className = 'tut-3d';
    var gl;
    try { gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true }) || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
    if (!gl) return null;

    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var prog;
    try {
      prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    } catch (e) { return null; }
    gl.useProgram(prog);
    var U = {}; ['uVP', 'uM', 'uN', 'uC', 'uCam', 'uA', 'uU'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    var aP = gl.getAttribLocation(prog, 'aP'), aN = gl.getAttribLocation(prog, 'aN');
    gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aN);

    function buf(mesh) {
      var b = { p: gl.createBuffer(), n: gl.createBuffer(), i: gl.createBuffer(), count: mesh.I.length };
      gl.bindBuffer(gl.ARRAY_BUFFER, b.p); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.P), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.n); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.N), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.i); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.I), gl.STATIC_DRAW);
      return b;
    }
    var SPH = buf(sphereMesh()), CYL = buf(cylMesh()), CUBE = buf(cubeMesh());
    function bind(b) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b.p); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.n); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.i);
    }

    // Farben nach Thema
    var cs = getComputedStyle(box), txt = parseCss(cs.color, [0.9, 0.9, 0.92]);
    var dark = (txt[0] * 0.3 + txt[1] * 0.59 + txt[2] * 0.11) > 0.5;
    var accRaw = getComputedStyle(document.documentElement).getPropertyValue('--accent');
    var acc = parseCss(accRaw, dark ? rgb(0xCFCDC6) : rgb(0x8E8466));
    var SKIN = rgb(0xD9A284), SKIN2 = rgb(0xC48B6E), HAIR = rgb(0x3A2A20), MOUTH = rgb(0x8E4B4B), WHITE = rgb(0xF5F5F5), DARK = rgb(0x16181C);
    var SHIRT = dark ? rgb(0xE9ECF2) : rgb(0x2F3744), SHORTS = dark ? rgb(0x4A5468) : rgb(0x8A93A5), SHOE = dark ? rgb(0xFAFAFA) : rgb(0x242830);
    var PHONE = dark ? rgb(0x0E0F12) : rgb(0x15171B);

    var VP = null, eye = [0, 0, 0];
    var drawList;
    function draw(b, pos, ax, ay, az, sx, sy, sz, col, alpha, unlit) {
      // ax/ay/az: Basisvektoren (Spalten), sx..sz: Skalierung
      var M = new Float32Array([ax[0] * sx, ax[1] * sx, ax[2] * sx, 0, ay[0] * sy, ay[1] * sy, ay[2] * sy, 0, az[0] * sz, az[1] * sz, az[2] * sz, 0, pos[0], pos[1], pos[2], 1]);
      var Nm = new Float32Array([ax[0] / sx, ax[1] / sx, ax[2] / sx, ay[0] / sy, ay[1] / sy, ay[2] / sy, az[0] / sz, az[1] / sz, az[2] / sz]);
      gl.uniformMatrix4fv(U.uM, false, M); gl.uniformMatrix3fv(U.uN, false, Nm);
      gl.uniform3fv(U.uC, col); gl.uniform1f(U.uA, alpha == null ? 1 : alpha); gl.uniform1f(U.uU, unlit ? 1 : 0);
      bind(b); gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0);
    }
    var X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
    function ball(p, r, col, zs) { draw(SPH, p, X, Y, Z, r, r, r * (zs || 1), col, 1, false); }
    function limb(a, b, r, col, zs) {
      var d = sub(b, a), l = len(d); if (l < 1e-4) return;
      var y = norm(d), x = cross(y, Z); if (len(x) < 1e-3) x = X; x = norm(x); var z = cross(x, y);
      draw(CYL, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], x, y, z, r, l, r * (zs || 1), col, 1, false);
      ball(a, r, col, zs); ball(b, r, col, zs);
    }
    function at(p, z) { return [p[0], p[1], z]; }

    var FX = FIGURE_X[ex], SH = SHADOW[ex];
    function scene(t, p, az) {
      var s = skeleton(ex, p), side, zi, z;
      // Boden-Schatten
      gl.depthMask(false);
      draw(SPH, [4.1, 0.0, 0], X, Y, Z, 5.2, 0.002, 3.0, dark ? [1, 1, 1] : [0, 0, 0], dark ? 0.045 : 0.06, true);
      draw(SPH, [SH[0], 0.004, 0], X, Y, Z, SH[1], 0.002, SH[2], [0, 0, 0], 0.26, true);
      gl.depthMask(true);
      // Mensch: Beine, Arme, Rumpf, Kopf mit Gesicht
      var hip = s.hip, shd = s.sh, a = norm(sub(shd, hip));
      function lv(p, q, k) { return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k]; }
      function pv(p, d, k) { return [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k]; }
      function ell(c, ax, sx, sy, sz, col) { var x = norm(cross(ax, Z)); draw(SPH, c, x, ax, cross(x, ax), sx, sy, sz, col, 1, false); }
      var fd = (ex === 'squat' || ex === 'situp') ? [-1, 0, 0] : norm([-0.3, -1, 0]);   // Richtung der Füße
      for (side = -1; side <= 1; side += 2) {
        var zl = 0.17 * side, za = 0.37 * side, zs = 0.33 * side;
        var hS = at(s.hip, zl), kS = at(s.knee, zl), aS = at(s.ank, zl);
        var mid = lv(hS, kS, 0.55);
        limb(hS, mid, 0.135, SHORTS); limb(mid, kS, 0.103, SKIN); limb(kS, aS, 0.082, SKIN);
        ball(kS, 0.1, SKIN);
        var fc = pv(aS, fd, 0.07); fc[1] -= 0.03;
        var fx = fd, fy = norm([-fd[1], fd[0], 0]);
        draw(SPH, fc, fx, fy, Z, 0.19, 0.078, 0.095, SHOE, 1, false);
        var sS = at(s.sh, zs), eS = at(s.elb, za), wS = at(s.hand, za), m2 = lv(sS, eS, 0.5);
        limb(sS, m2, 0.092, SHIRT); limb(m2, eS, 0.075, SKIN); limb(eS, wS, 0.068, SKIN);
        ball(sS, 0.112, SHIRT); ball(eS, 0.076, SKIN); ball(wS, 0.082, SKIN);
      }
      ell(lv(hip, shd, 0.08), a, 0.18, 0.2, 0.27, SHORTS);     // Becken
      ell(lv(hip, shd, 0.36), a, 0.165, 0.22, 0.255, SHIRT);   // Bauch
      ell(lv(hip, shd, 0.72), a, 0.19, 0.27, 0.33, SHIRT);     // Brust
      var H = s.head;
      limb(pv(shd, a, 0.04), pv(H, a, -0.14), 0.066, SKIN);   // Hals
      // Blickrichtung: immer zum Handy (nach links)
      var f;
      if (ex === 'pushup' || ex === 'plank') f = norm([a[0] * 0.35, a[1] * 0.35 - 0.9, 0]);
      else if (ex === 'squat') f = [-1, -0.03, 0];
      else { f = [-a[1], a[0], 0]; if (f[0] * -1 + f[1] * 0.6 < 0) f = [a[1], -a[0], 0]; }
      f = norm(f);
      var upv = norm(sub(a, [f[0] * dot(a, f), f[1] * dot(a, f), 0])), zz = cross(f, upv);
      function hp(ex2, ey, ez) { return [H[0] + f[0] * ex2 + upv[0] * ey + zz[0] * ez, H[1] + f[1] * ex2 + upv[1] * ey + zz[1] * ez, H[2] + f[2] * ex2 + upv[2] * ey + zz[2] * ez]; }
      draw(SPH, H, f, upv, zz, 0.19, 0.235, 0.17, SKIN, 1, false);                       // Kopf
      draw(SPH, hp(-0.05, 0.065, 0), f, upv, zz, 0.19, 0.205, 0.177, HAIR, 1, false);  // Haare
      for (var sd = -1; sd <= 1; sd += 2) {
        ball(hp(0.164, 0.05, 0.073 * sd), 0.034, WHITE);   // Auge
        ball(hp(0.188, 0.05, 0.073 * sd), 0.019, DARK);    // Pupille
        ball(hp(0.0, 0.0, 0.172 * sd), 0.04, SKIN);        // Ohr
        draw(SPH, hp(0.178, 0.105, 0.075 * sd), f, upv, zz, 0.012, 0.01, 0.04, HAIR, 1, false); // Braue
      }
      ball(hp(0.203, -0.02, 0), 0.04, SKIN2);              // Nase
      draw(SPH, hp(0.172, -0.09, 0), f, upv, zz, 0.014, 0.012, 0.047, MOUTH, 1, false);       // Mund

      // Handy (angelehnt) + Blickfeld
      var ph = [0.62, 0.42, 0], tilt = -0.2, c = Math.cos(tilt), sn = Math.sin(tilt);
      var px = [c, sn, 0], py = [-sn, c, 0];
      draw(CUBE, ph, px, py, Z, 0.09, 0.84, 0.44, PHONE, 1, false);
      draw(CUBE, [ph[0] + 0.048 * c, ph[1] + 0.048 * sn, 0], px, py, Z, 0.01, 0.74, 0.36, dark ? rgb(0x2B3342) : rgb(0x3A4254), 1, false);
      ball([ph[0] - 0.06 * c - 0.26 * sn, ph[1] - 0.06 * sn + 0.26 * c, 0.0], 0.06, rgb(0x20232A));
      ball([ph[0] - 0.06 * c - 0.26 * sn, ph[1] - 0.06 * sn + 0.26 * c, 0.0], 0.034, rgb(0x050506));
      // Kegel (Pyramide) vom Handy zur Figur
      var ap = [0.78, 0.62, 0], bx = 7.3, hw = 1.7, hh = 1.45;
      var cs4 = [[bx, 0.62 + hh, hw], [bx, 0.62 + hh, -hw], [bx, 0.0, -hw], [bx, 0.0, hw]];
      var tri = [], k;
      for (k = 0; k < 4; k++) tri.push(ap, cs4[k], cs4[(k + 1) % 4]);
      gl.depthMask(false);
      drawTris(tri, acc, 0.06);
      drawLines(cs4.map(function (q) { return [ap, q]; }).concat([[cs4[0], cs4[1]], [cs4[1], cs4[2]], [cs4[2], cs4[3]], [cs4[3], cs4[0]]]), acc, 0.4);
      // Abstandsmarke am Boden
      var x0 = 0.85, x1 = FX, zz = 1.05;
      drawLines([[[x0, 0.03, zz], [x1, 0.03, zz]], [[x0, 0.03, zz - 0.12], [x0, 0.03, zz + 0.12]], [[x1, 0.03, zz - 0.12], [x1, 0.03, zz + 0.12]]], acc, 0.95);
      gl.depthMask(true);
    }
    var dyn = gl.createBuffer(), dynN = gl.createBuffer(), dynI = gl.createBuffer();
    function drawTris(tris, col, a) {
      var P = [], N = [], I = [];
      tris.forEach(function (q, i) { P.push(q[0], q[1], q[2]); N.push(0, 1, 0); I.push(i); });
      gl.bindBuffer(gl.ARRAY_BUFFER, dyn); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.DYNAMIC_DRAW); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, dynN); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(N), gl.DYNAMIC_DRAW); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, dynI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.DYNAMIC_DRAW);
      var Id = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      gl.uniformMatrix4fv(U.uM, false, Id); gl.uniformMatrix3fv(U.uN, false, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
      gl.uniform3fv(U.uC, col); gl.uniform1f(U.uA, a); gl.uniform1f(U.uU, 1);
      gl.drawElements(gl.TRIANGLES, I.length, gl.UNSIGNED_SHORT, 0);
    }
    function drawLines(segs, col, a) {
      var P = [], N = [], I = [];
      segs.forEach(function (s, i) { P.push(s[0][0], s[0][1], s[0][2], s[1][0], s[1][1], s[1][2]); N.push(0, 1, 0, 0, 1, 0); I.push(i * 2, i * 2 + 1); });
      gl.bindBuffer(gl.ARRAY_BUFFER, dyn); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.DYNAMIC_DRAW); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, dynN); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(N), gl.DYNAMIC_DRAW); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, dynI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.DYNAMIC_DRAW);
      gl.uniformMatrix4fv(U.uM, false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
      gl.uniformMatrix3fv(U.uN, false, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
      gl.uniform3fv(U.uC, col); gl.uniform1f(U.uA, a); gl.uniform1f(U.uU, 1);
      gl.drawElements(gl.LINES, I.length, gl.UNSIGNED_SHORT, 0);
    }

    // Einbau in die Box
    var svg = box.querySelector('svg');
    box.insertBefore(canvas, box.firstChild);
    var dpr = Math.min(window.devicePixelRatio || 1, 2), W = Math.max(box.clientWidth, 200), H = Math.round(W * 0.62);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.cssText = 'display:block;width:100%;aspect-ratio:' + W + '/' + H;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    var proj = perspective(33 * Math.PI / 180, W / H, 0.5, 60);
    var cap = document.createElement('div'); cap.className = 'tut-cap'; cap.textContent = opts.caption || '';
    var lab = document.createElement('div'); lab.className = 'tut-lab'; lab.textContent = opts.label || '';
    box.appendChild(cap); box.appendChild(lab);
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    var raf = 0, alive = true, t0 = performance.now(), failed = false;
    function frame(now) {
      if (!alive) return;
      if (!canvas.isConnected) { dispose(); return; }
      var t = reduce ? 0 : (now - t0) / 1000;
      var p = reduce ? 0 : 0.5 - 0.5 * Math.cos(2 * Math.PI * t / D);
      if (ex === 'plank') p = 0;
      var az = reduce ? 0.55 : 0.55 + 0.22 * Math.sin(t * 0.4);
      var cm = CAM[ex];
      eye = [cm[0] - Math.cos(az) * cm[2], cm[3], Math.sin(az) * cm[2]];
      var view = lookAt(eye, [cm[0], cm[1], 0], [0, 1, 0]);
      VP = mul(proj, view);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(U.uVP, false, VP); gl.uniform3fv(U.uCam, eye);
      scene(t, p, az);
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    function dispose() {
      alive = false; cancelAnimationFrame(raf);
      try { var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) {}
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
    try { frame(performance.now()); } catch (e) { dispose(); return null; }
    if (gl.getError() !== gl.NO_ERROR && !canvas.width) { dispose(); return null; }
    if (svg) svg.style.display = 'none';
    box.classList.add('is3d');
    return { dispose: dispose, canvas: canvas };
  }
  window.Tut3D = { mount: mount };
})();
