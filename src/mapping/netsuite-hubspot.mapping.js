// This file contains function that transform data from Netsuite to Hubspot.
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
    // in_progress: "IN_PROGRESS",
    // new: "NEW",
    // nurture: "Nurture",
    // unqualified: "UNQUALIFIED",
    // qualified: "QUALIFIED",
    prospect: "IN_PROGRESS",
    customer: "QUALIFIED",
    lead: "NEW",
  };

  return leadStatusMapping[value] || null;
}
function lifecyclestage(netsuiteStatus) {
  const stageMap = {
    6: "lead",
    7: "salesqualifiedlead",
    10: "opportunity",
    13: "customer",
    14: "other",
    15: "customer",
    16: "other",
  };

  const mapped = stageMap[String(netsuiteStatus)];

  if (!mapped && netsuiteStatus) {
    logger.warn(`Unknown or unmapped company entitystatus: ${netsuiteStatus}`);
  }

  return mapped || null;
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
  if (!sourceData?.email || !isValidEmail(sourceData?.email)) {
    logger.warn(`Email is Empty or Invalid : ${JSON.stringify(sourceData)}`);
    return null;
  }

  // if (!isValidEmail(sourceData?.email)) {
  //   logger.warn(`Email is invalid : ${JSON.stringify(sourceData)}`);
  //   return null;
  // }

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
    carrier_machine_2: sourceData?.carrier_machine_2_name,
    carrier_machine_3: sourceData?.carrier_machine_3_name,
    carrier_machine_4: sourceData?.carrier_machine_4_name,
    skid_loader_make: sourceData?.custentity4,
    brand__model: sourceData?.custentity5,
    lead_ad_prop1: sourceData?.custentity_sp_skid_steer_make,
    lead_ad_prop2: sourceData?.custentity_sp_skid_steer_model,
    // Exists in netsuite
    machine_type: machineTypeDropDown(sourceData?.custentity29),
    attachments_of_interest: sourceData?.custentity18,
    current_attachments: sourceData?.custentity27,
    carrier_machine: sourceData?.carrier_machine_name,

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
    hs_lead_status: leadStatusMapping(sourceData?.stage),

    last_sales_activity: toHubSpotUnixMs(sourceData?.custentity_date_lsa),
    //  read only properties in hubspot
    // hs_recent_closed_order_date: sourceData?.lastsaledate,
    // hs_first_order_closed_date: toHubSpotUnixMs(sourceData?.firstsaledate),
  });

  logger.debug(`[Netsuite] Person : ${JSON.stringify(sourceData)}
  \n Payload ${JSON.stringify(payload)}
  `);

  return payload;
}

function companyMappingNSToHS(sourceData) {
  if (!sourceData?.companyname) {
    logger.warn(`Company name is empty for company ID: ${sourceData?.id}`);
    return null;
  }

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
    carrier_machine: sourceData?.carrier_machine_name,
    carrier_machine_2: sourceData?.carrier_machine_2_name,
    carrier_machine_3: sourceData?.carrier_machine_3_name,
    carrier_machine_4: sourceData?.carrier_machine_4_name,
    skid_loader_make: sourceData?.custentity4,
    brand__model: sourceData?.custentity5,
    lead_ad_prop1: sourceData?.custentity_sp_skid_steer_make, // Skid Steer Make
    lead_ad_prop2: sourceData?.custentity_sp_skid_steer_model, // Skid Steer Model
    machine_type: sourceData?.custentity29,
    attachments_of_interest: sourceData?.custentity18,
    current_attachments: sourceData?.custentity27,

    // ========== Sales & Ownership ==========
    sales_rep: sourceData?.custentityacs_salesrep,
    // ownername: sourceData?.["BUILTIN.DF(salesrep)"],   // read‑only / legacy – commented

    // ========== Status & Lifecycle ==========
    lifecyclestage: mapCompanyLifecyclestage(sourceData?.entitystatus),
    hs_lead_status: mapCompanyLeadStatus(sourceData?.stage),
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
  logger.debug(`[Netsuite] Company : ${JSON.stringify(sourceData)}
  \n Payload ${JSON.stringify(payload)}
  `);
  return payload;
}

