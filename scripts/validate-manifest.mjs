#!/usr/bin/env node
// This repo has no bundler — this script is the "build" leg of `npm run verify`.
// It checks manifest.json is well-formed MV3 and every file it references actually exists.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = join(rootDir, "manifest.json");

function fail(message) {
  console.error(`✗ manifest validation failed: ${message}`);
  process.exit(1);
}

let raw;
try {
  raw = readFileSync(manifestPath, "utf8");
} catch {
  fail(`could not read ${manifestPath}`);
}

let manifest;
try {
  manifest = JSON.parse(raw);
} catch (err) {
  fail(`manifest.json is not valid JSON — ${err.message}`);
}

if (manifest.manifest_version !== 3) {
  fail(`manifest_version must be 3, got ${JSON.stringify(manifest.manifest_version)}`);
}

for (const field of ["name", "version", "description"]) {
  if (!manifest[field]) fail(`missing required field "${field}"`);
}

if (manifest.description && manifest.description.length > 132) {
  fail(`description is ${manifest.description.length} chars — Chrome Web Store limit is 132`);
}

const referencedFiles = [];

if (manifest.background?.service_worker) {
  referencedFiles.push(manifest.background.service_worker);
}
if (manifest.action?.default_popup) {
  referencedFiles.push(manifest.action.default_popup);
}
if (manifest.icons) {
  referencedFiles.push(...Object.values(manifest.icons));
}
if (manifest.action?.default_icon) {
  referencedFiles.push(...Object.values(manifest.action.default_icon));
}
for (const entry of manifest.content_scripts ?? []) {
  referencedFiles.push(...(entry.js ?? []), ...(entry.css ?? []));
}

for (const relPath of referencedFiles) {
  if (!existsSync(join(rootDir, relPath))) {
    fail(`manifest references "${relPath}" but that file does not exist`);
  }
}

console.log(`✓ manifest.json is valid MV3 and all ${referencedFiles.length} referenced files exist`);
