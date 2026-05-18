// Transform Netsuite Data to Hubspot
// Check for integrity and consistency
import {
  isValidEmail,
  logger,
  shouldUpdateDeal,
  taskProperties,
  needsUpdate,
  needsUpdateJob,
  convertAustralianFormat,
  companyProperties,
  delta,
  currentDate,
  contactProperties,
  dealProperties,
  cleanProps,
  getLastSyncTime,
  saveLastSyncTime,
  taskClient,
} from "../index.js";

function ToHSBool(value) {
  if (
    value === 1 ||
    value === "1" ||
    value === true ||
    value === "true" ||
    value === "T"
  ) {
    return true;
  }

  return false;
}

/**
 * Converts a date string to a Unix timestamp in milliseconds at UTC midnight.
 * Ideal for HubSpot API standard date fields.
 *
 * @param {string} dateString - e.g., '10/19/2022' or '2022-10-19'
 * @returns {number} Unix timestamp in milliseconds
 */
function toHubSpotUnixMs(dateString) {
  if (!dateString) return null;

  const date = new Date(dateString);

  // Check if the date is valid
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date string provided");
  }

  // Force to UTC midnight
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function leadStatusMapping(sourceData) {
  let value = null;
  if (typeof sourceData === "number") value = sourceData;
  if (typeof sourceData === "string") {
    value = sourceData.trim().toLowerCase();
  }
  const leadStatusMapping = {
    in_progress: "IN_PROGRESS",
    new: "NEW",
    nurture: "Nurture",
    unqualified: "UNQUALIFIED",
    qualified: "QUALIFIED",
  };

  return leadStatusMapping[value] || null;
}
function lifecyclestage(sourceData) {
  let value = null;
  if (typeof sourceData === "number") value = sourceData;
  if (typeof sourceData === "string") {
    value = sourceData.trim().toLowerCase();
  }

  const lifecyclestageMapping = {
    219363586: "219363586",
    lead: "lead",
    marketingqualifiedlead: "marketingqualifiedlead",
    salesqualifiedlead: "salesqualifiedlead",
    opportunity: "opportunity",
    customer: "customer",
    other: "other",
  };

  return lifecyclestageMapping[value] || null;
}

function machineTypeDropDown(sourceData) {
  let value = null;
  if (typeof sourceData === "number") value = sourceData;
  if (typeof sourceData === "string") {
    value = sourceData.trim().toLowerCase();
  }
  const allowedOptions = {
    1: "Full Size Skid Loader",
    2: "Mini Skid Loader",
    3: "Tractor",
  };

  return allowedOptions[value] || null;
}

