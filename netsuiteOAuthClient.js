// netsuiteOAuthClient.js
import axios from "axios";
import OAuth from "oauth-1.0a";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const baseURL = process.env.NETSUITE_BASE_URL?.replace(/\/+$/, "");
const consumerKey = process.env.NETSUITE_CONSUMER_KEY;
const consumerSecret = process.env.NETSUITE_CONSUMER_SECRET;
const tokenKey = process.env.NETSUITE_TOKEN_ID;
const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

if (!baseURL || !consumerKey || !consumerSecret || !tokenKey || !tokenSecret) {
  console.error("Missing one of NETSUITE_BASE_URL, NETSUITE_CONSUMER_KEY, NETSUITE_CONSUMER_SECRET, NETSUITE_TOKEN_ID, or NETSUITE_TOKEN_SECRET in .env");
  process.exit(1);
}

// OAuth1 instance using HMAC-SHA256 (match Postman)
const oauth = new OAuth({
  consumer: { key: consumerKey, secret: consumerSecret },
  signature_method: "HMAC-SHA256",
  hash_function(base_string, key) {
    return crypto.createHmac("sha256", key).update(base_string).digest("base64");
  },
});

// helper: extract 'realm' from the host subdomain (e.g. 6762947 from 6762947.suitetalk.api.netsuite.com)
function getRealmFromBase(base) {
  try {
    const u = new URL(base);
    const host = u.host; // e.g. 6762947.suitetalk.api.netsuite.com
    const parts = host.split(".");
    return parts[0]; // account id
  } catch (err) {
    return undefined;
  }
}

/**
 * Build Authorization header string: include realm param first (required by Postman/NetSuite)
 */
function buildAuthHeader(requestData) {
  const token = { key: tokenKey, secret: tokenSecret };
  const headerObj = oauth.toHeader(oauth.authorize(requestData, token));
  // oauth.toHeader returns: { Authorization: 'OAuth oauth_consumer_key="...", oauth_token="...", ...' }
  const realm = getRealmFromBase(baseURL);
  if (realm) {
    const rest = headerObj.Authorization.replace(/^OAuth\s*/, "");
    return `OAuth realm="${realm}",${rest}`;
  }
  return headerObj.Authorization;
}

export async function oauthRequest(method, fullUrl, body, additionalHeaders = {}) {
  const requestData = { url: fullUrl, method };
  const Authorization = buildAuthHeader(requestData);

  const headers = {
    Authorization,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...additionalHeaders
  };

  try {
    const config = { method, url: fullUrl, headers, timeout: 20000 };
    if (body && (method === 'POST' || method === 'PUT')) {
      config.data = body;
    }
    const resp = await axios(config);
    return resp.data;
  } catch (err) {
    if (err.response) {
      const { status, data } = err.response;
      throw new Error(`NetSuite error ${status}: ${JSON.stringify(data)}`);
    } else {
      throw new Error(`Network or Axios error: ${err.message}`);
    }
  }
}

/**
 * Make a POST request signed with OAuth1.0a (NetSuite TBA)
 * @param {string} path - e.g. "/services/rest/query/v1/suiteql"
 * @param {object} body - JSON body to send
 */
export async function oauthPost(path, body) {
  const url = baseURL + path;
  return await oauthRequest('POST', url, body, { Prefer: "transient" });
}

/**
 * Make a POST request specifically for a standard NetSuite RESTlet execution
 * Extracts the correct restlets.api.netsuite.com subdomain from the suitecall base URL.
 */
export async function oauthRestletPost(scriptId, deployId, body) {
  const restletBaseURL = baseURL.replace("suitetalk.api.netsuite.com", "restlets.api.netsuite.com");
  const params = new URLSearchParams({ script: scriptId, deploy: deployId }).toString();
  const url = `${restletBaseURL}/app/site/hosting/restlet.nl?${params}`;

  return await oauthRequest('POST', url, body);
}

