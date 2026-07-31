// diff-sync.js
// Human-readable helper for verifying 2-way sync during manual testing.
//
// Usage:
//   node diff-sync.js status
//     -> prints checkpoint files + sync-state.json in readable form
//
//   node diff-sync.js compare --type contact --ns 12345 --hs 67890111
//   node diff-sync.js compare --type company --ns 12345 --hs 67890111
//     -> fetches the live record from both sides and prints a side-by-side
//        diff of the fields that matter for loop-guard verification
//
import "./bootstrap.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getHubspotClient } from "./src/configs/hubspot.config.js";
import { fetchCustomerById } from "./src/services/netsuite.service.js";
import { getSyncStateStore } from "./src/utils/syncStateStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SYNC_STATE_PATH = path.join(
  __dirname,
  "src",
  "utils",
  "data",
  "sync-state.json"
);
const CHECKPOINTS = {
  contacts: path.join(__dirname, "checkpoints", "hs_contacts.json"),
  companies: path.join(__dirname, "checkpoints", "hs_companies.json"),
};

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function fmt(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toISOString();
}

// ---------------------------------------------------------------------------
// status mode
// ---------------------------------------------------------------------------
function printStatus() {
  console.log("\n=== Checkpoints (HS -> NS delta cursors) ===");
  for (const [name, file] of Object.entries(CHECKPOINTS)) {
    const cp = readJsonSafe(file);
    console.log(
      `${name.padEnd(10)} lastModified: ${fmt(cp?.lastModified)}  ranAt: ${fmt(
        cp?.ranAt
      )}`
    );
  }

  console.log("\n=== Sync state (NS records we last wrote to from HS) ===");
  const state = readJsonSafe(SYNC_STATE_PATH);
  if (!state || Object.keys(state).length === 0) {
    console.log("(empty - no HS -> NS writes stamped yet)");
    return;
  }
  const rows = Object.entries(state)
    .sort((a, b) => new Date(b[1].ns_last_synced_at) - new Date(a[1].ns_last_synced_at))
    .slice(0, 25); // most recent 25, so this doesn't scroll forever
  for (const [nsId, s] of rows) {
    console.log(
      `nsId=${String(nsId).padEnd(10)} last_direction=${(
        s.last_direction || "-"
      ).padEnd(8)} ns_last_synced_at=${fmt(s.ns_last_synced_at)}`
    );
  }
  if (Object.keys(state).length > 25) {
    console.log(`... and ${Object.keys(state).length - 25} more`);
  }
}

// ---------------------------------------------------------------------------
// compare mode
// ---------------------------------------------------------------------------
async function printCompare({ type, nsId, hsId }) {
  if (!nsId || !hsId || !type) {
    console.error("Usage: node diff-sync.js compare --type contact|company --ns <nsId> --hs <hsId>");
    process.exit(1);
  }

  const hs_client = getHubspotClient();
  const nsRecord = await fetchCustomerById(nsId);
  const hsRecord =
    type === "contact"
      ? await hs_client.contacts.getContact(hsId, [
          "lastmodifieddate",
          "sourceid",
          "ns_last_synced_at",
        ])
      : await hs_client.companies.getCompany(hsId, [
          "hs_lastmodifieddate",
          "sourceid",
          "ns_last_synced_at",
        ]);

  const store = getSyncStateStore();
  const stateEntry = await store.get(nsId);

  console.log(`\n=== NetSuite (id=${nsId}) ===`);
  console.log(`lastmodifieddate:     ${fmt(nsRecord?.lastmodifieddate)}`);

  console.log(`\n=== HubSpot (id=${hsId}, type=${type}) ===`);
  const hsProps = hsRecord?.properties || {};
  console.log(`sourceid:             ${hsProps.sourceid ?? "-"}`);
  console.log(
    `lastmodifieddate:     ${fmt(
      type === "contact" ? hsProps.lastmodifieddate : hsProps.hs_lastmodifieddate
    )}`
  );
  console.log(`ns_last_synced_at:    ${fmt(hsProps.ns_last_synced_at)}`);

  console.log(`\n=== Local loop-guard state for nsId=${nsId} ===`);
  if (!stateEntry) {
    console.log("(none - this NS record has never been stamped by an HS -> NS write)");
  } else {
    console.log(`last_direction:       ${stateEntry.last_direction}`);
    console.log(`ns_last_synced_at:    ${fmt(stateEntry.ns_last_synced_at)}`);
  }

  console.log("\n=== Verdict ===");
  if (String(hsProps.sourceid) !== String(nsId)) {
    console.log("⚠️  sourceid on the HubSpot record does not match the NetSuite id you passed in - check you're comparing the right pair.");
  } else {
    console.log("✅ sourceid matches - this is a genuinely linked pair.");
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    out[key] = argv[i + 1];
  }
  return out;
}

const [, , mode, ...rest] = process.argv;

(async () => {
  if (mode === "status") {
    printStatus();
  } else if (mode === "compare") {
    const args = parseArgs(rest);
    await printCompare({ type: args.type, nsId: args.ns, hsId: args.hs });
  } else {
    console.log("Usage:");
    console.log("  node diff-sync.js status");
    console.log("  node diff-sync.js compare --type contact|company --ns <nsId> --hs <hsId>");
  }
})().catch((e) => {
  console.error("diff-sync failed:", e.message);
  process.exit(1);
});