function contactMappingNSToHS(sourceData) {
  if (!sourceData?.email) {
    logger.warn(`Email is empty : ${JSON.stringify(sourceData)}`);
    return null;
  }

  if (!isValidEmail(sourceData?.email)) {
    logger.warn(`Email is invalid : ${JSON.stringify(sourceData)}`);
    return null;
  }

  const payload = cleanProps({
    // --- Core Identity ---
    sourceid: sourceData?.id,
    firstname: sourceData?.firstname,
    lastname: sourceData?.lastname,
    company: sourceData?.companyname,

    // --- Email Fields ---
    email: isValidEmail(sourceData?.email) ? sourceData?.email : null, // Primary email (must be valid)
    alt_email: isValidEmail(sourceData?.custentity_sp_alt_email)
      ? sourceData?.custentity_sp_alt_email
      : null,
    alt_email_2: isValidEmail(sourceData?.custentity34)
      ? sourceData?.custentity34
      : null,
    alt_email_3: isValidEmail(sourceData?.custentity35)
      ? sourceData?.custentity35
      : null,

    // --- Phone Fields ---
    phone: sourceData?.phone,
    mobilephone: sourceData?.mobilephone, // Updated from sourceData.mobile to match NS scriptid
    work_phone: sourceData?.custentity31,
    alt_phone_2: sourceData?.custentity32,
    alt_phone_3: sourceData?.custentity33,

    // --- Address Fields ---
    // Note: Kept your existing variables as fallbacks just in case
    address: sourceData?.defaultbillingaddress || sourceData?.address,
    shipping_address: sourceData?.defaultshippingaddress,
    city: sourceData?.billing_city || sourceData?.address_city,
    state: sourceData?.billing_state || sourceData?.address_state,
    zip: sourceData?.billing_zip || sourceData?.address_postcode,
    fax: sourceData?.fax || sourceData?.fax_number,
    website: sourceData?.website,
    country: sourceData?.billing_country,

    // --- Equipment & Machine Info ---

    // Not exists in Netsuite
    carrier_machine_2: sourceData?.custentity16,
    carrier_machine_3: sourceData?.custentity_skidpro_carrier3,
    carrier_machine_4: sourceData?.custentity_skidpro_carrier4,
    skid_loader_make: sourceData?.custentity4,
    brand__model: sourceData?.custentity5,
    lead_ad_prop1: sourceData?.custentity_sp_skid_steer_make,
    lead_ad_prop2: sourceData?.custentity_sp_skid_steer_model,
    // Exists in netsuite
    machine_type: machineTypeDropDown(sourceData?.custentity29),
    attachments_of_interest: sourceData?.custentity18,
    current_attachments: sourceData?.custentity27, // You already have this, keep it
    carrier_machine: sourceData?.custentity_skidpro_carrier_machine,

    // --- Status & Lifecycle ---

    // --- Lead Source & Marketing ---
    referred_by: sourceData?.custentity1,
    referral: ToHSBool(sourceData?.custentity2),
    competitor_shopping: sourceData?.custentity28,

    // --- Communication Preferences ---
    unsubscribe: ToHSBool(sourceData?.unsubscribe),
    sms: ToHSBool(sourceData?.custentity36),
    taxable: ToHSBool(sourceData?.taxable),

    // --- Sales & Ownership ---
    sales_rep: sourceData?.custentityacs_salesrep,
    // ownername: sourceData?.["BUILTIN.DF(salesrep)"], // Display name of the rep

    // hs_email_optout: ToHSBool(sourceData?.custentity11), // Exists only on Contact
    // --- Others ---
    current_attachments: sourceData?.custentity27,
    closedate: toHubSpotUnixMs(sourceData?.dateclosed),
    lifecyclestage: lifecyclestage(sourceData?.entitystatus),
    hs_lead_status: leadStatusMapping(sourceData?.stage), // TODO Report Mapping Issue, Value Mismatch(Dropdowns)

    last_sales_activity: toHubSpotUnixMs(sourceData?.custentity_date_lsa),
    //  read only properties in hubspot
    // hs_recent_closed_order_date: sourceData?.lastsaledate,
    // hs_first_order_closed_date: sourceData?.firstsaledate,
  });

  return payload;
}

function companyMappingNSToHS(sourceData) {
  if (!sourceData?.companyname) {
    logger.warn(`Company name is empty for company ID: ${sourceData?.id}`);
    return null;
  }

  logger.info(`[Netsuite] Company : ${JSON.stringify(sourceData, null, 2)}`);

  const payload = cleanProps({
    // ========== Core Identity ==========
    sourceid: sourceData?.id, // custom property
    name: sourceData?.companyname,
    domain: sourceData?.website || null,

    // ========== Email Fields (custom company properties) ==========
    // Note: HubSpot Company object does NOT have a standard 'email' property.
    // The following fields must exist as custom company properties in HS.
    alt_email: sourceData?.custentity_sp_alt_email,
    // alt_email_2: sourceData?.custentity34,
    // alt_email_3: sourceData?.custentity35,

    // ========== Phone Fields ==========
    phone: sourceData?.phone,
    mobilephone: sourceData?.mobilephone, // custom property on Company
    work_phone: sourceData?.custentity31,
    alt_phone_2: sourceData?.custentity32,
    alt_phone_3: sourceData?.custentity33,

    // ========== Address Fields ==========
    // Your existing address logic (keeping as-is, even if defaultbillingaddress is an ID)
    address: sourceData?.defaultbillingaddress,
    address2: sourceData?.defaultshippingaddress,
    city: sourceData?.billing_city || sourceData?.shipping_city,
    state: sourceData?.billing_state || sourceData?.shipping_state,
    country: sourceData?.billing_country || sourceData?.shipping_country,
    zip: sourceData?.billing_zip || sourceData?.shipping_zip,

    // ========== Equipment & Machine Info ==========
    carrier_machine: sourceData?.custentity_skidpro_carrier_machine,
    carrier_machine_2: sourceData?.custentity16,
    carrier_machine_3: sourceData?.custentity_skidpro_carrier3,
    carrier_machine_4: sourceData?.custentity_skidpro_carrier4,
    skid_loader_make: sourceData?.custentity4,
    brand__model: sourceData?.custentity5,
    lead_ad_prop1: sourceData?.custentity_sp_skid_steer_make, // Skid Steer Make
    // lead_ad_prop2: sourceData?.custentity_sp_skid_steer_model, // Skid Steer Model
    machine_type: sourceData?.custentity29,
    // attachments_of_interest: sourceData?.custentity18,
    current_attachments: sourceData?.custentity27,

    // ========== Sales & Ownership ==========
    sales_rep: sourceData?.custentityacs_salesrep,
    // ownername: sourceData?.["BUILTIN.DF(salesrep)"],   // read‑only / legacy – commented

    // ========== Status & Lifecycle ==========
    lifecyclestage: mapCompanyLifecyclestage(sourceData?.entitystatus),
    // hs_lead_status: mapCompanyLeadStatus(sourceData?.stage),
    closedate: toHubSpotUnixMs(sourceData?.dateclosed),

    // ========== Lead Source & Marketing ==========
    referred_by: sourceData?.custentity1,
    referral: ToHSBool(sourceData?.custentity2),
    competitor_shopping: sourceData?.custentity28,

    // ========== Communication Preferences ==========
    // hs_email_optout: ToHSBool(sourceData?.custentity11), // Unsubscribed from all email
    // unsubscribe: ToHSBool(sourceData?.unsubscribe),     // Not a standard Company field
    sms: ToHSBool(sourceData?.custentity36), // SMS subscription

    // ========== Financial ==========
    taxable: ToHSBool(sourceData?.taxable), // or use your own boolean helper

    // ========== Sales Activity & Engagement ==========

    // ========== Read‑Only Properties (commented – cannot be set via API) ==========
    // lastmodifieddate: toHubSpotUnixMs(sourceData?.lastmodifieddate),
    // hs_last_sales_activity_timestamp: toHubSpotUnixMs(
    //   sourceData?.custentity_date_lsa
    // ),
    // hs_recent_closed_order_date: toHubSpotUnixMs(sourceData?.lastsaledate),
    // hs_first_order_closed_date: toHubSpotUnixMs(sourceData?.firstsaledate),
  });

  return payload;
}