/**
 * Maps NetSuite `entitystatus` IDs to HubSpot Company `lifecyclestage` internal names.
 *
 * MAPPED STATUSES (NetSuite -> HubSpot):
 * - 6 (Lead - Unqualified)       -> 'lead'
 * - 7 (Lead - Qualified)         -> 'salesqualifiedlead'
 * - 10 (Prospect - Proposal)     -> 'opportunity'
 * - 13 (Customer - Closed Won)   -> 'customer'
 * - 15 (Customer - Renewal)      -> 'customer'
 * - 14 (Prospect - Closed Lost)  -> 'other' (HS lacks a default "Lost Prospect" stage)
 * - 16 (Customer - Lost)         -> 'other' (HS lacks a default "Churned" stage)
 *
 * IGNORED NETSUITE STATUSES & WHY:
 * - IDs 1, 2, 3, 4, 5, -2: Left out because NetSuite classifies these as "JOB" (projects),
 *   not standard CRM Companies. Syncing them would corrupt HubSpot company lifecycle stages.
 * - IDs 8, 9: Left out because they are marked as 'inactive' in NetSuite.
 *
 * UNMAPPED HUBSPOT STAGES & WHY:
 * - '219363586' (Visitor), 'marketingqualifiedlead', 'evangelist': Left alone because
 *   there is no direct equivalent for these in this specific NetSuite environment.
 *   HubSpot will likely manage these top-of-funnel or post-sale stages natively.
 *
 * @param {string|number} netsuiteStatus - The internal ID of the NetSuite entitystatus
 * @returns {string|null} - The HubSpot internal value for lifecyclestage, or null if unmapped
 */
function mapCompanyLifecyclestage(netsuiteStatus) {
  const stageMap = {
    6: "lead",
    7: "salesqualifiedlead",
    10: "opportunity",
    13: "customer",
    14: "other",
    15: "customer",
    16: "other",
  };

  const mapped = stageMap[String(netsuiteStatus)];

  if (!mapped && netsuiteStatus) {
    logger.warn(`Unknown or unmapped company entitystatus: ${netsuiteStatus}`);
  }

  return mapped || null;
}

