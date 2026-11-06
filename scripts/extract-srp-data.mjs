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
const LANG_FILE = path.join(
  projectRoot,
  "SRParasites-1.12.2v1.9.21",
  "assets",
  "srparasites",
  "lang",
  "en_us.lang"
);
const MATTER_FILE = path.join(projectRoot, "info", "mobs-that-matter.txt");
const OVERRIDES_FILE = path.join(projectRoot, "data", "mob-overrides.json");

const OUTPUT_JSON = path.join(projectRoot, "data", "srp-mobs.json");
const OUTPUT_CSV = path.join(projectRoot, "data", "srp-mobs.csv");
const OUTPUT_JS = path.join(projectRoot, "data", "srp-data.js");

const EXPECTED_MAX_DIMENSION_MULTIPLIER = 4;
const EPSILON = 1e-9;

// Config section/header IDs differ from in-game entity IDs for a few mobs in SRP 1.9.21 / this pack.
const CONFIG_ID_MAP = {
  beckon_si: "beckon_i",
  beckon_sii: "beckon_ii",
  beckon_siii: "beckon_iii",
  beckon_siv: "beckon_iv",
  crux: "cruxa",
  hostii: "herd",
  incompleteform_medium: "inhoom",
  incompleteform_small: "inhoos",
};

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function closeEnough(a, b) {
  return Math.abs(a - b) <= EPSILON;
}

function readText(filePath, label = "File") {
  if (!fs.existsSync(filePath)) fail(`${label} not found: ${filePath}`);
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

function parseLang(langText) {
  const names = new Map();
  for (const rawLine of langText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const prefix = "entity.srparasites.";
    const suffix = ".name=";
    if (!line.startsWith(prefix) || !line.includes(suffix)) continue;
    const eq = line.indexOf(suffix);
    const shortId = line.slice(prefix.length, eq);
    const name = line.slice(eq + suffix.length).trim();
    if (shortId && name) names.set(shortId, name);
  }
  return names;
}

function parseMatterList(matterText) {
  const ids = [];
  const seen = new Set();
  for (const match of matterText.matchAll(/srparasites:([a-z0-9_]+)/g)) {
    const shortId = match[1];
    if (seen.has(shortId)) continue;
    seen.add(shortId);
    ids.push(shortId);
  }
  assert(ids.length > 0, "mobs-that-matter.txt did not yield any srparasites entity IDs");
  return ids;
}

function parseOverrides(filePath, { ignore = false } = {}) {
  if (ignore || !fs.existsSync(filePath)) return new Map();
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    fail(`Could not parse mob overrides (${filePath}): ${e instanceof Error ? e.message : String(e)}`);
  }
  assert(raw && typeof raw === "object" && !Array.isArray(raw), "mob-overrides.json must be a JSON object keyed by mob id");
  const overrides = new Map();
  for (const [key, value] of Object.entries(raw)) {
    const fullId = key.startsWith("srparasites:") ? key : `srparasites:${key}`;
    assert(value && typeof value === "object" && !Array.isArray(value), `Override ${fullId} must be an object`);
    const baseHealth = Number(value.baseHealth);
    const healthMultiplier = value.healthMultiplier == null ? 1 : Number(value.healthMultiplier);
    assert(Number.isFinite(baseHealth) && baseHealth > 0, `Override ${fullId} has invalid baseHealth`);
    assert(Number.isFinite(healthMultiplier) && healthMultiplier > 0, `Override ${fullId} has invalid healthMultiplier`);
    overrides.set(fullId, {
      baseHealth,
      healthMultiplier,
      enabled: typeof value.enabled === "boolean" ? value.enabled : true,
      name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : null,
      reason: typeof value.reason === "string" && value.reason.trim() ? value.reason.trim() : null,
      source: typeof value.source === "string" && value.source.trim() ? value.source.trim() : "manual-override",
    });
  }
  return overrides;
}

