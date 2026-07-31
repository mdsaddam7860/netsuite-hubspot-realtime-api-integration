import axios from "axios";
import OAuth from "oauth-1.0a";
import crypto from "crypto";
import qs from "querystring";
let netsuiteClient = null;

function getNetsuiteClient() {
  if (netsuiteClient) return netsuiteClient;

  // INITIALIZE OAUTH HERE - Inside the function to ensure process.env is ready
  const oauth = OAuth({
    consumer: {
      key: process.env.NETSUITE_CONSUMER_KEY,
      secret: process.env.NETSUITE_CONSUMER_SECRET,
    },
    signature_method: "HMAC-SHA256",
    hash_function(base_string, key) {
      return crypto
        .createHmac("sha256", key)
        .update(base_string)
        .digest("base64");
    },
  });

  const token = {
    key: process.env.NETSUITE_TOKEN_ID,
    secret: process.env.NETSUITE_TOKEN_SECRET,
  };

  netsuiteClient = axios.create({
    baseURL: process.env.NETSUITE_BASE_URL,
    headers: { "Content-Type": "application/json" },
  });

  netsuiteClient.interceptors.request.use((config) => {
    const cleanBase = config.baseURL.replace(/\/$/, "");
    const cleanPath = config.url.startsWith("/")
      ? config.url
      : "/" + config.url;

    let fullUrl = cleanBase + cleanPath;

    if (config.params) {
      const query = qs.stringify(config.params);
      fullUrl += `?${query}`;
    }

    const requestData = {
      url: fullUrl,
      method: config.method.toUpperCase(),
    };

    const oauthData = oauth.authorize(requestData, token);
    const authHeader = oauth.toHeader(oauthData).Authorization;

    config.headers.Authorization =
      `OAuth realm="${process.env.NS_ACCOUNT_ID}", ` +
      authHeader.replace("OAuth ", "");

    return config;
  });

  return netsuiteClient;
}

export { getNetsuiteClient };

/**Usage Example
 const client = getNetsuiteClient();

// To POST a new invoice
await client.post('/services/rest/record/v1/invoice', {
  entity: { id: "123" }, // Customer ID
  trandate: "2023-10-27",
  item: {
    items: [
      { item: { id: "456" }, quantity: 1 }
    ]
  }
});
 */
