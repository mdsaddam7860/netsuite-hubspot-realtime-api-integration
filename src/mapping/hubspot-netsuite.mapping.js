// mapping/netsuiteMapper.js
import { isValidEmail, logger, cleanProps } from "../index.js";
/**
 * Removes undefined, null, or empty string values from an object.
 * Crucial for PATCH requests to avoid clearing existing data in NetSuite.
 */
// function cleanProps(obj) {
//   return Object.fromEntries(
//     Object.entries(obj).filter(
//       ([_, v]) => v !== "" && v !== null && v !== undefined
//     )
//   );
// }
// function ToNSBool(value) {
//   if (
//     value === 1 ||
//     value === "1" ||
//     value === true ||
//     value === "true" ||
//     value === "T"
//   ) {
//     return "T";
//   }

//   return "F";
// }

/**
 * Maps standard data to NetSuite's Company Customer schema
 */
// function mapToNetSuiteCompany(sourceData) {
//   const payload = {
//     isperson: false,
//     companyname: sourceData.companyName,
//     email: sourceData.email,
//     phone: sourceData.phone,
//     // NetSuite almost always requires a subsidiary ID on customer creation
//     // subsidiary: sourceData.subsidiaryId
//     //   ? { id: sourceData.subsidiaryId }
//     //   : undefined,
//     // comments: sourceData.notes,
//   };

//   return cleanPayload(payload);
// }

function mapCompanyLifecyclestage(sourceData) {
  let value = null;
  if (typeof sourceData === "number") value = sourceData;
  if (typeof sourceData === "string") {
    value = sourceData.trim().toLowerCase();
  }
  const stageMap = {
    customer: 13, // Customer
    prospect: 14, // Prospect (from your data: entitystatus "14")
    lead: 1, // Lead
    opportunity: 2, // Opportunity
    customer: 3, // Customer
    evangelist: 4, // Evangelist
    other: 5, // :5 Other
    subscriber: 6, // Subscriber
  };

  const mapped = stageMap[String(value)] || null;
  if (!mapped && sourceData) {
    logger.warn(`Unknown company entitystatus: ${sourceData}`);
  }
  return mapped || null;
}

// Helper function for Company Lead Status mapping
function mapCompanyLeadStatus(sourceData) {
  let value = null;
  if (typeof sourceData === "number") value = sourceData;
  if (typeof sourceData === "string") {
    value = sourceData.trim().toLowerCase();
  }
  const statusMap = {
    // NEW: "LEAD",
    // OPEN: "PROSPECT", // From your data: stage "PROSPECT"
    // CUSTOMER: "CUSTOMER",

    opportunity: 13,
    customer: 14,
    lead: 15,
  };

  return statusMap[value] || null;
}
function mapToNetSuiteCompany(hsData) {
  // Assuming hsData is a flattened object of HubSpot properties.
  // In HubSpot, the default company name property is simply 'name'.
  if (!hsData?.name) {
    logger.warn(
      `Company name is empty from HubSpot : ${JSON.stringify(hsData)}`
    );
    return null;
  }

  // logger.info(`[HubSpot] Company to sync: ${JSON.stringify(hsData, null, 2)}`);

  const payload = cleanProps({
    // ========== Core Identity ==========
    // Note: 'id' is omitted for creation, but required if updating an existing NS record
    companyname: hsData?.name,
    website: hsData?.domain,

    // ========== Email Fields (custom company properties) ==========
    custentity_sp_alt_email: hsData?.alt_email,
    custentity34: hsData?.alt_email_2,
    custentity35: hsData?.alt_email_3,

    // ========== Phone Fields ==========
    phone: hsData?.phone,
    mobilephone: hsData?.mobilephone,
    custentity31: hsData?.work_phone,
    custentity32: hsData?.alt_phone_2,
    custentity33: hsData?.alt_phone_3,

    // ========== Address Fields ==========
    // *Important NetSuite Note*: While you can sometimes map flat billing/shipping fields,
    // NetSuite strictly manages addresses via the 'addressbook' sublist. If this flat mapping
    // fails during creation, you will need to restructure this into a sublist array.
    defaultbillingaddress: hsData?.address,
    defaultshippingaddress: hsData?.address2,
    billing_city: hsData?.city,
    billing_state: hsData?.state,
    billing_country: hsData?.country,
    billing_zip: hsData?.zip,

    // ========== Equipment & Machine Info ==========
    custentity_skidpro_carrier_machine: hsData?.carrier_machine,
    custentity16: hsData?.carrier_machine_2,
    custentity_skidpro_carrier3: hsData?.carrier_machine_3,
    custentity_skidpro_carrier4: hsData?.carrier_machine_4,
    custentity4: hsData?.skid_loader_make,
    custentity5: hsData?.brand__model,
    custentity_sp_skid_steer_make: hsData?.lead_ad_prop1,
    custentity_sp_skid_steer_model: hsData?.lead_ad_prop2,
    custentity29: hsData?.machine_type, // Assuming this is text, otherwise needs reverseDropdown()
    custentity18: hsData?.attachments_of_interest,
    custentity27: hsData?.current_attachments,

    // ========== Sales & Ownership ==========
    custentityacs_salesrep: hsData?.sales_rep,

    // ========== Status & Lifecycle ==========
    // Requires helper functions to convert HS strings back to NS Internal IDs
    entitystatus: mapCompanyLifecyclestage(hsData?.lifecyclestage),
    stage: mapCompanyLeadStatus(hsData?.hs_lead_status),
    // dateclosed: toNSDate(hsData?.closedate), // Convert Unix Ms to NS Date String

    // ========== Lead Source & Marketing ==========
    custentity1: hsData?.referred_by,
    custentity2: ToNSBool(hsData?.referral),
    custentity28: hsData?.competitor_shopping,

    // ========== Communication Preferences ==========
    custentity36: ToNSBool(hsData?.sms),

    // ========== Financial ==========
    taxable: ToNSBool(hsData?.taxable),
  });

  return payload;
}
/**
 * Maps standard data to NetSuite's Individual Customer schema
 */
