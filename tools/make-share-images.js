/* Regenerates og-image.jpg (the link-preview picture) and the store/install screenshots.
   Needs Playwright:  NODE_PATH=$(npm root -g) node tools/make-share-images.js   (edit tools/og.html to change the design) */
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const br = await chromium.launch(), root = path.join(__dirname, '..');
  const p = await br.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto('file://' + path.join(__dirname, 'og.html')); await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(root, 'og-image.jpg'), type: 'jpeg', quality: 86 });
  await br.close(); console.log('og-image.jpg written');
})();
