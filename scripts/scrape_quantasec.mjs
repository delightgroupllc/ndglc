import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const BASE_URL = 'https://www.quantasec.ae';
const OUTPUT_DIR = path.resolve(process.cwd(), 'scraped_data/quantasec');
const RAW_HTML_DIR = path.join(OUTPUT_DIR, 'raw_html');
const PAGES_DIR = path.join(OUTPUT_DIR, 'pages');
const IMAGES_DIR = path.join(OUTPUT_DIR, 'assets/images');
const DOCS_DIR = path.join(OUTPUT_DIR, 'assets/docs');

// Ensure output directories exist
[OUTPUT_DIR, RAW_HTML_DIR, PAGES_DIR, IMAGES_DIR, DOCS_DIR].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

// Seed URLs from sitemap and initial inspection
const seedUrls = [
  'https://www.quantasec.ae/',
  'https://www.quantasec.ae/index.html',
  'https://www.quantasec.ae/about.html',
  'https://www.quantasec.ae/services.html',
  'https://www.quantasec.ae/blog.html',
  'https://www.quantasec.ae/contact.html',
  'https://www.quantasec.ae/cctv-surveillance-systems.html',
  'https://www.quantasec.ae/access-control.html',
  'https://www.quantasec.ae/gate-barrier.html',
  'https://www.quantasec.ae/structured-cabling.html',
  'https://www.quantasec.ae/intercom-video-doorph.html',
  'https://www.quantasec.ae/annual-maintenance-contracts.html',
  'https://www.quantasec.ae/system-upgrade-retrofits.html',
  'https://www.quantasec.ae/integration-central-monitoring.html',
  'https://www.quantasec.ae/blog-smart-security.html',
  'https://www.quantasec.ae/blog-technical-strength.html',
  'https://www.quantasec.ae/blog-smart-elv.html',
  'https://www.quantasec.ae/blog-security-trends.html'
];

// Helper to normalize URLs
function normalizeUrl(rawUrl, currentUrl = BASE_URL) {
  try {
    const parsed = new URL(rawUrl, currentUrl);
    // Ignore non-http
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    // Strip hash
    parsed.hash = '';
    // Strip tracking query params
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(p => parsed.searchParams.delete(p));
    let href = parsed.href;
    // Normalize trailing slash / index.html
    if (href.endsWith('/index.html')) {
      href = href.replace('/index.html', '/');
    }
    return href;
  } catch {
    return null;
  }
}

function isInternal(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'www.quantasec.ae' || parsed.hostname === 'quantasec.ae';
  } catch {
    return false;
  }
}

function slugify(url) {
  const parsed = new URL(url);
  let p = parsed.pathname;
  if (!p || p === '/' || p === '') return 'home';
  p = p.replace(/^\//, '').replace(/\.html$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return p || 'home';
}

// Download file utility
async function downloadAsset(assetUrl, destFolder) {
  try {
    const parsed = new URL(assetUrl);
    let filename = path.basename(parsed.pathname);
    if (!filename || !filename.includes('.')) {
      filename = `asset_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }
    // Clean filename
    filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const localPath = path.join(destFolder, filename);

    if (fs.existsSync(localPath)) {
      return { localPath, filename, alreadyExists: true };
    }

    const client = parsed.protocol === 'https:' ? https : http;

    await new Promise((resolve, reject) => {
      const req = client.get(assetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadAsset(new URL(res.headers.location, assetUrl).href, destFolder)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed with status ${res.statusCode}`));
          return;
        }
        const fileStream = fs.createWriteStream(localPath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });

    return { localPath, filename, downloaded: true };
  } catch (err) {
    return { error: err.message, assetUrl };
  }
}