function parseConfigHeaders(mobsText) {
  const headerRegex =
    /^# (srparasites:[a-z0-9_]+)[ \t]*\n#-+[^\n]*\n# ([^\n]*?)[ \t]*\n#\s+Base Health:\s*([0-9.]+)/gm;
  const headers = new Map();
  for (const match of mobsText.matchAll(headerRegex)) {
    const fullId = match[1];
    const shortId = fullId.replace("srparasites:", "");
    const name = match[2].trim();
    const baseHealth = Number(match[3]);
    assert(name.length > 0, `Mob ${fullId} has an empty display name`);
    assert(Number.isFinite(baseHealth) && baseHealth > 0, `Mob ${fullId} has invalid base health: ${match[3]}`);
    assert(!headers.has(shortId), `Duplicate mob header: ${fullId}`);
    headers.set(shortId, { shortId, fullId, headerName: name, baseHealth });
  }
  return headers;
}

function parseConfigSections(mobsText) {
  const sections = new Map();
  const sectionRegex = /^"(srparasites:[a-z0-9_]+)"\s*\{/gm;
  for (const match of mobsText.matchAll(sectionRegex)) {
    sections.set(match[1].replace("srparasites:", ""), { start: match.index + match[0].length });
  }
  const starts = [...sections.values()].map((s) => s.start).sort((a, b) => a - b);
  for (const [shortId, section] of sections) {
    const nextStart = starts.find((start) => start > section.start);
    section.body = mobsText.slice(section.start, nextStart ?? mobsText.length);
  }
  return sections;
}

function findMultiplier(body, patterns, context) {
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) {
      const value = Number(match[1]);
      assert(Number.isFinite(value) && value > 0, `${context} has invalid value: ${match[1]}`);
      return value;
    }
  }
  return null;
}

