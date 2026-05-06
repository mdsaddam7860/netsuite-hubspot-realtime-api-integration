/**
 * sync_products_restlet.js
 * Alternative entry point: syncs NetSuite items → HubSpot Products via the
 * deployed RESTlet (hsSyncRestlet.js) rather than direct SuiteQL.
 * Use this when SuiteQL access is unavailable or the RESTlet provides richer data.
 *
 * CLI flags:
 *   --full    Ignore the checkpoint and run a full sync
 */
import { syncEngine } from './syncEngine.js';
import { runRestlet } from './netsuiteRestletClient.js';
import { mapNetSuiteItemToHubSpotProduct } from './mapProductFields.js';
import {
  batchReadByProperty,
  batchCreateObjects,
  batchUpdateObjects,
} from './hubspotObjects.js';
import { writeCheckpoint } from './checkpointStore.js';

const CHECKPOINT_FILE = './checkpoints/products.json';
const FULL_SYNC = process.argv.includes('--full');

// The IDs configured in NetSuite for this RESTlet deployment
const RESTLET_SCRIPT_ID = 'customscript_hs_sync_restlet';
const RESTLET_DEPLOY_ID = 'customdeploy_hs_sync_restlet';

// HubSpot property used as unique key
const KEY_PROPERTY = 'hs_sku';

// HubSpot product properties to fetch for diff comparison
const HS_PROPS = [
  'hs_sku', 'code', 'name', 'price', 'retail_price',
  'description', 'product_notes', 'prefered_inv_location',
  'item_class', 'ship_weight', 'vendor_stock', 'promo',
];

async function fetchPage({ limit, offset, lastModified }) {
  const resp = await runRestlet(RESTLET_SCRIPT_ID, RESTLET_DEPLOY_ID, {
    limit,
    offset,
    lastModified,
  });

  if (!resp || !resp.success) {
    console.error('RESTlet returned an error:', resp?.error || 'Unknown error');
    return [];
  }

  return resp.items || [];
}

function getKey(row) {
  const key = String(row.sku_code ?? row.code ?? '').trim();
  return key === 'Discount' || key === '' ? '' : key;
}

async function run() {
  if (FULL_SYNC) {
    console.log('🔁 --full flag detected: running full sync (checkpoint ignored).');
    await writeCheckpoint(CHECKPOINT_FILE, { lastModified: null, lastKey: null });
  }

  try {
    await syncEngine({
      name: 'Products (NetSuite → HubSpot) via RESTlet',
      checkpointFile: CHECKPOINT_FILE,
      fetchPage,
      lastModifiedField: 'lastmodifieddate',
      keyFieldLabel: 'SKU',
      keyProperty: KEY_PROPERTY,
      getKey,
      mapToHubSpot: mapNetSuiteItemToHubSpotProduct,

      // ── Batch callbacks ────────────────────────────────────────────────
      batchReadHubSpot: (keys) =>
        batchReadByProperty({
          objectType: 'products',
          propertyName: KEY_PROPERTY,
          values: keys,
          properties: HS_PROPS,
        }),
      batchCreateHubSpot: (propsArray) =>
        batchCreateObjects({ objectType: 'products', items: propsArray }),
      batchUpdateHubSpot: (items) =>
        batchUpdateObjects({ objectType: 'products', items }),

      pageLimit: 50,
    });
  } catch (err) {
    console.error('Fatal sync error:', err.message);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
  process.exit(1);
});

run();
