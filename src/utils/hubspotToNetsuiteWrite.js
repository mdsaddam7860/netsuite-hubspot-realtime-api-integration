import { markSyncedToNetsuite } from "./loopGuard.js";
// ... your existing netsuiteClient import etc.

/**
 * Example - adapt this to match your actual HS -> NS update function name/signature.
 * The key addition is the markSyncedToNetsuite() call right after a successful write.
 */
async function updateNetsuiteCustomerFromHubspot(nsId, payload) {
  //   await netsuiteClient.customer.update(nsId, payload);

  // Stamp OUR OWN local store (not NetSuite) so the NS -> HS pull
  // knows this record's next lastmodifieddate bump is our own echo.
  await markSyncedToNetsuite(nsId);
}

export { updateNetsuiteCustomerFromHubspot };