function resolveMob(shortId, { headers, sections, langNames, warnings, overrides }) {
  const fullId = `srparasites:${shortId}`;
  const override = overrides?.get(fullId);
  if (override) {
    return {
      id: fullId,
      name: override.name ?? langNames.get(shortId) ?? shortId,
      baseHealth: override.baseHealth,
      healthMultiplier: override.healthMultiplier,
      enabled: override.enabled,
      statsResolved: true,
      configSource: `${relative(OVERRIDES_FILE)}${override.reason ? ` (${override.reason})` : ""}`,
      override: true,
      overrideReason: override.reason ?? undefined,
      overrideSource: override.source,
    };
  }

  const name = langNames.get(shortId) ?? null;
  const isVariant = shortId.startsWith("pri_") || shortId.startsWith("ada_");

  if (isVariant) {
    const prefix = shortId.startsWith("pri_") ? "pri" : "ada";
    const baseKey = shortId.slice(prefix.length + 1);
    const header = headers.get(baseKey);
    const section = sections.get(baseKey);
    if (!header || !section) {
      warnings.push(`${fullId}: missing config section/header for base "${baseKey}" (variant unresolved)`);
      return unresolvedMob(fullId, name ?? shortId, `Missing config base section "${baseKey}" for ${prefix} variant`);
    }

    const displayName = name ?? (prefix === "pri" ? `Primitive ${header.headerName}` : `Adapted ${header.headerName}`);
    if (prefix === "pri") {
      const healthMultiplier = findMultiplier(
        section.body,
        [/Primitive [^"]*?Health Multiplier"=([0-9.]+)/, /Health Multiplier"=([0-9.]+)/],
        `${fullId} primitive health multiplier`
      );
      if (healthMultiplier == null) {
        warnings.push(`${fullId}: could not find Primitive Health Multiplier in section "${baseKey}"`);
        return unresolvedMob(fullId, displayName, `Missing Primitive Health Multiplier in config section "${baseKey}"`);
      }
      return {
        id: fullId,
        name: displayName,
        baseHealth: header.baseHealth,
        healthMultiplier,
        enabled: parseEnabled(section.body),
        statsResolved: true,
        configSource: `srparasites:${baseKey} (Primitive)`,
        variant: "primitive",
      };
    }

    const additionalHealth = findMultiplier(
      section.body,
      [/Stage Adapted additional Health"=([0-9.]+)/, /Adapted [^"]*?additional Health"=([0-9.]+)/],
      `${fullId} adapted additional health`
    );
    if (additionalHealth == null) {
      warnings.push(`${fullId}: could not find Stage Adapted additional Health in section "${baseKey}"`);
      return unresolvedMob(fullId, displayName, `Missing Stage Adapted additional Health in config section "${baseKey}"`);
    }
    const effectiveBase = header.baseHealth + additionalHealth;
    return {
      id: fullId,
      name: displayName,
      baseHealth: effectiveBase,
      healthMultiplier: 1,
      enabled: parseEnabled(section.body),
      statsResolved: true,
      configSource: `srparasites:${baseKey} (Adapted: base ${header.baseHealth} + additional ${additionalHealth})`,
      variant: "adapted",
      variantBaseHealth: header.baseHealth,
      adaptedAdditionalHealth: additionalHealth,
    };
  }

  const configKey = CONFIG_ID_MAP[shortId] ?? shortId;
  const header = headers.get(configKey);
  const section = sections.get(configKey);
  if (!header || !section) {
    warnings.push(`${fullId}: no config header/section found (config key tried: "${configKey}")`);
    return unresolvedMob(fullId, name ?? shortId, `Missing config stats (tried section "${configKey}")`);
  }

  const healthMultiplier = findMultiplier(
    section.body,
    [/Health Multiplier"=([0-9.]+)/],
    `${fullId} health multiplier`
  );
  if (healthMultiplier == null) {
    warnings.push(`${fullId}: could not find Health Multiplier in section "${configKey}"`);
    return unresolvedMob(fullId, name ?? header.headerName, `Missing Health Multiplier in config section "${configKey}"`);
  }

  return {
    id: fullId,
    name: name ?? header.headerName,
    baseHealth: header.baseHealth,
    healthMultiplier,
    enabled: parseEnabled(section.body),
    statsResolved: true,
    configSource: `srparasites:${configKey}`,
  };
}

function parseEnabled(body) {
  const match = body.match(/\bEnabled"=(true|false)/);
  return match ? match[1] === "true" : true;
}

function unresolvedMob(id, name, reason) {
  return {
    id,
    name,
    baseHealth: null,
    healthMultiplier: null,
    enabled: null,
    statsResolved: false,
    unresolvedReason: reason,
  };
}

function computeEffectiveHealth(mobs, dimensionHealthMultipliers) {
  const maxDimension = dimensionHealthMultipliers.find(
    (entry) => closeEnough(entry.multiplier, EXPECTED_MAX_DIMENSION_MULTIPLIER)
  );
  assert(maxDimension, `No dimension with a ${EXPECTED_MAX_DIMENSION_MULTIPLIER}x health multiplier was found`);

  return mobs.map((mob) => {
    if (!mob.statsResolved || mob.baseHealth == null || mob.healthMultiplier == null) {
      return {
        ...mob,
        effectiveHealthMax: null,
        effectiveHealthByDimension: Object.fromEntries(
          dimensionHealthMultipliers.map(({ dimension }) => [String(dimension), null])
        ),
      };
    }
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

function escapeCsv(value) {
  if (value == null) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
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
    "stats_resolved",
    "unresolved_reason",
    "effective_health_max",
    ...dimensions.map((dimension) => `effective_health_dim_${dimension}`),
  ];

  const rows = data.mobs.map((mob) => [
    mob.id,
    mob.name,
    mob.baseHealth,
    mob.healthMultiplier,
    mob.enabled,
    mob.statsResolved,
    mob.unresolvedReason ?? "",
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
  const keepOverrides = process.argv.includes("--keep-overrides");
  const resetOverrides = !keepOverrides; // regenerate resets manual overrides by default
  const mobsText = readText(MOBS_CONFIG, "Config file");
  const mixinsText = readText(MIXINS_CONFIG, "Config file");
  const langText = readText(LANG_FILE, "Lang file");
  const matterText = readText(MATTER_FILE, "Matter list");
  const overrides = parseOverrides(OVERRIDES_FILE, { ignore: resetOverrides });
  if (resetOverrides && fs.existsSync(OVERRIDES_FILE)) {
    fs.rmSync(OVERRIDES_FILE);
    console.log(`Reset overrides: removed ${relative(OVERRIDES_FILE)}`);
  }

  const { dimensionMultipliersEnabled, dimensionHealthMultipliers, maxDimensionMultiplier } =
    parseDimensionHealthMultipliers(mixinsText);
  const langNames = parseLang(langText);
  const matterIds = parseMatterList(matterText);
  const headers = parseConfigHeaders(mobsText);
  const sections = parseConfigSections(mobsText);

  const warnings = [];
  const resolvedMobs = [];
  for (const shortId of matterIds) {
    resolvedMobs.push(resolveMob(shortId, { headers, sections, langNames, warnings, overrides }));
  }
  const mobs = computeEffectiveHealth(resolvedMobs, dimensionHealthMultipliers);

  const unresolved = mobs.filter((mob) => !mob.statsResolved);
  const overriddenCount = mobs.filter((mob) => mob.override).length;
  const maxDimension = dimensionHealthMultipliers.find((entry) =>
    closeEnough(entry.multiplier, maxDimensionMultiplier)
  );

  const data = {
    generatedAt: new Date().toISOString(),
    sources: {
      mobs: relative(MOBS_CONFIG),
      srpmixins: relative(MIXINS_CONFIG),
      lang: relative(LANG_FILE),
      matterList: relative(MATTER_FILE),
      ...(overrides.size ? { overrides: relative(OVERRIDES_FILE) } : {}),
    },
    mobCount: mobs.length,
    resolvedMobCount: mobs.length - unresolved.length,
    unresolvedMobCount: unresolved.length,
    unresolvedMobIds: unresolved.map((mob) => mob.id),
    overriddenMobCount: overriddenCount,
    overriddenMobIds: mobs.filter((mob) => mob.override).map((mob) => mob.id),
    warnings,
    dimensionMultipliersEnabled,
    dimensionHealthMultipliers,
    maxDimensionMultiplier,
    maxDimension: maxDimension.dimension,
    mobs,
  };

  writeJson(data);
  writeCsv(data);
  writeJs(data);

  const resolved = mobs.filter((mob) => mob.statsResolved && mob.effectiveHealthMax != null);
  if (resolved.length > 0) {
    const maxHpMob = resolved.reduce((best, mob) =>
      mob.effectiveHealthMax > best.effectiveHealthMax ? mob : best
    );
    const minHpMob = resolved.reduce((best, mob) =>
      mob.effectiveHealthMax < best.effectiveHealthMax ? mob : best
    );
    console.log(`Highest max HP: ${maxHpMob.name} (${maxHpMob.id}) = ${maxHpMob.effectiveHealthMax} HP`);
    console.log(`Lowest max HP: ${minHpMob.name} (${minHpMob.id}) = ${minHpMob.effectiveHealthMax} HP`);
  }

  console.log(`Extracted ${mobs.length} mobs from ${relative(MATTER_FILE)} (resolved: ${data.resolvedMobCount}, unresolved: ${data.unresolvedMobCount}, overrides: ${data.overriddenMobCount}).`);
  if (unresolved.length > 0) {
    console.warn(`Unresolved mobs (missing config stats): ${unresolved.map((m) => m.id).join(", ")}`);
  }
  if (warnings.length > 0) {
    console.warn(`Warnings:\n- ${warnings.join("\n- ")}`);
  }
  console.log(
    `Dimension HP multipliers: ${dimensionHealthMultipliers
      .map((entry) => `${entry.dimension}=${entry.multiplier}x`)
      .join(", ")}`
  );
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