/*!SECTION
[, , , , , ]
*/
function mapCompanyLifecyclestage(netsuiteStatus) {
  const stageMap = {
    13: "other", // Customer
    14: "other", // Prospect (from your data: entitystatus "14")
    1: "219363586", // Lead
    2: "lead", // Opportunity
    3: "marketingqualifiedlead", // Customer
    4: "salesqualifiedlead", // Evangelist
    5: "opportunity", // Other
    6: "customer", // Subscriber
    // 13: "customer", // Customer
    // 14: "prospect", // Prospect (from your data: entitystatus "14")
    // 1: "lead", // Lead
    // 2: "opportunity", // Opportunity
    // 3: "customer", // Customer
    // 4: "evangelist", // Evangelist
    // 5: "other", // Other
    // 6: "subscriber", // Subscriber
  };

  const mapped = stageMap[String(netsuiteStatus)];
  if (!mapped && netsuiteStatus) {
    logger.warn(`Unknown company entitystatus: ${netsuiteStatus}`);
  }
  return mapped || null;
}

// Helper function for Company Lead Status mapping
function mapCompanyLeadStatus(netsuiteStage) {
  const statusMap = {
    LEAD: "NEW",
    PROSPECT: "OPEN", // From your data: stage "PROSPECT"
    CUSTOMER: "CUSTOMER",
  };

  return statusMap[netsuiteStage] || null;
}

// function contactMappingNSToHS(sourceData) {
//   if (!sourceData?.email) {
//     logger.warn(`Email is empty : ${JSON.stringify(sourceData)}`);
//     return null;
//   }
//   const payload = cleanProps({
//     sourceid: sourceData?.id,
//     email: sourceData?.email,
//     phone: sourceData.phone,
//     mobilephone: sourceData.mobile,
//     firstname: sourceData.firstname,
//     lastname: sourceData.lastname,
//     website: sourceData?.website,
//     address: sourceData?.address,
//     city: sourceData?.address_city,
//     state: sourceData?.address_state,
//     zip: sourceData?.address_postcode,
//     fax: sourceData?.fax_number,
//   });

//   return payload;
//   //   return { properties: payload };
// }

// function companyMappingNSToHS(sourceData) {
//   const payload = cleanProps({
//     sourceid: sourceData?.id,
//     name: sourceData?.companyname,
//     // domain: sourceData?.website,
//     address: sourceData?.defaultbillingaddress,
//     address2: sourceData?.defaultshippingaddress,
//     city: sourceData?.address_city,
//     state: sourceData?.address_state,
//     country: sourceData?.address_country,
//     zip: sourceData?.address_postcode,
//     phone: sourceData.phone,
//   });

//   return payload;
//   //   return { properties: payload };
// }

export { contactMappingNSToHS, companyMappingNSToHS };
