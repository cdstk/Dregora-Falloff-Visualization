# SRP Damage Falloff Lab

An offline, browser-based visualizer for **Scape and Run: Parasites** mob health and
**hits-to-kill before vs. after damage falloff**, built for the **RLCraft Dregora v1.1.2b**
config pack.

The page answers one question: *how many extra hits does the falloff handler add for each
configurable SRP mob at a given pre-falloff hit damage?*

No server, build step, CDN, or framework is required. Open `index.html` directly.

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

This rewrites the three files in `data/` and prints the parsed mob count, dimension
multipliers, and highest/lowest effective-HP mobs.

---

## What the page shows

- **Falloff curve** — post-falloff damage or reduction % across 1–1000 pre-falloff damage.
- **Damage slider** — drives every hits-to-kill value, table row, and chart.
- **Mob table** — all 81 configurable mobs with base HP, per-mob HP multiplier,
  effective max HP, hits before/after, extra hits, and % increase.
- **Sorting and search** — by any numeric column, name, or ID.
- **Detail panel** — click a row or bar for:
  - the full HP breakdown (`base × mob multiplier × dimension multiplier`),
  - effective HP in every configured dimension,
  - a hits-to-kill curve before vs. after falloff.
- **Top-mob bar chart** — largest extra hits, hits after falloff, or effective HP.
- **CSV export** — exports the currently visible rows at the selected damage.

Default state: **100 pre-falloff damage**, sorted by effective max HP descending.

---

## Data sources

Only these two files are parsed:

| File | Purpose |
| --- | --- |
| `RLCraft Dregora v1.1.2b/overrides/config/srparasites/SRParasitesMobs.cfg` | Mob names, base health, per-mob health multipliers, enabled flags |
| `RLCraft Dregora v1.1.2b/overrides/config/srpmixins.cfg` | Dimension health multipliers and the global multiplier switch |

`SRParasites.cfg`, damage caps, AttributeFix, Scaling Health, and all other mods are
intentionally excluded.

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

### Dataset size

- **81** configurable mobs
- Per-mob health multipliers: **0.25× – 2.0×**
- Effective max HP range: **20 – 2,000**
- Highest: **Ancient Overlord** — `250 × 2.0 × 4 = 2,000 HP`
- Lowest: **Gnat** — `5 × 1.0 × 4 = 20 HP`
- Other examples:
  - Ancient Dreadnaut — `200 × 2.0 × 4 = 1,600 HP`
  - Draconite — `666 × 0.4 × 4 = 1,065.6 HP`

Because the per-mob multiplier stacks with the dimension multiplier, the theoretical
maximum is **8× base HP** (2.0 mob multiplier × 4.0 dimension multiplier).

---

## Calculations

### Effective health

```text
effective HP = base HP × per-mob health multiplier × dimension multiplier
```

The table’s “Effective HP (4×)” column always uses the maximum dimension multiplier.

### Damage falloff

Taken directly from `src/DamageFalloffHandler.java`:

```text
divisor = clamp(6/7 + damage / 140, 1, 3)
damage  = damage / divisor
```

The handler applies only when the true damage source is a player and runs at
`EventPriority.LOWEST`, after other damage modifications. The app therefore treats the
slider value as the **final pre-falloff hit damage**.

Reference values:

| Pre-falloff damage | Divisor | Post-falloff damage | Reduction |
| ---: | ---: | ---: | ---: |
| 20 | 1.000 | 20.00 | 0.0% |
| 50 | 1.214 | 41.18 | 17.6% |
| 100 | 1.571 | 63.64 | 36.4% |
| 200 | 2.286 | 87.50 | 56.3% |
| 300 | 3.000 | 100.00 | 66.7% |
| ≥300 | 3.000 | damage / 3 | 66.7% |

Damage at or below 20 is not reduced. At or above 300 the divisor is capped at 3×.

### Hits to kill

```text
exact hits  = HP / damage
hits to kill = max(1, ceil(exact hits - 1e-9))
```

