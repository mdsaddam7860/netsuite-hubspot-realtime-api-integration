/**
 * mapProductFields.js
 * Maps a raw NetSuite SuiteQL row → HubSpot product properties object.
 *
 * NetSuite field corrections:
 *   product_notes → custitem1  (NOT custitem12 — that is a list-type field)
 *   vendor_stock  → custitem_skd_est_qty_supplier  (NOT totalquantityonhand)
 */

/**
 * Safely convert a value to a trimmed string.
 * Returns '' for null / undefined / literal "null" / literal "undefined".
 */
function safe(val) {
  if (val === null || val === undefined || val === 'null' || val === 'undefined') return '';
  return String(val).trim();
}

/**
 * Returns the value only if it looks like real text.
 * Rejects pure-integer strings (e.g. "1", "28", "57312") which are raw NetSuite
 * internal IDs returned when a field is a List/Record type in SuiteQL.
 * This prevents overwriting good HubSpot display names with bare numbers.
 */
function safeText(val) {
  const s = safe(val);
  if (/^\d+$/.test(s)) return ''; // looks like a raw ID — discard
  return s;
}

export function mapNetSuiteItemToHubSpotProduct(nsItem) {
  // Name: prefer displayname, fall back to itemid/code so it's never blank
  const name = safe(nsItem.name ?? nsItem.displayname)
             || safe(nsItem.code ?? nsItem.itemid);

  // Location / Class / Vendor: SuiteQL returns raw integer IDs for record-type fields.
  // safeText discards bare integers so we don't overwrite existing HubSpot display names.
  const invLocation    = safeText(nsItem.preferredinvlocation);
  const itemClass      = safeText(nsItem.itemclass);
  const preferredVendor = safeText(nsItem.preferredvendor);

  // Product notes: custitem1 (free-text field) — use safeText for safety
  const notes = safeText(nsItem.productnotes);

  return {
    // CORE FIELDS
    hs_sku: safe(nsItem.sku_code ?? nsItem.code),
    code:   safe(nsItem.code ?? nsItem.itemid),
    name,

    // Pricing — clamp to 0 minimum (HubSpot rejects negative prices)
    price:        Math.max(0, parseFloat(nsItem.retail_price ?? 0) || 0),
    retail_price: Math.max(0, parseFloat(nsItem.retail_price ?? 0) || 0),

    // Product notes (custitem1 — free-text field)
    description:   notes,
    product_notes: notes,

    // Record-type fields: only written when NetSuite returns a display name (not a bare ID)
    ...(invLocation     ? { prefered_inv_location: invLocation }     : {}),
    ...(itemClass       ? { item_class: itemClass }                   : {}),
    ...(preferredVendor ? { preferred_vendor: preferredVendor }       : {}),

    // Physical & Stock
    ship_weight:    parseFloat(nsItem.shipweight ?? 0) || 0,
    vendor_stock:   safe(nsItem.vendorstock ?? '0'),     // totalquantityonhand (actual on-hand)
    skid_pro_stock: safe(nsItem.skidprostock ?? '0'),    // custitem_skd_est_qty_supplier

    // Extended fields
    promo: safe(nsItem.promo),
  };
}
