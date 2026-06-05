/**
 * Generate favicon PNGs from favicon.svg using Sharp (available globally via mcp-control).
 * Run: node brand/_gen-favicons.mjs
 */
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load sharp from global npm (mcp-control has it)
const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  // Try global location
  sharp = require('C:/Users/isaac/AppData/Roaming/npm/node_modules/mcp-control/node_modules/sharp');
}

const svgPath = path.join(__dirname, 'favicon.svg');
const svgBuffer = readFileSync(svgPath);

async function generate() {
  // 32×32 favicon
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(__dirname, 'favicon-32.png'));
  console.log('✓ favicon-32.png');

  // 180×180 apple-touch-icon (add padding + background)
  const padded = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
    <rect width="180" height="180" rx="32" fill="#F6F3EC"/>
    <g transform="translate(27,27) scale(3.9375)">
      ${readFileSync(svgPath, 'utf8')
        .replace(/<svg[^>]*>/, '')
        .replace('</svg>', '')}
    </g>
  </svg>`;

  await sharp(Buffer.from(padded))
    .resize(180, 180)
    .png()
    .toFile(path.join(__dirname, 'favicon-180.png'));
  console.log('✓ favicon-180.png');

  console.log('Favicon generation complete.');
}

generate().catch(console.error);