// Helper function for Company Lead Status mapping
function mapCompanyLeadStatus(netsuiteStage) {
  let value = null;
  if (typeof netsuiteStage === "number") value = netsuiteStage;
  if (typeof netsuiteStage === "string") {
    value = netsuiteStage.trim().toLowerCase();
  }
  const statusMap = {
    // LEAD: "NEW",
    // PROSPECT: "OPEN", // From your data: stage "PROSPECT"
    // CUSTOMER: "CUSTOMER",
    prospect: "IN_PROGRESS",
    customer: "OPEN_DEAL",
    lead: "NEW",
  };

  return statusMap[value] || null;
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

/* Mapping Issues 
"message": "\"hs_first_order_closed_date\" is a read only property; its value cannot be set.",
        "code": "READ_ONLY_VALUE",
        "context": {
          "propertyName": [
            "hs_first_order_closed_date"
          ]
        }







        {
    "links": [],
    "alcoholrecipienttype": "CONSUMER",
    "altemail": "ryanrosengren@gctel.net",
    "altname": "Ryan Rosengren",
    "altphone": "320-815-3217",
    "balancesearch": "0",
    "companyname": "Rosengren Lawn Care & Landscpaing",
    "consolbalancesearch": "0",
    "consoldaysoverduesearch": "0",
    "consoldepositbalancesearch": "0",
    "consoloverduebalancesearch": "0",
    "consolunbilledorderssearch": "0",
    "contactlist": "82085",
    "creditholdoverride": "AUTO",
    "currency": "1",
    "custentity10": "F",
    "custentity11": "T",
    "custentity16": "356",
    "custentity2": "F",
    "custentity36": "F",
    "custentity8": "F",
    "custentity9": "F",
    "custentity_2663_customer_refund": "F",
    "custentity_2663_direct_debit": "F",
    "custentity_atlas_customer_invoice_email": "ryanrosengren@gctel.net",
    "custentity_atlas_customer_probability": "1",
    "custentity_atlas_high_impact": "F",
    "custentity_date_lsa": "11/17/2025",
    "custentity_link_lsa": "/app/crm/common/note.nl?id=1259201&compid=6762947",
    "custentity_link_name_lsa": "11/17/2025 Note",
    "custentity_mw_address_validated_flag": "F",
    "custentity_naw_trans_need_approval": "F",
    "custentity_skd_phone_number_lookup": "320-815-3217",
    "custentity_skidpro_carrier3": "351",
    "custentity_skidpro_carrier_machine": "362",
    "custentity_solupay_cust_bypass_surcharge": "F",
    "custentity_sp_alt_email": "ryanrosengren@gctel.net",
    "custentity_sp_pipeline_email_1": "ryanrosengren@gctel.net",
    "custentity_sp_pipeline_home_phone": "320-815-3217",
    "custentity_sp_pipeline_id": "1037695210",
    "custentity_sp_pipeline_mobile_phone": "320-815-3217",
    "custentity_sp_pipeline_phone": "320-815-3217",
    "custentity_sp_qb_email_address": "ryanrosengren@gctel.net",
    "custentity_sp_qb_phone": "(320) 815-3217",
    "custentity_sp_qbid": "6342",
    "custentity_sp_skid_steer_make": "CAT",
    "custentity_sp_skid_steer_model": "262-C",
    "custentity_sp_skid_steer_units": "1",
    "custentity_versapay_migrate_cc": "F",
    "custentity_versapay_migrate_status": "F",
    "custentityemkting_emailundeliverable": "F",
    "custentityemkting_emailunsubscribed": "F",
    "dateclosed": "10/29/2022",
    "datecreated": "10/29/2022",
    "daysoverduesearch": "0",
    "defaultallocationstrategy": "-2",
    "defaultbillingaddress": "725917",
    "defaultshippingaddress": "594350",
    "depositbalancesearch": "0",
    "displaysymbol": "$",
    "duplicate": "F",
    "email": "ryanrosengren@gctel.net",
    "emailpreference": "DEFAULT",
    "emailtransactions": "F",
    "entityid": "75094",
    "entitynumber": "75094",
    "entitystatus": "13",
    "entitytitle": "75094 Ryan Rosengren",
    "externalid": "Q6342",
    "faxtransactions": "F",
    "firstname": "Ryan",
    "firstorderdate": "5/4/2023",
    "firstsaledate": "4/6/2018",
    "firstsaleperiod": "75",
    "fullname": "75094 Ryan Rosengren",
    "giveaccess": "F",
    "globalsubscriptionstatus": "2",
    "id": "82085",
    "isautogeneratedrepresentingentity": "F",
    "isbudgetapproved": "F",
    "isinactive": "F",
    "isjob": "F",
    "isperson": "T",
    "language": "en_US",
    "lastmodifieddate": "11/17/2025",
    "lastname": "Rosengren",
    "lastorderdate": "11/3/2025",
    "lastsaledate": "11/13/2025",
    "lastsaleperiod": "272",
    "monthlyclosing": "31",
    "oncredithold": "F",
    "overduebalancesearch": "0",
    "overridecurrencyformat": "F",
    "phone": "1 320-815-3217",
    "printtransactions": "F",
    "probability": "1",
    "receivablesaccount": "-10",
    "salesrep": "98",
    "searchstage": "Customer",
    "shipcomplete": "F",
    "shippingcarrier": "nonups",
    "stage": "CUSTOMER",
    "startdate": "4/25/2023",
    "subsidiary": "1",
    "symbolplacement": "1",
    "taxable": "T",
    "taxexempt": "F",
    "taxrounding": "OFF",
    "toplevelparent": "82085",
    "unbilledorderssearch": "0",
    "unsubscribe": "T",
    "weblead": "F"
  }
*/
