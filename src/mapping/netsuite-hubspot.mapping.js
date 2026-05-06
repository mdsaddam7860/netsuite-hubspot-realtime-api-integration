import {
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

function contactMappingNSToHS(sourceData) {
  if (!sourceData?.email) {
    logger.warn(`Email is empty : ${JSON.stringify(sourceData)}`);
    return null;
  }
  const payload = cleanProps({
    // sourceid: sourceData?.id,
    email: sourceData?.email,
    phone: sourceData.phone,
    mobilephone: sourceData.mobile,
    firstname: sourceData.firstname,
    lastname: sourceData.lastname,
    website: sourceData?.website,
    address: sourceData?.address,
    city: sourceData?.address_city,
    state: sourceData?.address_state,
    zip: sourceData?.address_postcode,
    fax: sourceData?.fax_number,
  });

  return payload;
  //   return { properties: payload };
}

function companyMappingNSToHS(sourceData) {
  const payload = cleanProps({
    // sourceid: sourceData?.id,
    name: sourceData?.companyname,
    // domain: sourceData?.website,
    address: sourceData?.defaultbillingaddress,
    address2: sourceData?.defaultshippingaddress,
    city: sourceData?.address_city,
    state: sourceData?.address_state,
    country: sourceData?.address_country,
    zip: sourceData?.address_postcode,
    phone: sourceData.phone,
  });

  return payload;
  //   return { properties: payload };
}

export { contactMappingNSToHS, companyMappingNSToHS };
