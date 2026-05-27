import type { APIRoute } from 'astro';
import { query } from '../../../lib/db';

/**
 * GET: Fetch images for a specific section
 * DELETE: Remove an image
 * POST: Add/update an image
 * PATCH: Move an image to a new folder
 */

export const GET: APIRoute = async ({ url }) => {
  try {
    const division = url.searchParams.get('division'); // 'dtl' or 'dgs' or 'all' / empty
    const section = url.searchParams.get('section'); // 'hero', 'featured_products', etc

    let sql = 'SELECT id, division, section, image_url, alt_text, source, source_id, display_order, folder_path, created_at FROM section_images WHERE is_active = TRUE';
    const params: any[] = [];

    if (division && division !== 'all') {
      params.push(division);
      sql += ` AND division = $${params.length}`;
    }
    if (section && section !== 'all') {
      params.push(section);
      sql += ` AND section = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const res = await query(sql, params);

    return new Response(
      JSON.stringify({ images: res.rows }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Fetch images error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { division, section, imageUrl, altText, source, sourceId, displayOrder, folderPath } = body;

    if (!division || !section || !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate division and section against allowed values to avoid DB constraint errors
    const allowedDivisions = ['dtl', 'dgs'];
    const allowedSections = ['hero', 'discover_by_rooms', 'featured_products', 'projects', 'instagram'];
    const allowedSources = ['unsplash', 'pexels', 'custom'];

    if (!allowedDivisions.includes(division)) {
      return new Response(JSON.stringify({ error: 'Invalid division' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!allowedSections.includes(section)) {
      return new Response(JSON.stringify({ error: 'Invalid section' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const finalSource = (source && allowedSources.includes(source)) ? source : 'custom';
    const finalFolder = folderPath ? folderPath.trim() : '/';

    const res = await query(
      `INSERT INTO section_images (division, section, image_url, alt_text, source, source_id, display_order, folder_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, image_url, alt_text, source, display_order, folder_path, created_at`,
      [division, section, imageUrl, altText || '', finalSource, sourceId || null, displayOrder || 0, finalFolder]
    );

    return new Response(
      JSON.stringify({ 
        message: 'Image added successfully',
        image: res.rows[0]
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Add image error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { id, folderPath } = body;

    if (!id || !folderPath) {
      return new Response(
        JSON.stringify({ error: 'Missing id or folderPath' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const trimmedFolder = folderPath.trim();

    const res = await query(
      `UPDATE section_images SET folder_path = $1 WHERE id = $2 RETURNING id, folder_path`,
      [trimmedFolder, id]
    );

    if (res.rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Image not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ message: 'Folder path updated successfully', image: res.rows[0] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Move image error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const DELETE: APIRoute = async ({ request, url }) => {
  try {
    const imageId = url.searchParams.get('id');

    if (!imageId) {
      return new Response(
        JSON.stringify({ error: 'Missing image id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const res = await query(
      `UPDATE section_images SET is_active = FALSE WHERE id = $1 RETURNING id`,
      [imageId]
    );

    if (res.rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Image not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ message: 'Image deleted successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Delete image error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

