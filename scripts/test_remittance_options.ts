import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACTS_DIR = 'C:/Users/arnol/.gemini/antigravity-ide/brain/44658912-1f93-4a6a-b97b-dd7281130fa8/playwright_artifacts';
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

const ORDER_ID = '22b5c3fd-eb49-4311-95aa-da041a55773c';
const BASE_URL = 'http://localhost:4321';

async function runTest() {
  console.log('🚀 Testing Bank Remittance Placement Options...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    extraHTTPHeaders: { 'x-test-auth': 'test-runner-authorized' }
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/dashboard/invoices/print/${ORDER_ID}?layout=standard2`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // Check select options
  const options = await page.evaluate(() => {
    const sel = document.getElementById('config-remittance-placement') as HTMLSelectElement;
    return Array.from(sel.options).map(o => ({ value: o.value, text: o.text, selected: o.selected }));
  });
  console.log('Remittance select options:', options);

  // Check default header bank block visibility
  const headerBankVisible = await page.evaluate(() => {
    const el = document.querySelector('#layout-standard2-wrapper .print-bank-block-header') as HTMLElement;
    return el && window.getComputedStyle(el).display !== 'none' && !el.classList.contains('hidden');
  });
  console.log('Header Bank block visible by default:', headerBankVisible);

  // Screenshot Page 1 with Header Bank block
  const p1 = page.locator('#layout-standard2-wrapper .std2-page').first();
  await p1.screenshot({ path: path.join(ARTIFACTS_DIR, 'remit_header_placement_p1.png') });
  console.log('Saved remit_header_placement_p1.png');

  // Change remittance placement to 'both' (Show on Last Page & TOS Page)
  await page.evaluate(() => {
    const sel = document.getElementById('config-remittance-placement') as HTMLSelectElement;
    sel.value = 'both';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(400);

  const headerBankVisibleAfterBoth = await page.evaluate(() => {
    const el = document.querySelector('#layout-standard2-wrapper .print-bank-block-header') as HTMLElement;
    return el && window.getComputedStyle(el).display !== 'none' && !el.classList.contains('hidden');
  });
  const footerBankVisibleAfterBoth = await page.evaluate(() => {
    const el = document.querySelector('#layout-standard2-wrapper .print-bank-block-footer') as HTMLElement;
    return el && window.getComputedStyle(el).display !== 'none' && !el.classList.contains('hidden');
  });
  console.log('After selecting "both" - Header visible:', headerBankVisibleAfterBoth, 'Footer visible:', footerBankVisibleAfterBoth);

  // Change back to 'under-customer-both'
  await page.evaluate(() => {
    const sel = document.getElementById('config-remittance-placement') as HTMLSelectElement;
    sel.value = 'under-customer-both';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(400);

  // Also test Standard layout (non-2.0)
  await page.goto(`${BASE_URL}/dashboard/invoices/print/${ORDER_ID}?layout=standard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const stdHeaderBankVisible = await page.evaluate(() => {
    const el = document.querySelector('#layout-standard-wrapper .print-bank-block-header') as HTMLElement;
    return el && window.getComputedStyle(el).display !== 'none' && !el.classList.contains('hidden');
  });
  console.log('Standard Layout - Header Bank block visible:', stdHeaderBankVisible);

  const stdP1 = page.locator('#layout-standard-wrapper .print-page').first();
  await stdP1.screenshot({ path: path.join(ARTIFACTS_DIR, 'standard_layout_header_remit_p1.png') });
  console.log('Saved standard_layout_header_remit_p1.png');

  await browser.close();
  console.log('✅ All tests finished!');
}

runTest().catch(console.error);
