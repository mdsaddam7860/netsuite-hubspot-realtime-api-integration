import fs from "fs";
import path from "path";
import { getHubspotClient } from "../configs/hubspot.config.js";
import { logger } from "../index.js";
function delta() {
  const date = new Date();
  // date.setDate(date.getDate() - 2);
  date.setDate(date.getDate() - 1);

  const previousDate = date.toISOString().split("T")[0];
  return previousDate;
}
function currentDate() {
  const date = new Date();

  return date.toISOString().split("T")[0];
}

function contactProperties() {
  return [
    "email",
    "firstname",
    "lastname",
    "sourceid",
    "city",
    "state",
    "zip",
    "country",
    "website",
    "phone",
    "mobilephone",
    "address",
  ];
}
function dealProperties() {
  return [
    "sourceid",
    "dealname",
    "dealstage",
    "amount",
    // "hs_lastmodifieddate",
    "job_status_servicem8",
    "job_uuid_service_m8",
    "generated_job_id_service_m8",
    "dealstage",
    "pipeline",
    "job_address_service_m8",
    "billing_address_service_m8",
    "job_description_service_m",
    // "amount",
    "purchase_order_number_service_m8",
    "quote_sent_service_m8",
    "invoice_sent_service_m8",
    "payment_received_service_m8",
    "quote_sent_timestamp_service_m8",
    "invoice_sent_timestamp_service_m8",
    "payment_received_timestamp_service_m8",
    // "job_unsuccessful_date_service_m8",
    // "completion_date_service_m8",
    // "work_order_date_service_m8",
    "amount_servicem8",
  ];
}
function companyProperties() {
  return [
    "sourceid",
    "about_us",
    "city",
    "domain",
    "name",
    "country",
    "city",
    "street",
    "state",
    "zip",
    "address",
    "hs_country_code",
    "description",
    "address",
    "zip",
    "address2",
  ];
}

function cleanProps(obj) {
  if (!obj || typeof obj !== "object") return obj;

  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => {
      // Remove null or undefined
      if (value === null || value === undefined) return false;

      // Remove empty string
      if (typeof value === "string" && value.trim() === "") return false;

      // Remove empty array
      if (Array.isArray(value) && value.length === 0) return false;

      // Remove empty object
      if (
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0
      )
        return false;

      return true;
    })
  );
}

// Use path.join to ensure cross-platform compatibility (Windows vs Mac/Linux)
const filePath = path.join(process.cwd(), "lastSyncTime.json");

/**
 * Reads the last sync time from the file.
 * If the file doesn't exist, it defaults to 1 hour ago.
 */
function getLastSyncTime() {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data).lastSync;
    }
  } catch (error) {
    console.error("Error reading sync file, falling back to default.", error);
  }

  // Fallback: If no file exists, return the timestamp from 1 hour ago
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  return oneHourAgo.toISOString();

  // TODO : Change delta to 1 Hour
  // const fifteenMinsAgo = new Date();
  // fifteenMinsAgo.setMinutes(fifteenMinsAgo.getMinutes() - 2);
  // return fifteenMinsAgo.toISOString();
}

/**
 * Saves the current ISO date/time to the file.
 */
function saveLastSyncTime(date) {
  const syncData = {
    lastSync: date,
  };

  try {
    fs.writeFileSync(filePath, JSON.stringify(syncData, null, 2));
    console.log("Sync time updated to:", syncData.lastSync);
  } catch (error) {
    console.error("Failed to save sync time:", error);
  }
}

function convertAustralianFormat(phone) {
  if (!phone) {
    return null;
  }
  const rawPhone = phone;

  // 1. Remove all spaces and non-digit characters
  // let cleaned = rawPhone;
  let cleaned = rawPhone.replace(/\D/g, "");

  // 2. Replace leading '0' with '+61'
  if (cleaned.startsWith("0")) {
    cleaned = "+61" + cleaned.substring(1);
  } else if (!cleaned.startsWith("61")) {
    // Optional: Add +61 if it's missing entirely
    cleaned = "+61" + cleaned;
  }

  return cleaned;
}

