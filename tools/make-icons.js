/* Makes the two icons that need a solid background: the Android "maskable" icon and the iPhone home-screen icon. */
const { chromium } = require('playwright'), path = require('path');
const shield = '<path d="M32 12l18 7v13c0 11-8 18-18 21-10-3-18-10-18-21V19z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M24 32l6 6 11-12" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>';
const svg = (scale) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%"><rect width="64" height="64" fill="#0b5d7a"/><g transform="translate(' + (32 - 32 * scale) + ' ' + (32 - 32 * scale) + ') scale(' + scale + ')">' + shield + '</g></svg>';
(async () => {
  const br = await chromium.launch(), root = path.join(__dirname, '..');
  for (const [file, size, scale] of [['icon-maskable-512.png', 512, 0.68], ['apple-touch-icon.png', 180, 0.86]]) {
    const p = await br.newPage({ viewport: { width: size, height: size } });
    await p.setContent('<body style="margin:0">' + svg(scale) + '</body>'); await p.screenshot({ path: path.join(root, file) });
  }
  await br.close(); console.log('icons written');
})();
