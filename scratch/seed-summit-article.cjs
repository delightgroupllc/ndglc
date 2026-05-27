const fs = require('fs');
const path = require('path');
const pg = require('pg');

// Load .env variables
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;
    const eqIdx = trimmedLine.indexOf('=');
    if (eqIdx !== -1) {
      process.env[trimmedLine.substring(0, eqIdx).trim()] = trimmedLine.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("No DATABASE_URL found in .env file!");
    return;
  }

  const cleanedUrl = databaseUrl.split('?')[0];
  const isRemote = !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');
  
  const pool = new pg.Pool({
    connectionString: cleanedUrl,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  try {
    const title = "Desert Group Highlights Integrated Outdoor Infrastructure Solutions at Abu Dhabi Infrastructure Summit";
    const slug = "desert-group-highlights-integrated-outdoor-infrastructure-solutions-at-abu-dhabi-infrastructure-summit";
    const summary = "Desert Group participated in the Abu Dhabi Infrastructure Summit, showcasing pioneering engineering innovations and multi-disciplinary outdoor infrastructure supply capabilities across our Technical Lighting and Greenscapes divisions.";
    const featured_image = "/media__1779784859892.png";
    
    // The exact 6 alternating sections with local images (simplified float layout for easy WYSIWYG editing)
    const content = `
      <div style="font-family: 'Inter', sans-serif; line-height: 1.7; color: #334155;">
        <!-- Section 1 -->
        <div>
          <img src="/media__1779784859892.png" style="float: right; margin-left: 24px; margin-bottom: 16px; width: 45%; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); border: 1px solid #f1f5f9;" alt="Abu Dhabi Summit Showcase Stand" />
          <p>Infrastructure development is crucial for the continuous development of modern cities, and landscape architecture plays a central role in creating sustainable, highly functional spaces. As the UAE expands, the demand for integrated outdoor infrastructure solutions continues to rise, shaping the dynamic urban frameworks of tomorrow.</p>
          <p>During our recent participation in the Abu Dhabi Infrastructure Summit, our divisions showcased core engineering innovations. We believe that incorporating natural elements with advanced lighting systems is key to developing future-ready public infrastructure.</p>
          <div style="clear: both; height: 16px;"></div>
        </div>

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

        <!-- Section 2 -->
        <div>
          <img src="/media__1779785008670.png" style="float: left; margin-right: 24px; margin-bottom: 16px; width: 45%; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); border: 1px solid #f1f5f9;" alt="Emirati representatives" />
          <h3 style="font-family: 'Outfit', sans-serif; font-size: 1.35rem; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 8px;">A Growing Focus on Outdoor Infrastructure in Urban Development</h3>
          <p>Urban planners and developers are increasingly recognizing the necessity of smart open spaces. Integrating durable, low-maintenance landscaping and intelligent outdoor lighting significantly enhances the visual character and commercial viability of public parks, waterfronts, and retail squares.</p>
          <p>Delight Group's specialized divisions—Delight Technical Lighting and Delight Greenscapes—work in tandem to provide holistic turnkey supply packages. This combined capability ensures that lighting layouts and plant palettes complement each other perfectly, streamlining the procurement and delivery process for major developers.</p>
          <div style="clear: both; height: 16px;"></div>
        </div>

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

        <!-- Section 3 -->
        <div>
          <img src="/media__1779785090563.png" style="float: right; margin-left: 24px; margin-bottom: 16px; width: 45%; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); border: 1px solid #f1f5f9;" alt="Desert Group representatives" />
          <h3 style="font-family: 'Outfit', sans-serif; font-size: 1.35rem; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 8px;">Showcasing Multidisciplinary Expertise Across Desert Group Divisions</h3>
          <p>Our interactive showcase at the summit highlighted several key contract wins and B2B catalog items across our core specializations:</p>
          <ul style="list-style-type: none; padding-left: 0; margin-bottom: 16px;">
            <li style="padding-left: 1.75rem; background-image: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%23BE854C%22 stroke-width=%223%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M5 13l4 4L19 7%22 /%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: left center; background-size: 14px 14px; margin-bottom: 8px; font-weight: 600; color: #475569;">Premium Landscape Nurseries & Wahat Al Sahraa Plant Supply</li>
            <li style="padding-left: 1.75rem; background-image: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%23BE854C%22 stroke-width=%223%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M5 13l4 4L19 7%22 /%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: left center; background-size: 14px 14px; margin-bottom: 8px; font-weight: 600; color: #475569;">Custom Smart Lighting Automation Controls & IoT Integration</li>
            <li style="padding-left: 1.75rem; background-image: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%23BE854C%22 stroke-width=%223%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M5 13l4 4L19 7%22 /%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: left center; background-size: 14px 14px; margin-bottom: 8px; font-weight: 600; color: #475569;">Sharjahflex B2B Procurement and Fast UAE-Wide Logistics</li>
          </ul>
          <div style="clear: both; height: 16px;"></div>
        </div>

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

        <!-- Section 4 -->
        <div>
          <img src="/media__1779785326921.png" style="float: left; margin-right: 24px; margin-bottom: 16px; width: 45%; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); border: 1px solid #f1f5f9;" alt="Group of engineers" />
          <h3 style="font-family: 'Outfit', sans-serif; font-size: 1.35rem; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 8px;">Supporting Sustainable and Future Ready Developments</h3>
          <p>As sustainability becomes the cornerstone of urban planning, Delight Group remains committed to supply eco-friendly landscaping and smart lighting solutions. We prioritize native, water-efficient plant species and high-efficiency LED fixtures to meet regional environmental standards.</p>
          <ul style="list-style-type: none; padding-left: 0; margin-bottom: 16px;">
            <li style="padding-left: 1.75rem; background-image: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%23BE854C%22 stroke-width=%223%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M5 13l4 4L19 7%22 /%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: left center; background-size: 14px 14px; margin-bottom: 6px; font-weight: 600; color: #475569;">Asset database and planning</li>
            <li style="padding-left: 1.75rem; background-image: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%23BE854C%22 stroke-width=%223%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M5 13l4 4L19 7%22 /%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: left center; background-size: 14px 14px; margin-bottom: 6px; font-weight: 600; color: #475569;">Plant propagation systems</li>
            <li style="padding-left: 1.75rem; background-image: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%23BE854C%22 stroke-width=%223%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M5 13l4 4L19 7%22 /%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: left center; background-size: 14px 14px; margin-bottom: 6px; font-weight: 600; color: #475569;">Specimen tree management practices</li>
            <li style="padding-left: 1.75rem; background-image: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%23BE854C%22 stroke-width=%223%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M5 13l4 4L19 7%22 /%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: left center; background-size: 14px 14px; margin-bottom: 6px; font-weight: 600; color: #475569;">Alternative water sourcing</li>
            <li style="padding-left: 1.75rem; background-image: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%23BE854C%22 stroke-width=%223%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M5 13l4 4L19 7%22 /%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: left center; background-size: 14px 14px; margin-bottom: 6px; font-weight: 600; color: #475569;">Long term maintenance planning</li>
            <li style="padding-left: 1.75rem; background-image: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%23BE854C%22 stroke-width=%223%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M5 13l4 4L19 7%22 /%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: left center; background-size: 14px 14px; margin-bottom: 6px; font-weight: 600; color: #475569;">Integrated design and build projects</li>
          </ul>
          <div style="clear: both; height: 16px;"></div>
        </div>

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

        <!-- Section 5 -->
        <div>
          <img src="/media__1779785342533.png" style="float: right; margin-left: 24px; margin-bottom: 16px; width: 45%; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); border: 1px solid #f1f5f9;" alt="Delight technical team posing at stand" />
          <h3 style="font-family: 'Outfit', sans-serif; font-size: 1.35rem; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 8px;">Strengthening Industry Relationships in Abu Dhabi</h3>
          <p>The Abu Dhabi Infrastructure Summit provided an exceptional platform to connect with industry leaders, master developers, and government authorities. Our representatives engaged in fruitful discussions about upcoming high-profile projects in the capital and explored potential collaborative ventures.</p>
          <p>We are proud to play a key role in driving innovation in urban architecture and technical greenscaping, and we look forward to building strong partnerships that will shape the landscape of tomorrow.</p>
          <div style="clear: both; height: 16px;"></div>
        </div>

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

        <!-- Section 6 -->
        <div>
          <img src="/media__1779785828994.jpg" style="float: left; margin-right: 24px; margin-bottom: 16px; width: 45%; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); border: 1px solid #f1f5f9;" alt="Engineers and planners reviewing plans at table" />
          <h3 style="font-family: 'Outfit', sans-serif; font-size: 1.35rem; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 8px;">Looking Ahead</h3>
          <p>With several prestigious projects already in our portfolio and new opportunities on the horizon, Delight Group is poised to expand its footprint in the Abu Dhabi market. We are dedicated to delivering top-tier outdoor infrastructure solutions that combine aesthetics, functionality, and sustainability.</p>
          <p>Stay tuned for more updates on our upcoming projects and milestones as we continue our journey of transforming open spaces across the region.</p>
          <div style="clear: both; height: 8px;"></div>
        </div>
      </div>
    `;

    // Check if it already exists
    const check = await client.query("SELECT id FROM articles WHERE slug = $1", [slug]);
    if (check.rowCount > 0) {
      // Update
      await client.query(
        `UPDATE articles 
         SET title = $1, content = $2, summary = $3, featured_image = $4, division = 'both', status = 'published', published_at = '2026-05-15T10:00:00.000Z', updated_at = NOW()
         WHERE slug = $5`,
        [title, content, summary, featured_image, slug]
      );
      console.log("SUCCESS: Abu Dhabi Infrastructure Summit article updated in database!");
    } else {
      // Insert
      await client.query(
        `INSERT INTO articles (title, slug, content, summary, featured_image, type, division, status, published_at)
         VALUES ($1, $2, $3, $4, $5, 'press_release', 'both', 'published', '2026-05-15T10:00:00.000Z')`,
        [title, slug, content, summary, featured_image]
      );
      console.log("SUCCESS: Abu Dhabi Infrastructure Summit article inserted into database!");
    }
  } catch (err) {
    console.error('Seeding failed:', err.message || err);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
