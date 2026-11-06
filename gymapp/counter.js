/* Verdient – Zähl-Logik v2
 * Reine Logik ohne Kamera und Oberfläche, damit sie getestet werden kann.
 *
 * Wichtigste Ideen:
 * 1. Gelenkwinkel werden in 3D aus den "worldLandmarks" von MediaPipe berechnet (Meter, Hüfte = Ursprung).
 *    Dadurch ist der Winkel fast unabhängig davon, ob die Kamera von vorn, schräg oder seitlich filmt.
 *    Fehlen die 3D-Punkte, wird mit den 2D-Bildpunkten gerechnet.
 * 2. Beide Körperseiten werden nach Sichtbarkeit gewichtet gemittelt.
 * 3. Das Signal wird mit einem One-Euro-Filter geglättet (wenig Zittern, kaum Verzögerung).
 * 4. Die Zählung passt sich an die Person an: Sie merkt sich, wie weit "oben" bei dir ist, und zählt eine
 *    Wiederholung, wenn du von oben weit genug runter und wieder hoch gehst. Feste Mindestwerte verhindern Schummeln.
 * 5. Klare Hinweise, was fehlt: zu nah, zu weit, Füße nicht im Bild, falsche Haltung …
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GymCounter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CONFIG = {
    // open = typischer Winkel oben, minAmp = so viele Grad muss die Bewegung mindestens haben,
    // maxBottom = so tief (Winkel) muss man mindestens kommen, minRepMs = schneller zählt nicht.
    pushup: { joint: 'elbow', open: 160, minAmp: 38, maxBottom: 128, minTop: 145, minRepMs: 550, minDrop: 0.24, minKnee: 145, minLine: 140, points: 1 },
    squat: { joint: 'knee', open: 165, minAmp: 42, maxBottom: 128, minTop: 150, minRepMs: 750, minDrop: 0.26, points: 0.6 },
    situp: { joint: 'hip', open: 125, minAmp: 40, maxBottom: 85, minTop: 112, tiltLying: 62, tiltUp: 48, minRepMs: 750, points: 0.7 },
    plank: { minProp: 0.3, minLine: 145, minTilt: 45, graceMs: 2500, secondsPerRep: 20, points: 1.5 },
    common: {
      minVis: 0.35,        // ab hier gilt ein Gelenk als sichtbar (Beine bekommen unten einen Bonus, dunkle Kleidung)
      badToleranceMs: 700, // so lange darf die Erkennung aussetzen, ohne dass die Wiederholung verloren geht
      idleEndMs: 25000,    // Ende nach so langer Zeit ohne Bewegung
      motionDeg: 8,        // so viel Winkeländerung zählt als Bewegung
      maxRepMs: 12000,     // länger unten = neu anfangen
      filter: { minCutoff: 1.4, beta: 0.012, dCutoff: 1.0 }
    }
  };

  const NOTFULL = {
    pushup: { t: 'Oben ganz strecken.', s: 'Arme am Ende ganz durchdrücken, sonst zählt es nicht.' },
    squat: { t: 'Ganz aufrichten.', s: 'Oben die Beine ganz strecken, sonst zählt es nicht.' },
    situp: { t: 'Ganz hoch, ganz runter.', s: 'Oberkörper bis zum Sitzen hoch und danach ganz ablegen. Nur Kopf bewegen zählt nicht.' }
  };
  const LABELS = { pushup: 'Liegestütze', squat: 'Kniebeugen', situp: 'Situps', plank: 'Plank' };

  const SUBTEXT = {
    pushup: 'Brust Richtung Boden, dann ganz hochdrücken.',
    squat: 'Tief in die Hocke, dann ganz aufrichten.',
    situp: 'Oberkörper ganz hoch, dann wieder ablegen.',
    plank: 'Körper gerade wie ein Brett halten.'
  };

  const SETUP = {
    pushup: 'Handy auf den Boden, 2 bis 3 m entfernt. Am besten schräg von vorn, so dass beide Arme zu sehen sind.',
    squat: 'Handy auf Hüfthöhe, 2 bis 3 m entfernt. Von vorn oder schräg, ganzer Körper von Kopf bis Fuß im Bild.',
    situp: 'Handy seitlich oder schräg neben dich auf den Boden, 1,5 bis 2 m entfernt. Kopf, Hüfte und Knie im Bild.',
    plank: 'Handy auf den Boden, schräg seitlich, 2 m entfernt. Kopf bis Füße im Bild.'
  };

  // MediaPipe-Indizes
  const IDX = {
    nose: 0,
    L: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
    R: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 }
  };
  const JOINT = {
    elbow: ['shoulder', 'elbow', 'wrist'],
    knee: ['hip', 'knee', 'ankle'],
    hip: ['shoulder', 'hip', 'knee']
  };

  /* ---------- Geometrie ---------- */
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) }; }
  function len(v) { return Math.hypot(v.x, v.y, v.z); }
  function angle3(a, b, c) {
    const u = sub(a, b), v = sub(c, b);
    const lu = len(u), lv = len(v);
    if (!lu || !lv) return NaN;
    const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / (lu * lv);
    return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
  }
  // Neigung eines Vektors gegen die Senkrechte (0° = senkrecht, 90° = waagerecht)
  function tiltFromVertical(v) {
    const l = len(v);
    if (!l) return NaN;
    return Math.acos(Math.min(1, Math.abs(v.y) / l)) * 180 / Math.PI;
  }
  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 }; }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function visOf(p) {
    if (!p) return 0;
    const v = p.visibility === undefined ? 1 : p.visibility;
    const pr = p.presence === undefined ? 1 : p.presence;
    return Math.min(v, pr);
  }

  // Liefert Punkt i: 3D aus world (wenn vorhanden), sonst 2D in Pixeln. Sichtbarkeit immer aus den Bildpunkten.
  function makeGetter(lm, dims, world) {
    const use3d = !!(world && world.length >= 29);
    return {
      use3d: use3d,
      vis: (i) => visOf(lm[i]),
      p: (i) => {
        if (use3d) { const w = world[i]; return { x: w.x, y: w.y, z: w.z }; }
        const q = lm[i]; return { x: q.x * dims.w, y: q.y * dims.h, z: 0 };
      }
    };
  }

  // Gelenkwinkel beider Seiten, nach Sichtbarkeit gewichtet. Gibt {angle, vis} zurück.
  function jointAngle(g, joint) {
    const names = JOINT[joint];
    let sum = 0, wsum = 0, best = 0;
    for (const side of ['L', 'R']) {
      const ids = names.map((n) => IDX[side][n]);
      const v = Math.min.apply(null, ids.map(g.vis));
      best = Math.max(best, v);
      if (v < CONFIG.common.minVis) continue;
      const a = angle3(g.p(ids[0]), g.p(ids[1]), g.p(ids[2]));
      if (isNaN(a)) continue;
      const w = v * v;
      sum += a * w; wsum += w;
    }
    return { angle: wsum ? sum / wsum : NaN, vis: best };
  }

  function torsoTilt(g) {
    const ok = [11, 12, 23, 24].filter((i) => g.vis(i) >= CONFIG.common.minVis);
    const sh = g.vis(11) >= g.vis(12) ? 11 : 12;
    const hp = g.vis(23) >= g.vis(24) ? 23 : 24;
    if (g.vis(sh) < CONFIG.common.minVis || g.vis(hp) < CONFIG.common.minVis) return NaN;
    const S = ok.includes(11) && ok.includes(12) ? mid(g.p(11), g.p(12)) : g.p(sh);
    const H = ok.includes(23) && ok.includes(24) ? mid(g.p(23), g.p(24)) : g.p(hp);
    return tiltFromVertical(sub(S, H));
  }

  function bodyLine(g) {
    let sum = 0, n = 0;
    for (const side of ['L', 'R']) {
      const s = IDX[side];
      const foot = g.vis(s.ankle) >= CONFIG.common.minVis ? s.ankle : (g.vis(s.knee) >= CONFIG.common.minVis ? s.knee : -1);
      if (foot < 0 || g.vis(s.shoulder) < CONFIG.common.minVis || g.vis(s.hip) < CONFIG.common.minVis) continue;
      const a = angle3(g.p(s.shoulder), g.p(s.hip), g.p(foot));
      if (!isNaN(a)) { sum += a; n++; }
    }
    return n ? sum / n : NaN;
  }

  /* ---------- Bildausschnitt prüfen: zu nah, zu weit, was fehlt ---------- */
  const NEED = {
    pushup: { arms: true, legs: false, feet: false },
    squat: { arms: false, legs: true, feet: true },
    situp: { arms: false, legs: true, feet: false },
    plank: { arms: false, legs: true, feet: false }
  };

  function framing(ex, lm) {
    const mv = CONFIG.common.minVis;
    const v = (i) => visOf(lm[i]);
    const any = (a, b) => Math.max(v(a), v(b)) >= mv;
    const need = NEED[ex];
    const pts = [];
    for (let i = 0; i < 33; i++) if (lm[i] && v(i) >= mv) pts.push(lm[i]);
    if (pts.length < 6) return { title: 'Ich sehe dich nicht.', sub: 'Stell das Handy fest hin, 2 bis 3 m Abstand, ganzer Körper im Bild, gutes Licht von vorn.' };
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    const touches = minX < 0.015 || maxX > 0.985 || minY < 0.01 || maxY > 0.99;
    if (!any(11, 12)) return { title: 'Schultern nicht im Bild.', sub: 'Geh einen Schritt zurück oder stell das Handy etwas höher.' };
    if (!any(23, 24)) return { title: 'Hüfte nicht im Bild.', sub: 'Geh einen Schritt zurück, der ganze Körper muss zu sehen sein.' };
    if (need.arms && !(any(13, 14) && any(15, 16))) return { title: 'Arme nicht im Bild.', sub: 'Dreh dich etwas schräg zur Kamera, so dass ein Arm ganz zu sehen ist.' };
    if (need.legs && !any(25, 26)) return { title: 'Knie nicht im Bild.', sub: touches ? 'Du bist zu nah. Geh einen Schritt zurück.' : 'Stell das Handy tiefer oder geh weiter weg.' };
    if (need.feet && !any(27, 28)) return { title: 'Füße nicht im Bild.', sub: 'Geh einen Schritt zurück oder stell das Handy tiefer.' };
    const span = Math.max(maxX - minX, maxY - minY);
    if (span < (ex === 'squat' ? 0.25 : 0.12)) return { title: 'Zu weit weg.', sub: 'Komm etwas näher an die Kamera.', soft: true };
    if (touches && span > 0.9) return { title: 'Zu nah.', sub: 'Geh einen Schritt zurück, damit du ganz ins Bild passt.', soft: true };
    return null;
  }

  /* ---------- Ein Bild auswerten ---------- */
  // Gibt { ok, signal, tilt, line, title, sub } zurück. signal = Gelenkwinkel (oben groß, unten klein).
  function boostLegs(lm) {
    // Dunkle Kleidung drückt die Sichtbarkeit der Beine. Ein Bonus gleicht das aus.
    return lm.map((p, i) => (i >= 23 && p ? Object.assign({}, p, { visibility: Math.min(1, (p.visibility === undefined ? 1 : p.visibility) * 1.35), presence: p.presence === undefined ? undefined : Math.min(1, p.presence * 1.35) }) : p));
  }
  function analyze(ex, lm, dims, world) {
    if (lm && lm.length >= 29) lm = boostLegs(lm);
    const res = { ok: false, signal: NaN, tilt: NaN, line: NaN, title: '', sub: '', use3d: false };
    if (!lm || lm.length < 29) { res.title = 'Ich sehe dich nicht.'; res.sub = SETUP[ex]; return res; }
    const fr = framing(ex, lm);
    if (fr && !fr.soft) { res.title = fr.title; res.sub = fr.sub; return res; }
    const g = makeGetter(lm, dims || { w: 1, h: 1 }, world);
    res.use3d = g.use3d;
    res.tilt = torsoTilt(g);
    const cfg = CONFIG[ex];

    if (ex === 'plank') {
      res.line = bodyLine(g);
      if (isNaN(res.line)) { res.title = 'Beine nicht im Bild.'; res.sub = SETUP.plank; return res; }
      if (!(res.tilt >= cfg.minTilt)) { res.title = 'Geh in die Plank-Position.'; res.sub = 'Unterarme auf den Boden, Körper waagerecht.'; return res; }
      // Nicht schummeln: Auf dem Bauch oder Rücken liegen ist keine Plank. Die Arme müssen den Oberkörper stützen,
      // also muss der Ellbogen (oder das Handgelenk) deutlich unter der Schulter sein.
      const prop = plankProp(lm, dims || { w: 1, h: 1 });
      if (isNaN(prop)) { res.title = 'Arme nicht im Bild.'; res.sub = 'Ich muss sehen, dass du dich auf den Armen abstützt. Sonst zählt Liegen.'; return res; }
      if (prop < cfg.minProp) { res.title = 'Stütz dich auf die Arme.'; res.sub = 'Oberkörper vom Boden weg. Liegen zählt nicht.'; return res; }
      if (res.line < cfg.minLine) { res.title = 'Hüfte gerade.'; res.sub = 'Nicht durchhängen und nicht hochstrecken.'; return res; }
      res.ok = true; res.signal = res.line;
      if (fr) { res.title = fr.title; res.sub = fr.sub; }
      return res;
    }

    const j = jointAngle(g, cfg.joint);
    if (isNaN(j.angle)) {
      res.title = ex === 'pushup' ? 'Arme nicht gut zu sehen.' : 'Beine nicht gut zu sehen.';
      res.sub = SETUP[ex];
      return res;
    }
    if (ex === 'pushup') {
      if (!isNaN(res.tilt) && res.tilt < 40 && looksStanding(lm)) { res.title = 'Geh in die Liegestütz-Position.'; res.sub = 'Hände unter die Schultern, Körper gestreckt.'; return res; }
      res.line = bodyLine(g);
      // Nicht schummeln: Knie-Liegestütze und Hocken auf den Knien zählen nicht
      const kn = jointAngle(g, 'knee');
      if (isNaN(kn.angle)) { res.title = 'Beine nicht im Bild.'; res.sub = 'Ich muss deine Beine sehen, damit ich Liegestütze auf den Knien ausschließen kann.'; return res; }
      if (kn.angle < cfg.minKnee) { res.title = 'Beine strecken.'; res.sub = 'Knie vom Boden, Körper gerade. Auf den Knien zählt nicht.'; return res; }
      if (!isNaN(res.line) && res.line < cfg.minLine) { res.title = 'Körper gerade.'; res.sub = 'Hüfte nicht hochstrecken und nicht durchhängen.'; return res; }
    } else if (ex === 'squat') {
      if (!isNaN(res.tilt) && res.tilt > 70) { res.title = 'Stell dich hin.'; res.sub = 'Kniebeugen machst du im Stehen, Gesicht oder Seite zur Kamera.'; return res; }
    } else if (ex === 'situp') {
      const knee = jointAngle(g, 'knee');
      if (!isNaN(knee.angle) && knee.angle > 165 && !isNaN(res.tilt) && res.tilt < 30) { res.title = 'Leg dich hin.'; res.sub = 'Rücken auf den Boden, Knie angewinkelt.'; return res; }
    }
    res.ok = true;
    res.signal = j.angle;
    res.height = height2d(ex, lm, dims || { w: 1, h: 1 });
    if (fr) { res.title = fr.title; res.sub = fr.sub; }
    return res;
  }

  // Wie hoch stützen die Arme den Oberkörper? Senkrechter Abstand Schulter bis Ellbogen oder Handgelenk,
  // geteilt durch die Rumpflänge (Schulter bis Hüfte). Liegen ergibt etwa 0, eine Plank deutlich mehr.
  function plankProp(lm, dims) {
    const mv = CONFIG.common.minVis;
    const ok = (i) => lm[i] && visOf(lm[i]) >= mv;
    let best = NaN;
    for (const side of [0, 1]) {
      const sh = 11 + side, hip = 23 + side, el = 13 + side, wr = 15 + side;
      if (!ok(sh) || !ok(hip)) continue;
      const torso = Math.hypot((lm[sh].x - lm[hip].x) * dims.w, (lm[sh].y - lm[hip].y) * dims.h);
      if (!(torso > 1)) continue;
      for (const j of [el, wr]) {
        if (!ok(j)) continue;
        const drop = (lm[j].y - lm[sh].y) * dims.h / torso;
        if (isNaN(best) || drop > best) best = drop;
      }
    }
    return best;
  }

  // Steht die Person? Im Bild sind die Beine dann deutlich länger als der Oberkörper und hängen senkrecht nach unten.
  function looksStanding(lm) {
    const mv = CONFIG.common.minVis;
    const y = (a, b) => { const va = visOf(lm[a]), vb = visOf(lm[b]); if (va < mv && vb < mv) return NaN; return va >= vb ? lm[a].y : lm[b].y; };
    const hy = y(23, 24), ay = y(27, 28);
    if (isNaN(hy) || isNaN(ay)) return true; // ohne Hüfte/Füße entscheidet die 3D-Neigung
    if (visOf(lm[11]) < mv || visOf(lm[12]) < mv) return true;
    const sw = Math.hypot(lm[11].x - lm[12].x, lm[11].y - lm[12].y);
    return (ay - hy) > sw * 1.6;
  }

  // Zweites, vom Blickwinkel unabhängiges Signal aus dem Bild: senkrechter Abstand in Pixeln.
  // Liegestütz: Hände bis Schultern (wird beim Runtergehen kleiner). Kniebeuge: Füße bis Hüfte.
  function height2d(ex, lm, dims) {
    const mv = CONFIG.common.minVis;
    const avgY = (a, b) => {
      const va = visOf(lm[a]), vb = visOf(lm[b]);
      if (va < mv && vb < mv) return NaN;
      if (va < mv) return lm[b].y; if (vb < mv) return lm[a].y;
      return (lm[a].y + lm[b].y) / 2;
    };
    if (ex === 'pushup') return (avgY(15, 16) - avgY(11, 12)) * dims.h;
    if (ex === 'squat') return (avgY(27, 28) - avgY(23, 24)) * dims.h;
    return NaN;
  }

  /* ---------- One-Euro-Filter ---------- */
  function oneEuro(cfg) {
    let x = null, dx = 0, lastT = null;
    const alpha = (cutoff, dt) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };
    return {
      reset() { x = null; dx = 0; lastT = null; },
      f(v, t) {
        if (x === null || lastT === null) { x = v; lastT = t; return v; }
        const dt = Math.max(1e-3, (t - lastT) / 1000);
        lastT = t;
        const d = (v - x) / dt;
        dx = dx + alpha(cfg.dCutoff, dt) * (d - dx);
        const cut = cfg.minCutoff + cfg.beta * Math.abs(dx);
        x = x + alpha(cut, dt) * (v - x);
        return x;
      }
    };
  }

  /* ---------- Zähler ---------- */
  function createCounter(ex, t0) {
    const cm = CONFIG.common;
    const cfg = CONFIG[ex];
    const isPlank = ex === 'plank';
    const filt = oneEuro(cm.filter);
    const filtH = oneEuro({ minCutoff: 1.4, beta: 0.004, dCutoff: 1.0 });
    const B = { count: 0, phase: 'up', top: null, bottom: null, downAt: 0 };
    const st = {
      reps: 0,
      phase: 'up',      // 'up' = oben / Ausgangslage, 'down' = in der Bewegung
      top: null,        // höchster Winkel in der aktuellen Oben-Phase
      bottom: null,     // tiefster Winkel in der aktuellen Bewegung
      downAt: 0,
      lastAmp: null,
      badSince: null,
      lastOkT: null,
      lastMotionAt: t0,
      motionRef: null,
      plankMs: 0,
      plankLastT: null,
      lostAt: null,
      everOk: false,
      signal: NaN,
      hint: { title: 'Los geht’s.', sub: SUBTEXT[ex] },
      hintUntil: 0,
      countA: 0,
      tUp: NaN,
      tDown: NaN,
      pending: null
    };

    function setHint(title, sub, t, holdMs) {
      st.hint = { title: title, sub: sub };
      st.hintUntil = holdMs ? t + holdMs : 0;
    }

    function out(event, ended, ok, extra) {
      let depth = 0;
      if (isPlank) depth = (st.plankMs % (cfg.secondsPerRep * 1000)) / (cfg.secondsPerRep * 1000);
      else if (st.top !== null && !isNaN(st.signal)) {
        const amp = Math.max(cfg.minAmp * 1.25, st.lastAmp || 0);
        depth = clamp01((st.top - st.signal) / amp);
      }
      const o = {
        reps: st.reps, ok: ok, depth: depth, hint: st.hint, event: event, ended: ended,
        angle: st.signal, top: st.top, bottom: st.bottom, phase: st.phase,
        plankSeconds: Math.floor(st.plankMs / 1000), plankMs: st.plankMs
      };
      if (extra) for (const k in extra) o[k] = extra[k];
      return o;
    }

    function bad(frame, t) {
      if (st.badSince === null) st.badSince = t;
      if (t - st.badSince > cm.badToleranceMs) {
        // Bewegung verworfen, neu einpendeln
        st.phase = 'up'; st.top = null; st.bottom = null; filt.reset();
        B.phase = 'up'; B.top = null; B.bottom = null; filtH.reset();
        setHint(frame.title || 'Haltung prüfen.', frame.sub || SETUP[ex], t, 0);
      }
    }

    function stepReps(frame, t) {
      let event = null;
      if (!frame.ok || isNaN(frame.signal)) {
        bad(frame, t);
        const ended = t - st.lastMotionAt >= cm.idleEndMs ? 'idle' : null;
        return out(null, ended, false);
      }
      st.badSince = null;
      st.everOk = true;
      const s = filt.f(frame.signal, t);
      st.signal = s;

      if (st.motionRef === null || Math.abs(s - st.motionRef) >= cm.motionDeg) { st.motionRef = s; st.lastMotionAt = t; }
      if (t >= st.hintUntil) {
        if (frame.title) setHint(frame.title, frame.sub, t, 0);
        else st.hint = { title: st.reps ? 'Weiter so.' : 'Los geht’s.', sub: SUBTEXT[ex] };
      }

      if (st.top === null) { st.top = s; st.phase = 'up'; st.tUp = frame.tilt; }
      const tl = frame.tilt;

      // Detektor A: Gelenkwinkel (3D)
      let verdict = null;
      if (st.phase === 'up') {
        if (s > st.top) st.top = s;
        if (!isNaN(tl) && (isNaN(st.tUp) || tl > st.tUp)) st.tUp = tl;
        const enter = Math.max(12, cfg.minAmp * 0.4);
        if (s < st.top - enter) { st.phase = 'down'; st.bottom = s; st.downAt = t; st.tDown = tl; }
      } else {
        if (s < st.bottom) st.bottom = s;
        if (!isNaN(tl) && (isNaN(st.tDown) || tl < st.tDown)) st.tDown = tl;
        const amp = st.top - st.bottom;
        const back = Math.max(12, amp * 0.3);
        if (s >= st.top - back && s > st.bottom + Math.max(8, amp * 0.5)) {
          const dur = t - st.downAt;
          // "Ganz oben und ganz unten": sonst zählt die Wiederholung nicht
          let full = !cfg.minTop || st.top >= cfg.minTop;
          if (ex === 'situp') full = full && (isNaN(st.tUp) || st.tUp >= cfg.tiltLying) && (isNaN(st.tDown) || st.tDown <= cfg.tiltUp);
          if (amp >= cfg.minAmp && st.bottom <= cfg.maxBottom && dur >= cfg.minRepMs && full) { st.countA += 1; st.lastAmp = amp; }
          else if (amp < cfg.minAmp || st.bottom > cfg.maxBottom) verdict = 'shallow';
          else if (!full) verdict = 'notfull';
          else verdict = 'fast';
          st.phase = 'up'; st.top = s; st.bottom = null; st.tUp = tl; st.tDown = NaN;
        } else if (t - st.downAt > cm.maxRepMs) {
          st.phase = 'up'; st.top = s; st.bottom = null;
        }
      }

      // Detektor B: senkrechte Höhe im Bild (hilft, wenn die Tiefe in 3D falsch geschätzt wird)
      if (cfg.minDrop && frame.height > 0) {
        const h = filtH.f(frame.height, t);
        if (B.top === null) B.top = h;
        if (B.phase === 'up') {
          if (h > B.top) B.top = h;
          if (h < B.top * (1 - cfg.minDrop * 0.45)) { B.phase = 'down'; B.bottom = h; B.downAt = t; }
        } else {
          if (h < B.bottom) B.bottom = h;
          const drop = (B.top - B.bottom) / B.top;
          if (h >= B.top * (1 - Math.max(0.07, drop * 0.3)) && h > B.bottom * (1 + Math.max(0.06, drop * 0.4))) {
            if (drop >= cfg.minDrop && t - B.downAt >= cfg.minRepMs && (!cfg.minTop || s >= cfg.minTop - 8)) B.count += 1;
            B.phase = 'up'; B.top = h; B.bottom = null;
          } else if (t - B.downAt > cm.maxRepMs) { B.phase = 'up'; B.top = h; B.bottom = null; }
        }
      }

      // Zusammenführen: Es zählt der Detektor, der mehr saubere Wiederholungen gesehen hat
      const total = Math.max(st.countA, B.count);
      if (total > st.reps) {
        st.reps = total; event = 'rep'; st.pending = null;
        setHint(st.reps === 1 ? 'Erste Wiederholung!' : 'Sauber.', SUBTEXT[ex], t, 1200);
      } else if (verdict) {
        st.pending = { verdict: verdict, at: t, reps: st.reps };
      }
      if (st.pending && t - st.pending.at > 700) {
        if (st.reps === st.pending.reps) {
          if (st.pending.verdict === 'shallow') setHint(ex === 'situp' ? 'Höher.' : 'Tiefer.', 'Nicht weit genug, die Wiederholung zählt nicht.', t, 1800);
          else if (st.pending.verdict === 'notfull') setHint(NOTFULL[ex].t, NOTFULL[ex].s, t, 2200);
          else setHint('Langsamer.', 'Zu schnell, die Wiederholung zählt nicht.', t, 1800);
        }
        st.pending = null;
      }

      const ended = t - st.lastMotionAt >= cm.idleEndMs ? 'idle' : null;
      return out(event, ended, true);
    }

    function stepPlank(frame, t) {
      let event = null, ended = null;
      if (frame.ok) {
        st.everOk = true;
        if (st.plankLastT !== null) st.plankMs += Math.min(t - st.plankLastT, 500);
        st.plankLastT = t;
        st.lostAt = null;
        st.signal = frame.signal;
        const reps = Math.floor(st.plankMs / (cfg.secondsPerRep * 1000));
        if (reps > st.reps) { st.reps = reps; event = 'rep'; }
        setHint('Halten.', frame.title ? frame.sub : SUBTEXT.plank, t, 0);
      } else {
        st.plankLastT = null;
        if (st.lostAt === null) st.lostAt = t;
        if (t - st.lostAt > cm.badToleranceMs) setHint(frame.title || 'Haltung prüfen.', frame.sub || SETUP.plank, t, 0);
        if (st.everOk && t - st.lostAt >= cfg.graceMs) ended = 'lost';
        else if (!st.everOk && t - st.lastMotionAt >= cm.idleEndMs) ended = 'idle';
      }
      return out(event, ended, frame.ok);
    }

    function step(frame, t) { return isPlank ? stepPlank(frame, t) : stepReps(frame, t); }

    return {
      step: step,
      process: function (lm, dims, t, world) {
        const frame = analyze(ex, lm, dims, world);
        const o = step(frame, t);
        o.tilt = frame.tilt; o.line = frame.line; o.use3d = frame.use3d; o.raw = frame.signal;
        return o;
      },
      noPose: function (t) {
        return step({ ok: false, signal: NaN, title: 'Ich sehe dich nicht.', sub: 'Stell das Handy fest hin, 2 bis 3 m Abstand, ganzer Körper im Bild, gutes Licht von vorn.' }, t);
      },
      reps: function () { return st.reps; },
      plankSeconds: function () { return Math.floor(st.plankMs / 1000); }
    };
  }

  return {
    CONFIG: CONFIG, NOTFULL: NOTFULL, LABELS: LABELS, SUBTEXT: SUBTEXT, SETUP: SETUP, IDX: IDX,
    angle3: angle3, analyze: analyze, framing: framing, createCounter: createCounter
  };
});
