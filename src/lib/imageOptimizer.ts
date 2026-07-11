import sharp from 'sharp';

/**
 * Optimizes a base64-encoded image by resizing and converting to WebP.
 * Returns the optimized data URI.
 *
 * @param base64DataUri - Full data URI string (e.g., "data:image/png;base64,...")
 * @param productId - The product ID (kept for signature compatibility)
 * @returns The data URI for the optimized WebP image
 */
export async function optimizeAndSaveImage(
  base64DataUri: string,
  productId: string
): Promise<string> {
  const base64Data = base64DataUri.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(base64Data, 'base64');

  // Resize to max 800px on longest side and convert to WebP at 80% quality
  const outputBuffer = await sharp(inputBuffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  return `data:image/webp;base64,${outputBuffer.toString('base64')}`;
}
