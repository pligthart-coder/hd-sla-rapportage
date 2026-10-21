/**
 * Vercel Serverless Function — Carerix address panel backend.
 * All logic lives in lib/address-panel; see address-panel/README.md.
 */

import handleAddressRequest from '../lib/address-panel/handler.js';

export default async function handler(req, res) {
  await handleAddressRequest(req, res);
}
