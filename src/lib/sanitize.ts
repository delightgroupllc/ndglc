/**
 * Secure, lightweight HTML sanitizer to prevent XSS attacks.
 * Strips script tags, iframe tags, on* event handlers, and javascript: links.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  
  return html
    // Strip <script>...</script> tags case-insensitively
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
    // Strip <iframe...></iframe> tags
    .replace(/<iframe[^>]*>([\s\S]*?)<\/iframe>/gi, '')
    // Strip inline on* handlers (e.g. onload, onerror, onclick)
    .replace(/\s+on\w+\s*=\s*(["'])(.*?)\1/gi, '')
    .replace(/\s+on\w+\s*=\s*([^\s>]+)/gi, '')
    // Strip javascript: protocol links
    .replace(/href\s*=\s*(["'])javascript:(.*?)\1/gi, 'href="#"')
    .replace(/href\s*=\s*javascript:([^\s>]+)/gi, 'href="#"');
}
