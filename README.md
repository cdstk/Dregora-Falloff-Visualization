# SRP Damage Falloff Lab

An offline, browser-based visualizer for **Scape and Run: Parasites** mob health and
**hits-to-kill before vs. after damage falloff**, built for the **RLCraft Dregora v1.1.2b**
config pack.

The page answers one question: *how many extra hits does the falloff handler add for each
relevant SRP mob at a given pre-falloff hit damage?*

No server, build step, CDN, or framework is required. Open `index.html` directly.

## Disclaimer

This project was **written with AI assistance** to create a visual for SRP damage falloff / hits-to-kill analysis. **All mob stat data is derived from and verified against the modpack’s configuration files** (`SRParasitesMobs.cfg` / `srpmixins.cfg`, plus SRP 1.9.21 lang and the curated `mobs-that-matter.txt` scope) and is intended to reflect in-game values for RLCraft Dregora v1.1.2b. Any entry with missing config data is **explicitly marked** in the dataset/UI rather than guessed. The falloff formula and modeled assumptions (player-caused damage only; no armor, crits, regen, adaptation, damage caps, or other mods) are documented below.

---

## Quick start

### View the visual

Open `index.html` in a modern browser (works via `file://`).

### Regenerate the data

```powershell
npm run extract
```

or:

```powershell
node scripts/extract-srp-data.mjs
```

This rewrites the three files in `data/` and prints the parsed mob count, resolved/unresolved
counts, warnings, dimension multipliers, and highest/lowest effective-HP mobs.

---

## What the page shows

- **Falloff curve** — post-falloff damage or reduction % across 1–1000 pre-falloff damage.
- **Damage slider** — drives every hits-to-kill value, table row, and chart.
- **Mob table** — mobs from `info/mobs-that-matter.txt` with base HP, per-mob/variant HP handling,
  effective max HP, hits before/after, extra hits, and % increase. Mobs with **missing config stats**
  are clearly marked and excluded from numeric hit calculations/totals (so outliers can be fixed in post).
- **Sorting and search** — by any numeric column, name, or ID.
- **Detail panel** — click a row or bar for:
  - the full HP breakdown (`base × mob/variant multiplier × dimension multiplier`) when resolved,
  - effective HP in every configured dimension,
  - a hits-to-kill curve before vs. after falloff,
  - or a clear “missing config stats” notice for unresolved matter-list mobs.
- **Top-mob bar chart** — largest extra hits, hits after falloff, or effective HP (resolved mobs).
- **CSV export** — exports the currently visible rows at the selected damage, including
  `stats_resolved` / `unresolved_reason` columns.

Default state: **100 pre-falloff damage**, sorted by effective max HP descending.

---

## Data sources

The extractor uses these sources:

| File | Purpose |
| --- | --- |
| `RLCraft Dregora v1.1.2b/overrides/config/srparasites/SRParasitesMobs.cfg` | **Source of truth** for mob base health, health multipliers / variant health values, enabled flags |
| `RLCraft Dregora v1.1.2b/overrides/config/srpmixins.cfg` | Dimension health multipliers and the global multiplier switch |
| `SRParasites-1.12.2v1.9.21/assets/srparasites/lang/en_us.lang` | Display names / in-game entity ID mapping (SRP 1.9.21 lang; config naming differs for some IDs) |
| `info/mobs-that-matter.txt` | **Canonical in-game mob scope** — only these SRP mobs are included in the dataset |

`SRParasites.cfg`, damage caps, AttributeFix, Scaling Health, and all other mods are
intentionally excluded. The SRP wiki is **not** used as a data source (it reflects newer SRP versions).

### Parsed dimension multipliers

| Dimension ID | Multiplier |
| ---: | ---: |
| -1 | 1.0× |
| 0 | 1.5× |
| 1 | 1.0× |
| 3 | 3.0× |
| 111 | 4.0× |

The UI uses the **maximum** multiplier (4×) for the single effective-HP column. The detail
panel shows every dimension.

### ID / variant mapping notes (SRP 1.9.21 config quirks)

Some in-game entity IDs in the matter list use different IDs in `SRParasitesMobs.cfg`. The
extractor maps them explicitly (config-first for stats):

- `beckon_si/sii/siii/siv` → `beckon_i/ii/iii/iv`
- `crux` → `cruxa`
- `hostii` (Herd) → `herd`
- `incompleteform_medium/small` → `inhoom/inhoos`
- `pri_*` / `ada_*` variants are resolved from their base config sections (e.g. `arachnida`)
  using the Primitive health multiplier / Adapted additional-health values present in that config.

If a matter-list mob has no resolvable config stats (e.g. `carrier_light` has no health
section in this pack’s `SRParasitesMobs.cfg`), it is still included in the output and UI but
marked **Missing config** with `statsResolved=false` and an `unresolvedReason`.

---

## Damage falloff formula

The visualizer uses the handler described in the project:

```text
divisor = clamp(6/7 + damage/140, 1, 3)
damageAfter = damage / divisor
```

Behavior:

| Pre-falloff damage | Divisor | Result |
| ---: | ---: | --- |
| ≤ 20 | 1.0 | No reduction |
| 100 | ~1.571 | ~63.6 damage (**36.4%** reduction) |
| 300 | 3.0 | 100 damage (**66.7%** reduction) |
| > 300 | 3.0 (cap) | One third damage |

Hits-to-kill is computed as:

```text
hits = ceil(effectiveHP / damagePerHit)
```

Both before-falloff and after-falloff hits use this ceiling, so the table reflects actual
hit counts rather than fractional estimates.

---

## Project layout

```text
.
├── index.html                # Visualization entry point
├── styles.css                # Page and chart styles
├── app.js                    # Rendering, controls, charts, detail panel, CSV export
├── data/
│   ├── srp-mobs.json         # Generated mob + dimension data
│   ├── srp-mobs.csv          # Flat export of the same mob data
│   └── srp-data.js           # Browser-loadable `window.SRP_DATA = ...`
├── info/
│   ├── mobs-that-matter.txt  # Canonical in-game SRP mob list (dataset scope)
│   └── loaded-mobs.txt       # Broader loaded mob reference
├── scripts/
│   └── extract-srp-data.mjs  # Config + lang + matter-list parser / generator
├── SRParasites-1.12.2v1.9.21/ # SRP jar contents used for lang mapping
└── RLCraft Dregora v1.1.2b/
    └── overrides/config/
        ├── srparasites/SRParasitesMobs.cfg
        └── srpmixins.cfg
```

---

## Extending

- **Adjust the falloff formula:** edit `divisor` / `afterFalloff` in `app.js` and the formula
  card in `index.html`.
- **Add mobs to scope:** update `info/mobs-that-matter.txt`, then run `npm run extract`.
- **Fix unresolved outliers:** add/correct config mapping or variant handling in
  `scripts/extract-srp-data.mjs` (config-first), then regenerate.
- **Change the target modpack:** update the config/lang/matter-list paths in
  `scripts/extract-srp-data.mjs` and regenerate.
