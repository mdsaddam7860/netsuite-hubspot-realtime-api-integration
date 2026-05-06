// mapping/netsuiteMapper.js

/**
 * Removes undefined, null, or empty string values from an object.
 * Crucial for PATCH requests to avoid clearing existing data in NetSuite.
 */
function cleanPayload(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([_, v]) => v !== "" && v !== null && v !== undefined
    )
  );
}

/**
 * Maps standard data to NetSuite's Company Customer schema
 */
function mapToNetSuiteCompany(sourceData) {
  const payload = {
    isperson: false,
    companyname: sourceData.companyName,
    email: sourceData.email,
    phone: sourceData.phone,
    // NetSuite almost always requires a subsidiary ID on customer creation
    // subsidiary: sourceData.subsidiaryId
    //   ? { id: sourceData.subsidiaryId }
    //   : undefined,
    // comments: sourceData.notes,
  };

  return cleanPayload(payload);
}

/**
 * Maps standard data to NetSuite's Individual Customer schema
 */
function mapToNetSuitePerson(sourceData) {
  const payload = {
    isperson: true,
    firstname: sourceData.firstName,
    lastname: sourceData.lastName,
    email: sourceData.email,
    phone: sourceData.phone,
    // subsidiary: sourceData.subsidiaryId
    //   ? { id: sourceData.subsidiaryId }
    //   : undefined,
  };

  return cleanPayload(payload);
}

export { mapToNetSuitePerson, mapToNetSuiteCompany };
