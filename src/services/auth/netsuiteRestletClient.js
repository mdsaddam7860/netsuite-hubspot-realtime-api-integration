import { oauthRestletPost } from "./netsuiteOAuthClient.js";

/**
 * Calls a deployed custom RESTlet in NetSuite
 * @param {string} scriptId - The script ID (e.g., 'customscript_hs_sync_restlet')
 * @param {string} deployId - The deployment ID (e.g., 'customdeploy_hs_sync_restlet')
 * @param {object} params - JSON payload containing limit, offset, lastModified, etc
 */
export async function runRestlet(scriptId, deployId, params = {}) {
    return await oauthRestletPost(scriptId, deployId, params);
}
