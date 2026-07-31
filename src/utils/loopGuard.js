import { getSyncStateStore } from "./syncStateStore.js";
const ECHO_BUFFER_MS = 5 * 60 * 1000; // 5 min tolerance - absorbs NetSuite write-lag + clock skew; still far shorter than the 6h sync interval

/**
 * Call this immediately after a successful HS -> NS write, so the
 * NS -> HS pull knows to skip the resulting echo.
 * @param {string|number} nsId - NetSuite internal ID that was just written to
 */

/**
 * Call this immediately after a successful HS -> NS write, so the
 * NS -> HS pull knows to skip the resulting echo.
 * @param {string|number} nsId - NetSuite internal ID that was just written to
 */
async function markSyncedToNetsuite(nsId) {
  const store = getSyncStateStore();
  await store.upsert(nsId, {
    ns_last_synced_at: new Date().toISOString(),
    last_direction: "hs_to_ns",
  });
}

/**
 * Filters out records that are just echoes of our own HS -> NS writes.
 * Use this on the batch of records returned from your NetSuite SuiteQL
 * delta query, before pushing them to HubSpot.
 *
 * @param {Array<{ id: string|number, lastmodifieddate: string }>} records
 * @returns {Promise<Array>} records that represent genuine NetSuite-side changes
 */
async function filterOutOwnEchoes(records) {
  if (!records || records.length === 0) return [];

  const store = getSyncStateStore();
  const ids = records.map((r) => r.id);
  const stateMap = await store.getMany(ids);

  const genuine = [];
  let skipped = 0;

  for (const record of records) {
    const state = stateMap.get(String(record.id));

    if (!state || !state.ns_last_synced_at) {
      genuine.push(record); // never synced by us -> genuine NetSuite-side record
      continue;
    }

    const nsModified = new Date(record.lastmodifieddate).getTime();
    const ourStamp = new Date(state.ns_last_synced_at).getTime();

    if (Number.isNaN(nsModified)) {
      // Defensive: if lastmodifieddate is missing/unparseable, don't silently
      // drop the record - let it through and let downstream validation catch it.
      genuine.push(record);
      continue;
    }

    if (nsModified <= ourStamp + ECHO_BUFFER_MS) {
      skipped++;
      continue; // our own echo, skip
    }

    genuine.push(record); // genuine NetSuite-side edit after our write
  }

  if (skipped > 0) {
    // eslint-disable-next-line no-console
    console.debug(
      `[loopGuard] Skipped ${skipped}/${records.length} record(s) as own echoes.`
    );
  }

  return genuine;
}
export { markSyncedToNetsuite, filterOutOwnEchoes, ECHO_BUFFER_MS };
