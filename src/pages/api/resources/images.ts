import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { query } from '../../../lib/db';

export const GET: APIRoute = async () => {
  try {
    const images: Array<{ url: string; name: string; category: string; isLocal: boolean }> = [];
    const publicDir = path.join(process.cwd(), 'public');

    // 1. Scan public folder for local images
    if (fs.existsSync(publicDir)) {
      const files = fs.readdirSync(publicDir);
      files.forEach((file) => {
        if (/\.(png|jpg|jpeg|webp|svg|gif)$/i.test(file)) {
          let category = 'Public Resource';
          if (file.includes('1screen') || file.includes('dgs')) category = 'DGS Greenscapes';
          else if (file.includes('3screen') || file.includes('dtl')) category = 'DTL Technical Lighting';
          else if (file.includes('2screen') || file.includes('hero') || file.includes('about')) category = 'Hero & Architecture';
          else if (file.includes('logo')) category = 'Branding & Logos';

          images.push({
            url: `/${file}`,
            name: file,
            category,
            isLocal: true
          });
        }
      });
    }

    // 2. Scan public/uploads folder
    const uploadsDir = path.join(publicDir, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const uploadFiles = fs.readdirSync(uploadsDir);
      uploadFiles.forEach((file) => {
        if (/\.(png|jpg|jpeg|webp|svg|gif)$/i.test(file)) {
          images.push({
            url: `/uploads/${file}`,
            name: file,
            category: 'User Uploads',
            isLocal: true
          });
        }
      });
    }

    // 3. Query section_images table for valid DB images
    try {
      const dbRes = await query('SELECT DISTINCT image_url, alt_text, section FROM section_images WHERE is_active = TRUE LIMIT 50');
      dbRes.rows.forEach((r: any) => {
        let rawUrl = (r.image_url || '').trim();
        if (!rawUrl) return;

        // Fix broken pexels paths missing hostname
        if (rawUrl.startsWith('/photos/')) {
          rawUrl = `https://images.pexels.com${rawUrl}`;
        }

        // Check if local file exists
        let isLocal = false;
        if (rawUrl.startsWith('/')) {
          const localPath = path.join(publicDir, rawUrl.replace(/^\//, ''));
          if (fs.existsSync(localPath)) {
            isLocal = true;
          } else {
            // Ignore missing local files
            return;
          }
        }

        if (!images.some((i) => i.url === rawUrl)) {
          images.push({
            url: rawUrl,
            name: r.alt_text || rawUrl.split('/').pop() || 'Database Image',
            category: r.section ? `Section: ${r.section}` : 'Database Resource',
            isLocal
          });
        }
      });
    } catch (dbErr) {
      // Ignore DB errors
    }

    // Prioritize local resources first
    images.sort((a, b) => (a.isLocal === b.isLocal ? 0 : a.isLocal ? -1 : 1));

    return new Response(JSON.stringify({ images }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
