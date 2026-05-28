import fs from 'fs';
import path from 'path';

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

const homeSetup = {
  hero: {
    title: "Luminous Nature: Harmonizing Light & Life.",
    subtitle: "Where technical lighting precision meets organic landscape vitality. We engineer atmospheres that synchronize human circadian rhythms with the vibrant soul of the natural world.",
    imageUrl: "/2screen.png",
    ctaText: "Explore Divisions",
    ctaUrl: "#divisions"
  },
  dtl_banner: {
    title: "Technical Lighting",
    subtitle: "Architectural Precision",
    description: "Precision-engineered illumination that transforms architectural volumes. We specialize in circadian-aligned systems and museum-grade technical lighting for the world's most demanding environments, ensuring perfect clarity and atmospheric control.",
    imageUrl: "/3screen.png",
    ctaText: "Explore DTL Division",
    ctaUrl: "/delighttechnicallighting"
  },
  dgs_banner: {
    title: "Greenscapes",
    subtitle: "Organic Serenity",
    description: "Curated biophilic experiences that breathe life into the built environment. From vertical gardens to exotic landscape ecosystems, we design living architecture that evolves with time, fostering a deep connection between urban dwellers and the natural world.",
    imageUrl: "/1screen.png",
    ctaText: "Explore DGS Division",
    ctaUrl: "/delightgreenscapes"
  },
  sectors: {
    residential: {
      title: "Residential",
      desc: "Individual Houses, Villas, and private estates tailored for personal wellness.",
      imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuDKzpmZidP2wrFcJyW8Lsfa-46IwJ_ofH6_cLB_g2pCXDeoZUlVQG1Jd2RQbD5iuRp8tyTVQNqpsYqoOkRgMhWPgnjwOxJZVmv7NFQc8yccF63VN3PNzKq2thOWuGHiSFZeoXXabJ5Jd4dhGPoRfiXr-goFkYKHIGxG66Q9dut2QZftzVxda3dLswNO7EAyDezFdJAF8IJoJ6XJcmDsysGNx53GKYiXNeRhTjJWM6lm3Thp1ZS9gAghfzAlunkNFzmiLUppkPgFZw8",
      link: "/portfolio?sector=residential"
    },
    commercial: {
      title: "Commercial",
      desc: "Individual Houses, Villas, and private estates tailored for personal wellness.",
      imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBixLKPHKgXt131Z4yztKrDxoddfna7VJIlNInz9ePdOZblArS_GJJ5tHO1f_StEC0kalUDShHXkgk_DWXfEll4gOPLpGBbh_WNlbztmPLWWxyJl3awnm9yP2Xu_lQJkSYMAXamcp155pvLuwx69Iz_LviErccNSy1CQjYExwtYFfzonuUwqO5KOVvR4M_btDvqYgix9TydUNAN_rE2vqGwZf3rM3P-jBrIUp91q46ZO2FI5LEWEO0zIO0GSK4cldl4RmGIb0Jifr4",
      link: "/portfolio?sector=commercial"
    },
    hospitality: {
      title: "Hospitality",
      desc: "Individual Houses, Villas, and private estates tailored for personal wellness.",
      imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuAMx1j_FCvrJtX9CaD6c3KgMaZCisZEmzZpaN_gYZTZ_wjpros1ZrWHeo0eBK7iYZSdi_xQsiD05RavSG2LygkPRuE69C_B1JijZyrXI2D3JvjqzMM2vGFZkx8Cb4UXjnpBwDK1zr0_ArVHEVDY58CqM-c6YUjCCQf_0iDF8cHO_kAI-JoYdXUneS-V__iLArbGxDnCyAOb70B4ur49InnUaRewyD1BgRmBHEyCaw-HL1Qz9iUXrkQC18V_01g-8U3iXu10IU2aHrk",
      link: "/portfolio?sector=hospitality"
    },
    procurement: {
      title: "B2B & Procurement",
      desc: "Individual Houses, Villas, and private estates tailored for personal wellness.",
      imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuArzukkQe74HgIm92FnG3-sCZ-j0fHmv-kwwSws7u1yiSen96IHxJbd-MJLZX_CaNUzyhJhlmmZEx4cJUqUfYEoazhxeB5qnadct4xwJQxcXOUINJUsjU80-Ltb1PmkqjbcyZ222OFEq-dahQJaTDpLdi10-JkaxPrG69kJObYR8QwIKbaXmhgZGhCKapbZbQYD8wQAy5KetzliYsUP-BhpuS9x61NvpXSON_g_OrH6SKt8Ilc65qD5_osbEEEUuiQxp1-LZl38xXY",
      link: "/contact"
    }
  },
  cta: {
    title: "Ready to harmonize your space?",
    description: "Whether it's technical lighting precision or organic landscape vitality, let's collaborate to create an environment that breathes with life and light.",
    btn1Text: "Start a Project",
    btn1Url: "/contact",
    btn2Text: "Request Division Catalog",
    btn2Url: "/downloads"
  }
};

