/* Glass: echtes Linsen-Glas per WebGL (alles lokal, keine Bibliothek).
   Zeichnet hinter Karten, Kacheln und Knöpfen der Startseite: Lichtbrechung am Rand,
   leichte Farbaufspaltung, Fresnel-Rand, gerichtete Spiegelung, milchige Streuung,
   Eigenschatten. Der Hintergrund (Foto) wird dafür selbst nachgezeichnet.
   Ohne WebGL bleibt der CSS-Glas-Look aktiv. */
(function () {
  'use strict';

  const VS = `
    attribute vec2 a;
    uniform vec2 uRes;
    uniform vec4 uBox;      // x, y, w, h in CSS-Pixeln
    varying vec2 vP;
    void main() {
      vec2 p = uBox.xy + a * uBox.zw;
      vP = p;
      gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
    }`;

  // Hintergrund nachzeichnen (Foto wie im Hero, Verläufe, Ausblendungen)
  const FS_BG = `
    precision highp float;
    varying vec2 vP;
    uniform vec2 uRes;
    uniform sampler2D uImg;
    uniform vec2 uImgSize;
    uniform vec4 uKb;       // Rechteck des Fotos
    uniform vec2 uPos;      // background-position
    uniform vec4 uHero;     // Rechteck des Hero
    uniform float uHeroOp;
    uniform vec3 uBgA, uBgB, uBg;
    uniform float uFadeH, uFadeStop, uTopH, uTopA;
    uniform vec3 uTopCol;
    uniform float uLight;
    uniform float uYOff, uViewH;
    void main() {
      vec2 p = vP;
      vec3 base = mix(uBgA, uBgB, clamp((p.y - uYOff) / uViewH, 0.0, 1.0));
      vec3 col = base;
      float inHero = step(uHero.x, p.x) * step(p.x, uHero.x + uHero.z) * step(uHero.y, p.y) * step(p.y, uHero.y + uHero.w);
      float s = max(uKb.z / uImgSize.x, uKb.w / uImgSize.y);
      vec2 dsz = uImgSize * s;
      vec2 off = (uKb.zw - dsz) * uPos;
      vec2 uv = (p - uKb.xy - off) / dsz;
      float inKb = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
      vec3 img = texture2D(uImg, clamp(uv, 0.001, 0.999)).rgb;
      if (uLight > 0.5) {
        float l = dot(img, vec3(0.299, 0.587, 0.114));
        img = mix(vec3(l), img, 0.45) * 1.18;
      }
      float bt = clamp((p.y - (uHero.y + uHero.w - uFadeH)) / uFadeH, 0.0, 1.0);
      img = mix(img, uBg, clamp(bt / uFadeStop, 0.0, 1.0));
      float tt = clamp((p.y - uHero.y) / uTopH, 0.0, 1.0);
      img = mix(img, uTopCol, uTopA * (1.0 - tt));
      col = mix(col, img, inHero * inKb * uHeroOp);
      gl_FragColor = vec4(col, 1.0);
    }`;

  const FS_BLIT = `
    precision highp float;
    varying vec2 vP;
    uniform vec2 uRes;
    uniform sampler2D uScene;
    void main() { gl_FragColor = vec4(texture2D(uScene, vec2(vP.x / uRes.x, 1.0 - vP.y / uRes.y)).rgb, 1.0); }`;

  const FS_GLASS = `
    precision highp float;
    varying vec2 vP;
    uniform vec2 uRes;
    uniform sampler2D uScene;
    uniform vec4 uRect;     // Glasfläche
    uniform float uRad;     // Eckenradius
    uniform vec4 uTint;     // Farbe + Anteil
    uniform float uLight;   // 1 = helles Design
    uniform float uPress;
    uniform vec2 uL;        // Lichtrichtung (reagiert auf Scrollen, Finger, Neigen)

    vec2 suv(vec2 p) { return vec2(p.x / uRes.x, 1.0 - p.y / uRes.y); }
    float sdf(vec2 q, vec2 hb, float r) {
      vec2 d = abs(q) - hb;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    vec3 blurAt(vec2 p, float r) {
      vec3 s = vec3(0.0);
      for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float ang = fi * 2.399963;
        float rad = r * sqrt((fi + 0.5) / 8.0);
        s += texture2D(uScene, suv(p + vec2(cos(ang), sin(ang)) * rad)).rgb;
      }
      return s / 8.0;
    }
    // Kreisbogen der Wölbung (Glisse/Aave): Steigung, im Mittel 0,5
    void arc(float sag, float hf, out float R, out float sc) {
      R = (hf * hf + sag * sag) / (2.0 * sag);
      float m = (R - sqrt(max(R * R - hf * hf, 1e-4))) / hf;
      sc = m > 0.0 ? 0.5 / m : 1.0;
    }
    float tanhf(float x) { x = clamp(x, -9.0, 9.0); float e2 = exp(2.0 * x); return (e2 - 1.0) / (e2 + 1.0); }
    float slope(float x, float R, float sc) {
      float i = min(x, 0.999 * R);
      return i / sqrt(R * R - i * i) * sc;
    }

    void main() {
      vec2 p = vP;
      vec2 c = uRect.xy + uRect.zw * 0.5;
      vec2 q = p - c;
      float hw = uRect.z * 0.5, hh = uRect.w * 0.5;
      float mn = min(uRect.z, uRect.w);
      float rad = min(uRad, min(hw, hh));
      float d = sdf(q, vec2(hw, hh) - rad, rad);
      float aa = clamp(0.5 - d, 0.0, 1.0);
      if (aa <= 0.0) discard;
      float e = max(-d, 0.0);

      // Linse: am Rand zeigt das Glas Inhalt von weiter innen (Wölbung einer flachen Kuppel)
      float depth = 0.25 * mn;
      float sag = max(0.01, min(0.5 * mn, min(hw, hh) - 1.0));
      float Rx, sx, Ry, sy;
      arc(sag, hw, Rx, sx); arc(sag, hh, Ry, sy);
      vec2 pullDir = vec2(sign(q.x) * slope(abs(q.x), Rx, sx), sign(q.y) * slope(abs(q.y), Ry, sy));
      float iw = max(0.0, hw - depth), ih = max(0.0, hh - depth);
      float ir = clamp(rad, 0.0, min(iw, ih));
      float fo = 0.5 * (1.0 + tanhf(1.7724538509 * sdf(q, vec2(iw, ih) - ir, ir) / (depth * 1.41421)));
      vec2 pull = clamp(pullDir * fo, -1.0, 1.0) * 0.45 * mn;

      // Farbaufspaltung: Rot biegt etwas weiter als Blau
      vec3 col;
      col.r = blurAt(p - pull * 1.04, 3.0).r;
      col.g = blurAt(p - pull, 3.0).g;
      col.b = blurAt(p - pull * 0.96, 3.0).b;

      // Glaskörper wie bei iOS: halbtransparente Fläche
      if (uLight > 0.5) col = mix(col, vec3(1.0), 0.20);
      else col = mix(col, vec3(0.157), 0.60);
      col = mix(col, uTint.rgb, uTint.a);

      // sanfte Wölbung (Tropfen), Licht von links oben
      vec2 L = normalize(uL);
      float td = clamp(1.0 - e / (mn * 0.5), 0.0, 1.0);
      vec2 nrm;
      {
        float qx = abs(q.x) - hw + rad, qy = abs(q.y) - hh + rad;
        if (qx > 0.0 && qy > 0.0) { float ln = length(vec2(qx, qy)); nrm = sign(q) * vec2(qx, qy) / ln; }
        else if (qx > qy) nrm = vec2(sign(q.x), 0.0);
        else nrm = vec2(0.0, sign(q.y));
      }
      float dome = dot(nrm, L) * pow(td, 1.4);
      col += vec3(max(dome, 0.0) * (uLight > 0.5 ? 0.07 : 0.05));
      col *= 1.0 + min(dome, 0.0) * (uLight > 0.5 ? 0.10 : 0.16);

      // Kante: feine Linie, darüber das Licht am Rand (links/oben direkt, rechts/unten gespiegelt)
      float lined = smoothstep(0.5, 0.0, e) * 0.08;
      col = mix(col, uLight > 0.5 ? vec3(0.0) : vec3(1.0), lined);
      float facing = abs(nrm.x + nrm.y);
      float along = e / (2.2 * sqrt(max(1.0, facing)));
      float shine = uLight > 0.5 ? 0.42 : 0.30;
      float rim = along < 1.0 ? shine * pow(min(1.0, facing), 1.5) * (1.0 - pow(along, 1.5)) : 0.0;
      // weiches Licht etwas weiter innen, nur auf der Lichtseite
      float soft = smoothstep(0.0, 4.0, e) * smoothstep(14.0, 2.0, e) * max(dot(nrm, L), 0.0) * (uLight > 0.5 ? 0.16 : 0.10);
      col = mix(col, vec3(1.0), clamp(rim + soft, 0.0, 1.0));

      col *= 1.0 - uPress * 0.08;
      col += (hash(floor(p * 1.5)) - 0.5) * 0.010;
      gl_FragColor = vec4(col * aa, aa);
    }`;

  let G = null;       // GL-Zustand (einmalig)
  let ok = true;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
    return { p: p, u: u };
  }
  function target(gl, w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex: tex, fb: fb, w: w, h: h };
  }

  function init() {
    const canvas = document.createElement('canvas');
    canvas.className = 'glass-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('kein WebGL');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const cc = document.createElement('canvas'); cc.width = cc.height = 1;
    G = {
      canvas: canvas, gl: gl,
      bg: program(gl, FS_BG), blit: program(gl, FS_BLIT), glass: program(gl, FS_GLASS),
      img: gl.createTexture(), imgUrl: '', imgSize: [1, 1], imgReady: false,
      t1: null, t2: null, W: 0, H: 0, dpr: 1, raf: 0, root: null, items: [], sig: '',
      cx: cc.getContext('2d', { willReadFrequently: true })
    };
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ok = false; if (G && G.root) G.root.classList.remove('gl-on'); });
  }

  function color(str, fallback) {
    try {
      G.cx.clearRect(0, 0, 1, 1); G.cx.fillStyle = '#000'; G.cx.fillStyle = str; G.cx.fillRect(0, 0, 1, 1);
      const d = G.cx.getImageData(0, 0, 1, 1).data;
      return [d[0] / 255, d[1] / 255, d[2] / 255];
    } catch (e) { return fallback; }
  }

  function loadImage(url) {
    if (G.imgUrl === url) return;
    G.imgUrl = url; G.imgReady = false;
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      const gl = G.gl;
      gl.bindTexture(gl.TEXTURE_2D, G.img);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      G.imgSize = [im.naturalWidth, im.naturalHeight]; G.imgReady = true; G.sig = '';
    };
    im.onerror = () => { G.imgReady = false; };
    im.src = url;
  }

  function resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    if (G.canvas.width === pw && G.canvas.height === ph && G.W === w && G.H === h) return;
    G.W = w; G.H = h; G.dpr = dpr;
    G.canvas.width = pw; G.canvas.height = ph;
    const gl = G.gl;
    [G.t1, G.t2].forEach((t) => { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } });
    G.t1 = target(gl, pw, ph); G.t2 = target(gl, pw, ph);
    G.sig = '';
  }

  function use(pr, box) {
    const gl = G.gl;
    gl.useProgram(pr.p);
    gl.uniform2f(pr.u.uRes, G.W, G.H);
    gl.uniform4f(pr.u.uBox, box[0], box[1], box[2], box[3]);
  }
  function bindTex(unit, tex, loc) {
    const gl = G.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  const M = 350;   // Rand über und unter dem Bildschirm, damit Glas beim Scrollen schon bereit ist
  function rel(r, o) { return [r.left - o.left, r.top - o.top + M, r.width, r.height]; }

  // Licht reagiert auf Scrollen, Finger und (wenn vorhanden) Neigen
  const LIGHT = { px: 0, py: 0, tx: 0, ty: 0, x: -0.55, y: -0.83 };
  function onPoint(e) { LIGHT.px = (e.clientX / (window.innerWidth || 390) - 0.5) * 2; LIGHT.py = (e.clientY / (window.innerHeight || 844) - 0.5) * 2; if (G) G.sig = ''; }
  window.addEventListener('pointermove', onPoint, { passive: true });
  window.addEventListener('pointerdown', onPoint, { passive: true });
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    LIGHT.tx = Math.max(-1, Math.min(1, e.gamma / 35)); LIGHT.ty = Math.max(-1, Math.min(1, (e.beta - 40) / 35));
    if (G) G.sig = '';
  }, { passive: true });

  function frame() {
    G.raf = 0;
    const root = G.root;
    if (!root || !root.isConnected || !root.classList.contains('active') || document.hidden) { return; }
    G.raf = requestAnimationFrame(frame);
    const gl = G.gl;
    const ro = root.getBoundingClientRect();
    if (ro.width < 10) return;
    const kb = root.querySelector('.hero .kb'), hero = root.querySelector('.hero');
    if (!kb || !hero) return;
    const cs = getComputedStyle(kb);
    const m = /url\(["']?(.*?)["']?\)/.exec(cs.backgroundImage);
    if (m) loadImage(m[1]);
    if (!G.imgReady) return;
    const kr = kb.getBoundingClientRect(), hr = hero.getBoundingClientRect();
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    const items = G.items.map((it) => {
      const r = it.el.getBoundingClientRect();
      const w = it.el.offsetWidth || r.width, h = it.el.offsetHeight || r.height;
      // Glas wird in der ungedehnten Größe gerechnet, das Element dehnt es selbst mit
      const b = [r.left - ro.left + (r.width - w) / 2, r.top - ro.top + M + (r.height - h) / 2, w, h];
      return { it: it, r: r, b: b, on: it.el.classList.contains('on'), press: it.el.matches(':active') ? 1 : 0 };
    }).filter((x) => x.b[2] > 4 && x.r.bottom > ro.top - M && x.r.top < ro.bottom + M);
    const scr = root.querySelector('.scroll');
    const sy = scr ? scr.scrollTop : 0;
    const wantX = -0.55 + LIGHT.px * 0.55 + LIGHT.tx * 0.7 - Math.sin(sy * 0.004) * 0.35;
    const wantY = -0.83 + LIGHT.py * 0.3 + LIGHT.ty * 0.5 + Math.cos(sy * 0.003) * 0.12;
    LIGHT.x += (wantX - LIGHT.x) * 0.14; LIGHT.y += (wantY - LIGHT.y) * 0.14;
    const moving = Math.abs(wantX - LIGHT.x) + Math.abs(wantY - LIGHT.y) > 0.004;
    if (moving) G.sig = '';
    const sig = [LIGHT.x.toFixed(3), LIGHT.y.toFixed(3), ro.width, ro.height, kr.left, kr.top, kr.width, kr.height, hr.height, hero.style.opacity, light, items.map((x) => [Math.round(x.b[0] * 2), Math.round(x.b[1] * 2), x.b[2], x.b[3], x.on, x.press].join()).join('|')].join(';');
    if (sig === G.sig) return;
    G.sig = sig;
    resize(ro.width, ro.height + 2 * M);
    gl.disable(gl.BLEND);

    // Szene: Hintergrund
    const hs = getComputedStyle(root);
    const rs = getComputedStyle(document.documentElement);
    const bgA = color(rs.getPropertyValue('--bg-a').trim() || '#0f1013', [.06, .06, .07]);
    const bgB = color(rs.getPropertyValue('--bg-b').trim() || '#0b0c0e', [.04, .04, .05]);
    const bgC = color(rs.getPropertyValue('--bg').trim() || '#0c0d10', [.05, .05, .06]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.t1.fb);
    gl.viewport(0, 0, G.t1.w, G.t1.h);
    use(G.bg, [0, 0, G.W, G.H]);
    const u = G.bg.u;
    gl.uniform1f(u.uYOff, M);
    gl.uniform1f(u.uViewH, ro.height);
    bindTex(0, G.img, u.uImg);
    gl.uniform2f(u.uImgSize, G.imgSize[0], G.imgSize[1]);
    const kbo = rel(kr, ro), ho = rel(hr, ro);
    gl.uniform4f(u.uKb, kbo[0], kbo[1], kbo[2], kbo[3]);
    const pos = cs.backgroundPositionY.indexOf('%') > 0 ? parseFloat(cs.backgroundPositionY) / 100 : 0.5;
    const posx = cs.backgroundPositionX.indexOf('%') > 0 ? parseFloat(cs.backgroundPositionX) / 100 : 0.5;
    gl.uniform2f(u.uPos, posx, pos);
    gl.uniform4f(u.uHero, ho[0], ho[1], ho[2], ho[3]);
    gl.uniform1f(u.uHeroOp, parseFloat(getComputedStyle(hero).opacity) || 0);
    gl.uniform3f(u.uBgA, bgA[0], bgA[1], bgA[2]);
    gl.uniform3f(u.uBgB, bgB[0], bgB[1], bgB[2]);
    gl.uniform3f(u.uBg, bgC[0], bgC[1], bgC[2]);
    const bf = hero.querySelector('.bot-fade'), tf = hero.querySelector('.top-fade');
    gl.uniform1f(u.uFadeH, bf ? bf.getBoundingClientRect().height || 150 : 150);
    gl.uniform1f(u.uFadeStop, light ? 0.78 : 0.92);
    gl.uniform1f(u.uTopH, tf ? tf.getBoundingClientRect().height || 150 : 150);
    gl.uniform1f(u.uTopA, light ? 0.8 : 0.62);
    if (light) gl.uniform3f(u.uTopCol, 240 / 255, 243 / 255, 247 / 255); else gl.uniform3f(u.uTopCol, 10 / 255, 11 / 255, 13 / 255);
    gl.uniform1f(u.uLight, light ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const acc = (rs.getPropertyValue('--acc-rgb').trim() || '200,205,214').split(',').map((v) => parseFloat(v) / 255);

    const drawGlass = (list, sceneTex) => {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      list.forEach((x) => {
        const b = x.b, pad = 2;
        use(G.glass, [b[0] - pad, b[1] - pad, b[2] + pad * 2, b[3] + pad * 2]);
        const gu = G.glass.u;
        bindTex(0, sceneTex, gu.uScene);
        gl.uniform4f(gu.uRect, b[0], b[1], b[2], b[3]);
        gl.uniform1f(gu.uRad, Math.min(x.it.rad(), Math.min(b[2], b[3]) / 2));
        gl.uniform1f(gu.uBez, Math.min(x.it.bez, Math.min(b[2], b[3]) / 2.2));
        gl.uniform1f(gu.uStr, x.it.str);
        if (x.on) gl.uniform4f(gu.uTint, acc[0], acc[1], acc[2], light ? 0.14 : 0.20); else gl.uniform4f(gu.uTint, 0, 0, 0, 0);
        gl.uniform1f(gu.uLight, light ? 1 : 0);
        gl.uniform1f(gu.uPress, x.press);
        gl.uniform2f(gu.uL, LIGHT.x, LIGHT.y);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      });
      gl.disable(gl.BLEND);
      // jedes Glas in die eigene Fläche kopieren: sie bewegt sich mit dem Element, auch beim Überscrollen
      list.forEach((x) => {
        const cv = x.it.cv, d = G.dpr;
        const cw = Math.max(1, Math.round(x.b[2] * d)), ch = Math.max(1, Math.round(x.b[3] * d));
        if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
        const cx = x.it.cx2d;
        cx.clearRect(0, 0, cw, ch);
        cx.drawImage(G.canvas, Math.round(x.b[0] * d), Math.round(x.b[1] * d), cw, ch, 0, 0, cw, ch);
      });
    };
    const lv0 = items.filter((x) => x.it.level === 0), lv1 = items.filter((x) => x.it.level === 1);

    // Ebene 0 in Zwischenbild (damit Knöpfe auf der Karte die Karte brechen)
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.t2.fb);
    gl.viewport(0, 0, G.t2.w, G.t2.h);
    use(G.blit, [0, 0, G.W, G.H]);
    bindTex(0, G.t1.tex, G.blit.u.uScene);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    drawGlass(lv0, G.t1.tex);

    // Ausgabe: nur die Glasflächen, Rest bleibt durchsichtig
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, G.canvas.width, G.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawGlass(lv0, G.t1.tex);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawGlass(lv1, G.t2.tex);
  }

  const SPEC = [
    { sel: '.gcard-in', level: 0, bez: 24, str: 20 },
    { sel: '.tile', level: 0, bez: 18, str: 14 },
    { sel: '.start-btn', level: 1, bez: 16, str: 12 },
    { sel: '.card.glass', level: 0, bez: 20, str: 16 }
  ];

  function mount(root) {
    if (!ok) return;
    try {
      if (!G) init();
    } catch (e) { ok = false; return; }
    if (G.raf) cancelAnimationFrame(G.raf);
    G.root = root;
    G.items = [];
    SPEC.forEach((s) => {
      root.querySelectorAll(s.sel).forEach((el) => {
        const cv = document.createElement('canvas');
        cv.className = 'gl-surface'; cv.setAttribute('aria-hidden', 'true');
        el.insertBefore(cv, el.firstChild);
        G.items.push({ el: el, cv: cv, cx2d: cv.getContext('2d'), level: s.level, bez: s.bez, str: s.str, rad: () => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 20 });
      });
    });
    G.sig = '';
    root.classList.add('gl-on');
    G.raf = requestAnimationFrame(frame);
  }
  function wake() { if (G && G.root && !G.raf && ok) { G.sig = ''; G.raf = requestAnimationFrame(frame); } }
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('resize', () => { if (G) G.sig = ''; });

  window.Glass = { mount: mount, wake: wake };
})();
