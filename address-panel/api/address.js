/**
 * Vercel Serverless Function — Carerix address panel backend.
 * All logic lives in ../lib; see ../README.md.
 */

import handleAddressRequest from '../lib/handler.js';

export default async function handler(req, res) {
  await handleAddressRequest(req, res);
}