let task_client = null;

function taskClient() {
  if (task_client) return task_client;

  const client = getHubspotClient();

  task_client = client.customObject("tasks");

  return task_client;
}

function needsUpdate(payload, existingRecord, objectType = "Object") {
  if (!existingRecord || !existingRecord.properties) return true;

  const newProps = payload?.properties || payload || {};
  const oldProps = existingRecord.properties || {};

  const changes = Object.keys(newProps).filter((key) => {
    let newVal = newProps[key];
    let oldVal = oldProps[key];

    // 1. Handle Null/Undefined/Empty values
    if (
      (newVal === null || newVal === undefined || newVal === "") &&
      (oldVal === null || oldVal === undefined || oldVal === "")
    ) {
      return false;
    }

    // 2. Specialized Date/Timestamp Comparison
    // Logic: Convert both to a common format (ISO String without milliseconds)
    if (
      key.endsWith("_date") ||
      key.includes("timestamp") ||
      key.includes("_stamp")
    ) {
      try {
        const d1 = newVal ? new Date(newVal).toISOString().split(".")[0] : null;
        const d2 = oldVal ? new Date(oldVal).toISOString().split(".")[0] : null;
        return d1 !== d2;
      } catch (e) {
        // If date parsing fails, fall back to string comparison
      }
    }

    // 3. Specialized Number Comparison
    // Logic: Compare as floats to ignore trailing zeros (e.g., 10.5 vs 10.50)
    if (
      typeof newVal === "number" ||
      (!isNaN(parseFloat(oldVal)) && !isNaN(oldVal - 0))
    ) {
      const n1 = parseFloat(newVal);
      const n2 = parseFloat(oldVal);
      if (!isNaN(n1) && !isNaN(n2)) {
        return n1 !== n2;
      }
    }

    // 4. Default: String Normalization
    const normalizedNew = String(newVal ?? "").trim();
    const normalizedOld = String(oldVal ?? "").trim();

    return normalizedNew !== normalizedOld;
  });

  if (changes.length > 0) {
    logger.info(
      `[Idempotency] ${objectType} change detected in: ${changes.join(", ")}`
    );
    return true;
  }

  return false;
}

function taskProperties() {
  return [
    "hs_object_id",
    "service_m8_uuid",
    "hs_task_subject",
    "hs_task_status",
    "hs_task_reminders",
    "hs_task_recurrence",
    "hs_repeat_status",
    "hs_task_repeat_interval",
    "hs_repeat_status",
    "hs_task_repeat_interval",
  ];
}

/**
 * Compares the HubSpot-generated payload against the existing ServiceM8 record.
 * Returns true if a significant change is detected, false otherwise.
 */
function needsUpdateJob(payload, existingJob) {
  // These keys match the LEFT side of your jobMappingHSTOSM8 function
  const fieldsToCompare = [
    "status",
    "generated_job_id",
    "job_address",
    "billing_address",
    "job_description",
    "payment_amount",
    "purchase_order_number",
    "quote_sent",
    "invoice_sent",
    "payment_received",
    "unsuccessful_date",
    "completion_date",
    "work_order_date",
  ];

  for (const key of fieldsToCompare) {
    let newVal = payload[key];
    let oldVal = existingJob[key];

    // 1. Handle Booleans & Flags (ServiceM8 1/0 vs HubSpot "true"/"false")
    if (["quote_sent", "invoice_sent", "payment_received"].includes(key)) {
      const toBool = (v) => v === true || v === 1 || v === "true" || v === "1";
      if (toBool(newVal) !== toBool(oldVal)) {
        logger.info(
          `[Idempotency] Flag change in ${key}: ${oldVal} -> ${newVal}`
        );
        return true;
      }
      continue;
    }

    // 2. Handle Numbers (payment_amount)
    if (key === "payment_amount") {
      if (parseFloat(newVal || 0) !== parseFloat(oldVal || 0)) {
        logger.info(`[Idempotency] Amount change: ${oldVal} -> ${newVal}`);
        return true;
      }
      continue;
    }

    // 3. Handle Dates (Normalization)
    if (key.endsWith("_date") || key.endsWith("_stamp")) {
      const toTime = (v) => {
        if (!v || String(v).startsWith("0000")) return null;
        return new Date(v).getTime();
      };
      if (toTime(newVal) !== toTime(oldVal)) {
        logger.info(
          `[Idempotency] Date change in ${key}: ${oldVal} -> ${newVal}`
        );
        return true;
      }
      continue;
    }

    // 4. Standard String Comparison (status, addresses, descriptions)
    const strNew = String(newVal ?? "").trim();
    const strOld = String(oldVal ?? "").trim();

    // Special case for descriptions to ignore hidden \r characters
    if (key === "job_description") {
      const clean = (s) => s.replace(/\r\n/g, "\n").trim();
      if (clean(strNew) !== clean(strOld)) {
        logger.info(`[Idempotency] Description mismatch detected.`);
        return true;
      }
      continue;
    }

    if (strNew !== strOld) {
      logger.info(
        `[Idempotency] Field change: ${key} | "${strOld}" -> "${strNew}"`
      );
      return true;
    }
  }

  return false;
}
// function shouldUpdateDeal(newPayload, existingDeal) {
//   if (!existingDeal || !existingDeal.properties) return true;

