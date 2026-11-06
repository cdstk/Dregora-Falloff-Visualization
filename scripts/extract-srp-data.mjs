import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const MOBS_CONFIG = path.join(
  projectRoot,
  "RLCraft Dregora v1.1.2b",
  "overrides",
  "config",
  "srparasites",
  "SRParasitesMobs.cfg"
);
const MIXINS_CONFIG = path.join(
  projectRoot,
  "RLCraft Dregora v1.1.2b",
  "overrides",
  "config",
  "srpmixins.cfg"
);

const OUTPUT_JSON = path.join(projectRoot, "data", "srp-mobs.json");
const OUTPUT_CSV = path.join(projectRoot, "data", "srp-mobs.csv");
const OUTPUT_JS = path.join(projectRoot, "data", "srp-data.js");

const EXPECTED_MOB_COUNT = 81;
const EXPECTED_MAX_DIMENSION_MULTIPLIER = 4;
const EPSILON = 1e-9;

const SANITY_SAMPLES = [
  { id: "srparasites:anc_dreadnaut", baseHealth: 200, healthMultiplier: 2, effectiveHealthMax: 1600 },
  { id: "srparasites:anc_overlord", baseHealth: 250, healthMultiplier: 2, effectiveHealthMax: 2000 },
  { id: "srparasites:bogle", baseHealth: 310, healthMultiplier: 0.6, effectiveHealthMax: 744 },
  { id: "srparasites:draconite", baseHealth: 666, healthMultiplier: 0.4, effectiveHealthMax: 1065.6 },
  { id: "srparasites:succor", baseHealth: 85, healthMultiplier: 0.25, effectiveHealthMax: 85 },
];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function closeEnough(a, b) {
  return Math.abs(a - b) <= EPSILON;
}

