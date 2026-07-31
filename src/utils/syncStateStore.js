import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * JSON-file backed sync state store.
 * Tracks the last time WE (the integration) wrote to a NetSuite record,
 * so the NS -> HS pull can distinguish "our own echo" from a genuine
 * NetSuite-side edit.
 *
 * Structure on disk:
 * {
 *   "125": { "ns_last_synced_at": "2026-04-23T15:57:29.000Z", "last_direction": "hs_to_ns" },
 *   "126": { ... }
 * }
 *
 * NOTE: JSON file storage is fine for low-to-moderate volume / single-instance
 * deployments. If you run multiple sync workers concurrently, or the record
 * count grows large (tens of thousands+), move this to Redis/Postgres later -
 * the read/write interface below stays the same either way, so callers won't
 * need to change.
 */

const DEFAULT_FILE_PATH = path.join(__dirname, "data", "sync-state.json");

class SyncStateStore {
  constructor(filePath = DEFAULT_FILE_PATH) {
    this.filePath = filePath;
    this._ensureFileExists();
    this._writeQueue = Promise.resolve(); // serialize writes to avoid race conditions
  }

  _ensureFileExists() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({}, null, 2), "utf8");
    }
  }

  _readAll() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      return raw.trim() ? JSON.parse(raw) : {};
    } catch (err) {
      // Corrupt or empty file - fail safe with an empty store rather than crashing the sync
      return {};
    }
  }

  _writeAll(data) {
    // Atomic-ish write: write to temp file then rename, to reduce risk of
    // a half-written file if the process dies mid-write.
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmpPath, this.filePath);
  }

  /**
   * Get sync state for a single NetSuite internal ID.
   * @param {string|number} nsId
   * @returns {{ ns_last_synced_at: string, last_direction: string } | null}
   */
  async get(nsId) {
    const data = this._readAll();
    return data[String(nsId)] || null;
  }

  /**
   * Get sync state for multiple IDs at once (avoids re-reading the file per record).
   * @param {Array<string|number>} nsIds
   * @returns {Map<string, { ns_last_synced_at: string, last_direction: string }>}
   */
  async getMany(nsIds) {
    const data = this._readAll();
    const map = new Map();
    for (const id of nsIds) {
      const key = String(id);
      if (data[key]) map.set(key, data[key]);
    }
    return map;
  }

  /**
   * Upsert sync state for a NetSuite internal ID.
   * Writes are serialized via an internal queue so concurrent upserts
   * don't clobber each other (important since fs writes aren't atomic
   * across overlapping async calls).
   * @param {string|number} nsId
   * @param {{ ns_last_synced_at: string, last_direction: string }} state
   */
  async upsert(nsId, state) {
    this._writeQueue = this._writeQueue.then(() => {
      const data = this._readAll();
      data[String(nsId)] = {
        ...(data[String(nsId)] || {}),
        ...state,
      };
      this._writeAll(data);
    });
    return this._writeQueue;
  }

  /**
   * Bulk upsert - more efficient than calling upsert() in a loop when
   * stamping many records at once (single read + single write).
   * @param {Array<{ nsId: string|number, state: object }>} entries
   */
  async upsertMany(entries) {
    this._writeQueue = this._writeQueue.then(() => {
      const data = this._readAll();
      for (const { nsId, state } of entries) {
        data[String(nsId)] = {
          ...(data[String(nsId)] || {}),
          ...state,
        };
      }
      this._writeAll(data);
    });
    return this._writeQueue;
  }

  /**
   * Optional cleanup: remove stale entries older than N days, to keep the
   * JSON file from growing unbounded. Safe to run periodically (e.g. daily cron).
   */
  async prune(olderThanDays = 30) {
    this._writeQueue = this._writeQueue.then(() => {
      const data = this._readAll();
      const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
      for (const key of Object.keys(data)) {
        const ts = new Date(data[key].ns_last_synced_at).getTime();
        if (ts < cutoff) delete data[key];
      }
      this._writeAll(data);
    });
    return this._writeQueue;
  }
}

// Singleton instance - shared across the app
let instance = null;
function getSyncStateStore(filePath) {
  if (!instance) {
    instance = new SyncStateStore(filePath);
  }
  return instance;
}

export { SyncStateStore, getSyncStateStore };
