/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Extracts item fields for HubSpot Sync, including custom 2699 fields and Customer Price.
 */
define(['N/search', 'N/record'], function (search, record) {

    /**
     * Helper to safely get a value from search result
     */
    function getValueSafe(result, fieldId, joinUrl) {
        try {
            return joinUrl ? result.getValue({ name: fieldId, join: joinUrl }) : result.getValue({ name: fieldId });
        } catch (e) {
            return null;
        }
    }

    /**
     * POST request handler for the RESTlet
     * The payload (context) is automatically parsed from JSON by NetSuite
     */
    function doPost(context) {
        var limit = parseInt(context.limit, 10) || 50;
        var lastModified = context.lastModified; // e.g. "MM/DD/YYYY"

        var response = {
            success: true,
            items: [],
            error: null
        };

        try {
            // Build the standard item search
            var filters = [
                ['isinactive', 'is', 'F']
            ];

            if (lastModified) {
                filters.push('and');
                filters.push(['lastmodifieddate', 'onorafter', lastModified]);
            }

            var itemSearch = search.create({
                type: search.Type.ITEM,
                filters: filters,
                columns: [
                    'internalid',
                    'itemid', // Code
                    'displayname', // Name
                    'preferredlocation',
                    'class',
                    'totalquantityonhand',
                    'weight',
                    'custitem12', // product notes
                    'custitem2', // notes2
                    'custitem20', // notes3
                    'custitem4', // notes4
                    'custitem_atlas_approved',
                    'cost',
                    'costestimate',
                    search.createColumn({ name: 'lastmodifieddate', sort: search.Sort.ASC }),
                    'createddate',
                    'custitem21', // hs_sku

                    // The specific 2699 Fields
                    'custitem19', // Promo Amount
                    
                    // Price Level 1 (Retail/Base Price)
                    search.createColumn({ name: 'unitprice', join: 'pricing' })
                ]
            });

            var pagedData = itemSearch.runPaged({ pageSize: limit });

            var offset = parseInt(context.offset, 10) || 0;
            var pageIndex = Math.floor(offset / limit);

            if (pagedData.count > 0 && pageIndex < pagedData.pageRanges.length) {
                var page = pagedData.fetch({ index: pageIndex });

                page.data.forEach(function (result) {
                    var itemData = {
                        id: result.id,
                        code: getValueSafe(result, 'itemid'),
                        name: getValueSafe(result, 'displayname'),
                        preferredinvlocation: getValueSafe(result, 'preferredlocation'),
                        itemclass: getValueSafe(result, 'class'),
                        vendorstock: getValueSafe(result, 'totalquantityonhand'),
                        shipweight: getValueSafe(result, 'weight'),
                        productnotes: getValueSafe(result, 'custitem12'),
                        custitem_notes2: getValueSafe(result, 'custitem2'),
                        custitem_notes3: getValueSafe(result, 'custitem20'),
                        custitem_notes4: getValueSafe(result, 'custitem4'),
                        custitem_approved: getValueSafe(result, 'custitem_atlas_approved'),
                        cost: getValueSafe(result, 'cost'),
                        costestimate: getValueSafe(result, 'costestimate'),
                        lastmodifieddate: getValueSafe(result, 'lastmodifieddate'),
                        createddate: getValueSafe(result, 'createddate'),
                        sku_code: getValueSafe(result, 'custitem21'),

                        // 2699 fields mapping priorities
                        promo: getValueSafe(result, 'custitem19') || '',

                        retail_price: getValueSafe(result, 'unitprice', 'pricing') || 0,
                    };
                    response.items.push(itemData);
                });
            }

        } catch (e) {
            response.success = false;
            response.error = e.message;
            log.error('RESTlet Error', e);
        }

        return JSON.stringify(response);
    }

    return {
        post: doPost
    };
});
