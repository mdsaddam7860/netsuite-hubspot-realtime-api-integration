/**
 * sync_contacts.js
 * Syncs NetSuite customers → HubSpot Contacts via SuiteQL.
 * Uses email as the unique key.
 */
import { runSuiteQL } from './suiteql.js';
import { syncEngine } from './syncEngine.js';
import {
  batchReadByProperty,
  batchCreateObjects,
  batchUpdateObjects,
} from './hubspotObjects.js';

const CHECKPOINT_FILE = './checkpoints/contacts.json';
const KEY_PROPERTY = 'email';

const HS_PROPS = ['email', 'firstname', 'lastname', 'phone'];

const QUERY = `
  SELECT id, firstname, lastname, email, phone, lastmodifieddate
  FROM customer
  WHERE email IS NOT NULL
  ORDER BY lastmodifieddate DESC
`;

function mapNetSuiteCustomerToHubSpotContact(row) {
  return {
    email:     String(row.email ?? '').trim(),
    firstname: String(row.firstname ?? ''),
    lastname:  String(row.lastname ?? ''),
    phone:     String(row.phone ?? ''),
  };
}

async function fetchPage({ limit, offset }) {
  const resp = await runSuiteQL(QUERY, { limit, offset });
  return resp.items || [];
}

await syncEngine({
  name: 'Contacts (NetSuite → HubSpot)',
  checkpointFile: CHECKPOINT_FILE,
  fetchPage,
  lastModifiedField: 'lastmodifieddate',
  keyFieldLabel: 'email',
  keyProperty: KEY_PROPERTY,
  getKey: (row) => String(row.email ?? '').trim(),
  mapToHubSpot: mapNetSuiteCustomerToHubSpotContact,

  // ── Batch callbacks ──────────────────────────────────────────────────
  batchReadHubSpot: (keys) =>
    batchReadByProperty({
      objectType: 'contacts',
      propertyName: KEY_PROPERTY,
      values: keys,
      properties: HS_PROPS,
    }),
  batchCreateHubSpot: (propsArray) =>
    batchCreateObjects({ objectType: 'contacts', items: propsArray }),
  batchUpdateHubSpot: (items) =>
    batchUpdateObjects({ objectType: 'contacts', items }),

  pageLimit: 50,
});
