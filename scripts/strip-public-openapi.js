#!/usr/bin/env node
/**
 * Removes paths that should not be exposed in the public API doc
 * (auth/*, public/*, external/*). Run after generating openapi.json for the frontend.
 */
const fs = require('fs');
const path = require('path');

const defaultPath = path.join(__dirname, '../frontend/public/docs/openapi.json');
const filePath = process.argv[2] || defaultPath;

const spec = JSON.parse(fs.readFileSync(filePath, 'utf8'));
if (spec.paths) {
  const removed = [];
  for (const p of Object.keys(spec.paths)) {
    if (p.startsWith('/auth/') || p.startsWith('/public/') || p.startsWith('/external/')) {
      delete spec.paths[p];
      removed.push(p);
    }
  }
  console.log('Stripped from public OpenAPI spec:', removed.join(', ') || '(none)');
}
fs.writeFileSync(filePath, JSON.stringify(spec, null, 2), 'utf8');
