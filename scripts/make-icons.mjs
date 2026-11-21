#!/usr/bin/env node
// One-off: render public/icons/icon.svg to PNG sizes needed by iOS / Android (uses preinstalled Playwright).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const svg = fs.readFileSync('public/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:#264d8c">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: false });
  await page.close();
  console.log('wrote', name);
}
await browser.close();
