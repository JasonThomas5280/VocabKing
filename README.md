# ✦ VocabKing — SAT/GRE Vocabulary Flashcards

A beautiful, zero-dependency vocabulary flashcards web app. Practice **thousands
of curated SAT, GRE, and beyond** words — chosen to be genuinely usable in
everyday conversation — across three engaging modes. The words get **harder as
you level up**, so the challenge grows with you.

## Run it

No build step, no install. Just open the file:

```bash
open index.html        # macOS
xdg-open index.html    # Linux
```

Or serve it (recommended so fonts/audio behave on all browsers):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Features

- **Three modes**
  - 🎯 **Multiple Choice** — see the word, pick the right meaning (or press `1`–`4`)
  - ⌨️ **Type It** — see the meaning, type the word
  - 🃏 **Flip Cards** — self-check; tap to reveal the definition + an example
    sentence (or press `Space`)
- **One-tap Quick Play** — the home screen starts a round instantly using your
  last settings; all configuration is tucked behind an optional **⚙ Customize**
- **🎚️ Difficulty that scales with you** — words are organized into 6 tiers
  (Everyday+ · SAT · SAT+ · GRE · GRE+ · Elite). In the default **Auto** mode the
  active band slides upward as you earn XP and level up, so cards get steadily
  harder the further you go. Prefer to drive yourself? Switch Auto off and pick
  any tiers manually.
- **Adaptive practice** — tracks accuracy per word and weights each round toward
  your weak/unseen words. A live **Mastery %** shows progress across the active
  tiers, and **⚡ My tricky words** builds a round from your weakest words.
- **🔥 Daily streak** — a day-over-day streak with a **streak-freeze** (earned
  every 5 days) that covers one missed day, plus a **daily goal** (10 correct).
- **🎺 Victory fanfare** — a triumphant melody (Web Audio) plays on a perfect
  score; harder words are worth more points.
- **Progression**
  - ✨ **XP + levels** with a level-up celebration and tier-unlock toasts
  - 🏅 **Achievements** — Flawless, Sharpshooter, On a Roll, Quick Wit,
    Centurion, Bookworm, Scholar, Wordsmith
- **Engaging UX** — animated 3D card flips, shake-on-wrong, glow-on-right,
  streak meter with score + speed bonuses, confetti, sound effects, and 📳 haptic
  feedback on supported phones; live progress bar and per-card timing; toasts.
- **Results screen** — accuracy, best streak, avg time per card, a "worth another
  look" list, and a one-tap **Practice missed** replay.
- **Remembers everything** — points, level, per-word mastery, streak, and your
  setup via `localStorage`.
- **Responsive** and touch-friendly — works great on phones.

## Word list

The vocabulary lives in `words.js` as a single array. Each entry:

```js
{ w: "candid", pos: "adj", def: "honest and direct, even when blunt",
  ex: "I'll be candid with you — the plan needs work.", tier: 1 }
```

Words are curated to be **SAT/GRE-and-above but still usable in real
conversation** — no archaic, museum-piece words. The list is easy to extend: add
more objects (with a `tier` from 1–6) and they're picked up automatically. The
per-tier source batches live under `data/`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup for the three screens (setup / quiz / results) |
| `styles.css` | All styling, animations, and the aurora background |
| `app.js` | Game logic — deck building, modes, scoring, difficulty scaling, confetti, persistence |
| `words.js` | The curated word list (`window.WORDS`) |
| `data/` | Per-tier source batches the word list is built from |

All vanilla HTML/CSS/JS. No frameworks, no network calls (fonts load from Google
Fonts but the app works offline without them).