// function mapToNetSuitePerson(sourceData) {
//   const payload = {
//     isperson: true,
//     firstname: sourceData.firstName,
//     lastname: sourceData.lastName,
//     email: sourceData.email,
//     phone: sourceData.phone,
//     // subsidiary: sourceData.subsidiaryId
//     //   ? { id: sourceData.subsidiaryId }
//     //   : undefined,
//   };

//   return cleanPayload(payload);
// }

function leadStatusMapping(sourceData) {
  let value = null;
  if (typeof sourceData === "number") value = sourceData;
  if (typeof sourceData === "string") {
    value = sourceData.trim().toLowerCase();
  }
  const leadStatusMapping = {
    // in_progress: "IN_PROGRESS",
    // new: "NEW",
    // nurture: "Nurture",
    // unqualified: "UNQUALIFIED",
    // qualified: "QUALIFIED",
    in_progress: "PROSPECT",
    QUALIFIED: "CUSTOMER",
    new: "LEAD",
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
    // 219363586: "219363586",
    // lead: "lead",
    // marketingqualifiedlead: "marketingqualifiedlead",
    // salesqualifiedlead: "salesqualifiedlead",
    // opportunity: "opportunity",
    // customer: "customer",
    // other: "other",

    opportunity: 13,
    customer: 14,
    lead: 15,
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
    "Full Size Skid Loader": 1,
    "Mini Skid Loader": 2,
    Tractor: 3,
  };

  return allowedOptions[value] || null;
}
function mapToNetSuitePerson(hsData) {
  // If your hsData comes directly from a HubSpot webhook or API v3,
  // fields might be nested under hsData.properties.
  // Assuming hsData is already flattened here to match your style.

  if (!hsData?.email) {
    logger.warn(`Email is empty from HubSpot : ${JSON.stringify(hsData)}`);
    return null;
  }

  // Optional: Validating email before pushing to NetSuite
  if (!isValidEmail(hsData?.email)) {
    logger.warn(`Email is invalid from HubSpot : ${JSON.stringify(hsData)}`);
    return null;
  }

  const payload = cleanProps({
    // --- Core Identity ---
    // Note: 'id' is omitted for creation, but required if you are doing an update (Internal ID in NS)
    subsidiary: { id: 1 },
    isperson: true,
    firstname: hsData?.firstname,
    lastname: hsData?.lastname,
    companyname: hsData?.company,

    // --- Email Fields ---
    email: isValidEmail(hsData?.email) ? hsData?.email : null, // Primary email (must be valid)
    custentity_sp_alt_email: isValidEmail(hsData?.alt_email)
      ? hsData?.alt_email
      : null,
    custentity34: isValidEmail(hsData?.alt_email_2)
      ? hsData?.alt_email_2
      : null,
    custentity35: isValidEmail(hsData?.alt_email_3)
      ? hsData?.alt_email_3
      : null,

    // --- Phone Fields ---
    phone: hsData?.phone,
    mobilephone: hsData?.mobilephone,
    custentity31: hsData?.work_phone,
    custentity32: hsData?.alt_phone_2,
    custentity33: hsData?.alt_phone_3,

    // --- Address Fields ---
    // Note: NetSuite often prefers updates to standard address fields via the 'addressbook' sublist,
    // but if you have these exposed as flat body fields for integration, this will work.
    defaultbillingaddress: hsData?.address,
    defaultshippingaddress: hsData?.shipping_address,
    billing_city: hsData?.city,
    billing_state: hsData?.state,
    billing_zip: hsData?.zip,
    fax: hsData?.fax,
    website: hsData?.website,
    billing_country: hsData?.country,

    // --- Equipment & Machine Info ---
    // custentity16: hsData?.carrier_machine_2,
    // custentity_skidpro_carrier3: hsData?.carrier_machine_3,
    // custentity_skidpro_carrier4: hsData?.carrier_machine_4,
    custentity4: hsData?.skid_loader_make,
    custentity5: hsData?.brand__model,
    custentity_sp_skid_steer_make: hsData?.lead_ad_prop1,
    custentity_sp_skid_steer_model: hsData?.lead_ad_prop2,

    // Reverse Dropdown Mappings
    custentity29: machineTypeDropDown(hsData?.machine_type),
    custentity18: hsData?.attachments_of_interest,
    custentity27: hsData?.current_attachments,
    // custentity_skidpro_carrier_machine: hsData?.carrier_machine,

    // --- Lead Source & Marketing ---
    custentity1: hsData?.referred_by,
    // custentity2: ToNSBool(hsData?.referral),
    custentity28: hsData?.competitor_shopping,

    // --- Communication Preferences ---
    unsubscribe: hsData?.unsubscribe,
    // unsubscribe: ToNSBool(hsData?.unsubscribe),
    // custentity36: ToNSBool(hsData?.sms),
    // taxable: ToNSBool(hsData?.taxable),

    // --- Sales & Ownership ---
    custentityacs_salesrep: hsData?.sales_rep,

    // --- Status & Lifecycle ---
    // dateclosed: toNSDate(hsData?.closedate),
    entitystatus: lifecyclestage(hsData?.lifecyclestage),
    stage: leadStatusMapping(hsData?.hs_lead_status),
  });

  return payload;
}

