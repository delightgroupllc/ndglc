import { chromium } from 'playwright';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/arnol/.gemini/antigravity-ide/brain/44658912-1f93-4a6a-b97b-dd7281130fa8/playwright_artifacts';
const ORDER_ID = '22b5c3fd-eb49-4311-95aa-da041a55773c';
const BASE_URL = 'http://localhost:4321';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    extraHTTPHeaders: { 'x-test-auth': 'test-runner-authorized' }
  });
  const page = await context.newPage();

  // Test with standard layout first
  console.log('--- TESTING STANDARD LAYOUT ---');
  await page.goto(`${BASE_URL}/dashboard/invoices/print/${ORDER_ID}?layout=standard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // Select 'under-customer'
  await page.evaluate(() => {
    const sel = document.getElementById('config-remittance-placement') as HTMLSelectElement;
    sel.value = 'under-customer';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(600);

  const stdCheck = await page.evaluate(() => {
    const headerBank = document.querySelector('#layout-standard-wrapper .print-bank-block-header') as HTMLElement;
    const footerBank = document.querySelector('#layout-standard-wrapper .print-bank-block-footer') as HTMLElement;
    const p2Bank = document.querySelector('#layout-standard-wrapper .print-bank-block-p2') as HTMLElement;
    return {
      headerBank: headerBank ? {
        display: window.getComputedStyle(headerBank).display,
        offsetParent: headerBank.offsetParent !== null,
        classes: headerBank.className
      } : null,
      footerBank: footerBank ? {
        display: window.getComputedStyle(footerBank).display,
        offsetParent: footerBank.offsetParent !== null,
        classes: footerBank.className
      } : null,
      p2Bank: p2Bank ? {
        display: window.getComputedStyle(p2Bank).display,
        offsetParent: p2Bank.offsetParent !== null,
        classes: p2Bank.className
      } : null,
    };
  });
  console.log('Standard Layout Check with under-customer:', JSON.stringify(stdCheck, null, 2));

  // Screenshot standard
  const stdP1 = page.locator('#layout-standard-wrapper .print-page').first();
  await stdP1.screenshot({ path: path.join(ARTIFACTS_DIR, 'std_under_customer_p1.png') });

  // Test with standard2 layout
  console.log('\n--- TESTING STANDARD2 (2.0) LAYOUT ---');
  await page.goto(`${BASE_URL}/dashboard/invoices/print/${ORDER_ID}?layout=standard2`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // Select 'under-customer'
  await page.evaluate(() => {
    const sel = document.getElementById('config-remittance-placement') as HTMLSelectElement;
    sel.value = 'under-customer';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(600);

  const std2Check = await page.evaluate(() => {
    const headerBank = document.querySelector('#layout-standard2-wrapper .print-bank-block-header') as HTMLElement;
    const footerBank = document.querySelector('#layout-standard2-wrapper .print-bank-block-footer') as HTMLElement;
    const p2Bank = document.querySelector('#layout-standard2-wrapper .print-bank-block-p2') as HTMLElement;
    return {
      headerBank: headerBank ? {
        display: window.getComputedStyle(headerBank).display,
        offsetParent: headerBank.offsetParent !== null,
        classes: headerBank.className
      } : null,
      footerBank: footerBank ? {
        display: window.getComputedStyle(footerBank).display,
        offsetParent: footerBank.offsetParent !== null,
        classes: footerBank.className
      } : null,
      p2Bank: p2Bank ? {
        display: window.getComputedStyle(p2Bank).display,
        offsetParent: p2Bank.offsetParent !== null,
        classes: p2Bank.className
      } : null,
    };
  });
  console.log('Standard2 Layout Check with under-customer:', JSON.stringify(std2Check, null, 2));

  const std2P1 = page.locator('#layout-standard2-wrapper .std2-page').first();
  await std2P1.screenshot({ path: path.join(ARTIFACTS_DIR, 'std2_under_customer_p1.png') });

  // Also check all pages of standard2 to see where bank block is!
  const pagesInfo = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll('#layout-standard2-wrapper .std2-page'));
    return pages.map((p, idx) => {
      const bH = p.querySelector('.print-bank-block-header') as HTMLElement;
      const bF = p.querySelector('.print-bank-block-footer') as HTMLElement;
      const bP2 = p.querySelector('.print-bank-block-p2') as HTMLElement;
      return {
        page: idx + 1,
        hasHeaderBank: !!bH && window.getComputedStyle(bH).display !== 'none',
        hasFooterBank: !!bF && window.getComputedStyle(bF).display !== 'none',
        hasP2Bank: !!bP2 && window.getComputedStyle(bP2).display !== 'none',
        innerHTMLSnippet: p.innerHTML.substring(0, 300)
      };
    });
  });
  console.log('Pages info:', JSON.stringify(pagesInfo, null, 2));

  await browser.close();
}

run().catch(console.error);
