import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve(process.cwd(), 'scraped_data/quantasec');
const RAW_HTML_DIR = path.join(OUTPUT_DIR, 'raw_html');
const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');

const files = fs.readdirSync(RAW_HTML_DIR).filter(f => f.endsWith('.html'));

const knowledgeBase = {
  extractedAt: new Date().toISOString(),
  company: {
    brandName: 'QuantaSec',
    tagline: 'Precision Security & ELV System Integrator in UAE',
    phone: '+971 55 776 6952',
    email: 'info@quantasec.ae',
    address: 'QuantaSec Solutions, Office A-17 - First Floor, Al Hilal Bank Building, Sheikha Mahra Al Ghurair, Al Qusais 2, Dubai, UAE.',
    googleMapsUrl: 'https://maps.app.goo.gl/w8qTAvB3MbMzW7nY8',
    aboutParagraphs: [],
    coreValues: [],
    stats: []
  },
  services: [],
  blogs: [],
  faqs: [],
  testimonials: [],
  whyChooseUs: []
};

files.forEach(file => {
  const slug = file.replace('.html', '');
  const html = fs.readFileSync(path.join(RAW_HTML_DIR, file), 'utf-8');

  // Simple HTML text extractor helper
  const clean = (str) => str ? str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';

  // Check if it's a service page
  const isService = [
    'cctv-surveillance-systems',
    'access-control',
    'gate-barrier',
    'structured-cabling',
    'intercom-video-doorph',
    'annual-maintenance-contracts',
    'system-upgrade-retrofits',
    'integration-central-monitoring'
  ].includes(slug);

  // Check if it's a blog page
  const isBlog = slug.startsWith('blog-');

  // Extract titles
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1Match ? clean(h1Match[1]) : slug;

  if (isService) {
    // Extract service sub-items from lists
    const serviceItems = [];
    const serviceListRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = serviceListRegex.exec(html)) !== null) {
      const text = clean(match[1]);
      if (text.length > 5 && text.length < 150 && !text.includes('Copyright') && !text.includes('Privacy') && !text.includes('Home')) {
        serviceItems.push(text);
      }
    }

    // Extract paragraphs
    const paragraphs = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = pRegex.exec(html)) !== null) {
      const pText = clean(match[1]);
      if (pText.length > 40 && !pText.includes('cookie') && !pText.includes('Copyright')) {
        paragraphs.push(pText);
      }
    }

    // Extract image references
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*alt=["']?([^"'>]*)["']?/gi;
    const serviceImages = [];
    while ((match = imgRegex.exec(html)) !== null) {
      const src = match[1];
      const alt = match[2];
      if (!src.includes('logo') && !src.includes('icon-')) {
        serviceImages.push({ src, alt });
      }
    }

    knowledgeBase.services.push({
      slug,
      title,
      summary: paragraphs[0] || '',
      allParagraphs: paragraphs,
      featureHighlights: Array.from(new Set(serviceItems)).slice(0, 15),
      images: serviceImages
    });
  }

  if (isBlog) {
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const paragraphs = [];
    let match;
    while ((match = pRegex.exec(html)) !== null) {
      const pText = clean(match[1]);
      if (pText.length > 30 && !pText.includes('cookie') && !pText.includes('Copyright')) {
        paragraphs.push(pText);
      }
    }

    knowledgeBase.blogs.push({
      slug,
      title,
      paragraphs,
      summary: paragraphs[0] || ''
    });
  }

  if (slug === 'about') {
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = pRegex.exec(html)) !== null) {
      const pText = clean(match[1]);
      if (pText.length > 40 && !pText.includes('cookie') && !pText.includes('Copyright')) {
        knowledgeBase.company.aboutParagraphs.push(pText);
      }
    }
  }
});

// Write structured knowledge base
fs.writeFileSync(
  path.join(OUTPUT_DIR, 'extracted_knowledge.json'),
  JSON.stringify(knowledgeBase, null, 2),
  'utf-8'
);

console.log('✅ Extracted Knowledge Base saved!');
console.log(`- Services count: ${knowledgeBase.services.length}`);
console.log(`- Blogs count: ${knowledgeBase.blogs.length}`);
console.log(`- About paragraphs count: ${knowledgeBase.company.aboutParagraphs.length}`);
