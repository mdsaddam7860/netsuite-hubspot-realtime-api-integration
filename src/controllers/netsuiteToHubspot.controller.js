import { logger } from "../index.js";
import {
  sync_netsuite_customers_to_hubspot_companies,
  sync_netsuite_customers_to_hubspot_contacts,
} from "../services/netsuite.service";

export async function netsuiteToHubspot() {
  try {
    await sync_netsuite_customers_to_hubspot_contacts();
    await sync_netsuite_customers_to_hubspot_companies();
  } catch (error) {
    logger.error(`Error in syncing netsuite to hubspot:`, {
      status: error?.status,
      response: error.response?.data,
      method: error?.method,
      url: error?.config?.url,
      message: error.message,
      stack: error?.stack || error,
    });
  }
}
