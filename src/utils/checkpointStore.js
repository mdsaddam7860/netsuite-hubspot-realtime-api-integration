/**
 * checkpointStore.js
 * Atomic read/write for checkpoint JSON files.
 * Uses a temp-file + rename strategy to prevent corruption if the process dies mid-write.
 */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function readCheckpoint(filePath, fallback = {}) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function writeCheckpoint(filePath, value) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Write to a temp file first, then atomically rename to avoid partial-write corruption
  const tmpFile = path.join(os.tmpdir(), `checkpoint_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
  try {
    await fs.writeFile(tmpFile, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tmpFile, filePath);
  } catch (err) {
    // Clean up temp file on failure
    await fs.unlink(tmpFile).catch(() => {});
    throw err;
  }
}
