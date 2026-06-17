/**
 * Lexora brand asset generator — converts SVGs to PNGs using Chrome headless.
 * Run from repo root: node scripts/generate-brand-assets.js
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const chromePath =
  fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const publicDir = path.resolve(__dirname, '..', 'frontend', 'public');

function makeHtml(svgPath, width, height, bg = 'transparent') {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: ${bg}; }
  img { width: ${width}px; height: ${height}px; display: block; }
</style>
</head>
<body>
<img src="${svgPath.replace(/\\/g, '/')}"/>
</body>
</html>`;
}

function generatePng(svgFile, pngFile, width, height, bg = 'transparent') {
  const svgAbsolute = path.resolve(publicDir, svgFile);
  const pngAbsolute = path.resolve(publicDir, pngFile);
  const htmlAbsolute = svgAbsolute.replace('.svg', '._tmp.html');

  fs.writeFileSync(htmlAbsolute, makeHtml(`file:///${svgAbsolute}`, width, height, bg));

  try {
    const transparentFlag = bg === 'transparent' ? '--default-background-color=00000000' : '';
    execSync(
      `"${chromePath}" --headless=new --disable-gpu --no-sandbox ${transparentFlag} --screenshot="${pngAbsolute}" --window-size=${width},${height} --hide-scrollbars "file:///${htmlAbsolute}"`,
      { stdio: 'inherit' }
    );
    console.log(`✓ Generated ${pngFile} (${width}×${height})`);
  } finally {
    fs.unlinkSync(htmlAbsolute);
  }
}

console.log('Lexora brand asset generator');
console.log(`Using browser: ${chromePath}\n`);

generatePng('logo.svg',      'logo.png',      512, 512, 'transparent');
generatePng('favicon.svg',   'favicon.png',   256, 256, 'transparent');
generatePng('thumbnail.svg', 'thumbnail.png', 1200, 630, '#0F1E4A');

console.log('\nDone. PNG files written to frontend/public/');