function readConfig(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Config file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function relative(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function parseDimensionHealthMultipliers(mixinsText) {
  const switchMatch = mixinsText.match(
    /Parasite Stat\+Drop Multiplier: Global switch"=(true|false)/
  );
  assert(switchMatch, 'Could not find "Parasite Stat+Drop Multiplier: Global switch" in srpmixins.cfg');
  const dimensionMultipliersEnabled = switchMatch[1] === "true";
  assert(
    dimensionMultipliersEnabled,
    'srpmixins.cfg has "Parasite Stat+Drop Multiplier: Global switch"=false; dimension health multipliers are disabled.'
  );

  const blockMatch = mixinsText.match(
    /S:"Parasite Health Multipliers"\s*<([\s\S]*?)>/
  );
  assert(blockMatch, 'Could not find "Parasite Health Multipliers" list in srpmixins.cfg');

  const entries = [];
  for (const rawLine of blockMatch[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split(",").map((part) => part.trim());
    assert(parts.length >= 2, `Invalid Parasite Health Multipliers line: "${rawLine}"`);

    const dimension = Number(parts[0]);
    const multiplier = Number(parts[1]);

    assert(Number.isFinite(dimension), `Invalid dimension in line: "${rawLine}"`);
    assert(Number.isFinite(multiplier) && multiplier > 0, `Invalid multiplier in line: "${rawLine}"`);

    entries.push({ dimension, multiplier });
  }

  assert(entries.length > 0, "Parasite Health Multipliers list is empty");

  const seen = new Set();
  for (const entry of entries) {
    assert(!seen.has(entry.dimension), `Duplicate dimension in Parasite Health Multipliers: ${entry.dimension}`);
    seen.add(entry.dimension);
  }

  entries.sort((a, b) => a.dimension - b.dimension);

  const maxMultiplier = Math.max(...entries.map((entry) => entry.multiplier));
  assert(
    closeEnough(maxMultiplier, EXPECTED_MAX_DIMENSION_MULTIPLIER),
    `Expected max dimension health multiplier ${EXPECTED_MAX_DIMENSION_MULTIPLIER}x, found ${maxMultiplier}x`
  );

  return {
    dimensionMultipliersEnabled,
    dimensionHealthMultipliers: entries,
    maxDimensionMultiplier: maxMultiplier,
  };
}

function parseMobs(mobsText) {
  const headerRegex =
    /^# (srparasites:[a-z0-9_]+)[ \t]*\n#-+[^\n]*\n# ([^\n]*?)[ \t]*\n#\s+Base Health:\s*([0-9.]+)/gm;

  const headerMatches = [...mobsText.matchAll(headerRegex)];
  assert(
    headerMatches.length === EXPECTED_MOB_COUNT,
    `Expected ${EXPECTED_MOB_COUNT} mob header blocks in SRParasitesMobs.cfg, found ${headerMatches.length}`
  );

  const sectionRegex = /^"(srparasites:[a-z0-9_]+)"\s*\{/gm;
  const sections = new Map();
  for (const match of mobsText.matchAll(sectionRegex)) {
    const id = match[1];
    const start = match.index;
    const bodyStart = start + match[0].length;
    sections.set(id, { start: bodyStart });
  }

  const sortedSectionStarts = [...sections.values()]
    .map((section) => section.start)
    .sort((a, b) => a - b);

  const mobs = [];
  const seenIds = new Set();

  for (const match of headerMatches) {
    const id = match[1];
    const name = match[2].trim();
    const baseHealth = Number(match[3]);

    assert(!seenIds.has(id), `Duplicate mob id: ${id}`);
    seenIds.add(id);

    assert(name.length > 0, `Mob ${id} has an empty display name`);
    assert(Number.isFinite(baseHealth) && baseHealth > 0, `Mob ${id} has invalid base health: ${match[3]}`);

    const section = sections.get(id);
    assert(section, `Found a header for ${id} but no matching config section`);

    const nextStart = sortedSectionStarts.find((start) => start > section.start);
    const body = mobsText.slice(section.start, nextStart ?? mobsText.length);

    const multiplierMatch = body.match(/Health Multiplier"=([0-9.]+)/);
    assert(multiplierMatch, `Could not find a Health Multiplier for ${id}`);
    const healthMultiplier = Number(multiplierMatch[1]);
    assert(
      Number.isFinite(healthMultiplier) && healthMultiplier > 0,
      `Mob ${id} has invalid health multiplier: ${multiplierMatch[1]}`
    );

    const enabledMatch = body.match(/Enabled"=(true|false)/);
    const enabled = enabledMatch ? enabledMatch[1] === "true" : true;

    mobs.push({
      id,
      name,
      baseHealth,
      healthMultiplier,
      enabled,
    });
  }

  return mobs;
}

function computeEffectiveHealth(mobs, dimensionHealthMultipliers) {
  const maxDimension = dimensionHealthMultipliers.find(
    (entry) => closeEnough(entry.multiplier, EXPECTED_MAX_DIMENSION_MULTIPLIER)
  );
  assert(maxDimension, `No dimension with a ${EXPECTED_MAX_DIMENSION_MULTIPLIER}x health multiplier was found`);

  return mobs.map((mob) => {
    const effectiveHealthByDimension = {};
    for (const { dimension, multiplier } of dimensionHealthMultipliers) {
      effectiveHealthByDimension[String(dimension)] = mob.baseHealth * mob.healthMultiplier * multiplier;
    }

    return {
      ...mob,
      effectiveHealthMax: mob.baseHealth * mob.healthMultiplier * maxDimension.multiplier,
      effectiveHealthByDimension,
    };
  });
}

function validateSamples(mobs) {
  const byId = new Map(mobs.map((mob) => [mob.id, mob]));

  for (const sample of SANITY_SAMPLES) {
    const mob = byId.get(sample.id);
    assert(mob, `Sanity check failed: ${sample.id} was not parsed`);

    const values = [
      ["base health", mob.baseHealth, sample.baseHealth],
      ["health multiplier", mob.healthMultiplier, sample.healthMultiplier],
      ["effective max health", mob.effectiveHealthMax, sample.effectiveHealthMax],
    ];

    for (const [label, actual, expected] of values) {
      assert(
        closeEnough(actual, expected),
        `Sanity check failed for ${sample.id}: expected ${label} ${expected}, found ${actual}`
      );
    }
  }
}

function escapeCsv(value) {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function writeJson(data) {
  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeCsv(data) {
  const dimensions = data.dimensionHealthMultipliers.map((entry) => entry.dimension);
  const header = [
    "id",
    "name",
    "base_health",
    "health_multiplier",
    "enabled",
    "effective_health_max",
    ...dimensions.map((dimension) => `effective_health_dim_${dimension}`),
  ];

  const rows = data.mobs.map((mob) => [
    mob.id,
    mob.name,
    mob.baseHealth,
    mob.healthMultiplier,
    mob.enabled,
    mob.effectiveHealthMax,
    ...dimensions.map((dimension) => mob.effectiveHealthByDimension[String(dimension)]),
  ]);

  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
  fs.mkdirSync(path.dirname(OUTPUT_CSV), { recursive: true });
  fs.writeFileSync(OUTPUT_CSV, `${csv}\n`, "utf8");
}

function writeJs(data) {
  const js = `// Generated by scripts/extract-srp-data.mjs. Do not edit by hand.\nwindow.SRP_DATA = ${JSON.stringify(data, null, 2)};\n`;
  fs.mkdirSync(path.dirname(OUTPUT_JS), { recursive: true });
  fs.writeFileSync(OUTPUT_JS, js, "utf8");
}

function main() {
  const mobsText = readConfig(MOBS_CONFIG);
  const mixinsText = readConfig(MIXINS_CONFIG);

  const { dimensionMultipliersEnabled, dimensionHealthMultipliers, maxDimensionMultiplier } =
    parseDimensionHealthMultipliers(mixinsText);

  const parsedMobs = parseMobs(mobsText);
  const mobs = computeEffectiveHealth(parsedMobs, dimensionHealthMultipliers);
  validateSamples(mobs);

  const maxDimension = dimensionHealthMultipliers.find((entry) =>
    closeEnough(entry.multiplier, maxDimensionMultiplier)
  );

  const data = {
    generatedAt: new Date().toISOString(),
    sources: {
      mobs: relative(MOBS_CONFIG),
      srpmixins: relative(MIXINS_CONFIG),
    },
    mobCount: mobs.length,
    dimensionMultipliersEnabled,
    dimensionHealthMultipliers,
    maxDimensionMultiplier,
    maxDimension: maxDimension.dimension,
    mobs,
  };

  writeJson(data);
  writeCsv(data);
  writeJs(data);

  const maxHpMob = mobs.reduce((best, mob) =>
    mob.effectiveHealthMax > best.effectiveHealthMax ? mob : best
  );
  const minHpMob = mobs.reduce((best, mob) =>
    mob.effectiveHealthMax < best.effectiveHealthMax ? mob : best
  );

  console.log(`Extracted ${mobs.length} SRP mobs from 2 config files.`);
  console.log(
    `Dimension HP multipliers: ${dimensionHealthMultipliers
      .map((entry) => `${entry.dimension}=${entry.multiplier}x`)
      .join(", ")}`
  );
  console.log(`Highest max HP: ${maxHpMob.name} (${maxHpMob.id}) = ${maxHpMob.effectiveHealthMax} HP`);
  console.log(`Lowest max HP: ${minHpMob.name} (${minHpMob.id}) = ${minHpMob.effectiveHealthMax} HP`);
  console.log(`Wrote ${relative(OUTPUT_JSON)}`);
  console.log(`Wrote ${relative(OUTPUT_CSV)}`);
  console.log(`Wrote ${relative(OUTPUT_JS)}`);
}

try {
  main();
} catch (error) {
  console.error(`\nExtraction failed:\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