const aboutSetup = {
  header: {
    title: "Our Story",
    description: "Greetings from Delight Group LLC. Redefining the supply experience in the UAE.",
    subtitle: "Greetings from Delight Group LLC",
    logoUrl: "/dgllclogolarge.png"
  },
  definition: {
    title: "Redefining the supply experience in the UAE.",
    description1: "We are not engineers or contractors. We are passionate resellers who believe great products — beautiful lighting and thriving plants — should be straightforward to source.",
    description2: "We work with homeowners, interior designers, fitout contractors, hotel developers, and facility managers who want a dependable supply partner they can count on. As a new company entering the UAE market, our commitment is simple: honest pricing, genuine products, and service that makes you want to come back."
  },
  division_dtl: {
    title: "Delight Technical Lighting",
    desc: "We supply premium indoor and outdoor lighting fixtures from trusted global brands to homes, offices, hotels, retail spaces, and commercial developments across the UAE. From pendant lights and downlights to architectural outdoor fixtures — if it illuminates a space, we carry it."
  },
  division_dgs: {
    title: "Delight Greenscapes",
    desc: "We supply curated indoor and outdoor plants, decorative pots, and planters to residences, offices, hotels, and commercial developments. Whether you need a single statement palm for your living room or bulk greenery for a hotel lobby fitout, Greenscapes is your UAE source."
  },
  vision: {
    title: "Our Vision",
    content: "To become the UAE's most trusted specialist supplier of premium lighting and plants — valued for quality, transparency, and dependable service."
  },
  mission: {
    title: "Our Mission",
    content: "Make beautiful, high-quality products accessible to every client — from a homeowner redecorating a room to a developer fitting out an entire building."
  },
  values: {
    v1: {
      title: "Honest about what we are",
      desc: "Resellers, not engineers. We're clear about what we do best, sourcing and delivering exceptional products."
    },
    v2: {
      title: "Quality products, no compromise",
      desc: "If we wouldn't put it in our own homes, we won't supply it to yours."
    },
    v3: {
      title: "Straightforward pricing",
      desc: "Transparent B2B and B2C structures to build dependable long-term relationships."
    },
    v4: {
      title: "UAE-wide delivery commitment",
      desc: "Reliable logistics infrastructure ensuring your products arrive safely and on schedule."
    }
  },
  testimonials: {
    t1: {
      quote: "Delight Technical Lighting has completely transformed our hotel projects. Their luminaire supply capacity and swift response times are unmatched in the UAE.",
      author: "Lead Architect",
      company: "Al Habtoor Group • Dubai"
    },
    t2: {
      quote: "The potted monsteras and custom office plants supplied by Delight Greenscapes brought our fitout workspaces to life. Genuinely thriving plants of high caliber.",
      author: "Interior Design Director",
      company: "Emaar Properties • Dubai"
    },
    t3: {
      quote: "Finding a supply partner that delivers both high-end light fixtures and curated foliage under straightforward pricing has completely streamlined our procurement.",
      author: "Procurement Manager",
      company: "Sobha Realty • Dubai"
    }
  },
  leadership: {
    title: "Leadership Message",
    subtitle: "Our goal isn't just to sell products, but to curate environments where people feel truly at home.",
    description1: "Delight Group LLC was founded on a simple belief: that premium light elements and green flora are key to crafting inspiring environments. We want to remove the complexity from sourcing high-quality architectural components.",
    description2: "Every product in our catalog is hand-selected. Every client interaction is backed by the personal touch of a small business, backed by the operational safety of a trusted brand. We are proud to contribute to shaping the landscapes of the UAE, one space at a time.",
    authorTitle: "Founder & CEO",
    authorCompany: "DELIGHT GROUP LLC",
    imageUrl: "/about-hero.png"
  }
};

const contactSetup = {
  heroImageUrl: "/about-hero.png",
  mapUrl: "https://maps.google.com",
  emails: {
    press: "media@delightgroupllc.com",
    careers: "careers@delightgroupllc.com"
  },
  hours: "Monday – Friday: 09:00 – 18:00 GST",
  socialLinks: {
    websiteUrl: "https://delightgroupllc.com"
  }
};

const downloadsSetup = {
  title: "Download Center",
  description: "Access technical specifications, brand assets, and sustainability reports for our core divisions. Designed for precision and ease of integration into your architectural workflows.",
  imageUrl: "/about-hero.png",
  ctaTitle: "Have a specific requirement?",
  ctaDescription: "Our technical team is available for deep-dive consultations regarding custom specifications, large-scale integrations, and material compliance for your unique project needs.",
  ctaBtnText: "Contact Our Team",
  ctaBtnLink: "/contact"
};

async function seed() {
  const { pool } = await import('../src/lib/db');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const settingsToSeed = [
      { key: 'home_setup', value: JSON.stringify(homeSetup) },
      { key: 'about_setup', value: JSON.stringify(aboutSetup) },
      { key: 'contact_setup', value: JSON.stringify(contactSetup) },
      { key: 'downloads_setup', value: JSON.stringify(downloadsSetup) }
    ];

    for (const s of settingsToSeed) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
        [s.key, s.value]
      );
    }
    
    await client.query('COMMIT');
    console.log('Successfully seeded database page settings!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding page settings failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