// -------------------------------------------------------------------
// This file contains functions that transform data from HubSpot to NetSuite.
// Mirrors the logic in netsuite-hubspot_mapping.js, but in reverse.
// This file contains functions that transform data from HubSpot to NetSuite.
// Mirrors the logic in netsuite-hubspot_mapping.js, but in reverse.
// TODO - Move this logic into netsuite-hubspot_mapping.js

/* ============================================================
 * HELPERS
 * ============================================================ */

// HubSpot boolean -> NetSuite REST API boolean.
// NOTE: NetSuite's REST Record API (used by netsuiteOAuthClient/oauthRequest)
// expects native JSON true/false for checkbox fields, NOT the "T"/"F"
// strings used by NetSuite's older SOAP/CSV-import APIs. Sending "T"/"F"
// here causes: "Unable to parse value 'T' (String) from the Boolean field".
function ToNSBool(value) {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  return null;
}

/**
 * Converts a HubSpot Unix ms timestamp (or date string) back into a
 * NetSuite REST API LocalDate string (YYYY-MM-DD).
 * NOTE: NetSuite's REST Record API expects ISO format (YYYY-MM-DD) for
 * LocalDate fields, NOT MM/DD/YYYY (that format is for SOAP/CSV import).
 * Sending MM/DD/YYYY causes:
 * "Unable to parse value '...' (String) from the LocalDate field".
 * @param {number|string} hsValue
 * @returns {string|null}
 */
