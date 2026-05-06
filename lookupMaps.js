/**
 * lookupMaps.js
 * Loads NetSuite reference data (classifications, locations) once at startup.
 * These are used to convert raw IDs returned by SuiteQL into display names.
 *
 * NetSuite SuiteQL table names:
 *   - Classifications → "classification"  (id, name)
 *   - Locations       → "location"        (id, name)
 *
 * Both tables require the `Prefer: transient` header (handled by oauthPost).
 * If either query fails the maps are empty and raw IDs are stored as-is.
 */
import { runSuiteQL } from './suiteql.js';

async function loadMap(query, label) {
  try {
    const result = await runSuiteQL(query, { limit: 1000 });
    const map = {};
    for (const row of (result.items || [])) {
      if (row.id) map[String(row.id)] = row.name || '';
    }
    console.log(`📋 Loaded ${Object.keys(map).length} ${label} entries`);
    return map;
  } catch (e) {
    console.warn(`⚠️  Could not load ${label} map: ${e.message.substring(0, 200)}`);
    return {}; // Return empty map — IDs will be stored as-is
  }
}

export async function loadLookupMaps() {
  const [classMap, locationMap] = await Promise.all([
    loadMap(`SELECT id, name FROM classification ORDER BY name`, 'classification'),
    loadMap(`SELECT id, name FROM location ORDER BY name`, 'location'),
  ]);
  return { classMap, locationMap };
}
