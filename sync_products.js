/**
 * sync_products.js
 * Syncs NetSuite inventory items → HubSpot Products via SuiteQL.
 * Uses hs_sku (custitem21 ?? itemid) as the unique key.
 * Checkpoint-based incremental sync: only processes items modified since last run.
 *
 * CLI flags:
 *   --full    Ignore the checkpoint and run a full sync (does NOT delete the file)
 */
import { logger } from "./src/index.js";
import { syncEngine } from "./syncEngine.js";
import { runSuiteQL } from "./suiteql.js";
import { mapNetSuiteItemToHubSpotProduct } from "./mapProductFields.js";
import {
  batchReadByProperty,
  batchCreateObjects,
  batchUpdateObjects,
} from "./hubspotObjects.js";
import { writeCheckpoint } from "./checkpointStore.js";

const CHECKPOINT_FILE = "./checkpoints/products.json";
const FULL_SYNC = process.argv.includes("--full");

// HubSpot property used as unique key
const KEY_PROPERTY = "hs_sku";

// HubSpot product properties to fetch for diff comparison
const HS_PROPS = [
  "hs_sku",
  "code",
  "name",
  "price",
  "retail_price",
  "description",
  "product_notes",
  "prefered_inv_location",
  "item_class",
  "ship_weight",
  "vendor_stock",
  "skid_pro_stock",
  "promo",
  "preferred_vendor",
];

// Convert any date format (M/D/YYYY or ISO) → MM/DD/YYYY for SuiteQL TO_DATE()
function toSuiteQLDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function buildQuery(lastModified) {
  const sqlDate = toSuiteQLDate(lastModified);
  const dateFilter = sqlDate
    ? `AND i.lastmodifieddate > TO_DATE('${sqlDate}', 'MM/DD/YYYY')`
    : "";
  return `
    SELECT
      i.custitem21                    AS sku_code,
      i.itemid                        AS code,
      i.displayname                   AS name,
      BUILTIN.DF(i.preferredlocation) AS preferredinvlocation,
      BUILTIN.DF(i.class)             AS itemclass,
      i.totalquantityonhand           AS vendorstock,
      i.custitem_skd_est_qty_supplier AS skidprostock,
      i.custitem1                     AS productnotes,
      i.weight                        AS shipweight,
      v.entityid || ' ' || v.companyname AS preferredvendor,
      p.unitprice                     AS retail_price,
      i.custitem19                    AS promo,
      i.lastmodifieddate
    FROM item i
    LEFT JOIN pricing p ON p.item = i.id AND p.pricelevel = 1
    LEFT JOIN vendor v ON v.id = i.vendor
    WHERE i.isinactive = 'F'
      ${dateFilter}
    ORDER BY i.lastmodifieddate DESC
  `;
}

async function fetchPage({ limit, offset, lastModified }) {
  const resp = await runSuiteQL(buildQuery(lastModified), { limit, offset });
  return resp.items || [];
}

function getKey(row) {
  const key = String(row.sku_code ?? row.code ?? "").trim();
  return key === "Discount" || key === "" ? "" : key;
}

/**
 * Runs the Product Sync.
 * @param {boolean} isFullSync - If true, ignores the checkpoint.
 */
export async function runProductSync(isFullSync = false) {
  if (isFullSync) {
    logger.info(
      "🔁 Full sync requested: running full sync (checkpoint ignored)."
    );
    await writeCheckpoint(CHECKPOINT_FILE, {
      lastModified: null,
      lastKey: null,
    });
  }

  try {
    await syncEngine({
      name: "Products (NetSuite → HubSpot)",
      checkpointFile: CHECKPOINT_FILE,
      fetchPage,
      lastModifiedField: "lastmodifieddate",
      keyFieldLabel: "SKU",
      keyProperty: KEY_PROPERTY,
      getKey,
      mapToHubSpot: mapNetSuiteItemToHubSpotProduct,

      // ── Batch callbacks ────────────────────────────────────────────────
      batchReadHubSpot: (keys) =>
        batchReadByProperty({
          objectType: "products",
          propertyName: KEY_PROPERTY,
          values: keys,
          properties: HS_PROPS,
        }),
      batchCreateHubSpot: (propsArray) =>
        batchCreateObjects({ objectType: "products", items: propsArray }),
      batchUpdateHubSpot: (items) =>
        batchUpdateObjects({ objectType: "products", items }),

      pageLimit: 50,
    });
  } catch (err) {
    logger.error("Fatal sync error in Product Sync:", err.message);
    // CRITICAL: We throw the error instead of using process.exit(1)
    // so the main server stays alive even if a sync fails.
    throw err;
  }
}

// CRITICAL: Remove the immediate execution and unhandledRejection blocks from the bottom!
// Do not call run() here.

// async function run() {
//   if (FULL_SYNC) {
//     logger.info('🔁 --full flag detected: running full sync (checkpoint ignored).');
//     await writeCheckpoint(CHECKPOINT_FILE, { lastModified: null, lastKey: null });
//   }

//   try {
//     await syncEngine({
//       name: 'Products (NetSuite → HubSpot)',
//       checkpointFile: CHECKPOINT_FILE,
//       fetchPage,
//       lastModifiedField: 'lastmodifieddate',
//       keyFieldLabel: 'SKU',
//       keyProperty: KEY_PROPERTY,
//       getKey,
//       mapToHubSpot: mapNetSuiteItemToHubSpotProduct,

//       // ── Batch callbacks ────────────────────────────────────────────────
//       batchReadHubSpot: (keys) =>
//         batchReadByProperty({
//           objectType: 'products',
//           propertyName: KEY_PROPERTY,
//           values: keys,
//           properties: HS_PROPS,
//         }),
//       batchCreateHubSpot: (propsArray) =>
//         batchCreateObjects({ objectType: 'products', items: propsArray }),
//       batchUpdateHubSpot: (items) =>
//         batchUpdateObjects({ objectType: 'products', items }),

//       pageLimit: 50,
//     });
//   } catch (err) {
//     logger.error('Fatal sync error:', err.message);
//     process.exit(1);
//   }
// }

// process.on('unhandledRejection', (reason) => {
//   logger.error('[UNHANDLED REJECTION]', reason);
//   process.exit(1);
// });

// run();