function toNetSuiteDateString(hsValue) {
  if (hsValue === null || hsValue === undefined || hsValue === "") return null;

  const date =
    typeof hsValue === "number" ? new Date(hsValue) : new Date(hsValue);

  if (isNaN(date.getTime())) {
    logger.warn(`Invalid HubSpot date value provided: ${hsValue}`);
    return null;
  }

  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// HubSpot lifecyclestage -> NetSuite entitystatus id
// Canonical NS id chosen for each HS stage where the forward (NS -> HS) map
// was many-to-one (13 chosen over 15 for "customer", 14 over 16 for "other").
const lifecyclestageToEntityStatus = {
  lead: "6",
  salesqualifiedlead: "7",
  opportunity: "10",
  customer: "13",
  other: "14",
};

function entityStatusFromLifecyclestage(hsLifecyclestage) {
  if (!hsLifecyclestage) return null;
  const value = String(hsLifecyclestage).trim().toLowerCase();
  const mapped = lifecyclestageToEntityStatus[value];

  if (!mapped) {
    logger.warn(
      `[HubSpot -> NetSuite] Unmapped lifecyclestage, skipping entitystatus: ${hsLifecyclestage}`
    );
    return null;
  }
  return mapped;
}

// HubSpot hs_lead_status -> NetSuite stage (contacts)
const leadStatusToStage = {
  IN_PROGRESS: "PROSPECT",
  QUALIFIED: "CUSTOMER",
  NEW: "LEAD",
};

function stageFromLeadStatus(hsLeadStatus) {
  if (!hsLeadStatus) return null;
  const mapped = leadStatusToStage[hsLeadStatus];
  if (!mapped) {
    logger.warn(
      `[HubSpot -> NetSuite] Unmapped hs_lead_status, skipping stage: ${hsLeadStatus}`
    );
    return null;
  }
  return mapped;
}

// HubSpot hs_lead_status -> NetSuite stage (companies)
// Company-side forward map used OPEN_DEAL for "customer" instead of QUALIFIED.
const companyLeadStatusToStage = {
  IN_PROGRESS: "PROSPECT",
  OPEN_DEAL: "CUSTOMER",
  NEW: "LEAD",
};

function companyStageFromLeadStatus(hsLeadStatus) {
  if (!hsLeadStatus) return null;
  const mapped = companyLeadStatusToStage[hsLeadStatus];
  if (!mapped) {
    logger.warn(
      `[HubSpot -> NetSuite] Unmapped company hs_lead_status, skipping stage: ${hsLeadStatus}`
    );
    return null;
  }
  return mapped;
}

// HubSpot machine_type label -> NetSuite custentity29 List/Record field.
// NOTE: NetSuite's REST API expects List/Select (and MultiSelect) fields
// as a reference object { id: "..." }, NOT a bare string. Sending "1"
// causes: "Unable to parse value '1' (String) from the List,MultiSelect field".
const machineTypeToNSId = {
  "full size skid loader": "1",
  "mini skid loader": "2",
  tractor: "3",
};

function machineTypeIdFromLabel(hsLabel) {
  if (!hsLabel) return null;
  const value = String(hsLabel).trim().toLowerCase();
  const mapped = machineTypeToNSId[value];
  if (!mapped) {
    logger.warn(
      `[HubSpot -> NetSuite] Unmapped machine_type label, skipping custentity29: ${hsLabel}`
    );
    return null;
  }
  return { id: mapped };
}

/* ============================================================
 * CONTACT MAPPING
 * ============================================================ */

/**
 * Maps a HubSpot Contact record to a NetSuite Contact/Customer payload.
 * Mirrors contactMappingNSToHS (in netsuite-hubspot_mapping.js), but in
 * reverse. Fields that only exist on the HubSpot side (no NetSuite field)
 * are intentionally omitted, since there is nowhere in NetSuite to write
 * them.
 *
 * @param {object} hsData - HubSpot contact properties object
 * @returns {object|null} NetSuite-ready payload, or null if invalid
 */
function contactMappingHSToNS(hsData) {
  if (!hsData?.email || !isValidEmail(hsData?.email)) {
    logger.warn(
      `[HubSpot -> NetSuite] Email is empty or invalid: ${JSON.stringify(
        hsData
      )}`
    );
    return null;
  }

  const payload = cleanProps({
    isperson: true,
    subsidiary: { id: 1 },
    // --- Core Identity ---
    id: hsData?.sourceid, // NetSuite internal id, if already synced once
    firstname: hsData?.firstname,
    lastname: hsData?.lastname,
    companyname: hsData?.company,

    // --- Email Fields ---
    email: isValidEmail(hsData?.email) ? hsData?.email : null,
    custentity_sp_alt_email: isValidEmail(hsData?.alt_email)
      ? hsData?.alt_email
      : null,
    custentity34: isValidEmail(hsData?.alt_email_2)
      ? hsData?.alt_email_2
      : null,
    custentity35: isValidEmail(hsData?.alt_email_3)
      ? hsData?.alt_email_3
      : null,

    // --- Phone Fields ---
    phone: hsData?.phone,
    mobilephone: hsData?.mobilephone,
    custentity31: hsData?.work_phone,
    custentity32: hsData?.alt_phone_2,
    custentity33: hsData?.alt_phone_3,

    // --- Address Fields ---
    // Note: billing/shipping address fields in NetSuite are typically
    // sub-record/id based, not plain strings. If your NetSuite side
    // expects address internal ids rather than raw text, this will
    // need an address-lookup step upstream of this mapping.
    address: hsData?.address,
    defaultshippingaddress: hsData?.shipping_address,
    billing_city: hsData?.city,
    billing_state: hsData?.state,
    billing_zip: hsData?.zip,
    billing_country: hsData?.country,
    fax: hsData?.fax,
    website: hsData?.website,

    // --- Equipment & Machine Info ---
    custentity4: hsData?.skid_loader_make,
    custentity5: hsData?.brand__model,
    custentity_sp_skid_steer_make: hsData?.lead_ad_prop1,
    custentity_sp_skid_steer_model: hsData?.lead_ad_prop2,
    // custentity29: machineTypeIdFromLabel(hsData?.machine_type),
    custentity18: hsData?.attachments_of_interest,
    custentity27: hsData?.current_attachments,
    // carrier_machine / carrier_machine_2-4: no NetSuite field to write
    // to (marked "Not exists in Netsuite" in the forward map) - skipped.

    // --- Lead Source & Marketing ---
    custentity1: hsData?.referred_by,
    custentity2: ToNSBool(hsData?.referral),
    custentity28: hsData?.competitor_shopping,

    // --- Communication Preferences ---
    unsubscribe: ToNSBool(hsData?.unsubscribe),
    custentity36: ToNSBool(hsData?.sms),
    taxable: ToNSBool(hsData?.taxable),

    // --- Sales & Ownership ---
    custentityacs_salesrep: hsData?.sales_rep,

    // --- Status & Lifecycle ---
    dateclosed: toNetSuiteDateString(hsData?.closedate),
    entitystatus: entityStatusFromLifecyclestage(hsData?.lifecyclestage),
    stage: stageFromLeadStatus(hsData?.hs_lead_status),

    custentity_date_lsa: toNetSuiteDateString(hsData?.last_sales_activity),
  });

  logger.debug(
    `[HubSpot -> NetSuite] Contact : ${JSON.stringify(
      hsData
    )}\n Payload ${JSON.stringify(payload)}`
  );

  return payload;
}

/* ============================================================
 * COMPANY MAPPING
 * ============================================================ */

/**
 * Maps a HubSpot Company record to a NetSuite Company/Customer payload.
 * Mirrors companyMappingNSToHS (in netsuite-hubspot_mapping.js), but in
 * reverse. Only fields that were confirmed to exist as real NetSuite
 * fields in the forward map (i.e. not commented out as "property does
 * not exist") are included here.
 *
 * @param {object} hsData - HubSpot company properties object
 * @returns {object|null} NetSuite-ready payload, or null if invalid
 */
function companyMappingHSToNS(hsData) {
  if (!hsData?.name) {
    logger.warn(
      `[HubSpot -> NetSuite] Company name is empty: ${JSON.stringify(hsData)}`
    );
    return null;
  }

  const payload = cleanProps({
    isperson: false,
    subsidiary: { id: 1 },
    // --- Core Identity ---
    id: hsData?.sourceid,
    companyname: hsData?.name,
    website: hsData?.domain,

    // --- Phone Fields ---
    // Only "phone" exists as a real NetSuite company field per the
    // forward map; mobilephone/work_phone/alt_phone_* were marked
    // "property does not exist" and are intentionally skipped.
    phone: hsData?.phone,

    // --- Address Fields ---
    defaultbillingaddress: hsData?.address,
    defaultshippingaddress: hsData?.address2,
    billing_city: hsData?.city,
    billing_state: hsData?.state,
    billing_country: hsData?.country,
    billing_zip: hsData?.zip,

    // --- Status & Lifecycle ---
    entitystatus: entityStatusFromLifecyclestage(hsData?.lifecyclestage),
    stage: companyStageFromLeadStatus(hsData?.hs_lead_status),
    dateclosed: toNetSuiteDateString(hsData?.closedate),

    // Equipment/machine, referral, sms, taxable, sales_rep fields were
    // all marked "property does not exist" on the Company side in the
    // forward map, so there is nowhere in NetSuite to write them here.
  });

  logger.debug(
    `[HubSpot -> NetSuite] Company : ${JSON.stringify(
      hsData
    )}\n Payload ${JSON.stringify(payload)}`
  );

  return payload;
}

export {
  contactMappingHSToNS,
  companyMappingHSToNS,
  mapToNetSuitePerson,
  mapToNetSuiteCompany,
};