async function scrapeWebsite() {
  console.log('🚀 Starting QuantaSec scraper with Playwright...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 }
  });

  const visitedUrls = new Set();
  const queue = [...seedUrls.map(u => normalizeUrl(u)).filter(Boolean)];
  const scrapedPages = [];
  const allDiscoveredImages = new Map();
  const allDiscoveredDocs = new Map();

  while (queue.length > 0) {
    const currentUrl = queue.shift();
    if (!currentUrl || visitedUrls.has(currentUrl)) continue;
    visitedUrls.add(currentUrl);

    console.log(`\n📄 [${visitedUrls.size}] Scraping: ${currentUrl}`);

    const page = await context.newPage();
    try {
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // wait a moment for any dynamic rendering / fonts
      await page.waitForTimeout(2000);

      // Extract full HTML
      const htmlContent = await page.content();
      const slug = slugify(currentUrl);
      const rawHtmlPath = path.join(RAW_HTML_DIR, `${slug}.html`);
      fs.writeFileSync(rawHtmlPath, htmlContent, 'utf-8');

      // Comprehensive DOM inspection & extraction
      const pageData = await page.evaluate(() => {
        // Meta information
        const getMeta = (name) => {
          const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
          return el ? el.getAttribute('content') : '';
        };

        const title = document.title || '';
        const description = getMeta('description') || getMeta('og:description') || '';
        const keywords = getMeta('keywords') || '';
        const ogTitle = getMeta('og:title') || '';
        const ogImage = getMeta('og:image') || '';

        // Headings
        const headings = [];
        document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
          const text = h.innerText.trim();
          if (text) {
            headings.push({ tag: h.tagName.toLowerCase(), text });
          }
        });

        // Breadcrumbs
        const breadcrumbs = [];
        document.querySelectorAll('.breadcrumb, [class*="breadcrumb"], nav[aria-label="breadcrumb"] li, ol.breadcrumb li').forEach(el => {
          const text = el.innerText.trim();
          if (text) breadcrumbs.push(text);
        });

        // Navigation links
        const navLinks = [];
        document.querySelectorAll('header a, nav a, .menu a, .navbar a').forEach(a => {
          const href = a.getAttribute('href');
          const text = a.innerText.trim();
          if (href && text) navLinks.push({ text, href });
        });

        // Footer links
        const footerLinks = [];
        document.querySelectorAll('footer a').forEach(a => {
          const href = a.getAttribute('href');
          const text = a.innerText.trim();
          if (href && text) footerLinks.push({ text, href });
        });

        // Contact info in document
        const phoneLinks = Array.from(document.querySelectorAll('a[href^="tel:"]')).map(a => ({
          text: a.innerText.trim(),
          href: a.getAttribute('href')
        }));
        const emailLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]')).map(a => ({
          text: a.innerText.trim(),
          href: a.getAttribute('href')
        }));

        // Discover all image elements and background images
        const images = [];
        document.querySelectorAll('img').forEach(img => {
          const src = img.getAttribute('src') || img.getAttribute('data-src') || img.currentSrc;
          const alt = img.getAttribute('alt') || '';
          if (src) {
            images.push({ src, alt, width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
          }
        });

        // Background images
        document.querySelectorAll('*').forEach(el => {
          const bg = window.getComputedStyle(el).backgroundImage;
          if (bg && bg.startsWith('url(')) {
            const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
            if (match && match[1] && !match[1].startsWith('data:')) {
              images.push({ src: match[1], alt: 'background-image' });
            }
          }
        });

        // Document downloads (.pdf, etc.)
        const docs = [];
        document.querySelectorAll('a[href$=".pdf"], a[href$=".doc"], a[href$=".docx"], a[href$=".zip"]').forEach(a => {
          const href = a.getAttribute('href');
          const text = a.innerText.trim();
          if (href) docs.push({ href, text });
        });

        // Structured content sections
        const sections = [];
        const contentContainers = document.querySelectorAll('section, main, article, .content, .section, div[class*="section"], div[class*="container"]');
        contentContainers.forEach((sec, idx) => {
          // Avoid duplicate outer container content
          const id = sec.id || '';
          const className = sec.className || '';
          const secTitle = sec.querySelector('h1, h2, h3')?.innerText?.trim() || '';
          const paragraphs = Array.from(sec.querySelectorAll('p, li')).map(p => p.innerText.trim()).filter(Boolean);
          if (paragraphs.length > 0 || secTitle) {
            sections.push({
              index: idx,
              id,
              className: typeof className === 'string' ? className : '',
              title: secTitle,
              contentSnippet: paragraphs.slice(0, 10).join('\n')
            });
          }
        });

        // Clean body text
        const bodyText = document.body ? document.body.innerText.replace(/\s+/g, ' ').trim() : '';

        // All internal and external links
        const rawLinks = [];
        document.querySelectorAll('a[href]').forEach(a => {
          const href = a.getAttribute('href');
          const text = a.innerText.trim();
          if (href) rawLinks.push({ href, text });
        });

        return {
          title,
          description,
          keywords,
          ogTitle,
          ogImage,
          headings,
          breadcrumbs,
          navLinks,
          footerLinks,
          phoneLinks,
          emailLinks,
          images,
          docs,
          sections,
          bodyText,
          rawLinks
        };
      });

      // Filter and enqueue new internal links
      pageData.rawLinks.forEach(({ href }) => {
        const fullUrl = normalizeUrl(href, currentUrl);
        if (fullUrl && isInternal(fullUrl) && !visitedUrls.has(fullUrl) && !queue.includes(fullUrl)) {
          // Exclude direct media or document links from HTML crawler queue
          if (!/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|mp4)$/i.test(fullUrl)) {
            queue.push(fullUrl);
          }
        }
      });

      // Track images
      pageData.images.forEach(img => {
        const fullImgUrl = normalizeUrl(img.src, currentUrl);
        if (fullImgUrl && !allDiscoveredImages.has(fullImgUrl)) {
          allDiscoveredImages.set(fullImgUrl, {
            originalSrc: img.src,
            alt: img.alt,
            foundOn: currentUrl
          });
        }
      });

      // Track docs
      pageData.docs.forEach(doc => {
        const fullDocUrl = normalizeUrl(doc.href, currentUrl);
        if (fullDocUrl && !allDiscoveredDocs.has(fullDocUrl)) {
          allDiscoveredDocs.set(fullDocUrl, {
            originalHref: doc.href,
            text: doc.text,
            foundOn: currentUrl
          });
        }
      });

      const structuredPage = {
        url: currentUrl,
        slug,
        rawHtmlFile: `raw_html/${slug}.html`,
        title: pageData.title,
        meta: {
          description: pageData.description,
          keywords: pageData.keywords,
          ogTitle: pageData.ogTitle,
          ogImage: pageData.ogImage
        },
        headings: pageData.headings,
        breadcrumbs: pageData.breadcrumbs,
        navLinks: pageData.navLinks,
        footerLinks: pageData.footerLinks,
        contactInfo: {
          phones: pageData.phoneLinks,
          emails: pageData.emailLinks
        },
        images: pageData.images,
        docs: pageData.docs,
        sections: pageData.sections,
        bodyTextSnippet: pageData.bodyText.substring(0, 1500),
        fullBodyTextLength: pageData.bodyText.length
      };

      const pageJsonPath = path.join(PAGES_DIR, `${slug}.json`);
      fs.writeFileSync(pageJsonPath, JSON.stringify(structuredPage, null, 2), 'utf-8');

      scrapedPages.push(structuredPage);
      console.log(`✅ Saved ${slug} (Headings: ${pageData.headings.length}, Imgs: ${pageData.images.length})`);
    } catch (err) {
      console.error(`❌ Error scraping ${currentUrl}:`, err.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log(`\n📦 Total pages scraped: ${scrapedPages.length}`);
  console.log(`🖼️ Total unique images discovered: ${allDiscoveredImages.size}`);
  console.log(`📄 Total documents discovered: ${allDiscoveredDocs.size}`);

  // Download all discovered images
  console.log('\n⬇️ Downloading images locally...');
  const downloadedImages = [];
  for (const [imgUrl, meta] of allDiscoveredImages.entries()) {
    try {
      const res = await downloadAsset(imgUrl, IMAGES_DIR);
      if (res && res.filename) {
        downloadedImages.push({
          url: imgUrl,
          localPath: `assets/images/${res.filename}`,
          filename: res.filename,
          alt: meta.alt,
          foundOn: meta.foundOn
        });
      }
    } catch (e) {
      console.warn(`Failed to download image ${imgUrl}: ${e.message}`);
    }
  }

  // Download all discovered documents
  console.log('\n⬇️ Downloading documents locally...');
  const downloadedDocs = [];
  for (const [docUrl, meta] of allDiscoveredDocs.entries()) {
    try {
      const res = await downloadAsset(docUrl, DOCS_DIR);
      if (res && res.filename) {
        downloadedDocs.push({
          url: docUrl,
          localPath: `assets/docs/${res.filename}`,
          filename: res.filename,
          text: meta.text,
          foundOn: meta.foundOn
        });
      }
    } catch (e) {
      console.warn(`Failed to download doc ${docUrl}: ${e.message}`);
    }
  }

  // Generate Master Manifest
  const manifest = {
    scrapedAt: new Date().toISOString(),
    sourceDomain: 'https://www.quantasec.ae',
    totalPages: scrapedPages.length,
    totalImages: downloadedImages.length,
    totalDocs: downloadedDocs.length,
    pages: scrapedPages.map(p => ({
      slug: p.slug,
      url: p.url,
      title: p.title,
      description: p.meta.description,
      headingsCount: p.headings.length
    })),
    services: scrapedPages
      .filter(p => p.slug.includes('cctv') || p.slug.includes('access') || p.slug.includes('gate') || p.slug.includes('cable') || p.slug.includes('intercom') || p.slug.includes('maintenance') || p.slug.includes('retrofit') || p.slug.includes('monitoring') || p.slug === 'services')
      .map(p => ({
        slug: p.slug,
        title: p.title,
        url: p.url,
        summary: p.meta.description
      })),
    blogs: scrapedPages
      .filter(p => p.slug.startsWith('blog'))
      .map(p => ({
        slug: p.slug,
        title: p.title,
        url: p.url,
        summary: p.meta.description
      })),
    images: downloadedImages,
    docs: downloadedDocs
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  // Generate Markdown Human-Readable Summary
  let mdSummary = `# QuantaSec Full Scrape Index & Delight Vision Mapping\n\n`;
  mdSummary += `**Scraped At:** ${manifest.scrapedAt}\n`;
  mdSummary += `**Source Website:** https://www.quantasec.ae\n`;
  mdSummary += `**Total Pages Scraped:** ${manifest.totalPages}\n`;
  mdSummary += `**Total Images Downloaded:** ${manifest.totalImages}\n`;
  mdSummary += `**Total Docs Downloaded:** ${manifest.totalDocs}\n\n`;

  mdSummary += `## Pages Index\n\n`;
  manifest.pages.forEach(p => {
    mdSummary += `- **[${p.title || p.slug}](${p.url})** (\`${p.slug}\`)\n  - Description: ${p.description || 'N/A'}\n`;
  });

  mdSummary += `\n## Services & Solutions\n\n`;
  manifest.services.forEach(s => {
    mdSummary += `- **${s.title}** (\`${s.slug}\`)\n  - URL: ${s.url}\n  - Summary: ${s.summary || 'N/A'}\n`;
  });

  mdSummary += `\n## Blog Posts\n\n`;
  manifest.blogs.forEach(b => {
    mdSummary += `- **${b.title}** (\`${b.slug}\`)\n  - URL: ${b.url}\n`;
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, 'SITE_INDEX.md'), mdSummary, 'utf-8');

  console.log('\n🎉 QuantaSec scraping and asset indexing complete!');
  console.log(`📁 Files saved in: ${OUTPUT_DIR}`);
}

scrapeWebsite().catch(err => {
  console.error('Fatal scrape error:', err);
  process.exit(1);
});
