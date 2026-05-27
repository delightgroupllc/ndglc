import type { APIRoute } from 'astro';

// Unified image search supporting Unsplash and Pexels
export const GET: APIRoute = async ({ url }) => {
  try {
    const q = url.searchParams.get('query') || 'lighting';
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const perPage = parseInt(url.searchParams.get('per_page') || '12', 10);
    const source = (url.searchParams.get('source') || 'both').toLowerCase(); // 'unsplash' | 'pexels' | 'both'

    const unsplashKey = import.meta.env.UNSPLASH_ACCESS_KEY;
    const pexelsKey = import.meta.env.PEXELS_API_KEY;

    if (source === 'unsplash' && !unsplashKey) {
      return new Response(JSON.stringify({ error: 'Unsplash API key not configured', images: [] }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (source === 'pexels' && !pexelsKey) {
      return new Response(JSON.stringify({ error: 'Pexels API key not configured', images: [] }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const results: any[] = [];

    // Helper to map Unsplash item
    const mapUnsplash = (img: any) => ({
      id: `unsplash:${img.id}`,
      url: img.urls.regular,
      thumbUrl: img.urls.thumb,
      altText: img.alt_description || img.description || 'Unsplash image',
      photographer: img.user?.name || '',
      photographerUrl: img.user?.links?.html || '',
      source: 'unsplash',
      sourceId: img.id,
    });

    // Helper to map Pexels item
    const mapPexels = (photo: any) => ({
      id: `pexels:${photo.id}`,
      url: photo.src?.large2x || photo.src?.large || photo.src?.medium || photo.src?.original,
      thumbUrl: photo.src?.small || photo.src?.tiny || photo.src?.medium,
      altText: photo.alt || '',
      photographer: photo.photographer || '',
      photographerUrl: photo.url || '',
      source: 'pexels',
      sourceId: String(photo.id),
    });

    const calls: Promise<void>[] = [];

    if (source === 'unsplash' || source === 'both') {
      calls.push((async () => {
        if (!unsplashKey) return;
        const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&page=${page}&per_page=${perPage}&client_id=${unsplashKey}`);
        if (!res.ok) throw new Error(`Unsplash: ${res.status} ${res.statusText}`);
        const data = await res.json();
        const items = (data.results || []).map(mapUnsplash);
        results.push(...items);
      })());
    }

    if (source === 'pexels' || source === 'both') {
      calls.push((async () => {
        if (!pexelsKey) return;
        const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&page=${page}&per_page=${perPage}`, {
          headers: { Authorization: pexelsKey }
        });
        if (!res.ok) throw new Error(`Pexels: ${res.status} ${res.statusText}`);
        const data = await res.json();
        const items = (data.photos || []).map(mapPexels);
        results.push(...items);
      })());
    }

    await Promise.all(calls);

    // If both services were queried, interleave or trim to perPage
    let images = results;
    if (source === 'both') {
      // simple de-dup and take first perPage
      const seen = new Set();
      images = [];
      for (const it of results) {
        const key = `${it.source}:${it.sourceId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        images.push(it);
        if (images.length >= perPage) break;
      }
    } else {
      images = images.slice(0, perPage);
    }

    return new Response(JSON.stringify({ page, perPage, images }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Image search error:', error);
    return new Response(JSON.stringify({ error: error.message, images: [] }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
