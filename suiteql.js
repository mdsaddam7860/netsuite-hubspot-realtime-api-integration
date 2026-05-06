import { oauthPost } from "./netsuiteOAuthClient.js";

export async function runSuiteQL(query, { limit = 100, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const path = `/services/rest/query/v1/suiteql?${params.toString()}`;
  return await oauthPost(path, { q: query });
}
