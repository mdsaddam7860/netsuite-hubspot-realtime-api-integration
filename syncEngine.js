/**
 * syncEngine.js
 * Generic NetSuite → HubSpot sync engine — BATCH MODE.
 *
 * Per page of NetSuite rows:
 *   1. Filter rows (checkpoint + empty key)
 *   2. Batch-read all matching HubSpot records in ONE API call
 *   3. Diff each record in memory
 *   4. Batch-create new records  (ONE API call per 100)
 *   5. Batch-update changed records (ONE API call per 100)
 *
 * Net result: ~3 API calls per page of 50 items vs ~100 calls previously.
 */
import { readCheckpoint, writeCheckpoint } from './checkpointStore.js';

function parseDateSafe(v) {
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

function diffProps(oldProps = {}, newProps = {}) {
  const changed = [];
  for (const [k, v] of Object.entries(newProps)) {
    const oldVal = String(oldProps[k] ?? '');
    const newVal = String(v ?? '');
    if (oldVal !== newVal) changed.push({ field: k, oldVal, newVal });
  }
  return changed;
}

/**
 * @param {object} opts
 * @param {string}   opts.name               - Display name for logs
 * @param {string}   opts.checkpointFile     - Path to checkpoint JSON
 * @param {Function} opts.fetchPage          - ({ limit, offset, lastModified }) => row[]
 * @param {string}   opts.lastModifiedField  - Field name on rows for last-modified date
 * @param {string}   opts.keyFieldLabel      - Label for logs (e.g. 'SKU', 'email')
 * @param {string}   opts.keyProperty        - HubSpot property name used as unique key
 * @param {Function} opts.getKey             - (row) => string unique key
 * @param {Function} opts.mapToHubSpot       - (row) => HubSpot properties object
 * @param {Function} opts.batchReadHubSpot   - (keys) => HubSpot record[]
 * @param {Function} opts.batchCreateHubSpot - (propsArray) => void
 * @param {Function} opts.batchUpdateHubSpot - ([{id, properties}]) => void
 * @param {number}  [opts.pageLimit=50]      - Records per NetSuite page
 */
export async function syncEngine({
  name,
  checkpointFile,
  fetchPage,
  lastModifiedField,
  keyFieldLabel,
  keyProperty,
  getKey,
  mapToHubSpot,
  batchReadHubSpot,
  batchCreateHubSpot,
  batchUpdateHubSpot,
  pageLimit = 50,
}) {
  const startedAt = new Date();
  const cp = await readCheckpoint(checkpointFile, { lastModified: null, lastKey: null });
  const cpTime = parseDateSafe(cp.lastModified);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 ${name}`);
  console.log(`   Started   : ${startedAt.toISOString()}`);
  console.log(`   Checkpoint: ${cp.lastModified || 'none (full sync)'}`);
  console.log(`${'='.repeat(60)}`);

  let offset = 0;
  let processed = 0, created = 0, updated = 0, skipped = 0, failed = 0;
  let newestSeenTime = cpTime, newestSeenRaw = cp.lastModified, newestSeenKey = cp.lastKey;
  let checkpointSaved = false;

  const saveCheckpoint = async () => {
    if (checkpointSaved) return;
    checkpointSaved = true;
    await writeCheckpoint(checkpointFile, {
      lastModified: newestSeenRaw || cp.lastModified,
      lastKey: newestSeenKey || cp.lastKey,
      ranAt: new Date().toISOString(),
    });
  };

  process.once('SIGINT', async () => {
    console.warn('\n⚠️  Interrupted — saving checkpoint before exit...');
    await saveCheckpoint();
    process.exit(0);
  });
  process.once('SIGTERM', async () => {
    console.warn('\n⚠️  Terminated — saving checkpoint before exit...');
    await saveCheckpoint();
    process.exit(0);
  });

  while (true) {
    // ── 1. Fetch page from NetSuite ──────────────────────────────────────
    let rows;
    try {
      rows = await fetchPage({ limit: pageLimit, offset, lastModified: cp.lastModified });
    } catch (e) {
      console.error(`❌ Failed to fetch page at offset ${offset}:`, e.message);
      break;
    }
    if (!rows.length) break;

    console.log(`\n📄 Page offset=${offset} — ${rows.length} rows`);

    // ── 2. Filter rows: skip empty keys and checkpoint-older items ────────
    const processable = [];
    for (const row of rows) {
      const key = String(getKey(row) ?? '').trim();
      if (!key) { skipped++; continue; }

      const lmRaw = row?.[lastModifiedField];
      const lmTime = parseDateSafe(lmRaw);
      if (cpTime && lmTime !== null && lmTime <= cpTime) { skipped++; continue; }

      processable.push({ row, key, lmRaw, lmTime });
    }

    if (!processable.length) {
      offset += pageLimit;
      if (rows.length < pageLimit) break;
      continue;
    }

    // ── 3. Batch-read existing HubSpot records (ONE API call) ────────────
    const keys = processable.map((p) => p.key);
    let existingRecords = [];
    try {
      existingRecords = await batchReadHubSpot(keys);
    } catch (e) {
      console.error(`❌ Batch read failed at offset ${offset}:`, e.message);
      failed += processable.length;
      offset += pageLimit;
      if (rows.length < pageLimit) break;
      continue;
    }

    // Build a map: key → HubSpot record
    const existingMap = new Map(
      existingRecords.map((r) => [String(r.properties?.[keyProperty] ?? ''), r])
    );

    // ── 4. Diff each item in memory, sort into buckets ───────────────────
    const toCreate = [];   // [{ key, props }]
    const toUpdate = [];   // [{ key, id, props, changed }]

    for (const { row, key, lmRaw, lmTime } of processable) {
      const props = mapToHubSpot(row);
      const existing = existingMap.get(key);

      if (existing) {
        const changed = diffProps(existing.properties, props);
        if (changed.length > 0) {
          console.log(`🔄 UPDATE ${keyFieldLabel}=${key}`);
          changed.forEach(({ field, oldVal, newVal }) =>
            console.log(`     ${field}: "${oldVal}" → "${newVal}"`)
          );
          toUpdate.push({ key, id: existing.id, props });
        } else {
          console.log(`⏭️  SKIP ${keyFieldLabel}=${key} (no changes)`);
          skipped++;
        }
      } else {
        console.log(`➕ CREATE ${keyFieldLabel}=${key}`);
        toCreate.push({ key, props });
      }

      // Track newest modified date for checkpoint
      if (lmTime !== null && (newestSeenTime === null || lmTime > newestSeenTime)) {
        newestSeenTime = lmTime;
        newestSeenRaw = lmRaw;
        newestSeenKey = key;
      }
    }

    // ── 5. Batch-create (ONE API call per 100 new records) ───────────────
    if (toCreate.length) {
      try {
        await batchCreateHubSpot(toCreate.map((i) => i.props));
        created += toCreate.length;
        processed += toCreate.length;
      } catch (e) {
        failed += toCreate.length;
        const detail = e.response?.data
          ? JSON.stringify(e.response.data).substring(0, 300)
          : e.message;
        console.error(`❌ Batch CREATE failed: ${detail}`);
      }
    }

    // ── 6. Batch-update (ONE API call per 100 changed records) ───────────
    if (toUpdate.length) {
      try {
        await batchUpdateHubSpot(toUpdate.map((i) => ({ id: i.id, properties: i.props })));
        updated += toUpdate.length;
        processed += toUpdate.length;
      } catch (e) {
        failed += toUpdate.length;
        const detail = e.response?.data
          ? JSON.stringify(e.response.data).substring(0, 300)
          : e.message;
        console.error(`❌ Batch UPDATE failed: ${detail}`);
      }
    }

    offset += pageLimit;
    if (rows.length < pageLimit) break;
  }

  await saveCheckpoint();

  const finishedAt = new Date();
  const elapsedSec = ((finishedAt - startedAt) / 1000).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ ${name} — DONE`);
  console.log(`   Finished  : ${finishedAt.toISOString()} (${elapsedSec}s)`);
  console.log(`   processed=${processed} | created=${created} | updated=${updated} | skipped=${skipped} | failed=${failed}`);
  console.log(`${'='.repeat(60)}\n`);

  if (failed > 0) {
    console.warn(`⚠️  ${failed} item(s) failed — check logs above for details.`);
  }
}
