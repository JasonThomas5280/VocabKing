/* ✦ VocabKing — SAT/GRE vocabulary flashcards
   Vanilla JS, no dependencies. State machine: setup → quiz → results.
   Mirrors the Math Quest engine: adaptive practice, XP/levels, achievements,
   daily streak, speed bonuses, haptics, persisted settings, "practice missed"
   replay, and a victory fanfare on a perfect score — but the math layer is
   replaced by a tiered vocabulary engine whose difficulty scales with points. */

(() => {
  "use strict";

  // ---------- element refs ----------
  const $ = (id) => document.getElementById(id);

  const screens = { setup: $("setup"), quiz: $("quiz"), results: $("results") };

  const tierGrid = $("tierGrid");
  const modeRow = $("modeRow");
  const lengthSeg = $("lengthSeg");
  const bestStrip = $("bestStrip");
  const masteryEl = $("mastery");
  const autoToggle = $("autoToggle");
  const autoDesc = $("autoDesc");

  const lvlBadge = $("lvlBadge");
  const xpFill = $("xpFill");
  const xpText = $("xpText");
  const badgeCount = $("badgeCount");

  const flashcard = $("flashcard");
  const fcKicker = $("fcKicker");
  const questionEl = $("question");
  const posTag = $("posTag");
  const answerWord = $("answerWord");
  const answerDef = $("answerDef");
  const answerEx = $("answerEx");
  const flipHint = $("flipHint");
  const choicesEl = $("choices");
  const typeForm = $("typeForm");
  const typeInput = $("typeInput");
  const flipControls = $("flipControls");
  const timerBar = $("timerBar");
  const timerFill = $("timerFill");

  const progressFill = $("progressFill");
  const streakBadge = $("streakBadge");
  const streakNum = $("streakNum");
  const qCount = $("qCount");
  const scoreNum = $("scoreNum");
  const toastWrap = $("toastWrap");

  // daily streak panel + customize
  const streakPanel = $("streakPanel");
  const flameEl = $("flame");
  const streakDays = $("streakDays");
  const streakSub = $("streakSub");
  const freezeBadge = $("freezeBadge");
  const freezeNum = $("freezeNum");
  const goalFill = $("goalFill");
  const goalNow = $("goalNow");
  const goalTarget = $("goalTarget");
  const goalWrap = streakPanel ? streakPanel.querySelector(".goal") : null;
  const customizeEl = $("customize");
  const customizeToggle = $("customizeToggle");

  // ---------- config ----------
  const TIERS = [1, 2, 3, 4, 5, 6];
  const TIER_NAMES = { 1: "Everyday+", 2: "SAT", 3: "SAT+", 4: "GRE", 5: "GRE+", 6: "Elite" };
  const MAX_TIER = 6;
  const STORE_KEY = "vocabKing.v1";
  const CARD_SECONDS = 8; // timer-bar fill duration (cosmetic urgency, no fail)
  const POS_FULL = { adj: "adjective", n: "noun", v: "verb", adv: "adverb" };

  const ACHIEVEMENTS = {
    first_perfect: { emoji: "🏆", name: "Flawless", desc: "100% in a round" },
    sharpshooter:  { emoji: "🎯", name: "Sharpshooter", desc: "90%+ in a round" },
    streak_10:     { emoji: "🔥", name: "On a Roll", desc: "10-answer streak" },
    speed_demon:   { emoji: "⚡", name: "Quick Wit", desc: "Correct under 1.2s" },
    centurion:     { emoji: "💯", name: "Centurion", desc: "100 correct all-time" },
    dedicated:     { emoji: "📚", name: "Bookworm", desc: "Played 10 rounds" },
    scholar:       { emoji: "🧠", name: "Scholar", desc: "Reached the Elite tier" },
    wordsmith:     { emoji: "📝", name: "Wordsmith", desc: "Mastered 250 words" },
  };

  // ---------- word data (from words.js) ----------
  const ALL_WORDS = (Array.isArray(window.WORDS) ? window.WORDS : [])
    .filter((x) => x && x.w && x.def && typeof x.tier === "number");
  const WORD_BY_KEY = new Map();
  const WORDS_BY_TIER = {};
  TIERS.forEach((t) => (WORDS_BY_TIER[t] = []));
  ALL_WORDS.forEach((x) => {
    if (!WORD_BY_KEY.has(x.w)) WORD_BY_KEY.set(x.w, x);
    if (WORDS_BY_TIER[x.tier]) WORDS_BY_TIER[x.tier].push(x);
  });

  // ---------- persistent store ----------
  const defaultStore = () => ({
    bestPct: 0, bestStreak: 0, games: 0,
    xp: 0, totalCorrect: 0,
    words: {},             // word -> { s: seen, c: correct }
    achievements: {},      // id -> true
    settings: { tiers: [1, 2], auto: true, mode: "choice", length: 10 },
    // daily streak
    dayStreak: 0, lastDay: null, freezes: 0,
    dailyGoal: 10, todayCorrect: 0, todayDay: null, goalDoneDay: null,
  });
  function loadStore() {
    try { return Object.assign(defaultStore(), JSON.parse(localStorage.getItem(STORE_KEY)) || {}); }
    catch { return defaultStore(); }
  }
  function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch {} }
  const store = loadStore();

  // ---------- live settings (mirror of store.settings) ----------
  const settings = {
    tiers: new Set(store.settings.tiers && store.settings.tiers.length ? store.settings.tiers : [1, 2]),
    auto: store.settings.auto !== false,
    mode: store.settings.mode || "choice",
    length: typeof store.settings.length === "number" ? store.settings.length : 10,
  };
  function persistSettings() {
    store.settings = { tiers: [...settings.tiers], auto: settings.auto, mode: settings.mode, length: settings.length };
    saveStore();
  }

  // ---------- level + difficulty math ----------
  const levelFromXp = (xp) => Math.floor(Math.sqrt(xp / 40)) + 1;
  const xpForLevel = (lvl) => 40 * (lvl - 1) ** 2;
  // Unlocked-tier ceiling: gain levels (points) → harder tiers unlock.
  const tierCeiling = () => Math.max(1, Math.min(MAX_TIER, 1 + Math.floor(levelFromXp(store.xp) / 2)));

  // ---------- daily streak ----------
  const dayKey = (d) => {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const todayKey = () => dayKey(new Date());
  function daysBetween(aKey, bKey) {
    const a = new Date(aKey + "T00:00:00"), b = new Date(bKey + "T00:00:00");
    return Math.round((b - a) / 86400000);
  }

  function ensureDailyState() {
    const tk = todayKey();
    if (store.todayDay !== tk) { store.todayDay = tk; store.todayCorrect = 0; saveStore(); }
  }

  function registerPracticeDay() {
    const tk = todayKey();
    if (store.lastDay === tk) return;
    const gap = store.lastDay ? daysBetween(store.lastDay, tk) : null;
    if (gap === null || gap <= 0) {
      store.dayStreak = Math.max(1, store.dayStreak || 0);
      if (gap === null) store.dayStreak = 1;
    } else if (gap === 1) {
      store.dayStreak = (store.dayStreak || 0) + 1;
    } else if (gap === 2 && (store.freezes || 0) > 0) {
      store.freezes--; store.dayStreak = (store.dayStreak || 0) + 1;
      setTimeout(() => toast("❄️", "Streak freeze used", "Your streak is safe!"), 400);
    } else {
      store.dayStreak = 1;
    }
    store.lastDay = tk;
    if (store.dayStreak > 0 && store.dayStreak % 5 === 0 && (store.freezes || 0) < 2) {
      store.freezes = (store.freezes || 0) + 1;
      setTimeout(() => toast("❄️", "Streak freeze earned", "Banked — one for a rainy day"), 700);
    }
    saveStore();
  }

  function bumpDailyGoal() {
    ensureDailyState();
    store.todayCorrect = (store.todayCorrect || 0) + 1;
    const goal = store.dailyGoal || 10;
    if (store.todayCorrect === goal && store.goalDoneDay !== store.todayDay) {
      store.goalDoneDay = store.todayDay;
      toast("🎯", "Daily goal complete!", `${goal} correct today — nice`);
      burstConfetti();
    }
    saveStore();
  }

  function renderStreak() {
    if (!streakPanel) return;
    ensureDailyState();
    const d = store.dayStreak || 0;
    const practicedToday = store.lastDay === todayKey();
    streakDays.textContent = d;
    flameEl.classList.toggle("cold", !practicedToday && d === 0);
    streakSub.textContent = practicedToday
      ? "Practiced today ✓ — see you tomorrow!"
      : d > 0 ? "Practice today to keep your streak 🔥" : "Practice today to start your streak";
    if ((store.freezes || 0) > 0) { freezeBadge.hidden = false; freezeNum.textContent = store.freezes; }
    else freezeBadge.hidden = true;
    const goal = store.dailyGoal || 10;
    const now = store.todayCorrect || 0;
    goalFill.style.width = Math.min(100, Math.round((now / goal) * 100)) + "%";
    goalNow.textContent = now;
    goalTarget.textContent = goal;
    if (goalWrap) goalWrap.classList.toggle("done", now >= goal);
    if (practicedToday) litFlame();
  }
  function litFlame() {
    if (!flameEl) return;
    flameEl.classList.remove("lit"); void flameEl.offsetWidth; flameEl.classList.add("lit");
  }

  // ===================================================================
  // SETUP SCREEN
  // ===================================================================
  function buildTierGrid() {
    TIERS.forEach((t) => {
      const b = document.createElement("button");
      b.className = "tbtn";
      b.dataset.t = t;
      b.innerHTML = `<span class="tier-num">${t}</span><span class="tier-name">${TIER_NAMES[t]}</span>`;
      b.addEventListener("click", () => {
        // Touching a tier switches off Auto and lets you choose manually.
        if (settings.auto) { settings.auto = false; settings.tiers = new Set(); }
        if (settings.tiers.has(t)) settings.tiers.delete(t);
        else settings.tiers.add(t);
        if (settings.tiers.size === 0) settings.tiers.add(t); // never fully empty
        reflectDifficulty(); persistSettings(); renderMastery();
      });
      tierGrid.appendChild(b);
    });
  }

  // Highlight the active tiers (auto = unlocked band; manual = chosen set).
  function reflectDifficulty() {
    const ceiling = tierCeiling();
    autoToggle.classList.toggle("is-on", settings.auto);
    autoToggle.setAttribute("aria-pressed", String(settings.auto));
    tierGrid.classList.toggle("auto-managed", settings.auto);
    [...tierGrid.children].forEach((b) => {
      const t = +b.dataset.t;
      const on = settings.auto ? t <= ceiling : settings.tiers.has(t);
      b.classList.toggle("is-on", on);
      b.classList.toggle("locked", settings.auto && t > ceiling);
      b.setAttribute("aria-pressed", String(on));
    });
    if (settings.auto) {
      autoDesc.textContent = `Unlocked: Tiers 1–${ceiling} · harder as you level up`;
    } else {
      const list = [...settings.tiers].sort((a, b) => a - b).join(", ");
      autoDesc.textContent = `Manual — practising tier${settings.tiers.size > 1 ? "s" : ""} ${list}`;
    }
  }

  function applyQuickSelect(kind) {
    if (kind === "weak") { startTrickyGame(); return; }
    const map = { all: TIERS, easy: [1, 2, 3], hard: [4, 5, 6] };
    settings.auto = false;
    settings.tiers = new Set(map[kind]);
    reflectDifficulty(); persistSettings(); renderMastery();
  }

  // Words whose tier is in the currently active band.
  function activeTiers() {
    if (settings.auto) {
      const ceiling = tierCeiling();
      return TIERS.filter((t) => t <= ceiling);
    }
    return [...settings.tiers];
  }
  function poolWords() {
    const tiers = new Set(activeTiers());
    const pool = ALL_WORDS.filter((x) => tiers.has(x.tier));
    return pool.length ? pool : ALL_WORDS.slice();
  }

  function renderMastery() {
    const pool = poolWords();
    if (!pool.length) { masteryEl.innerHTML = ""; return; }
    let sum = 0;
    pool.forEach((x) => {
      const f = store.words[x.w];
      sum += f && f.s ? f.c / f.s : 0;
    });
    const pct = Math.round((sum / pool.length) * 100);
    masteryEl.innerHTML = `Mastery <div class="bar"><i style="width:${pct}%"></i></div> <b>${pct}%</b>`;
  }

  function renderProfile() {
    const lvl = levelFromXp(store.xp);
    const base = xpForLevel(lvl), nextAt = xpForLevel(lvl + 1);
    const into = store.xp - base, span = nextAt - base;
    lvlBadge.textContent = "Lv " + lvl;
    xpFill.style.width = Math.round((into / span) * 100) + "%";
    xpText.textContent = `${into} / ${span} XP`;
    badgeCount.textContent = "🏅 " + Object.keys(store.achievements).length;
  }

  // chips (tier quick-selects)
  document.querySelectorAll(".quick-row .chip").forEach((c) =>
    c.addEventListener("click", () => { if (c.dataset.select) applyQuickSelect(c.dataset.select); })
  );

  autoToggle.addEventListener("click", () => {
    settings.auto = !settings.auto;
    if (!settings.auto && settings.tiers.size === 0) settings.tiers = new Set(activeTiers());
    reflectDifficulty(); persistSettings(); renderMastery();
  });

  modeRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-btn");
    if (!btn) return;
    settings.mode = btn.dataset.mode;
    modeRow.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("is-on", b === btn));
    persistSettings();
  });

  lengthSeg.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    settings.length = +btn.dataset.len;
    lengthSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", b === btn));
    persistSettings();
  });

  function reflectModeAndLength() {
    modeRow.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("is-on", b.dataset.mode === settings.mode));
    lengthSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", +b.dataset.len === settings.length));
  }

  // ===================================================================
  // DECK BUILDING (adaptive + difficulty-scaled)
  // ===================================================================
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Weight = base adaptive (low accuracy / unseen → higher) × tier bias in Auto
  // mode (favours the hardest unlocked tiers, so cards get harder as you climb).
  function adaptiveWeight(word) {
    const f = store.words[word.w];
    if (!f || !f.s) return 5;
    return 1 + (1 - f.c / f.s) * 6;
  }
  function tierBias(tier, ceiling) {
    return 1 / (1 + Math.max(0, ceiling - tier)); // ceiling=1, ceiling-1=.5, ...
  }

  function weightedPick(pool) {
    const total = pool.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    for (const x of pool) { r -= x.w; if (r <= 0) return x.p; }
    return pool[pool.length - 1].p;
  }

  function buildDeck(targetLen) {
    const words = poolWords();
    const ceiling = tierCeiling();
    const pool = words.map((p) => ({
      p,
      w: adaptiveWeight(p) * (settings.auto ? tierBias(p.tier, ceiling) : 1),
    }));
    const out = [];
    let lastQ = null, guard = 0;
    while (out.length < targetLen) {
      const pick = weightedPick(pool);
      if (words.length > 1 && pick.w === lastQ && guard++ < 8) continue;
      out.push(pick); lastQ = pick.w; guard = 0;
    }
    return out;
  }

  // Multiple-choice distractors: other definitions from a nearby tier.
  function buildChoices(card) {
    const opts = [{ text: card.def, correct: true }];
    const usedDefs = new Set([card.def]);
    const near = ALL_WORDS.filter(
      (x) => x.w !== card.w && Math.abs(x.tier - card.tier) <= 1 && !usedDefs.has(x.def)
    );
    shuffle(near);
    let pool = near;
    let i = 0;
    while (opts.length < 4 && i < pool.length) {
      const x = pool[i++];
      if (usedDefs.has(x.def)) continue;
      usedDefs.add(x.def); opts.push({ text: x.def, correct: false });
    }
    // fallback to any word if a sparse tier didn't yield enough distractors
    if (opts.length < 4) {
      pool = shuffle(ALL_WORDS.filter((x) => x.w !== card.w && !usedDefs.has(x.def)));
      i = 0;
      while (opts.length < 4 && i < pool.length) {
        const x = pool[i++];
        if (usedDefs.has(x.def)) continue;
        usedDefs.add(x.def); opts.push({ text: x.def, correct: false });
      }
    }
    return shuffle(opts);
  }

  // ===================================================================
  // QUIZ FLOW
  // ===================================================================
  let deck = [];
  let idx = 0, score = 0, streak = 0, bestStreakRound = 0;
  let locked = false, cardStart = 0, totalTime = 0, answered = 0;
  let roundXp = 0, fastCorrect = false;
  let lastMissed = [];
  const missed = [];

  function startGame(customDeck) {
    if (!ALL_WORDS.length) { flash(bestStrip, "Word list still loading… ✦"); return; }
    if (!customDeck && !settings.auto && settings.tiers.size === 0) {
      flash(bestStrip, "Pick at least one difficulty tier ✦"); openCustomize(); return;
    }
    const len = settings.length === 0 ? 20 : settings.length;
    deck = customDeck || buildDeck(len);
    idx = 0; score = 0; streak = 0; bestStreakRound = 0;
    answered = 0; totalTime = 0; roundXp = 0; fastCorrect = false; missed.length = 0;
    scoreNum.textContent = "0"; streakNum.textContent = "0";
    show("quiz");
    renderCard();
  }

  // A focused round built from your weakest seen words.
  function startTrickyGame() {
    const seen = Object.keys(store.words)
      .map((w) => ({ w, f: store.words[w] }))
      .filter((x) => x.f && x.f.s > 0 && WORD_BY_KEY.has(x.w));
    if (seen.length < 4) { toast("📊", "Play a few rounds first", "so I can spot your tricky words"); return; }
    seen.sort((a, b) => (a.f.c / a.f.s) - (b.f.c / b.f.s) || b.f.s - a.f.s);
    const n = settings.length === 0 ? 20 : settings.length;
    const picks = seen.slice(0, Math.min(n, seen.length)).map((x) => WORD_BY_KEY.get(x.w));
    startGame(shuffle(picks));
  }

  function roundLength() { return settings.length === 0 ? 0 : deck.length; }

  function currentCard() {
    if (settings.length === 0 && idx >= deck.length) { deck = deck.concat(buildDeck(20)); }
    return deck[idx];
  }

  function expandPos(pos) { return POS_FULL[pos] || pos || ""; }

  function renderCard() {
    locked = false;
    const card = currentCard();

    flashcard.classList.remove("flipped", "shake", "correct-glow", "wrong-glow");

    // back face (used by flip mode + wrong-answer reveal in type mode)
    answerWord.textContent = card.w;
    answerDef.textContent = card.def;
    answerEx.textContent = card.ex ? "“" + card.ex + "”" : "";

    const len = roundLength();
    qCount.textContent = idx + 1;
    const pct = len === 0 ? ((idx % 20) / 20) * 100 : (idx / len) * 100;
    progressFill.style.width = pct + "%";

    choicesEl.style.display = "none";
    typeForm.classList.remove("is-active");
    flipControls.classList.remove("is-active");
    flashcard.classList.remove("is-flip-mode");
    flipHint.style.visibility = "hidden";
    questionEl.classList.remove("is-prompt");
    posTag.hidden = true;

    if (settings.mode === "choice") renderChoiceMode(card);
    else if (settings.mode === "type") renderTypeMode(card);
    else renderFlipMode(card);

    if (settings.mode === "flip") stopTimer();
    else startTimer();

    cardStart = performance.now();
  }

  function renderChoiceMode(card) {
    fcKicker.textContent = "What does this word mean?";
    questionEl.textContent = card.w;
    posTag.textContent = expandPos(card.pos);
    posTag.hidden = false;

    choicesEl.style.display = "grid";
    choicesEl.innerHTML = "";
    buildChoices(card).forEach((opt) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.textContent = opt.text;
      if (opt.correct) b.dataset.correct = "1";
      b.addEventListener("click", () => handleChoice(b, opt.correct));
      choicesEl.appendChild(b);
    });
  }

  function renderTypeMode(card) {
    fcKicker.textContent = `Type the ${expandPos(card.pos)} that means:`;
    questionEl.textContent = card.def;
    questionEl.classList.add("is-prompt");
    typeForm.classList.add("is-active");
    typeInput.value = "";
    typeInput.className = "type-input";
    setTimeout(() => typeInput.focus(), 50);
  }

  function renderFlipMode(card) {
    fcKicker.textContent = "What does this mean?";
    questionEl.textContent = card.w;
    posTag.textContent = expandPos(card.pos);
    posTag.hidden = false;
    flashcard.classList.add("is-flip-mode");
    flipHint.style.visibility = "visible";
    flipHint.textContent = "tap to reveal";
  }

  // ---------- timer bar ----------
  function startTimer() {
    timerBar.classList.add("is-on");
    timerFill.style.transition = "none";
    timerFill.style.transform = "scaleX(1)";
    void timerFill.offsetWidth;
    timerFill.style.transition = `transform ${CARD_SECONDS}s linear`;
    timerFill.style.transform = "scaleX(0)";
  }
  function freezeTimer() {
    const m = getComputedStyle(timerFill).transform;
    timerFill.style.transition = "none";
    timerFill.style.transform = m === "none" ? "scaleX(0)" : m;
  }
  function stopTimer() {
    timerBar.classList.remove("is-on");
    timerFill.style.transition = "none";
    timerFill.style.transform = "scaleX(1)";
  }

  // ---------- normalize typed answers ----------
  function norm(s) {
    return String(s).toLowerCase().trim().replace(/[.,!?;:'"]/g, "").replace(/\s+/g, " ");
  }

  // ---------- answer handlers ----------
  function handleChoice(btn, ok) {
    if (locked) return;
    locked = true; freezeTimer();
    [...choicesEl.children].forEach((b) => {
      b.disabled = true;
      if (b.dataset.correct === "1") b.classList.add("right");
      else if (b === btn) b.classList.add("wrong");
      else b.classList.add("dim");
    });
    grade(ok);
    setTimeout(next, ok ? 700 : 1300);
  }

  typeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (locked) return;
    const raw = typeInput.value.trim();
    if (raw === "") return;
    locked = true; freezeTimer();
    const card = currentCard();
    const ok = norm(raw) === norm(card.w);
    typeInput.classList.add(ok ? "right" : "wrong");
    if (!ok) flashcard.classList.add("flipped"); // reveal the word + example
    grade(ok);
    setTimeout(next, ok ? 750 : 1700);
  });

  flipControls.addEventListener("click", (e) => {
    const btn = e.target.closest(".flip-btn");
    if (!btn || locked) return;
    locked = true;
    grade(btn.dataset.flip === "right");
    setTimeout(next, 350);
  });

  flashcard.addEventListener("click", () => {
    if (settings.mode !== "flip" || locked) return;
    const isFlipped = flashcard.classList.toggle("flipped");
    if (isFlipped) flipControls.classList.add("is-active");
  });

  // ---------- grading ----------
  function grade(ok) {
    const t = (performance.now() - cardStart) / 1000;
    totalTime += t * 1000;
    answered++;
    const card = currentCard();

    registerPracticeDay();

    const f = store.words[card.w] || (store.words[card.w] = { s: 0, c: 0 });
    f.s++; if (ok) f.c++;

    if (ok) {
      streak++;
      bestStreakRound = Math.max(bestStreakRound, streak);
      const streakBonus = Math.min(streak - 1, 10) * 2;
      const speedBonus = settings.mode === "flip" ? 0 : t < 1.5 ? 5 : t < 3 ? 3 : t < 5 ? 1 : 0;
      const tierBonus = (card.tier - 1) * 2; // harder words are worth more points
      if (settings.mode !== "flip" && t < 1.2) fastCorrect = true;
      const gained = 10 + streakBonus + speedBonus + tierBonus;
      score += gained; roundXp += gained;
      store.totalCorrect++;
      bumpDailyGoal();
      flashcard.classList.add("correct-glow");
      popStreak();
      tone(true); haptic(true);
    } else {
      streak = 0;
      missed.push({ w: card.w, pos: card.pos, def: card.def, ex: card.ex, tier: card.tier });
      flashcard.classList.add("wrong-glow", "shake");
      tone(false); haptic(false);
    }
    scoreNum.textContent = score;
    streakNum.textContent = streak;
  }

  function popStreak() {
    streakBadge.classList.remove("pop");
    void streakBadge.offsetWidth;
    streakBadge.classList.add("pop");
  }

  function next() {
    idx++;
    const done = roundLength() > 0 && idx >= roundLength();
    if (done) finish();
    else renderCard();
  }

  // ===================================================================
  // RESULTS
  // ===================================================================
  function finish() {
    stopTimer();
    progressFill.style.width = "100%";
    const total = roundLength();
    const correctCount = total - missed.length;
    const pct = total ? Math.round((correctCount / total) * 100) : 0;
    const avg = answered ? (totalTime / answered / 1000) : 0;

    $("resultScore").textContent = correctCount;
    $("resultPct").textContent = pct + "%";
    $("resultBest").textContent = bestStreakRound;
    $("resultTime").textContent = avg.toFixed(1) + "s";
    document.querySelector(".result-of").textContent = "/ " + total;

    let emoji = "🎉", title = "Brilliant!";
    if (pct === 100) { emoji = "🏆"; title = "Perfect score!"; }
    else if (pct >= 80) { emoji = "🌟"; title = "Awesome work!"; }
    else if (pct >= 60) { emoji = "💪"; title = "Nice — keep going!"; }
    else { emoji = "📚"; title = "Good practice!"; }
    $("resultEmoji").textContent = emoji;
    $("resultTitle").textContent = title;

    const wrap = $("reviewWrap");
    wrap.innerHTML = "";
    if (missed.length) {
      const t = document.createElement("div");
      t.className = "review-title";
      t.textContent = "Worth another look:";
      wrap.appendChild(t);
      missed.slice(0, 8).forEach((m) => {
        const row = document.createElement("div");
        row.className = "review-row";
        row.innerHTML = `<span class="q">${m.w}</span><span class="a">${m.def}</span>`;
        wrap.appendChild(row);
      });
    }

    lastMissed = missed.slice();
    const rbtn = $("reviewBtn");
    if (lastMissed.length) { rbtn.hidden = false; rbtn.textContent = `Practice missed (${lastMissed.length})`; }
    else rbtn.hidden = true;

    store.bestPct = Math.max(store.bestPct, pct);
    store.bestStreak = Math.max(store.bestStreak, bestStreakRound);
    store.games += 1;
    const before = levelFromXp(store.xp);
    store.xp += roundXp;
    const after = levelFromXp(store.xp);
    saveStore();

    renderProfile(); renderMastery(); renderBestStrip(); reflectDifficulty();
    show("results");

    if (pct === 100) { burstConfetti(); playFanfare(); }
    else if (pct >= 80) burstConfetti();
    if (after > before) celebrateLevel(after);
    checkAchievements(pct);
  }

  // ===================================================================
  // ACHIEVEMENTS
  // ===================================================================
  function masteredCount() {
    let n = 0;
    for (const w in store.words) { const f = store.words[w]; if (f && f.s >= 2 && f.c / f.s >= 0.8) n++; }
    return n;
  }
  function award(id) {
    if (store.achievements[id]) return;
    store.achievements[id] = true; saveStore();
    const a = ACHIEVEMENTS[id];
    toast(a.emoji, "Achievement: " + a.name, a.desc);
    renderProfile();
  }
  function checkAchievements(pct) {
    if (pct === 100) award("first_perfect");
    if (pct >= 90) award("sharpshooter");
    if (bestStreakRound >= 10) award("streak_10");
    if (fastCorrect) award("speed_demon");
    if (store.totalCorrect >= 100) award("centurion");
    if (store.games >= 10) award("dedicated");
    if (tierCeiling() >= MAX_TIER) award("scholar");
    if (masteredCount() >= 250) award("wordsmith");
  }
  function celebrateLevel(lvl) {
    toast("✨", "Level " + lvl + "!", "Keep it up — XP unlocked", true);
    lvlBadge.classList.remove("bump"); void lvlBadge.offsetWidth; lvlBadge.classList.add("bump");
    burstConfetti();
    const ceiling = tierCeiling();
    if (1 + Math.floor((lvl - 1) / 2) === ceiling && ceiling > 1) {
      setTimeout(() => toast("🔓", `Tier ${ceiling} unlocked!`, `${TIER_NAMES[ceiling]} words are in play`), 500);
    }
  }

  // ===================================================================
  // BEST STRIP
  // ===================================================================
  function renderBestStrip() {
    if (!store.games) { bestStrip.textContent = `${ALL_WORDS.length.toLocaleString()} words ready — your first round awaits ✦`; return; }
    bestStrip.innerHTML =
      `🏅 Best <b>${store.bestPct}%</b> · 🔥 Top streak <b>${store.bestStreak}</b> · 🎮 <b>${store.games}</b> rounds · ✅ <b>${store.totalCorrect}</b> correct`;
  }

  // ===================================================================
  // FEEDBACK: sound, haptics, toasts, confetti
  // ===================================================================
  let audioCtx = null;
  function ensureAudio() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }
  function tone(ok) {
    try {
      const ac = ensureAudio();
      const now = ac.currentTime;
      const notes = ok ? [523.25, 659.25, 783.99] : [196, 155.56];
      notes.forEach((f, i) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = ok ? "triangle" : "sawtooth";
        osc.frequency.value = f;
        const t = now + i * 0.07;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.connect(gain).connect(ac.destination);
        osc.start(t); osc.stop(t + 0.2);
      });
    } catch {}
  }

  function playFanfare() {
    try {
      const ac = ensureAudio();
      const now = ac.currentTime;
      const master = ac.createGain();
      master.gain.value = 0.0001;
      master.gain.setValueAtTime(0.22, now);
      master.connect(ac.destination);

      const note = (f, t, d, type, vol) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type || "triangle";
        o.frequency.value = f;
        const s = now + t;
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(vol || 0.9, s + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, s + d);
        o.connect(g).connect(master);
        o.start(s); o.stop(s + d + 0.05);
      };

      const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G6 = 1568.0;
      const C4 = 261.63, G4 = 392.0;

      [[C5, 0.0, 0.18], [E5, 0.16, 0.18], [G5, 0.32, 0.18], [C6, 0.48, 0.42],
       [G5, 0.66, 0.34], [C6, 0.86, 0.7]].forEach(([f, t, d]) => note(f, t, d, "triangle", 0.85));
      [[E6, 0.48, 0.3], [G6, 0.86, 0.5]].forEach(([f, t, d]) => note(f, t, d, "square", 0.18));
      note(C4, 0.0, 0.5, "sawtooth", 0.5);
      note(G4, 0.5, 0.34, "sawtooth", 0.4);
      note(C4, 0.86, 0.85, "sawtooth", 0.55);
    } catch {}
  }

  function haptic(ok) {
    try { if (navigator.vibrate) navigator.vibrate(ok ? 15 : [25, 40, 25]); } catch {}
  }

  function toast(emoji, title, desc, levelup) {
    const el = document.createElement("div");
    el.className = "toast" + (levelup ? " levelup" : "");
    el.innerHTML = `<span class="t-emoji">${emoji}</span><span><b>${title}</b>${desc ? "<br><small>" + desc + "</small>" : ""}</span>`;
    toastWrap.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  const canvas = $("confetti");
  const ctx = canvas.getContext("2d");
  let confetti = [];
  let confettiRAF = null;
  function sizeCanvas() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
  }
  window.addEventListener("resize", sizeCanvas);
  sizeCanvas();

  function burstConfetti() {
    const colors = ["#6d5efc", "#b66bff", "#2ad6c8", "#ffce4f", "#2fd07a", "#ff5a7a"];
    const W = canvas.width;
    confetti = Array.from({ length: 140 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height * 0.3,
      vx: (Math.random() - 0.5) * 16 * devicePixelRatio,
      vy: (Math.random() * -14 - 4) * devicePixelRatio,
      g: 0.4 * devicePixelRatio,
      size: (Math.random() * 8 + 4) * devicePixelRatio,
      color: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1,
    }));
    if (!confettiRAF) animateConfetti();
  }
  function animateConfetti() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    confetti.forEach((p) => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.006;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });
    confetti = confetti.filter((p) => p.life > 0 && p.y < canvas.height + 50);
    if (confetti.length) confettiRAF = requestAnimationFrame(animateConfetti);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); confettiRAF = null; }
  }

  // ===================================================================
  // SCREEN HELPERS + WIRING
  // ===================================================================
  function show(name) {
    Object.values(screens).forEach((s) => s.classList.remove("is-active"));
    screens[name].classList.add("is-active");
    if (name === "setup") renderStreak();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  let flashTimer = null;
  function flash(el, msg) {
    el.textContent = msg;
    el.style.color = "var(--warn)";
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.style.color = ""; renderBestStrip(); }, 2200);
  }

  $("startBtn").addEventListener("click", () => startGame());
  $("againBtn").addEventListener("click", () => startGame());
  $("menuBtn").addEventListener("click", () => show("setup"));
  $("quitBtn").addEventListener("click", () => { stopTimer(); show("setup"); });

  function openCustomize() {
    if (customizeEl && customizeToggle && customizeEl.hasAttribute("hidden")) customizeToggle.click();
  }

  if (customizeToggle && customizeEl) {
    customizeToggle.addEventListener("click", () => {
      const open = customizeEl.hasAttribute("hidden");
      if (open) customizeEl.removeAttribute("hidden");
      else customizeEl.setAttribute("hidden", "");
      customizeToggle.setAttribute("aria-expanded", String(open));
      customizeToggle.classList.toggle("is-open", open);
      customizeToggle.textContent = open ? "⚙ Customize ▲" : "⚙ Customize";
    });
  }
  $("reviewBtn").addEventListener("click", () => {
    if (!lastMissed.length) return;
    const d = shuffle(lastMissed.map((m) => ({ w: m.w, pos: m.pos, def: m.def, ex: m.ex, tier: m.tier })));
    startGame(d);
  });

  document.addEventListener("keydown", (e) => {
    if (!screens.quiz.classList.contains("is-active")) return;
    if (settings.mode === "choice" && /^[1-4]$/.test(e.key)) {
      const b = choicesEl.children[+e.key - 1];
      if (b && !b.disabled) b.click();
    }
    if (settings.mode === "flip" && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      flashcard.click();
    }
  });

  // ---------- init ----------
  buildTierGrid();
  reflectDifficulty();
  reflectModeAndLength();
  renderProfile();
  renderMastery();
  renderBestStrip();
  renderStreak();
})();
