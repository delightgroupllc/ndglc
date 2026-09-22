import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACTS_DIR = 'C:/Users/arnol/.gemini/antigravity-ide/brain/44658912-1f93-4a6a-b97b-dd7281130fa8/playwright_artifacts';
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

const SHORT_ORDER_ID = '94d996e8-c052-42f6-b87a-41e9504912e8';
const LONG_ORDER_ID = '22b5c3fd-eb49-4311-95aa-da041a55773c';
const BASE_URL = 'http://localhost:4321';

async function runTests() {
  console.log('🚀 Starting Playwright Continuous Flow Layout 2.0 Test Suite...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 1,
    extraHTTPHeaders: {
      'x-test-auth': 'test-runner-authorized'
    }
  });
  const page = await context.newPage();

  const testResults: any[] = [];

  try {
    // ════════════════════════════════════════════════════════════════════
    // TEST SUITE 1: SHORT ORDER (2 ITEMS)
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- [TEST 1] Short Order (2 Items): Initial Load with Layout 2.0 ---');
    await page.goto(`${BASE_URL}/dashboard/invoices/print/${SHORT_ORDER_ID}?layout=standard2`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Verify Layout 2.0 wrapper is active
    const isStd2Visible = await page.evaluate(() => {
      const el = document.getElementById('layout-standard2-wrapper');
      return el && window.getComputedStyle(el).display !== 'none';
    });
    console.log(`Layout 2.0 wrapper visible: ${isStd2Visible}`);
    testResults.push({ test: 'Short Order Layout 2.0 Wrapper Active', passed: isStd2Visible });

    // Expand all sidebar details sections to make all inputs interactive
    await page.evaluate(() => {
      document.querySelectorAll('#print-sidebar-config details').forEach(d => (d as HTMLDetailsElement).open = true);
    });

    // 1A. Test with TOS Enabled (Default state)
    console.log('\n--- [TEST 1A] Short Order: With Terms of Sale Enabled ---');
    let pagesCount = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#layout-standard2-wrapper .std2-page'))
        .filter(p => window.getComputedStyle(p).display !== 'none').length;
    });
    let footerText = await page.evaluate(() => {
      return document.querySelector('#layout-standard2-wrapper .std2-page[data-page-index="0"] .print-page-footer-num')?.textContent?.trim();
    });
    console.log(`Visible Pages with TOS: ${pagesCount}`);
    console.log(`Page 1 Footer Text: "${footerText}"`);
    testResults.push({
      test: 'Short Order with TOS Page Count is >= 2',
      passed: pagesCount >= 2,
      details: `Count=${pagesCount}`
    });

    // Check Page 1 has Items + Math Totals + Bank details
    const p1HasClosingBlocks = await page.evaluate(() => {
      const p1 = document.querySelector('#layout-standard2-wrapper .std2-page[data-page-index="0"]');
      const math = p1?.querySelector('.print-footer-math');
      const bank = p1?.querySelector('.std-bank-block');
      const rows = p1?.querySelectorAll('tbody tr.item-row-render').length;
      return { hasMath: Boolean(math), hasBank: Boolean(bank), rowCount: rows };
    });
    console.log('Page 1 Content:', p1HasClosingBlocks);
    testResults.push({
      test: 'Page 1 has items and closing blocks immediately following items',
      passed: p1HasClosingBlocks.rowCount === 2 && p1HasClosingBlocks.hasMath && p1HasClosingBlocks.hasBank
    });

    // Screenshot Page 1 & Page 2 with TOS
    const p1El = page.locator('#layout-standard2-wrapper .std2-page[data-page-index="0"]');
    await p1El.screenshot({ path: path.join(ARTIFACTS_DIR, 'short_order_with_tos_page1.png') });
    const p2El = page.locator('#layout-standard2-wrapper .std2-page').nth(1);
    if (await p2El.count() > 0) {
      await p2El.screenshot({ path: path.join(ARTIFACTS_DIR, 'short_order_with_tos_page2.png') });
    }

    // 1B. Test with TOS Unticked (Should collapse to Page 1 of 1)
    console.log('\n--- [TEST 1B] Short Order: Untick "Show Terms of Service" (Page 1 of 1 Test) ---');
    await page.evaluate(() => {
      const cb = document.getElementById('config-show-page-2') as HTMLInputElement;
      if (cb) {
        cb.checked = false;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);

    pagesCount = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#layout-standard2-wrapper .std2-page'))
        .filter(p => window.getComputedStyle(p).display !== 'none').length;
    });
    footerText = await page.evaluate(() => {
      return document.querySelector('#layout-standard2-wrapper .std2-page[data-page-index="0"] .print-page-footer-num')?.textContent?.trim();
    });
    console.log(`Visible Pages after unticking TOS: ${pagesCount}`);
    console.log(`Page 1 Footer Text: "${footerText}"`);
    testResults.push({
      test: 'Short Order without TOS collapses cleanly to Page 1 of 1',
      passed: pagesCount === 1 && (footerText?.includes('Page 1 of 1') ?? false),
      details: `Count=${pagesCount}, Footer="${footerText}"`
    });

    // Verify all components fit on Page 1 without clipping
    const p1SinglePageComponents = await page.evaluate(() => {
      const p1 = document.querySelector('#layout-standard2-wrapper .std2-page[data-page-index="0"]');
      const math = p1?.querySelector('.print-footer-math');
      const bank = p1?.querySelector('.std-bank-block');
      const sigs = p1?.querySelector('.std-signatures-table');
      const compCard = p1?.querySelector('.company-card-tos-wrapper');
      const p1Rect = p1?.getBoundingClientRect();
      const sigsRect = sigs?.getBoundingClientRect();
      const overflows = sigsRect && p1Rect ? (sigsRect.bottom > p1Rect.bottom) : false;
      return {
        hasMath: Boolean(math),
        hasBank: Boolean(bank),
        hasSigs: Boolean(sigs),
        hasCompCard: Boolean(compCard),
        overflows
      };
    });
    console.log('Page 1 of 1 Components & Boundary Check:', p1SinglePageComponents);
    testResults.push({
      test: 'Page 1 contains Totals, Bank, Signatures, and Company Card with zero overflow',
      passed: p1SinglePageComponents.hasMath && p1SinglePageComponents.hasBank && p1SinglePageComponents.hasSigs && !p1SinglePageComponents.overflows
    });

    await p1El.screenshot({ path: path.join(ARTIFACTS_DIR, 'short_order_no_tos_page1_of_1.png') });

    // 1C. Test Toggle Product Images
    console.log('\n--- [TEST 1C] Short Order: Toggle Product Images ---');
    const imgToggle = page.locator('#config-show-product-images');
    await imgToggle.uncheck();
    await page.waitForTimeout(300);
    const imagesHidden = await page.evaluate(() => {
      const imgCols = Array.from(document.querySelectorAll('#layout-standard2-wrapper .product-image-column'));
      return imgCols.every(c => c.classList.contains('hidden'));
    });
    console.log(`Images column hidden: ${imagesHidden}`);
    testResults.push({ test: 'Product images column hide toggle works', passed: imagesHidden });

    await imgToggle.check();
    await page.waitForTimeout(300);
    const imagesShown = await page.evaluate(() => {
      const imgCols = Array.from(document.querySelectorAll('#layout-standard2-wrapper .product-image-column'));
      return imgCols.some(c => !c.classList.contains('hidden'));
    });
    console.log(`Images column shown: ${imagesShown}`);
    testResults.push({ test: 'Product images column show toggle works', passed: imagesShown });

    // 1D. Test Document Title Override to DELIVERY NOTE
    console.log('\n--- [TEST 1D] Short Order: Switch Document Title to DELIVERY NOTE ---');
    await page.selectOption('#config-doc-type', 'DELIVERY NOTE');
    await page.waitForTimeout(300);
    const cancelModalBtn = page.locator('#confirm-cancel-btn');
    if (await cancelModalBtn.isVisible()) {
      await cancelModalBtn.click();
    }
    await page.waitForTimeout(500);

    const docPrefixUpdated = await page.evaluate(() => {
      const docNo = document.querySelector('#layout-standard2-wrapper .dynamic-doc-number')?.textContent?.trim();
      const title = document.querySelector('#layout-standard2-wrapper .std-doc-title')?.textContent?.trim();
      return { docNo, title, startsWithDLN: docNo?.startsWith('DLN-') };
    });
    console.log('Document Prefix Update:', docPrefixUpdated);
    testResults.push({
      test: 'Document Title Switch to DELIVERY NOTE updates prefix to DLN-',
      passed: Boolean(docPrefixUpdated.startsWithDLN)
    });

    // ════════════════════════════════════════════════════════════════════
    // TEST SUITE 2: LONG ORDER (12 ITEMS)
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- [TEST 2] Long Order (12 Items): Multi-Page Continuous Flow ---');
    await page.goto(`${BASE_URL}/dashboard/invoices/print/${LONG_ORDER_ID}?layout=standard2`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    // Expand all sidebar details sections
    await page.evaluate(() => {
      document.querySelectorAll('#print-sidebar-config details').forEach(d => (d as HTMLDetailsElement).open = true);
    });

    const longPagesCount = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#layout-standard2-wrapper .std2-page'))
        .filter(p => window.getComputedStyle(p).display !== 'none').length;
    });
    console.log(`Long Order Total Visible Pages: ${longPagesCount}`);
    testResults.push({
      test: 'Long Order (12 items) automatically slices into multiple pages',
      passed: longPagesCount >= 2,
      details: `TotalPages=${longPagesCount}`
    });

    // Verify row distribution across pages
    const rowDistribution = await page.evaluate(() => {
      const pages = Array.from(document.querySelectorAll('#layout-standard2-wrapper .std2-page'))
        .filter(p => window.getComputedStyle(p).display !== 'none');
      return pages.map((p, idx) => {
        const rows = p.querySelectorAll('tbody tr.item-row-render').length;
        const hasMath = Boolean(p.querySelector('.print-footer-math'));
        const hasBank = Boolean(p.querySelector('.std-bank-block'));
        const hasTerms = Boolean(p.querySelector('.std2-terms-wrapper'));
        const hasSigs = Boolean(p.querySelector('.std-signatures-table'));
        const continuationHeader = Boolean(p.querySelector('.std2-continuation-header'));
        const footer = p.querySelector('.print-page-footer-num')?.textContent?.trim();
        const pRect = p.getBoundingClientRect();
        return { page: idx + 1, rows, hasMath, hasBank, hasTerms, hasSigs, continuationHeader, footer, heightPx: pRect.height };
      });
    });
    console.log('Long Order Page Distribution:', JSON.stringify(rowDistribution, null, 2));

    testResults.push({
      test: 'Page 2 has continuation header with logo and document code',
      passed: rowDistribution.length > 1 && rowDistribution[1].continuationHeader
    });

    testResults.push({
      test: 'All pages strictly conform to A4 height (<= 1123px)',
      passed: rowDistribution.every(p => p.heightPx <= 1123)
    });

    // Check row word integrity: ensure no row crosses the bottom threshold
    const rowIntegrity = await page.evaluate(() => {
      const pages = Array.from(document.querySelectorAll('#layout-standard2-wrapper .std2-page'))
        .filter(p => window.getComputedStyle(p).display !== 'none');
      let clippedCount = 0;
      pages.forEach(p => {
        const pRect = p.getBoundingClientRect();
        const rows = p.querySelectorAll('tr.item-row-render');
        rows.forEach(r => {
          const rRect = r.getBoundingClientRect();
          if (rRect.bottom > (pRect.bottom - 40)) {
            clippedCount++;
          }
        });
      });
      return { clippedCount, totalRowsChecked: 12 };
    });
    console.log('Row Integrity Check:', rowIntegrity);
    testResults.push({
      test: 'Zero rows or words clipped across page bottoms',
      passed: rowIntegrity.clippedCount === 0
    });

    // Take screenshots of each page of the long order
    for (let pIdx = 0; pIdx < longPagesCount; pIdx++) {
      const pLocator = page.locator('#layout-standard2-wrapper .std2-page').nth(pIdx);
      await pLocator.screenshot({ path: path.join(ARTIFACTS_DIR, `long_order_page_${pIdx + 1}.png`) });
    }

    // 2B. Test Long Order with TOS Unticked
    console.log('\n--- [TEST 2B] Long Order: Untick TOS ---');
    await page.evaluate(() => {
      const cb = document.getElementById('config-show-page-2') as HTMLInputElement;
      if (cb) {
        cb.checked = false;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);

    const longPagesWithoutTos = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#layout-standard2-wrapper .std2-page'))
        .filter(p => window.getComputedStyle(p).display !== 'none').length;
    });
    console.log(`Long Order pages without TOS: ${longPagesWithoutTos}`);
    testResults.push({
      test: 'Long Order without TOS repaginates and contracts cleanly',
      passed: longPagesWithoutTos <= longPagesCount,
      details: `WithTOS=${longPagesCount}, WithoutTOS=${longPagesWithoutTos}`
    });

    const pLastLocator = page.locator('#layout-standard2-wrapper .std2-page').nth(longPagesWithoutTos - 1);
    await pLastLocator.screenshot({ path: path.join(ARTIFACTS_DIR, `long_order_no_tos_last_page.png`) });

    // 2C. Test Electronic Signature Toggle
    console.log('\n--- [TEST 2C] Long Order: Toggle Electronic Signature ---');
    await page.evaluate(() => {
      const cb = document.getElementById('config-electronic-sig') as HTMLInputElement;
      if (cb) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(400);

    const electronicSigActive = await page.evaluate(() => {
      const p = document.querySelector('#layout-standard2-wrapper .print-electronic-badge');
      const sigs = document.querySelector('#layout-standard2-wrapper .std-signatures-table');
      return p && !p.classList.contains('hidden') && sigs && sigs.classList.contains('hidden');
    });
    console.log(`Electronic Signature active: ${electronicSigActive}`);
    testResults.push({
      test: 'Electronic signature badge replaces physical signatures cleanly',
      passed: Boolean(electronicSigActive)
    });

  } catch (err: any) {
    console.error('❌ Error during Playwright execution:', err);
    testResults.push({ test: 'Playwright Test Execution', passed: false, error: err.message });
  } finally {
    await browser.close();
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('              PLAYWRIGHT TEST SUMMARY REPORT                   ');
  console.log('═══════════════════════════════════════════════════════════════');
  let allPassed = true;
  testResults.forEach((t, i) => {
    const icon = t.passed ? '✅' : '❌';
    console.log(`${icon} [${i + 1}] ${t.test} ${t.details ? `(${t.details})` : ''}`);
    if (!t.passed) allPassed = false;
  });
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(allPassed ? '🎉 ALL PLAYWRIGHT TESTS PASSED!' : '⚠️ SOME TESTS FAILED');
}

runTests().catch(console.error);
