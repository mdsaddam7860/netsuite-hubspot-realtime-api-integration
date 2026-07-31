// test-sync-manual.js
// Run manually: node test-sync-manual.js
// Lets you trigger NS->HS and HS->NS on demand instead of waiting for the 6h cron.
import "./bootstrap.js";
import { netsuiteToHubspot } from "./src/services/netsuite.service.js";
import {
  syncHubspotContactsToNetsuite,
  syncHubspotCompaniesToNetsuite,
} from "./src/services/hubspotToNetsuite.service.js";

const direction = process.argv[2]; // "ns2hs" | "hs2ns" | "both"

async function run() {
  if (direction === "ns2hs" || direction === "both") {
    console.log("=== Running NetSuite -> HubSpot ===");
    await netsuiteToHubspot();
  }
  if (direction === "hs2ns" || direction === "both") {
    console.log("=== Running HubSpot -> NetSuite ===");
    await syncHubspotContactsToNetsuite();
    await syncHubspotCompaniesToNetsuite();
  }
  console.log("Done.");
}

run().catch((e) => {
  console.error("Manual sync failed:", e);
  process.exit(1);
});
