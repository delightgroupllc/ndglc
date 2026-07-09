import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

/**
 * Optimizes a base64-encoded image by resizing and converting to WebP.
 * Returns the public URL path of the saved optimized image.
 *
 * @param base64DataUri - Full data URI string (e.g., "data:image/png;base64,...")
 * @param productId - The product ID (used in filename)
 * @returns The public URL path (e.g., "/uploads/img_abc123_1234567890.webp")
 */
export async function optimizeAndSaveImage(
  base64DataUri: string,
  productId: string
): Promise<string> {
  const base64Data = base64DataUri.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(base64Data, 'base64');

  const fileName = `img_${productId}_${Date.now()}.webp`;
  const dir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);

  // Resize to max 800px on longest side and convert to WebP at 80% quality
  await sharp(inputBuffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(filePath);

  return `/uploads/${fileName}`;
}
