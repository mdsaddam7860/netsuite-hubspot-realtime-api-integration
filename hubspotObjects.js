/**
 * hubspotObjects.js
 * HubSpot CRM helpers — single-record and batch operations.
 * Batch endpoints handle up to 100 records per call (chunked automatically).
 */
import hubspot from './hubspotClient.js';

// ─── Single-record helpers (kept for ad-hoc use) ──────────────────────────

export async function searchByProperty({ objectType, propertyName, value, properties = [] }) {
  const safeValue = String(value ?? '').trim();
  const payload = {
    filterGroups: [{ filters: [{ propertyName, operator: 'EQ', value: safeValue }] }],
    properties,
    limit: 1,
  };
  const response = await hubspot.post(`/crm/v3/objects/${objectType}/search`, payload);
  return response.data?.results?.[0] || null;
}

export async function createObject({ objectType, properties }) {
  return await hubspot.post(`/crm/v3/objects/${objectType}`, { properties });
}

export async function updateObject({ objectType, id, properties }) {
  return await hubspot.patch(`/crm/v3/objects/${objectType}/${id}`, { properties });
}

// ─── Batch helpers ─────────────────────────────────────────────────────────

/**
 * Batch-read records by a unique property (e.g. hs_sku, email).
 * HubSpot limit: 100 per call — auto-chunked.
 * Returns flat array of HubSpot record objects.
 */
export async function batchReadByProperty({ objectType, propertyName, values, properties = [] }) {
  if (!values.length) return [];
  const results = [];
  for (let i = 0; i < values.length; i += 100) {
    const chunk = values.slice(i, i + 100);
    const resp = await hubspot.post(`/crm/v3/objects/${objectType}/batch/read`, {
      idProperty: propertyName,
      inputs: chunk.map((v) => ({ id: String(v) })),
      properties,
    });
    results.push(...(resp.data?.results || []));
  }
  return results;
}

/**
 * Batch-create records.
 * items: array of properties objects  [{ hs_sku: '...', name: '...' }, ...]
 * HubSpot limit: 100 per call — auto-chunked.
 */
export async function batchCreateObjects({ objectType, items }) {
  if (!items.length) return [];
  const results = [];
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    const resp = await hubspot.post(`/crm/v3/objects/${objectType}/batch/create`, {
      inputs: chunk.map((properties) => ({ properties })),
    });
    results.push(...(resp.data?.results || []));
  }
  return results;
}

/**
 * Batch-update records.
 * items: array of { id, properties }  [{ id: '12345', properties: { name: '...' } }, ...]
 * HubSpot limit: 100 per call — auto-chunked.
 */
export async function batchUpdateObjects({ objectType, items }) {
  if (!items.length) return [];
  const results = [];
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    const resp = await hubspot.post(`/crm/v3/objects/${objectType}/batch/update`, {
      inputs: chunk.map(({ id, properties }) => ({ id, properties })),
    });
    results.push(...(resp.data?.results || []));
  }
  return results;
}
