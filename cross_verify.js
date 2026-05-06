import dotenv from 'dotenv';
dotenv.config();
import { runSuiteQL } from './suiteql.js';
import { batchReadByProperty } from './hubspotObjects.js';
import { mapNetSuiteItemToHubSpotProduct } from './mapProductFields.js';

async function crossVerify() {
  console.log('🔄 Fetching 3 random valid products from NetSuite...');
  const query = `
    SELECT TOP 5
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
      i.custitem19                    AS promo
    FROM item i
    LEFT JOIN pricing p ON p.item = i.id AND p.pricelevel = 1
    LEFT JOIN vendor v ON v.id = i.vendor
    WHERE i.isinactive = 'F'
      AND i.itemid IS NOT NULL
      AND i.itemid NOT LIKE '%*INACTIVE*%'
    ORDER BY i.lastmodifieddate DESC
  `;
  
  try {
    const nsRes = await runSuiteQL(query);
    const nsItems = nsRes.items || [];
    
    if (nsItems.length === 0) {
      console.log('❌ No items found in NS');
      return;
    }

    const mappedNS = nsItems.map(mapNetSuiteItemToHubSpotProduct);
    const skusToTest = mappedNS.map(m => m.hs_sku);

    console.log(`✅ Loaded SKUs from NetSuite: ${skusToTest.join(', ')}`);
    console.log(`🔄 Cross-referencing those SKUs strictly in HubSpot...`);

    const hsProps = [
        'hs_sku', 'code', 'name', 'price', 'retail_price', 
        'description', 'product_notes', 'prefered_inv_location', 
        'item_class', 'ship_weight', 'vendor_stock', 
        'skid_pro_stock', 'promo', 'preferred_vendor'
    ];
    
    const hsItems = await batchReadByProperty({
        objectType: 'products',
        propertyName: 'hs_sku',
        values: skusToTest,
        properties: hsProps
    });
    
    console.log('\n=============================================');
    console.log('            CROSS-VERIFICATION REPORT        ');
    console.log('=============================================\n');

    for (let i = 0; i < mappedNS.length; i++) {
        const nsProp = mappedNS[i];
        const hsProd = hsItems.find(h => h.properties.hs_sku === nsProp.hs_sku);

        console.log(`📦 SKU: ${nsProp.hs_sku} --------------------------`);
        if (!hsProd) {
            console.log('  ❌ NOT FOUND IN HUBSPOT!');
            continue;
        }

        const hsProp = hsProd.properties;

        hsProps.forEach(key => {
            const nsVal = nsProp[key] === null || nsProp[key] === undefined ? "" : String(nsProp[key]);
            const hsVal = hsProp[key] === null || hsProp[key] === undefined ? "" : String(hsProp[key]);
            
            // Adjust format explicitly so we can see the direct comparison
            if (nsVal === hsVal || (!nsVal && !hsVal)) {
                console.log(`  ✅ ${key.padEnd(23)} | Match     | ${hsVal}`);
            } else {
                console.log(`  ❌ ${key.padEnd(23)} | MISMATCH! | NS: ${nsVal} | HS: ${hsVal}`);
            }
        });
        console.log('');
    }
  } catch (err) {
    console.error('Crash:', err);
  }
}

crossVerify();
