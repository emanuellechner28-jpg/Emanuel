/* Gym App – Spiel-Logik (Phase 1): Punkte, Rang, Streak, Shop, Handyzeit.
 * Reine Logik ohne Oberfläche, damit sie getestet werden kann.
 * Alle Zahlen sind Startwerte aus dem Bauplan und werden nach dem Test angepasst.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GymStore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;

  const POINTS_PER_REP = { pushup: 1, squat: 0.6, situp: 0.7, plank: 1.5 };
  // Plank: je länger du hältst, desto mehr bringt jeder 20-Sekunden-Block. Block 1 bis 3: 1 Punkt, 4 bis 6: 1,5, ab 7: 2.
  const PLANK_TIERS = [{ upTo: 3, pts: 1 }, { upTo: 6, pts: 1.5 }, { upTo: Infinity, pts: 2 }];
  function plankPoints(blocks) {
    let sum = 0;
    for (let i = 1; i <= blocks; i++) sum += PLANK_TIERS.find((t) => i <= t.upTo).pts;
    return sum;
  }
  function isProState(state) { return !!(state.settings && state.settings.proTest); }
  function earnedFor(state, ex, reps) { return round2(pointsFor(ex, reps)); }
  // Ist die Übung nutzbar? Gratis-Übungen immer, sonst mit Pro oder einzeln freigeschaltet.
  function isUnlocked(state, ex) {
    return PRO.FREE_EXERCISES.indexOf(ex) >= 0 || isProState(state) || (state.unlockedEx || []).indexOf(ex) >= 0;
  }
  function trialUsed(state) { return (state.trialStartedAt || 0) > 0; }
  // Vorschau: merkt sich nur, dass die Gratis-Woche genutzt wurde. Es gibt noch keinen echten Kauf.
  function startTrialPreview(state, nowMs) { if (trialUsed(state)) return false; state.trialStartedAt = nowMs; return true; }
  // Kleine Statistik für Pro: letzte N Tage
  function stats(state, nowMs, days) {
    let reps = 0, active = 0; const byEx = {};
    for (let i = 0; i < days; i++) {
      const d = dayOf(state, dayKey(addDays(startOfDay(nowMs), -i)));
      if (d.reps > 0) { active++; reps += d.reps; for (const e in (d.byEx || {})) byEx[e] = (byEx[e] || 0) + d.byEx[e]; }
    }
    let fav = null; for (const e in byEx) if (!fav || byEx[e] > byEx[fav]) fav = e;
    return { reps: reps, active: active, avg: active ? Math.round(reps / active) : 0, fav: fav, goalDays: Array.from({ length: days }, (_, i) => dayOf(state, dayKey(addDays(startOfDay(nowMs), -i))).goalMet).filter(Boolean).length };
  }
  function pointsFor(ex, reps) { return ex === 'plank' ? plankPoints(reps) : reps * POINTS_PER_REP[ex]; }
  const EXERCISES = ['pushup', 'squat', 'situp', 'plank'];
  const EX_LABEL = { pushup: 'Liegestütze', squat: 'Kniebeugen', situp: 'Situps', plank: 'Plank' };

  // Rang nach Gesamt-Wiederholungen (plus kleiner Streak-Bonus). Der Rang sinkt nie.
  const RANKS = [
    { name: 'Neuling', from: 0, tagline: 'Der erste Schritt' },
    { name: 'Einsteiger', from: 50, tagline: 'Auf dem Weg' },
    { name: 'Aktiv', from: 150, tagline: 'In Bewegung' },
    { name: 'Fit', from: 350, tagline: 'Der Frühaufsteher' },
    { name: 'Sportler', from: 750, tagline: 'Mit Rhythmus' },
    { name: 'Athlet', from: 1500, tagline: 'Stark und ausdauernd' },
    { name: 'Kraftprotz', from: 3000, tagline: 'Nichts hält dich auf' },
    { name: 'Profi', from: 5000, tagline: 'Routine mit Biss' },
    { name: 'Meister', from: 10000, tagline: 'Eine Klasse für sich' },
    { name: 'Legende', from: 20000, tagline: 'Für immer dabei' }
  ];

  // Pro Tag mit geschafftem Tagesziel gibt es dauerhaft so viele Wiederholungs-Punkte extra.
  const STREAK_BONUS_PER_DAY = 2;
  const MINUTES_VALID_DAYS = 3; // Restzeit bleibt etwa 3 Tage

  // Shop-Pakete (Startwerte). type 'pass' = Tagespass bis Mitternacht.
  const PACKAGES = [
    { id: 'p5', name: 'Kurz checken', minutes: 5, price: 10, photo: 'fruehnebel', badge: null },
    { id: 'p15', name: 'Kaffeepause', minutes: 15, price: 30, photo: 'sonnenaufgang', badge: 'popular' },
    { id: 'p30', name: 'Mittagspause', minutes: 30, price: 45, photo: 'mittag', badge: null },
    { id: 'p60', name: 'Feierabend', minutes: 60, price: 75, photo: 'abendrot', badge: 'save' },
    { id: 'p300', name: 'Ganzer Abend', minutes: 300, price: 180, photo: 'sternennacht', badge: 'save' },
    { id: 'pass', name: 'Freier Tag', minutes: 0, price: 200, photo: 'polarlicht', badge: null, type: 'pass' }
  ];
  // Pro-Preise und Testphase: Vorschläge, noch nicht festgelegt. Nur HIER ändern.
  const PRO = {
    TRIAL_DAYS: 7,
    PRICES: { year: 19.99, month: 3.99, once: 39.99, exercise: 2.99 },   // exercise = eine einzelne Übung, pro Monat   // Euro; once = Einmalkauf (Platzhalter)
    FREE_HISTORY_DAYS: 7,
    PRO_HISTORY_DAYS: 28,
    FREE_EXERCISES: ['pushup', 'situp']   // ohne Pro nur diese. Die anderen: Pro oder einzeln kaufen
  };

  // Selbstschätzung: wie viel Zeit am Handy pro Tag (nur zur Einordnung, nicht gemessen)
  const PHONE_LEVELS = [
    { id: 'lt1', label: 'Unter 1 Std' },
    { id: '1to2', label: '1 bis 2 Std' },
    { id: '2to4', label: '2 bis 4 Std' },
    { id: '4to6', label: '4 bis 6 Std' },
    { id: 'gt6', label: 'Über 6 Std' }
  ];
  const PHONE_LEGACY = { lt2: '1to2', mid: '2to4', gt4: '4to6' };   // alte Antworten aus früheren Versionen

  // Wie fit: 5 Stufen, daraus ergibt sich das Tagesziel
  const FIT_STEPS = [
    { id: 'f1', name: 'Neuling', goal: 10 },
    { id: 'f2', name: 'Einsteiger', goal: 20 },
    { id: 'f3', name: 'Geübt', goal: 30 },
    { id: 'f4', name: 'Fit', goal: 45 },
    { id: 'f5', name: 'Stark', goal: 60 }
  ];
  const TIME_GOAL = { min: 15, max: 180, step: 5, def: 45 };   // Handyzeit pro Tag ohne Training (Minuten)
  const AGE = { min: 10, max: 80, def: 25 };

  // Geschätzte Trainingszeit (ca.). Annahmen: 1 Min Aufbau, Tempo pro Wiederholung, Sätze mit Pause dazwischen.
  const TRAIN_EST = {
    setupSec: 60,
    pushup: { sec: 3, set: 10, rest: 45 },
    squat: { sec: 3, set: 15, rest: 45 },
    situp: { sec: 3, set: 15, rest: 45 },
    plank: { sec: 20, set: 3, rest: 30 }      // 1 Wiederholung = 20 Sekunden halten
  };
  function trainingMinutes(ex, goal) {
    const e = TRAIN_EST[ex];
    const sets = Math.max(1, Math.ceil(goal / e.set));
    const sec = TRAIN_EST.setupSec + goal * e.sec + (sets - 1) * e.rest;
    return Math.max(1, Math.ceil(sec / 60));
  }


  const COUNTDOWN_LONG = 5, COUNTDOWN_SHORT = 3, COUNTDOWN_SHORT_AFTER = 3; // Sekunden, ab so vielen Trainings kurz
  const BASE_RATE = 30 / 15; // Punkte pro Minute beim 15-Minuten-Paket als Vergleich für "Spare x %"

  function round2(n) { return Math.round(n * 100) / 100; }

  function defaultState() {
    return {
      v: 1,
      points: 0,
      totalReps: { pushup: 0, squat: 0, situp: 0, plank: 0 },
      plankSeconds: 0,
      daily: {},          // 'YYYY-MM-DD': { reps, byEx:{...}, goalMet }
      goal: 10,
      minutes: [],        // { id, minutes, boughtAt, expiresAt }
      passUntil: 0,
      purchases: [],      // { id, name, price, at }
      sessions: [],       // letzte Trainings: { at, ex, reps, earned }
      onboarded: false,
      goalDrop: null,     // { to, need, base } wenn das Ziel gesenkt werden soll
      earnedTotal: 0,
      unlockedEx: [],     // einzeln freigeschaltete Übungen (Vorschau, nur im Test)
      trialStartedAt: 0,  // Gratis-Woche gibt es nur einmal: wann sie gestartet wurde (0 = noch nie)
      trainings: 0,       // abgeschlossene Trainings (mit Wiederholungen), für den kürzeren Countdown
      shieldDays: [],     // Tage, die der Streak-Schutztag gerettet hat ('YYYY-MM-DD')
      settings: { sound: true, facing: 'user', debug: false, ex: 'pushup', theme: 'dark', view: 'front', tutDone: {}, phone: null, shield: false, proTest: false, name: '', age: null, timeGoal: null }
    };
  }

  function dayKey(ms) {
    const d = new Date(ms);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function startOfDay(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function endOfDay(ms) {
    const d = new Date(ms);
    d.setHours(24, 0, 0, 0); // nächste Mitternacht (auch bei Zeitumstellung korrekt)
    return d.getTime();
  }

  function addDays(ms, n) {
    const d = new Date(ms);
    d.setDate(d.getDate() + n);
    return d.getTime();
  }

  function dayOf(state, key) {
    return state.daily[key] || { reps: 0, byEx: {}, goalMet: false };
  }

  function totalRepsAll(state) {
    return EXERCISES.reduce((s, e) => s + (state.totalReps[e] || 0), 0);
  }

  function goalDays(state) {
    let n = 0;
    for (const k in state.daily) if (state.daily[k].goalMet) n++;
    return n;
  }

  // Punktzahl für den Rang: Wiederholungen plus dauerhafter Streak-Bonus
  function rankScore(state) {
    return totalRepsAll(state) + goalDays(state) * STREAK_BONUS_PER_DAY;
  }

  function rankInfo(score) {
    let idx = 0;
    for (let i = 0; i < RANKS.length; i++) if (score >= RANKS[i].from) idx = i;
    const cur = RANKS[idx];
    const next = RANKS[idx + 1] || null;
    const progress = next ? (score - cur.from) / (next.from - cur.from) : 1;
    return {
      index: idx,
      number: idx + 1,
      total: RANKS.length,
      name: cur.name,
      tagline: cur.tagline,
      next: next ? next.name : null,
      toNext: next ? Math.max(0, Math.ceil(next.from - score)) : 0,
      progress: Math.max(0, Math.min(1, progress))
    };
  }

  // Zahl der Tage in Folge mit geschafftem Tagesziel. Heute zählt, wenn es schon geschafft ist,
  // sonst wird ab gestern gezählt (der Streak bricht erst ab, wenn ein ganzer Tag fehlt).
  function isShielded(state, key) { return (state.shieldDays || []).indexOf(key) >= 0; }
  function streakOf(state, nowMs) {
    let t = startOfDay(nowMs);
    const held = (tt) => dayOf(state, dayKey(tt)).goalMet || isShielded(state, dayKey(tt));
    if (!held(t)) t = addDays(t, -1);
    let n = 0;
    while (held(t)) { if (dayOf(state, dayKey(t)).goalMet) n++; t = addDays(t, -1); }
    return n;
  }

  // ---- Streak-Schutztag: 1 pro Woche (Mo bis So), nur mit Pro. Pro gibt es noch nicht zu kaufen,
  // darum schaltet im Test der Schalter "Pro simulieren" (settings.proTest) Pro frei.
  function isPro(state) { return !!state.settings.proTest; }
  function shieldActive(state) { return isPro(state) && !!state.settings.shield; }
  function mondayKey(ms) {
    const offset = (new Date(ms).getDay() + 6) % 7;
    return dayKey(addDays(startOfDay(ms), -offset));
  }
  function shieldUsedThisWeek(state, nowMs) {
    const wk = mondayKey(nowMs);
    return (state.shieldDays || []).some((k) => mondayKey(new Date(k + 'T12:00:00').getTime()) === wk);
  }
  // Schützt GESTERN, wenn: Schutz an, gestern nicht geschafft, davor eine Serie lief und diese Woche noch keiner benutzt wurde.
  // Gibt den geschützten Tag zurück oder null.
  function applyShield(state, nowMs) {
    if (!shieldActive(state)) return null;
    const y = addDays(startOfDay(nowMs), -1);
    const key = dayKey(y);
    if (dayOf(state, key).goalMet || isShielded(state, key)) return null;
    const before = dayKey(addDays(y, -1));
    if (!dayOf(state, before).goalMet) return null;          // keine Serie zu retten
    if (shieldUsedThisWeek(state, y)) return null;           // Woche von gestern schon benutzt
    state.shieldDays.push(key);
    if (state.shieldDays.length > 60) state.shieldDays = state.shieldDays.slice(-60);
    return key;
  }
  // Countdown vor dem Training: nach 3 abgeschlossenen Trainings nur noch 3 Sekunden
  function countdownSeconds(state) { return (state.trainings || 0) >= COUNTDOWN_SHORT_AFTER ? COUNTDOWN_SHORT : COUNTDOWN_LONG; }

  // Montag bis Sonntag der aktuellen Woche
  function weekOf(state, nowMs) {
    const d = new Date(nowMs);
    const offset = (d.getDay() + 6) % 7; // Montag = 0
    const monday = addDays(startOfDay(nowMs), -offset);
    const days = [];
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const t = addDays(monday, i);
      const reps = dayOf(state, dayKey(t)).reps;
      total += reps;
      days.push({ label: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i], reps: reps, today: dayKey(t) === dayKey(nowMs) });
    }
    return { days: days, total: total };
  }

  // Zeit nach einem Training gutschreiben
  function addSession(state, ex, reps, plankSeconds, nowMs) {
    if (!EXERCISES.includes(ex)) throw new Error('Unbekannte Übung: ' + ex);
    reps = Math.max(0, Math.floor(reps));
    const rankBefore = rankInfo(rankScore(state));
    const streakBefore = streakOf(state, nowMs);
    const key = dayKey(nowMs);
    const day = state.daily[key] || { reps: 0, byEx: {}, goalMet: false };
    const wasMet = day.goalMet;
    const earned = earnedFor(state, ex, reps);

    state.points = round2(state.points + earned);
    state.earnedTotal = round2((state.earnedTotal || 0) + earned);
    if (reps > 0) {
      state.sessions.push({ at: nowMs, ex: ex, reps: reps, earned: earned });
      if (state.sessions.length > 60) state.sessions = state.sessions.slice(-60);
    }
    if (reps > 0 || (ex === 'plank' && plankSeconds > 0)) state.trainings = (state.trainings || 0) + 1;
    state.totalReps[ex] = (state.totalReps[ex] || 0) + reps;
    if (ex === 'plank') state.plankSeconds = (state.plankSeconds || 0) + Math.max(0, Math.floor(plankSeconds || 0));
    day.reps += reps;
    day.byEx[ex] = (day.byEx[ex] || 0) + reps;
    if (day.reps >= state.goal) day.goalMet = true;
    if (reps > 0 || state.daily[key]) state.daily[key] = day;

    const rankAfter = rankInfo(rankScore(state));
    const goalLowered = checkGoalDrop(state);
    return {
      earned: earned,
      reps: reps,
      todayReps: day.reps,
      goal: state.goal,
      goalLowered: goalLowered,
      goalJustMet: !wasMet && day.goalMet,
      goalMet: day.goalMet,
      streak: streakOf(state, nowMs),
      streakBefore: streakBefore,
      rankBefore: rankBefore,
      rankAfter: rankAfter,
      rankUp: rankAfter.index > rankBefore.index
    };
  }

  function pruneMinutes(state, nowMs) {
    state.minutes = state.minutes.filter((m) => m.expiresAt > nowMs && m.minutes > 0);
  }

  function passActive(state, nowMs) {
    return state.passUntil > nowMs;
  }

  function minutesFree(state, nowMs) {
    return state.minutes.reduce((s, m) => (m.expiresAt > nowMs ? s + m.minutes : s), 0);
  }

  function savingPercent(pkg) {
    if (pkg.type === 'pass' || !pkg.minutes) return 0;
    const normal = pkg.minutes * BASE_RATE;
    return Math.round((1 - pkg.price / normal) * 100);
  }

  // Wie viele Minuten Handyzeit bringt ein Tagesziel? Rechnet mit dem 60-Minuten-Paket.
  function minutesForGoal(goal, ex) {
    const pk = findPackage('p60');
    const pts = goal * POINTS_PER_REP[ex];
    return Math.max(0, Math.round(pts * pk.minutes / pk.price));
  }
  // Wie viele Wiederholungen kostet 1 Stunde?
  function repsPerHour(ex) {
    const pk = findPackage('p60');
    return Math.ceil(pk.price * (60 / pk.minutes) / POINTS_PER_REP[ex]);
  }

  function findPackage(id) {
    return PACKAGES.find((p) => p.id === id) || null;
  }

  function canAfford(state, pkg) {
    return state.points + 1e-9 >= pkg.price;
  }

  function buy(state, id, nowMs) {
    const pkg = findPackage(id);
    if (!pkg) return { ok: false, error: 'unknown' };
    if (pkg.type === 'pass' && passActive(state, nowMs)) return { ok: false, error: 'pass_active' };
    if (!canAfford(state, pkg)) return { ok: false, error: 'not_enough' };
    state.points = round2(state.points - pkg.price);
    if (pkg.type === 'pass') {
      state.passUntil = endOfDay(nowMs);
    } else {
      state.minutes.push({ id: pkg.id, minutes: pkg.minutes, boughtAt: nowMs, expiresAt: nowMs + MINUTES_VALID_DAYS * DAY_MS });
    }
    state.purchases.push({ id: pkg.id, name: pkg.name, price: pkg.price, at: nowMs });
    return { ok: true, pkg: pkg };
  }

  // Nur zum Testen im Browser: Zeit "verbrauchen", die älteste zuerst
  function spendMinutes(state, amount, nowMs) {
    pruneMinutes(state, nowMs);
    let left = amount;
    state.minutes.sort((a, b) => a.expiresAt - b.expiresAt);
    for (const m of state.minutes) {
      const take = Math.min(m.minutes, left);
      m.minutes -= take;
      left -= take;
      if (left <= 0) break;
    }
    pruneMinutes(state, nowMs);
    return amount - left;
  }

  // Tagesziel erhöhen ist gratis, Senken ist (noch) gesperrt.
  function setGoal(state, goal) {
    goal = Math.floor(goal);
    if (!(goal >= 1 && goal <= 1000)) return { ok: false, error: 'range' };
    if (goal < state.goal) return { ok: false, error: 'lower_blocked' };
    state.goal = goal;
    state.goalDrop = null; // Erhöhen bricht ein offenes Senken ab
    return { ok: true };
  }

  // Ziel senken kostet einmalig Extra-Wiederholungen (egal welche Übung), danach gilt das neue Ziel.
  const GOAL_STEP = 5;
  const GOAL_MIN = 5;
  const GOAL_DROP_REPS = 20;

  function requestGoalDrop(state) {
    if (state.goalDrop) return { ok: false, error: 'pending' };
    if (state.goal - GOAL_STEP < GOAL_MIN) return { ok: false, error: 'min' };
    state.goalDrop = { to: state.goal - GOAL_STEP, need: GOAL_DROP_REPS, base: totalRepsAll(state) };
    return { ok: true, goalDrop: state.goalDrop };
  }

  function cancelGoalDrop(state) { state.goalDrop = null; }

  function goalDropProgress(state) {
    const g = state.goalDrop;
    if (!g) return null;
    const done = Math.max(0, totalRepsAll(state) - g.base);
    return { to: g.to, need: g.need, done: Math.min(done, g.need), left: Math.max(0, g.need - done) };
  }

  function checkGoalDrop(state) {
    const g = state.goalDrop;
    if (!g) return false;
    if (totalRepsAll(state) - g.base >= g.need) { state.goal = g.to; state.goalDrop = null; return true; }
    return false;
  }


  // ---------- Auswertungen für Startseite, Inventar und Shop ----------

  function bestStreak(state) {
    const keys = Object.keys(state.daily).filter((k) => state.daily[k].goalMet).sort();
    let best = 0, run = 0, prev = null;
    for (const k of keys) {
      const t = new Date(k + 'T12:00:00').getTime();
      const gap1 = prev !== null && dayKey(addDays(prev, 1)) === k;
      const gap2 = prev !== null && !gap1 && isShielded(state, dayKey(addDays(prev, 1))) && dayKey(addDays(prev, 2)) === k;
      run = gap1 || gap2 ? run + 1 : 1;
      prev = t;
      if (run > best) best = run;
    }
    return best;
  }

  function bestDay(state) {
    let best = 0;
    for (const k in state.daily) if (state.daily[k].reps > best) best = state.daily[k].reps;
    return best;
  }

  function activeDays(state) {
    let n = 0;
    for (const k in state.daily) if (state.daily[k].reps > 0) n++;
    return n;
  }

  // Letzte n Tage (älteste zuerst), für den Kalender
  function lastDays(state, nowMs, n) {
    const out = [];
    const base = startOfDay(nowMs);
    for (let i = n - 1; i >= 0; i--) {
      const t = addDays(base, -i);
      const d = dayOf(state, dayKey(t));
      out.push({ key: dayKey(t), date: new Date(t).getDate(), reps: d.reps, goalMet: !!d.goalMet, today: i === 0 });
    }
    return out;
  }

  function recentSessions(state, n) {
    return state.sessions.slice(-n).reverse();
  }

  // Nächstes Shop-Ziel: das günstigste Paket, das noch nicht bezahlbar ist
  function nextShopGoal(state, nowMs) {
    const open = PACKAGES.filter((p) => !canAfford(state, p) && !(p.type === 'pass' && passActive(state, nowMs)));
    if (!open.length) return null;
    open.sort((a, b) => a.price - b.price);
    const pkg = open[0];
    const missing = Math.ceil(pkg.price - state.points - 1e-9);
    return {
      pkg: pkg,
      missing: missing,
      progress: Math.max(0, Math.min(1, state.points / pkg.price)),
      pushups: Math.ceil(missing / POINTS_PER_REP.pushup),
      squats: Math.ceil(missing / POINTS_PER_REP.squat)
    };
  }

  // Wie lange die älteste gekaufte Zeit noch gilt (in Tagen, aufgerundet)
  function expiryDays(state, nowMs) {
    const live = state.minutes.filter((m) => m.expiresAt > nowMs && m.minutes > 0);
    if (!live.length) return null;
    const soon = Math.min.apply(null, live.map((m) => m.expiresAt));
    return Math.max(1, Math.ceil((soon - nowMs) / DAY_MS));
  }

  // Meilensteine, nur aus vorhandenen Daten berechnet
  function milestones(state) {
    const reps = totalRepsAll(state);
    const best = bestStreak(state);
    const idx = rankInfo(rankScore(state)).index;
    return [
      { id: 'first', name: 'Erster Schritt', desc: 'Erste Wiederholung', done: reps >= 1 },
      { id: 'r100', name: 'Hundert', desc: '100 Wiederholungen', done: reps >= 100 },
      { id: 'r500', name: 'Fünfhundert', desc: '500 Wiederholungen', done: reps >= 500 },
      { id: 'r1000', name: 'Tausender', desc: '1.000 Wiederholungen', done: reps >= 1000 },
      { id: 's3', name: 'Dranbleiber', desc: '3 Tage in Folge', done: best >= 3 },
      { id: 's7', name: 'Wochensieger', desc: '7 Tage in Folge', done: best >= 7 },
      { id: 's30', name: 'Gewohnheit', desc: '30 Tage in Folge', done: best >= 30 },
      { id: 'shop', name: 'Verdient', desc: 'Erste Handyzeit eingelöst', done: state.purchases.length >= 1 },
      { id: 'allround', name: 'Allrounder', desc: 'Alle 4 Übungen gemacht', done: EXERCISES.every((e) => (state.totalReps[e] || 0) > 0) },
      { id: 'fit', name: 'Fit', desc: 'Rang Fit erreicht', done: idx >= 3 }
    ];
  }

  function greeting(nowMs) {
    const h = new Date(nowMs).getHours();
    if (h < 5) return 'Noch wach?';
    if (h < 11) return 'Guten Morgen';
    if (h < 17) return 'Guten Tag';
    if (h < 22) return 'Guten Abend';
    return 'Noch wach?';
  }

  function fmtPoints(n) {
    return String(Math.floor(n + 1e-9));
  }

  // Gespeicherten Stand prüfen und fehlende Felder ergänzen
  function normalize(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    const s = Object.assign(base, raw);
    s.totalReps = Object.assign({ pushup: 0, squat: 0, situp: 0, plank: 0 }, raw.totalReps || {});
    s.settings = Object.assign(defaultState().settings, raw.settings || {});
    if (PHONE_LEGACY[s.settings.phone]) s.settings.phone = PHONE_LEGACY[s.settings.phone];
    if (!PHONE_LEVELS.some((l) => l.id === s.settings.phone)) s.settings.phone = null;
    if (!s.daily || typeof s.daily !== 'object') s.daily = {};
    if (!Array.isArray(s.minutes)) s.minutes = [];
    s.shieldDays = Array.isArray(raw.shieldDays) ? raw.shieldDays.filter((k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)) : [];
    s.settings.shield = s.settings.shield === true;
    s.settings.proTest = s.settings.proTest === true;
    s.unlockedEx = Array.isArray(raw.unlockedEx) ? raw.unlockedEx.filter((e, i, a) => EXERCISES.indexOf(e) >= 0 && a.indexOf(e) === i) : [];
    s.settings.name = typeof s.settings.name === 'string' ? s.settings.name.trim().slice(0, 20) : '';
    { const a = s.settings.age; s.settings.age = typeof a === 'number' && isFinite(a) && a >= AGE.min && a <= AGE.max ? Math.round(a) : null; }
    { const g = s.settings.timeGoal; s.settings.timeGoal = typeof g === 'number' && isFinite(g) && g >= TIME_GOAL.min && g <= TIME_GOAL.max ? Math.round(g / TIME_GOAL.step) * TIME_GOAL.step : null; }
    s.trialStartedAt = typeof raw.trialStartedAt === 'number' && isFinite(raw.trialStartedAt) && raw.trialStartedAt > 0 ? raw.trialStartedAt : 0;
    s.trainings = Math.max(typeof raw.trainings === 'number' && isFinite(raw.trainings) ? Math.floor(raw.trainings) : 0, Array.isArray(raw.sessions) ? raw.sessions.length : 0);
    if (!Array.isArray(s.purchases)) s.purchases = [];
    if (!Array.isArray(s.sessions)) s.sessions = [];
    if (typeof s.earnedTotal !== 'number' || !isFinite(s.earnedTotal)) s.earnedTotal = 0;
    if (typeof s.points !== 'number' || !isFinite(s.points)) s.points = 0;
    // Bestehende Spielstände überspringen den Einstieg
    if (raw.onboarded === undefined && (s.points > 0 || totalRepsAll(s) > 0)) s.onboarded = true;
    s.onboarded = !!s.onboarded;
    const gd = raw.goalDrop;
    s.goalDrop = gd && typeof gd === 'object' && gd.to >= 1 && gd.need >= 1 && typeof gd.base === 'number' ? { to: Math.floor(gd.to), need: Math.floor(gd.need), base: gd.base } : null;
    if (typeof s.goal !== 'number' || !(s.goal >= 1)) s.goal = 10;
    return s;
  }

  return {
    POINTS_PER_REP: POINTS_PER_REP,
    pointsFor: pointsFor,
    earnedFor: earnedFor,
    isUnlocked: isUnlocked,
    trialUsed: trialUsed,
    startTrialPreview: startTrialPreview,
    stats: stats,
    FIT_STEPS: FIT_STEPS,
    TIME_GOAL: TIME_GOAL,
    AGE: AGE,
    TRAIN_EST: TRAIN_EST,
    trainingMinutes: trainingMinutes,
    PLANK_TIERS: PLANK_TIERS,
    EXERCISES: EXERCISES,
    EX_LABEL: EX_LABEL,
    RANKS: RANKS,
    PACKAGES: PACKAGES,
    PRO: PRO,
    PHONE_LEVELS: PHONE_LEVELS,
    PHONE_LEGACY: PHONE_LEGACY,
    minutesForGoal: minutesForGoal,
    repsPerHour: repsPerHour,
    STREAK_BONUS_PER_DAY: STREAK_BONUS_PER_DAY,
    MINUTES_VALID_DAYS: MINUTES_VALID_DAYS,
    defaultState: defaultState,
    normalize: normalize,
    dayKey: dayKey,
    startOfDay: startOfDay,
    endOfDay: endOfDay,
    dayOf: dayOf,
    totalRepsAll: totalRepsAll,
    rankScore: rankScore,
    rankInfo: rankInfo,
    streakOf: streakOf,
    isPro: isPro,
    shieldActive: shieldActive,
    shieldUsedThisWeek: shieldUsedThisWeek,
    applyShield: applyShield,
    countdownSeconds: countdownSeconds,
    weekOf: weekOf,
    addSession: addSession,
    pruneMinutes: pruneMinutes,
    passActive: passActive,
    minutesFree: minutesFree,
    savingPercent: savingPercent,
    findPackage: findPackage,
    canAfford: canAfford,
    buy: buy,
    spendMinutes: spendMinutes,
    setGoal: setGoal,
    GOAL_STEP: GOAL_STEP,
    GOAL_MIN: GOAL_MIN,
    GOAL_DROP_REPS: GOAL_DROP_REPS,
    requestGoalDrop: requestGoalDrop,
    cancelGoalDrop: cancelGoalDrop,
    goalDropProgress: goalDropProgress,
    checkGoalDrop: checkGoalDrop,
    fmtPoints: fmtPoints,
    bestStreak: bestStreak,
    bestDay: bestDay,
    activeDays: activeDays,
    lastDays: lastDays,
    recentSessions: recentSessions,
    nextShopGoal: nextShopGoal,
    expiryDays: expiryDays,
    milestones: milestones,
    greeting: greeting
  };
});
