/**
 * hubspotClient.js
 * Axios instance for HubSpot API with automatic retry on 429 / 5xx errors.
 */
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
if (!HUBSPOT_ACCESS_TOKEN) {
  console.error('[FATAL] HUBSPOT_ACCESS_TOKEN is missing from .env');
  process.exit(1);
}

const MAX_RETRIES = 4;
const RETRY_BASE_MS = 1000; // first retry after 1s, doubles each time

const hubspot = axios.create({
  baseURL: 'https://api.hubapi.com',
  headers: {
    Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/**
 * Response interceptor — retries on 429 (rate-limit) and 5xx (server errors)
 * with exponential backoff + jitter.
 */
hubspot.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config;
    if (!config) return Promise.reject(err);

    config.__retryCount = config.__retryCount ?? 0;

    const status = err.response?.status;
    const isRetryable = status === 429 || (status >= 500 && status < 600);

    if (isRetryable && config.__retryCount < MAX_RETRIES) {
      config.__retryCount += 1;

      // HubSpot 429 may supply Retry-After header (seconds)
      const retryAfterHeader = err.response?.headers?.['retry-after'];
      const retryAfterMs = retryAfterHeader
        ? parseFloat(retryAfterHeader) * 1000
        : RETRY_BASE_MS * Math.pow(2, config.__retryCount - 1) + Math.random() * 200;

      console.warn(
        `[HubSpot] ${status} – retrying (attempt ${config.__retryCount}/${MAX_RETRIES}) after ${Math.round(retryAfterMs)}ms...`
      );

      await new Promise((r) => setTimeout(r, retryAfterMs));
      return hubspot(config);
    }

    return Promise.reject(err);
  }
);

export default hubspot;
