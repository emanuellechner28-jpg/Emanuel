/* Glass: echtes Linsen-Glas per WebGL (alles lokal, keine Bibliothek).
   Zeichnet hinter Karten, Kacheln, Knöpfen, Reglern und der unteren Leiste auf allen Seiten:
   Lichtbrechung am Rand, leichte Farbaufspaltung, Fresnel-Rand, gerichtete Spiegelung,
   milchige Streuung, Eigenschatten. Der Hintergrund (Foto, Verläufe, Lichtflecken) wird dafür
   selbst nachgezeichnet. Ohne WebGL bleibt der CSS-Glas-Look aktiv.

   Feineinstellung pro Element über CSS-Variablen (siehe style.css, Abschnitt "Glas überall"):
     --gl-body      Deckkraft des Glaskörpers, 1 = Linse, 0 = nur Rand und Glanz
     --gl-body-col  Farbe und Anteil des Glaskörpers, "r g b anteil"
     --gl-tint      Tönung, "r g b alpha"
     --gl-tint-on   Tönung, wenn das Element .on, .sel oder .cur trägt */
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

  // Hintergrund nachzeichnen (Foto wie im Hero, Verläufe, Lichtflecken, Ausblendungen)
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
    uniform vec4 uGl0, uGl1, uGl2;    // Lichtflecken: Mitte x, y und Radius x, y in Pixeln
    uniform vec4 uGc0, uGc1, uGc2;    // Farbe und Deckkraft
    uniform vec3 uGs;                 // wo der Fleck ausläuft (Anteil des Radius)
    vec3 glow(vec3 col, vec2 p, vec4 g, vec4 c, float stop) {
      if (c.a <= 0.0) return col;
      float t = length((p - g.xy) / max(g.zw, vec2(1.0))) / max(stop, 0.01);
      return mix(col, c.rgb, c.a * clamp(1.0 - t, 0.0, 1.0));
    }
    void main() {
      vec2 p = vP;
      vec3 base = mix(uBgA, uBgB, clamp((p.y - uYOff) / uViewH, 0.0, 1.0));
      vec3 col = base;
      col = glow(col, p, uGl2, uGc2, uGs.z);
      col = glow(col, p, uGl1, uGc1, uGs.y);
      col = glow(col, p, uGl0, uGc0, uGs.x);
      float inHero = step(uHero.x, p.x) * step(p.x, uHero.x + uHero.z) * step(uHero.y, p.y) * step(p.y, uHero.y + uHero.w);
      float s = max(uKb.z / uImgSize.x, uKb.w / uImgSize.y);
      vec2 dsz = uImgSize * s;
      vec2 off = (uKb.zw - dsz) * uPos;
      vec2 uv = (p - uKb.xy - off) / dsz;
      float inKb = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
      vec3 img = texture2D(uImg, clamp(uv, 0.001, 0.999)).rgb;
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
    uniform float uBody;    // Deckkraft des Glaskörpers: 1 = Linse, 0 = nur Rand und Glanz
    uniform vec4 uBodyCol;  // Farbe des Glaskörpers und wie stark sie die Brechung überdeckt
    uniform float uBand;    // Breite des Rands, an dem die Brechung bei dünnem Glas sichtbar bleibt
    uniform float uBend;    // wie stark die Linse den Hintergrund biegt (glisse: --lg-glass-bend)
    uniform float uDisp;    // Farbaufspaltung (glisse: --lg-glass-dispersion)
    uniform float uBlur;    // Weichzeichner in Pixeln (glisse: --lg-blur)
    uniform float uShine;   // Glanz am Rand (glisse: --lg-rim-shine)
    uniform float uFrost;   // Weichzeichner im Inneren in Pixeln (damit Text über Fotos lesbar bleibt)

    vec2 suv(vec2 p) { return vec2(p.x / uRes.x, 1.0 - p.y / uRes.y); }
    float sdf(vec2 q, vec2 hb, float r) {
      vec2 d = abs(q) - hb;
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    vec3 blurAt(vec2 p, float r) {
      if (r < 0.01) return texture2D(uScene, suv(p)).rgb;   // ohne Weichzeichner genügt eine Probe
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
      float depth = min(0.25 * mn, 34.0);      // Breite des gewölbten Rands: bei großen Karten nur ein schmaler Streifen
      float sag = max(0.01, min(0.5 * mn, min(hw, hh) - 1.0));
      float Rx, sx, Ry, sy;
      arc(sag, hw, Rx, sx); arc(sag, hh, Ry, sy);
      vec2 pullDir = vec2(sign(q.x) * slope(abs(q.x), Rx, sx), sign(q.y) * slope(abs(q.y), Ry, sy));
      float iw = max(0.0, hw - depth), ih = max(0.0, hh - depth);
      float ir = clamp(rad, 0.0, min(iw, ih));
      float fo = 0.5 * (1.0 + tanhf(1.7724538509 * sdf(q, vec2(iw, ih) - ir, ir) / (depth * 1.41421)));
      vec2 pull = clamp(pullDir * fo, -1.0, 1.0) * uBend * min(mn, 84.0);   // große Karten verzerren nicht stärker als mittlere

      // Farbaufspaltung wie bei glisse: Rot biegt am weitesten, Blau am wenigsten
      vec3 col;
      float br = uBlur + uFrost * smoothstep(0.0, depth * 1.2, e);   // innen leicht weich, am Rand scharf
      col.r = blurAt(p - pull * (1.0 + 0.2 * uDisp), br).r;
      col.g = blurAt(p - pull * (1.0 + 0.1 * uDisp), br).g;
      col.b = blurAt(p - pull, br).b;

      // Glaskörper wie bei iOS: halbtransparente Fläche
      col = mix(col, uBodyCol.rgb, uBodyCol.a);
      col = mix(col, uTint.rgb, uTint.a);

      // Licht von links oben. Wie bei Apple: innen bleibt das Glas ruhig und klar, das Licht sammelt sich an der Kante.
      vec2 L = normalize(uL);
      vec2 nrm;
      {
        float qx = abs(q.x) - hw + rad, qy = abs(q.y) - hh + rad;
        if (qx > 0.0 && qy > 0.0) { float ln = length(vec2(qx, qy)); nrm = sign(q) * vec2(qx, qy) / ln; }
        else if (qx > qy) nrm = vec2(sign(q.x), 0.0);
        else nrm = vec2(0.0, sign(q.y));
      }
      float facing = abs(nrm.x + nrm.y);
      float f2 = min(facing, 1.0);
      float lit = max(dot(nrm, L), 0.0);
      float k = uShine / 0.22;
      // Lichtkante: hauchdünn, auf der Lichtseite am hellsten, an den übrigen Ecken schwächer
      float edgeLine = smoothstep(1.25, 0.1, e) * (0.22 + 0.55 * f2 * f2 + 0.25 * lit) * k;
      // feiner Schein innen an der Kante
      float glow = smoothstep(9.0, 0.0, e) * (0.04 + 0.10 * lit + 0.05 * f2 * f2) * k;
      float hi = clamp(edgeLine + glow, 0.0, 1.0);

      // Dünnes Glas: innen durchsichtig, am Rand bleibt die Brechung als schmaler Streifen sichtbar
      float band = 1.0 - smoothstep(0.0, uBand, e);
      float bodyA = clamp(uBody + band * 0.22, 0.0, 1.0);
      vec3 pre = (1.0 - hi) * (col * bodyA) + hi * vec3(1.0);
      float alpha = hi + (1.0 - hi) * bodyA;
      pre *= 1.0 - uPress * 0.08;
      pre += (hash(floor(p * 1.5)) - 0.5) * 0.010 * bodyA;
      gl_FragColor = vec4(pre * aa, alpha * aa);
    }`;

  // Grundwerte der Linse, so wie im glisse-Beispiel <Glass style={{ "--lg-glass-bend": 0.76, ... }} />.
  // Pro Element lassen sie sich mit denselben CSS-Variablen ändern: --lg-glass-bend, --lg-glass-dispersion, --lg-blur, --lg-rim-shine.
  const LENS = { bend: 0.76, dispersion: 0.30, blur: 0, shine: 0.22, frost: 3 };

  // Was Glas bekommt. level 0 = Grundfläche, level 1 = liegt auf Glas und bricht die Fläche darunter.
  // top: Fläche liegt über dem Inhalt (Fotokarten, dort zeigt sich nur Rand und Glanz).
  // keep: das Element behält seinen CSS-Hintergrund und Blur (untere Leiste, darunter läuft Inhalt).
  // global: Element liegt außerhalb der Seiten (untere Leiste).
  const SPEC = [
    // Training (Startseite)
    { sel: '.gcard-in', level: 0 },
    { sel: '.tile', level: 0 },
    { sel: '.start-btn', level: 1 },
    { sel: '.tip', level: 0 },
    // Karten, Kästen und Knöpfe auf allen Seiten
    { sel: '.card.glass:not(.goal-card)', level: 0 },
    { sel: '.goal-card', level: 0, top: true },
    { sel: '.round-btn', level: 0 },
    { sel: '.chart', level: 0 },
    { sel: '.total', level: 0 },
    { sel: '.rec', level: 0 },
    { sel: '.mile', level: 0 },
    { sel: '.lockcard', level: 0 },
    { sel: '.rchip', level: 0 },
    { sel: '.balance', level: 0 },
    { sel: '.pcard', level: 0, top: true },
    { sel: '.buy-panel', level: 0 },
    { sel: '.hold', level: 1 },
    { sel: '.lk-tile', level: 0 },
    { sel: '.plan-opt', level: 0 },
    { sel: '.btn-grad', level: 0 },
    // Einstellungen
    { sel: '.panel.glass', level: 0 },
    { sel: '.switch', level: 1 },
    { sel: '.stepper button', level: 1 },
    { sel: '.actbtn', level: 1 },
    { sel: '.segpair button.on', level: 1 },
    { sel: '.seg button.on', level: 1 },
    // Einstieg: Fragen, Regler, Halte-Kugel
    { sel: '.extile', level: 0 },
    { sel: '.theme-card', level: 0, top: true },
    { sel: '.fl', level: 0 },
    { sel: '.in-wrap', level: 0 },
    { sel: '.vs-thumb b', level: 1 },
    { sel: '.orb-core', level: 0 },
    // untere Leiste samt gleitender Pille
    { sel: '#nav', level: 0, keep: true, global: true },
    { sel: '#nav .nav-pill', level: 1, global: true }
  ];

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
  function imgParams(gl) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
      t1: null, t2: null, W: 0, H: 0, dpr: 1, raf: 0, root: null, items: [], sig: '', scene: null,
      cx: cc.getContext('2d', { willReadFrequently: true })
    };
    // leeres 1x1-Bild, damit die Textur auch ohne Foto gültig ist
    gl.bindTexture(gl.TEXTURE_2D, G.img);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    imgParams(gl);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); ok = false;
      // Ohne Kontext zurück zum CSS-Glas: alle Elemente verlieren die Glas-Markierung
      G.items.forEach((it) => it.el.classList.remove('gl-el', 'gl-keep'));
      if (G.root) G.root.classList.remove('gl-on');
    });
  }

  function color(str, fallback) {
    try {
      G.cx.clearRect(0, 0, 1, 1); G.cx.fillStyle = '#000'; G.cx.fillStyle = str; G.cx.fillRect(0, 0, 1, 1);
      const d = G.cx.getImageData(0, 0, 1, 1).data;
      return [d[0] / 255, d[1] / 255, d[2] / 255];
    } catch (e) { return fallback; }
  }
  function nums(s) { return (String(s).match(/-?(?:\d+\.?\d*|\.\d+)/g) || []).map(Number); }

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
      imgParams(gl);
      G.imgSize = [im.naturalWidth, im.naturalHeight]; G.imgReady = true; G.sig = '';
    };
    im.onerror = () => { G.imgReady = false; };
    im.src = url;
  }

  // Foto als fertiges Canvas (der Farbverlauf der Startseite): direkt als Textur, ohne Umweg über eine URL
  function loadSource(cv) {
    if (G.imgUrl === cv) return;
    G.imgUrl = cv;
    const gl = G.gl;
    gl.bindTexture(gl.TEXTURE_2D, G.img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    imgParams(gl);
    G.imgSize = [cv.width, cv.height]; G.imgReady = true; G.sig = ''; G.sceneKey = '';
  }

  function resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    if (G.canvas.width === pw && G.canvas.height === ph && G.W === w && G.H === h) return;
    G.W = w; G.H = h; G.dpr = dpr; G.sceneKey = '';
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

  const M = 350;      // Rand über und unter dem Bildschirm, damit Glas beim Scrollen schon bereit ist
  const CULL = 90;    // so weit außerhalb des Bildschirms wird Glas noch mitgezeichnet
  function rel(r, o) { return [r.left - o.left, r.top - o.top + M, r.width, r.height]; }

  /* ---------- Hintergrund der Seite: Lichtflecken aus dem CSS lesen ---------- */
  function splitTop(s) {
    const out = []; let depth = 0, cur = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '(') depth++; else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function rgba(s) {
    const m = /rgba?\(([^)]+)\)/.exec(s);
    if (!m) return null;
    const n = nums(m[1]);
    return [n[0] / 255, n[1] / 255, n[2] / 255, n.length > 3 ? n[3] : 1];
  }
  // Liest "radial-gradient(70% 38% at 50% -4%, Farbe, transparent 70%)" aus dem berechneten Hintergrund.
  // Andere Verläufe werden übersprungen; höchstens drei Flecken.
  function parseGlows(bg, w, h) {
    const out = [];
    splitTop(bg).forEach((layer) => {
      if (layer.indexOf('radial-gradient(') !== 0) return;
      const parts = splitTop(layer.slice(layer.indexOf('(') + 1, layer.lastIndexOf(')')));
      const m = /^(-?[\d.]+)(%|px)\s+(-?[\d.]+)(%|px)\s+at\s+(-?[\d.]+)(%|px)\s+(-?[\d.]+)(%|px)/.exec(parts[0] || '');
      if (!m || parts.length < 3) return;
      const px = (v, u, full) => (u === '%' ? parseFloat(v) / 100 * full : parseFloat(v));
      const c1 = rgba(parts[1]), c2 = rgba(parts[2]);
      if (!c1 || !c2 || c2[3] !== 0) return;   // nur "Farbe zu transparent"
      const st = /(\d+(?:\.\d+)?)%\s*$/.exec(parts[2]);
      out.push({ x: px(m[5], m[6], w), y: px(m[7], m[8], h), rx: px(m[1], m[2], w), ry: px(m[3], m[4], h), c: c1, stop: st ? parseFloat(st[1]) / 100 : 1 });
    });
    return out.slice(0, 3);
  }
  function sceneOf(root, ro, light) {
    const key = [root.id, light, ro.width, ro.height].join();
    if (G.scene && G.scene.key === key) return G.scene;
    const fx = root.querySelector('.bgfx');
    const bg = fx ? getComputedStyle(fx).backgroundImage : '';
    G.scene = { key: key, glows: parseGlows(bg, ro.width, ro.height) };
    return G.scene;
  }

  /* ---------- Licht: reagiert auf Scrollen, Finger und (wenn vorhanden) Neigen ---------- */
  const LIGHT = { px: 0, py: 0, tx: 0, ty: 0, x: -0.55, y: -0.83 };
  function onPoint(e) { LIGHT.px = (e.clientX / (window.innerWidth || 390) - 0.5) * 2; LIGHT.py = (e.clientY / (window.innerHeight || 844) - 0.5) * 2; if (G) G.sig = ''; }
  window.addEventListener('pointermove', onPoint, { passive: true });
  window.addEventListener('pointerdown', onPoint, { passive: true });
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    LIGHT.tx = Math.max(-1, Math.min(1, e.gamma / 35)); LIGHT.ty = Math.max(-1, Math.min(1, (e.beta - 40) / 35));
    if (G) G.sig = '';
  }, { passive: true });

  /* ---------- Einstellungen pro Element (aus CSS-Variablen, einmal pro Größe und Design) ---------- */
  function rgbaVar(s) { const n = nums(s); return n.length >= 4 ? [n[0] / 255, n[1] / 255, n[2] / 255, n[3]] : null; }
  function params(it, w, h, light, acc) {
    const c = it.cache;
    if (c && c.light === light && c.w === w && c.h === h) return c;
    const cs = getComputedStyle(it.el);
    let rad = parseFloat(cs.borderTopLeftRadius) || 20;
    if (cs.borderTopLeftRadius.indexOf('%') > 0) rad = rad / 100 * Math.min(w, h);
    const b = nums(cs.getPropertyValue('--gl-body'));
    const bc = rgbaVar(cs.getPropertyValue('--gl-body-col'));
    const lens = (name, def) => { const v = nums(cs.getPropertyValue(name)); return v.length ? v[0] : def; };
    it.cache = {
      light: light, w: w, h: h, rad: Math.min(rad, Math.min(w, h) / 2),
      bend: lens('--lg-glass-bend', LENS.bend), disp: lens('--lg-glass-dispersion', LENS.dispersion),
      blur: lens('--lg-blur', LENS.blur), shine: lens('--lg-rim-shine', LENS.shine), frost: lens('--gl-frost', LENS.frost),
      body: b.length ? b[0] : 1,
      bodyCol: bc || (light ? [1, 1, 1, 0.20] : [0.157, 0.157, 0.157, 0.60]),
      tint: rgbaVar(cs.getPropertyValue('--gl-tint')),
      // gewählt (.on, .sel, .cur): eigene Tönung, sonst die normale, sonst ein Hauch Akzentfarbe
      tintOn: rgbaVar(cs.getPropertyValue('--gl-tint-on')) || rgbaVar(cs.getPropertyValue('--gl-tint')) || [acc[0], acc[1], acc[2], light ? 0.14 : 0.20]
    };
    return it.cache;
  }

  function frame() {
    G.raf = 0;
    const root = G.root;
    if (!root || !root.isConnected || !root.classList.contains('active') || document.hidden) { return; }
    G.raf = requestAnimationFrame(frame);
    const gl = G.gl;
    const ro = root.getBoundingClientRect();
    if (ro.width < 10) return;
    const hero = root.querySelector('.hero'), kb = hero && hero.querySelector('.kb');
    let cs = null;
    if (kb) {
      cs = getComputedStyle(kb);
      if (kb.__glImg) loadSource(kb.__glImg);
      else { const m = /url\(["']?(.*?)["']?\)/.exec(cs.backgroundImage); if (m) loadImage(m[1]); }
    }
    const kr = kb ? kb.getBoundingClientRect() : null, hr = hero ? hero.getBoundingClientRect() : null;
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    const items = G.items.map((it) => {
      const r = it.el.getBoundingClientRect();
      const w = it.el.offsetWidth || r.width, h = it.el.offsetHeight || r.height;
      // Glas wird in der ungedehnten Größe gerechnet, das Element dehnt es selbst mit
      const b = [r.left - ro.left + (r.width - w) / 2, r.top - ro.top + M + (r.height - h) / 2, w, h];
      return { it: it, r: r, b: b, on: /(^|\s)(on|sel|cur)(\s|$)/.test(it.el.className), press: it.el.matches(':active') ? 1 : 0 };
    }).filter((x) => x.b[2] > 4 && x.r.bottom > ro.top - CULL && x.r.top < ro.bottom + CULL);
    const scr = root.querySelector('.scroll');
    const sy = scr ? scr.scrollTop : 0;
    const wantX = -0.55 + LIGHT.px * 0.55 + LIGHT.tx * 0.7 - Math.sin(sy * 0.004) * 0.35;
    const wantY = -0.83 + LIGHT.py * 0.3 + LIGHT.ty * 0.5 + Math.cos(sy * 0.003) * 0.12;
    LIGHT.x += (wantX - LIGHT.x) * 0.14; LIGHT.y += (wantY - LIGHT.y) * 0.14;
    const moving = Math.abs(wantX - LIGHT.x) + Math.abs(wantY - LIGHT.y) > 0.004;
    if (moving) G.sig = '';
    const sig = [LIGHT.x.toFixed(3), LIGHT.y.toFixed(3), ro.width, ro.height, kr ? [kr.left, kr.top, kr.width, kr.height, hr.height, hero.style.opacity].join() : '', light, items.map((x) => [Math.round(x.b[0] * 2), Math.round(x.b[1] * 2), x.b[2], x.b[3], x.on, x.press].join()).join('|')].join(';');
    if (sig === G.sig) return;
    G.sig = sig;
    resize(ro.width, ro.height + 2 * M);
    gl.disable(gl.BLEND);

    // Szene: Hintergrund. Er hängt nur von Seite, Foto und Design ab, nicht von den Glas-Elementen:
    // beim Scrollen bleibt er (außer dem Foto der Startseite) gleich und wird nicht neu gezeichnet.
    const rs = getComputedStyle(document.documentElement);
    const sceneKey = [root.id, ro.width, ro.height, light, kr ? [kr.left, kr.top, kr.width, kr.height, hr.height, hero.style.opacity, getComputedStyle(hero).opacity].join() : '', (typeof G.imgUrl === 'string' ? G.imgUrl : 'canvas'), G.imgReady].join(';');
    if (sceneKey !== G.sceneKey) {
    G.sceneKey = sceneKey;
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
    if (kb) {
      const kbo = rel(kr, ro), ho = rel(hr, ro);
      gl.uniform4f(u.uKb, kbo[0], kbo[1], kbo[2], kbo[3]);
      const pos = cs.backgroundPositionY.indexOf('%') > 0 ? parseFloat(cs.backgroundPositionY) / 100 : 0.5;
      const posx = cs.backgroundPositionX.indexOf('%') > 0 ? parseFloat(cs.backgroundPositionX) / 100 : 0.5;
      gl.uniform2f(u.uPos, posx, pos);
      gl.uniform4f(u.uHero, ho[0], ho[1], ho[2], ho[3]);
      gl.uniform1f(u.uHeroOp, G.imgReady ? (parseFloat(getComputedStyle(hero).opacity) || 0) : 0);
      const bf = hero.querySelector('.bot-fade'), tf = hero.querySelector('.top-fade');
      gl.uniform1f(u.uFadeH, bf ? bf.getBoundingClientRect().height || 150 : 150);
      gl.uniform1f(u.uTopH, tf ? tf.getBoundingClientRect().height || 150 : 150);
    } else {
      gl.uniform4f(u.uKb, 0, 0, 1, 1);
      gl.uniform2f(u.uPos, 0.5, 0.5);
      gl.uniform4f(u.uHero, 0, 0, 0, 0);
      gl.uniform1f(u.uHeroOp, 0);
      gl.uniform1f(u.uFadeH, 150);
      gl.uniform1f(u.uTopH, 150);
    }
    gl.uniform3f(u.uBgA, bgA[0], bgA[1], bgA[2]);
    gl.uniform3f(u.uBgB, bgB[0], bgB[1], bgB[2]);
    gl.uniform3f(u.uBg, bgC[0], bgC[1], bgC[2]);
    gl.uniform1f(u.uFadeStop, light ? 0.78 : 0.92);
    gl.uniform1f(u.uTopA, light ? 0.8 : 0.62);
    if (light) gl.uniform3f(u.uTopCol, 240 / 255, 243 / 255, 247 / 255); else gl.uniform3f(u.uTopCol, 10 / 255, 11 / 255, 13 / 255);
    // Lichtflecken der Seite (z. B. die warmen und kühlen Wolken im Hintergrund)
    const gls = sceneOf(root, ro, light).glows;
    [0, 1, 2].forEach((i) => {
      const g = gls[i];
      gl.uniform4f(u['uGl' + i], g ? g.x : 0, g ? g.y + M : 0, g ? g.rx : 1, g ? g.ry : 1);
      gl.uniform4f(u['uGc' + i], g ? g.c[0] : 0, g ? g.c[1] : 0, g ? g.c[2] : 0, g ? g.c[3] : 0);
    });
    gl.uniform3f(u.uGs, gls[0] ? gls[0].stop : 1, gls[1] ? gls[1].stop : 1, gls[2] ? gls[2].stop : 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    const acc = (rs.getPropertyValue('--acc-rgb').trim() || '200,205,214').split(',').map((v) => parseFloat(v) / 255);

    const drawGlass = (list, sceneTex, copy) => {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      list.forEach((x) => {
        const b = x.b, pad = 2;
        const pr = params(x.it, b[2], b[3], light, acc);
        use(G.glass, [b[0] - pad, b[1] - pad, b[2] + pad * 2, b[3] + pad * 2]);
        const gu = G.glass.u;
        bindTex(0, sceneTex, gu.uScene);
        gl.uniform4f(gu.uRect, b[0], b[1], b[2], b[3]);
        gl.uniform1f(gu.uRad, pr.rad);
        const t = x.on ? pr.tintOn : (pr.tint || [0, 0, 0, 0]);
        gl.uniform4f(gu.uTint, t[0], t[1], t[2], t[3]);
        gl.uniform1f(gu.uLight, light ? 1 : 0);
        gl.uniform1f(gu.uPress, x.press);
        gl.uniform2f(gu.uL, LIGHT.x, LIGHT.y);
        gl.uniform1f(gu.uBody, pr.body);
        gl.uniform4f(gu.uBodyCol, pr.bodyCol[0], pr.bodyCol[1], pr.bodyCol[2], pr.bodyCol[3]);
        gl.uniform1f(gu.uBand, x.it.top ? 9 : 16);
        gl.uniform1f(gu.uBend, pr.bend);
        gl.uniform1f(gu.uDisp, pr.disp);
        gl.uniform1f(gu.uBlur, pr.blur);
        gl.uniform1f(gu.uShine, pr.shine);
        gl.uniform1f(gu.uFrost, pr.frost);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (!copy) return;
        // jedes Glas sofort in die eigene Fläche kopieren: sie bewegt sich mit dem Element, auch beim Überscrollen.
        // Danach den Bereich leeren, sonst nähme ein überlappendes Nachbar-Glas dessen Pixel mit.
        const cv = x.it.cv, d = G.dpr;
        const cw = Math.max(1, Math.round(b[2] * d)), ch = Math.max(1, Math.round(b[3] * d));
        if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
        const cx = x.it.cx2d;
        cx.clearRect(0, 0, cw, ch);
        cx.drawImage(G.canvas, Math.round(b[0] * d), Math.round(b[1] * d), cw, ch, 0, 0, cw, ch);
        const sx = Math.max(0, Math.floor((b[0] - pad) * d)), sw = Math.ceil((b[2] + pad * 2) * d) + 2;
        const sh = Math.ceil((b[3] + pad * 2) * d) + 2, sy = Math.max(0, G.canvas.height - Math.ceil((b[1] + b[3] + pad) * d) - 1);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(sx, sy, sw, sh);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.SCISSOR_TEST);
      });
      gl.disable(gl.BLEND);
    };
    const lv0 = items.filter((x) => x.it.level === 0), lv1 = items.filter((x) => x.it.level === 1);

    // Ebene 0 in Zwischenbild (damit Knöpfe auf der Karte die Karte brechen).
    // Es genügt, was in Reichweite eines Knopfes liegt: die Linse holt ihr Bild höchstens aus der eigenen Größe.
    if (lv1.length) {
      const under = lv0.filter((x) => lv1.some((y) => {
        const m = 0.8 * Math.min(y.b[2], y.b[3]) + 4;
        return x.b[0] < y.b[0] + y.b[2] + m && x.b[0] + x.b[2] > y.b[0] - m && x.b[1] < y.b[1] + y.b[3] + m && x.b[1] + x.b[3] > y.b[1] - m;
      }));
      gl.bindFramebuffer(gl.FRAMEBUFFER, G.t2.fb);
      gl.viewport(0, 0, G.t2.w, G.t2.h);
      use(G.blit, [0, 0, G.W, G.H]);
      bindTex(0, G.t1.tex, G.blit.u.uScene);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      drawGlass(under, G.t1.tex, false);
    }

    // Ausgabe: nur die Glasflächen, Rest bleibt durchsichtig
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, G.canvas.width, G.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawGlass(lv0, G.t1.tex, true);
    if (lv1.length) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      drawGlass(lv1, G.t2.tex, true);
    }
  }

  // Legt für ein Element eine eigene Glasfläche an (einmalig; Seiten werden oft neu gezeichnet)
  function attach(el, s) {
    if (el.__gl) return el.__gl;
    const cv = document.createElement('canvas');
    cv.className = 'gl-surface' + (s.top ? ' top' : '');
    cv.setAttribute('aria-hidden', 'true');
    const cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
    // Die Fläche liegt im Innenrand; Rahmen ausgleichen, damit sie genau das Element deckt
    const bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
    if (bl || bt) { cv.style.left = -bl + 'px'; cv.style.top = -bt + 'px'; cv.style.width = 'calc(100% + ' + 2 * bl + 'px)'; cv.style.height = 'calc(100% + ' + 2 * bt + 'px)'; }
    el.insertBefore(cv, el.firstChild);
    el.classList.add('gl-el');
    if (s.keep) el.classList.add('gl-keep');
    if (s.top) el.classList.add('gl-top');
    if (s.level === 1) el.classList.add('gl-l1');
    const it = { el: el, cv: cv, cx2d: cv.getContext('2d'), level: s.level, top: !!s.top, global: !!s.global, cache: null };
    el.__gl = it;
    return it;
  }

  // Sucht auf der Seite (und bei der Leiste im ganzen Dokument) alles, was Glas bekommt.
  // Mehrfach aufrufbar: schon versehene Elemente bleiben, neue kommen dazu, entfernte fallen weg.
  function mount(root) {
    if (!ok) return;
    try {
      if (!G) init();
    } catch (e) { ok = false; return; }
    if (G.raf) cancelAnimationFrame(G.raf);
    G.raf = 0;
    G.root = root;
    G.items = G.items.filter((it) => it.el.isConnected && (it.global || root.contains(it.el)));
    const have = new Set(G.items.map((it) => it.el));
    SPEC.forEach((s) => {
      (s.global ? document : root).querySelectorAll(s.sel).forEach((el) => {
        if (el.__gl) {
          // Wird der Inhalt eines Elements neu gesetzt (innerHTML), geht die Glasfläche verloren: wieder einsetzen
          if (el.__gl.cv.parentNode !== el) el.insertBefore(el.__gl.cv, el.firstChild);
          if (!have.has(el)) { G.items.push(el.__gl); have.add(el); }
          return;
        }
        if (have.has(el)) return;
        G.items.push(attach(el, s));
        have.add(el);
      });
    });
    G.sig = ''; G.sceneKey = '';
    root.classList.add('gl-on');
    G.raf = requestAnimationFrame(frame);
  }
  function wake() { if (G && G.root && !G.raf && ok) { G.sig = ''; G.raf = requestAnimationFrame(frame); } }
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('resize', () => { if (G) G.sig = ''; });

  window.Glass = { mount: mount, wake: wake };
})();
