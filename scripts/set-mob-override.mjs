import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const OVERRIDES_FILE = path.join(projectRoot, "data", "mob-overrides.json");

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function usage() {
  console.log(`Usage:
  node scripts/set-mob-override.mjs <mob_id> --base-health <n> [--health-multiplier <n>] [--name "..."] [--enabled true|false] [--reason "..."] [--no-extract]
  node scripts/set-mob-override.mjs <mob_id> --remove [--no-extract]

Examples:
  node scripts/set-mob-override.mjs carrier_light --base-health 30 --health-multiplier 1 --reason "manual (missing config section)"
  npm run set-mob -- carrier_light --base-health 30 --health-multiplier 1

Notes:
  - mob_id may be "carrier_light" or "srparasites:carrier_light".
  - Overrides are saved to data/mob-overrides.json and applied by scripts/extract-srp-data.mjs.
  - By default this re-runs extraction with --keep-overrides so the new override is applied.
  - "npm run extract" resets overrides by default (regenerates from config).`);
}

function parseArgs(argv) {
  const args = { id: null, remove: false, extract: true, enabled: true };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { usage(); process.exit(0); }
    else if (a === "--remove") args.remove = true;
    else if (a === "--no-extract") args.extract = false;
    else if (a === "--base-health") args.baseHealth = argv[++i];
    else if (a === "--health-multiplier") args.healthMultiplier = argv[++i];
    else if (a === "--name") args.name = argv[++i];
    else if (a === "--reason" || a === "--note") args.reason = argv[++i];
    else if (a === "--enabled") args.enabled = argv[++i];
    else if (a.startsWith("--")) fail(`Unknown option: ${a}`);
    else positional.push(a);
  }
  args.id = positional[0];
  return args;
}

function normalizeId(id) {
  if (!id) return null;
  return id.startsWith("srparasites:") ? id : `srparasites:${id}`;
}

function loadOverrides() {
  if (!fs.existsSync(OVERRIDES_FILE)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) fail("data/mob-overrides.json must be a JSON object");
    return data;
  } catch (e) {
    fail(`Could not read ${path.relative(projectRoot, OVERRIDES_FILE)}: ${e.message}`);
  }
}

function saveOverrides(overrides) {
  const sorted = Object.fromEntries(Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(path.dirname(OVERRIDES_FILE), { recursive: true });
  fs.writeFileSync(OVERRIDES_FILE, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

const args = parseArgs(process.argv.slice(2));
if (!args.id) { usage(); fail("Missing <mob_id>"); }
const fullId = normalizeId(args.id);
const overrides = loadOverrides();

if (args.remove) {
  if (!overrides[fullId]) {
    console.log(`No override found for ${fullId}.`);
  } else {
    delete overrides[fullId];
    saveOverrides(overrides);
    console.log(`Removed override for ${fullId} -> ${path.relative(projectRoot, OVERRIDES_FILE)}`);
  }
} else {
  const baseHealth = Number(args.baseHealth);
  if (!Number.isFinite(baseHealth) || baseHealth <= 0) fail("--base-health must be a positive number");
  const healthMultiplier = args.healthMultiplier == null ? 1 : Number(args.healthMultiplier);
  if (!Number.isFinite(healthMultiplier) || healthMultiplier <= 0) fail("--health-multiplier must be a positive number");
  let enabled = true;
  if (typeof args.enabled === "string") {
    if (["true", "1", "yes"].includes(args.enabled.toLowerCase())) enabled = true;
    else if (["false", "0", "no"].includes(args.enabled.toLowerCase())) enabled = false;
    else fail("--enabled must be true or false");
  }
  const entry = {
    baseHealth,
    healthMultiplier,
    enabled,
    ...(args.name ? { name: args.name } : {}),
    ...(args.reason ? { reason: args.reason } : {}),
    source: "manual-override",
  };
  overrides[fullId] = entry;
  saveOverrides(overrides);
  console.log(`Saved override for ${fullId}: baseHealth=${baseHealth}, healthMultiplier=${healthMultiplier}`);
  console.log(` -> ${path.relative(projectRoot, OVERRIDES_FILE)}`);
}

if (args.extract) {
  console.log("\nRunning extract...");
  const r = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "extract-srp-data.mjs"), "--keep-overrides"], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}