//   const oldProps = existingDeal.properties;
//   const changes = [];

//   for (const [key, newVal] of Object.entries(newPayload)) {
//     const oldVal = oldProps[key];

//     // 1. Explicitly skip the category field
//     if (key === "servicem8_job_category") continue;

//     // 2. Skip if both are essentially empty
//     if ((newVal == null || newVal === "") && (oldVal == null || oldVal === ""))
//       continue;

//     let hasChanged = false;

//     // 3. Date Comparison
//     if (
//       key.includes("timestamp") ||
//       key.endsWith("_date") ||
//       key.endsWith("_stamp")
//     ) {
//       const time1 = newVal ? new Date(newVal).getTime() : 0;
//       const time2 = oldVal ? new Date(oldVal).getTime() : 0;
//       if (Math.abs(time1 - time2) > 1000) hasChanged = true;
//     }

//     // 4. Numeric Comparison - ONLY checking before the decimal point (.)
//     else if (
//       typeof newVal === "number" ||
//       key.includes("amount") ||
//       key.includes("total")
//     ) {
//       // Math.trunc removes everything after the decimal point
//       const n1 = Math.trunc(parseFloat(newVal || 0));
//       const n2 = Math.trunc(parseFloat(oldVal || 0));

//       if (n1 !== n2) {
//         // DEBUG LOG: Remove this after you find the culprit
//         logger.info(
//           `[DEBUG] Numeric mismatch on ${key}: New=${n1} (from ${newVal}), Old=${n2} (from ${oldVal})`
//         );
//         hasChanged = true;
//       }
//     }

//     // 5. String/Boolean
//     else {
//       if (String(newVal ?? "").trim() !== String(oldVal ?? "").trim()) {
//         hasChanged = true;
//       }
//     }

//     if (hasChanged) {
//       changes.push(key);
//     }
//   }

//   if (changes.length > 0) {
//     logger.info(`[Idempotency] Deal change detected in: ${changes.join(", ")}`);
//     return true;
//   }

//   return false;
// }

function shouldUpdateDeal(newPayload, existingDeal) {
  // If the deal doesn't exist yet, we definitely want to create/update it
  if (!existingDeal || !existingDeal.properties) return true;

  const oldProps = existingDeal.properties;

  // Extract the status fields (default to empty string to avoid null errors)
  const newStatus = String(newPayload.job_status_servicem8 ?? "").trim();
  const oldStatus = String(oldProps.job_status_servicem8 ?? "").trim();

  // Compare strictly on status
  if (newStatus !== oldStatus) {
    logger.info(
      `[Idempotency] Deal status change detected: Old=[${oldStatus}] -> New=[${newStatus}]. Proceeding with update.`
    );
    return true;
  }

  // If status is the same, do nothing (even if other fields changed)
  logger.info(`[Idempotency] No status change detected. Skipping update.`);
  return false;
}
export {
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
};
