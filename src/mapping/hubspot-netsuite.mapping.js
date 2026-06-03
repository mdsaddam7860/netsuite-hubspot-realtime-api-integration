// mapping/netsuiteMapper.js
import { logger, isValidEmail } from "../index.js";
/**
 * Removes undefined, null, or empty string values from an object.
 * Crucial for PATCH requests to avoid clearing existing data in NetSuite.
 */
function cleanProps(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([_, v]) => v !== "" && v !== null && v !== undefined
    )
  );
}
function ToNSBool(value) {
  if (
    value === 1 ||
    value === "1" ||
    value === true ||
    value === "true" ||
    value === "T"
  ) {
    return "T";
  }

  return "F";
}

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

function mapCompanyLifecyclestage(netsuiteStatus) {
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

  const mapped = stageMap[String(netsuiteStatus)];
  if (!mapped && netsuiteStatus) {
    logger.warn(`Unknown company entitystatus: ${netsuiteStatus}`);
  }
  return mapped || null;
}

// Helper function for Company Lead Status mapping
function mapCompanyLeadStatus(netsuiteStage) {
  const statusMap = {
    NEW: "LEAD",
    OPEN: "PROSPECT", // From your data: stage "PROSPECT"
    CUSTOMER: "CUSTOMER",
  };

  return statusMap[netsuiteStage] || null;
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

    opportunity: prospect,
    customer: customer,
    lead: lead,
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
export { mapToNetSuitePerson, mapToNetSuiteCompany };
