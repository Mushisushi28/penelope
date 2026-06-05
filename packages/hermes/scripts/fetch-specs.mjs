#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..');

const specs = [
  { name: 'stripe-raw.json',  url: 'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json' },
  { name: 'calendly-raw.yaml', url: 'https://calendly.stoplight.io/docs/api-docs/branches/master/cb3l4r1nz0n4y-calendly-api.yaml' },
  { name: 'twilio-raw.json',  url: 'https://raw.githubusercontent.com/twilio/twilio-oai/main/spec/json/twilio_messaging_v1.json' },
];

mkdirSync(outDir, { recursive: true });
for (const { name, url } of specs) {
  process.stdout.write(`fetching ${name} ... `);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    writeFileSync(join(outDir, name), text);
    console.log(`ok (${(text.length / 1024).toFixed(1)} KB)`);
  } catch (e) {
    console.log(`failed: ${e.message}`);
  }
}
console.log('\nspecs ready. now run: npm run discover');
