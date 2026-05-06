/**
 * controllers/webhookController.js
 * Handles incoming webhooks from NetSuite for Customer updates.
 */

import { logger } from "../index.js";
import {
  fetchCustomerById,
  processHSToNetsuite,
} from "../services/netsuite.service.js"; // Adjust path as needed
// Assuming you have these utility functions similar to the product sync
// import { mapNetSuiteCustomerToHubSpot } from "../mapCustomerFields.js";
// import {
//   batchReadByProperty,
//   batchCreateObjects,
//   batchUpdateObjects,
// } from "../hubspotObjects.js";

// HubSpot typically uses 'email' as the unique identifier for contacts/customers
const KEY_PROPERTY = "email";

// Properties to fetch from HubSpot to compare changes
const HS_PROPS = [
  "email",
  "firstname",
  "lastname",
  "company",
  "phone",
  "lifecyclestage",
];

// Helper to diff properties (reused from your sync engine)
function diffProps(oldProps = {}, newProps = {}) {
  const changed = [];
  for (const [k, v] of Object.entries(newProps)) {
    const oldVal = String(oldProps[k] ?? "");
    const newVal = String(v ?? "");
    if (oldVal !== newVal && newVal !== "")
      changed.push({ field: k, oldVal, newVal });
  }
  return changed;
}

async function handleNetsuiteWebhooks(req, res) {
  // 1. Acknowledge immediately to prevent NetSuite from timing out
  res.status(200).send({ message: "Customer Webhook received and processing" });

  // 2. Extract the customer ID from the NetSuite payload
  // Note: Ensure your NetSuite User Event script sends the internal ID as 'customerId'

  logger.info(
    `[WEBHOOK] Received customer update: ${JSON.stringify(req.body, null, 2)}`
  );

  // After receiving webhook from NetSuite find customer full details by ID(if provided) and trigger contact/customer sync to HubSpot. This ensures we always have the most up-to-date data and can handle cases where NetSuite might not send all fields in the webhook payload.
  //   const { customerId } = req.body;

  //   if (!customerId) {
  //     console.warn(
  //       '⚠️ [WEBHOOK] Received customer update, but no "customerId" in payload:',
  //       req.body
  //     );
  //     return;
  //   }

  //   console.log(
  //     `\n🔔 [WEBHOOK] Triggered for NetSuite Customer ID: ${customerId}`
  //   );

  try {
    // // 3. Fetch the fresh data directly from NetSuite
    // const nsCustomer = await fetchCustomerById(customerId);
    // if (!nsCustomer) {
    //   console.log(
    //     `⏭️ [WEBHOOK] Customer ${customerId} not found or inactive. Aborting sync.`
    //   );
    //   return;
    // }
    // // 4. Map the NetSuite data to HubSpot format
    // const hsProps = mapNetSuiteCustomerToHubSpot(nsCustomer);
    // const uniqueKey = hsProps[KEY_PROPERTY]; // Usually the email
    // if (!uniqueKey) {
    //   logger.warn(
    //     `⚠️ [WEBHOOK] Customer ${customerId} has no email. Cannot sync to HubSpot.`
    //   );
    //   return;
    // }
    // // 5. Check if the customer already exists in HubSpot
    // const existingRecords = await batchReadByProperty({
    //   objectType: "contacts", // Assuming customers map to HubSpot Contacts
    //   propertyName: KEY_PROPERTY,
    //   values: [uniqueKey],
    //   properties: HS_PROPS,
    // });
    // const existingHubSpotContact = existingRecords[0];
    // // 6. Diff and Push to HubSpot
    // if (existingHubSpotContact) {
    //   const changed = diffProps(existingHubSpotContact.properties, hsProps);
    //   if (changed.length > 0) {
    //     console.log(`🔄 [WEBHOOK] UPDATING HubSpot Contact: ${uniqueKey}`);
    //     changed.forEach(({ field, oldVal, newVal }) =>
    //       console.log(`     ${field}: "${oldVal}" → "${newVal}"`)
    //     );
    //     await batchUpdateObjects({
    //       objectType: "contacts",
    //       items: [{ id: existingHubSpotContact.id, properties: hsProps }],
    //     });
    //     console.log(`✅ [WEBHOOK] Successfully updated ${uniqueKey}`);
    //   } else {
    //     console.log(
    //       `⏭️ [WEBHOOK] No changes detected for ${uniqueKey}. Skipping update.`
    //     );
    //   }
    // } else {
    //   console.log(`➕ [WEBHOOK] CREATING new HubSpot Contact: ${uniqueKey}`);
    //   await batchCreateObjects({
    //     objectType: "contacts",
    //     items: [hsProps],
    //   });
    //   console.log(`✅ [WEBHOOK] Successfully created ${uniqueKey}`);
    // }
  } catch (error) {
    console.error(`❌ [WEBHOOK] Fatal error syncing Customer ${customerId}:`, {
      httpStatus: error?.status,
      response: error?.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error?.message,
      stack: error?.stack || error,
    });
  }
}
async function handleHubspotContactWebhooks(next, req, res, err) {
  // 1. Acknowledge immediately to prevent NetSuite from timing out
  res.status(200).send({ message: "Contacts Webhook received and processing" });

  // 2. Extract the customer ID from the NetSuite payload
  // Note: Ensure your NetSuite User Event script sends the internal ID as 'customerId'

  logger.info(
    `[WEBHOOK] Received Contacts update: ${JSON.stringify(req.body, null, 2)}`
  );

  // After receiving webhook from Hubspot find contact full details by ID(if provided) and trigger contact sync to NetSuite. This ensures we always have the most up-to-date data and can handle cases where HubSpot might not send all fields in the webhook payload.

  try {
    await processHSToNetsuite(req.body, "contact");
  } catch (error) {
    console.error(`❌ [WEBHOOK] Fatal error syncing Customer ${customerId}:`, {
      httpStatus: error?.status,
      response: error?.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error?.message,
      stack: error?.stack || error,
    });
  }
}
async function handleHubspotCompanyWebhooks(next, req, res, err) {
  // 1. Acknowledge immediately to prevent NetSuite from timing out
  res.status(200).send({ message: "Company Webhook received and processing" });

  // 2. Extract the customer ID from the NetSuite payload
  // Note: Ensure your NetSuite User Event script sends the internal ID as 'customerId'

  logger.info(
    `[WEBHOOK] Received Company update: ${JSON.stringify(req.body, null, 2)}`
  );

  // After receiving webhook from Hubspot find contact full details by ID(if provided) and trigger contact sync to NetSuite. This ensures we always have the most up-to-date data and can handle cases where HubSpot might not send all fields in the webhook payload.

  try {
    await processHSToNetsuite(req.body, "company");
  } catch (error) {
    console.error(
      `❌ [WEBHOOK] Fatal error handleHubspotContactWebhooks ${customerId}:`,
      {
        httpStatus: error?.status,
        response: error?.response?.data,
        method: error?.method,
        url: error?.config?.url,
        message: error?.message,
        stack: error?.stack || error,
      }
    );
  }
}

export {
  handleNetsuiteWebhooks,
  handleHubspotContactWebhooks,
  handleHubspotCompanyWebhooks,
};
