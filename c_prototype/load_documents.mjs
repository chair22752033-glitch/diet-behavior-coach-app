/*
 * Node-only helper: load draft documents from c_prototype/documents + compute content hashes.
 * Used by the API test and the browser server. (In production, documents would be served
 * from static assets and hashed at build time; this fs loader is prototype-only.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from './consent_store.mjs';

export async function loadDocuments() {
  const dir = path.dirname(fileURLToPath(import.meta.url)) + '/documents';
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const out = [];
  for (const m of manifest.documents) {
    const content = fs.readFileSync(path.join(dir, m.file), 'utf8');
    out.push({ docType: m.docType, version: m.version, title: m.title, status: m.status, content, contentSha256: await sha256Hex(content) });
  }
  return out;
}