The epsilon avoids floating-point rollover when HP is an exact multiple of the damage.
Hits are discrete damage applications, not seconds; attack cooldowns and DPS are not
modeled.

---

## Project layout

```text
falloff-visualization/
├── index.html                     # Page markup
├── styles.css                     # Dashboard styling
├── app.js                         # Charts, table, slider, detail, CSV export
├── package.json                   # npm run extract
├── data/
│   ├── srp-data.js                # Generated; embedded browser data (window.SRP_DATA)
│   ├── srp-mobs.json              # Generated; structured dataset
│   └── srp-mobs.csv               # Generated; inspection export
├── scripts/
│   └── extract-srp-data.mjs       # Config parser + validation + generators
├── src/
│   ├── DamageFalloffHandler.java  # Formula reference (not executed by the app)
│   └── Main.java
└── RLCraft Dregora v1.1.2b/
    └── overrides/config/…         # Source configs
```

### Data flow

```text
SRParasitesMobs.cfg ─┐
                     ├─→ scripts/extract-srp-data.mjs ─→ srp-mobs.json
srpmixins.cfg ───────┘                                 ├─→ srp-mobs.csv
                                                       └─→ srp-data.js
                                                              │
                                                              ▼
                                                         app.js + index.html
```

`index.html` loads `data/srp-data.js` as a plain script, so no local web server is needed.

---

## Extractor behavior and validation

`scripts/extract-srp-data.mjs` will fail loudly rather than emit a bad dataset. It checks:

- both config files exist;
- the mixin global multiplier switch is enabled;
- the dimension multiplier list exists, has no duplicate dimensions, and contains a 4× max;
- exactly **81** mob header blocks are present;
- every header has a matching config section and a valid `Health Multiplier`;
- no duplicate mob IDs;
- base health and multipliers are positive numbers;
- known sample mobs match expected values:
  - Ancient Dreadnaut: `200 × 2.0 × 4 → 1,600`
  - Ancient Overlord: `250 × 2.0 × 4 → 2,000`
  - Bogle: `310 × 0.6 × 4 → 744`
  - Draconite: `666 × 0.4 × 4 → 1,065.6`
  - Succor: `85 × 0.25 × 4 → 85`

### If the configs change

1. Edit the constants near the top of `scripts/extract-srp-data.mjs` if needed:
   - `EXPECTED_MOB_COUNT`
   - `EXPECTED_MAX_DIMENSION_MULTIPLIER`
   - `SANITY_SAMPLES`
2. Run `npm run extract`.
3. Refresh `index.html`.

The UI reads everything from the generated data, including mob count, dimension list,
max dimension, and generation timestamp. No app-code changes are needed for normal stat
or mob updates.

---

## Assumptions and limitations

- Only **player-caused damage** is subject to falloff.
- The damage input is the **final pre-falloff hit damage**; no armor, enchantments,
  critical hits, potions, or other reductions are modeled.
- No regeneration, healing, adaptation, damage caps, AttributeFix, Scaling Health, or
  other mods are modeled.
- Hits are damage instances, not a time-to-kill estimate.
- Only the current falloff handler is visualized; the older breakpoint mapping is not
  shown.
- The single effective-HP column uses the 4× dimension multiplier, not a dimension chosen
  by the user.
- Mob `Enabled` flags are extracted but all configurable mobs remain in the dataset, per
  the original requirement.

---

## Verification performed

- All **81** rows render from the two configs.
- Formula values match the current handler at `20`, `50`, `100`, `200`, `300`, and `1000`.
- Slider, numeric input, clamping (`1–1000`), reset, search, sorting, metric toggle, bar
  metric, detail panel, and Escape-to-close were exercised.
- CSV export produced a header plus 81 data rows with the expected dimensions and
  hits-to-kill columns.
- No runtime errors under headless Chrome at desktop and narrow viewport widths.
- Page has no horizontal overflow outside the intentional table scroll container.
