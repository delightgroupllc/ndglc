# Image Configurator Setup Guide

## Overview
The Image Configurator allows administrators to search and manage images from Unsplash for different sections of the DTL and DGS homepages.

## Features
- 🔍 Search Unsplash API for images by keyword
- 🖼️ Preview and organize images for specific sections
- 📸 Automatic image metadata storage (URL, alt text, photographer credit)
- 🎨 Separate image management for DTL and DGS divisions
- 🗑️ Delete/deactivate images as needed

## Setup Instructions

### 1. Get Unsplash API Key
1. Visit https://unsplash.com/developers
2. Sign up or log in
3. Create a new application
4. Copy your Access Key

### 2. Configure Environment Variables
Add to your `.env` file:
```env
UNSPLASH_ACCESS_KEY=your_access_key_here
```

### 3. Run Database Migration
```bash
npx tsx migrate_section_images.ts
```

This creates the `section_images` table with the following structure:
- `id` - UUID primary key
- `division` - 'dtl' or 'dgs'
- `section` - Target section (hero, discover_by_rooms, featured_products, projects, instagram)
- `image_url` - Direct link to image
- `alt_text` - Accessibility text
- `source` - Image source (unsplash, pexels, custom)
- `source_id` - Source-specific ID
- `display_order` - Sort order
- `is_active` - Soft delete flag
- `created_at` / `updated_at` - Timestamps

### 4. Restart Development Server
```bash
npm run dev
```

### 5. Access Dashboard
Navigate to `/dashboard/dtl-images` as an admin user.

## API Endpoints

### Search Images
```
GET /api/images/search?query=lighting&page=1&per_page=12
```

Returns array of image objects with URLs, photographer info, etc.

### Get Section Images
```
GET /api/images?division=dtl&section=hero
```

### Add Image
```
POST /api/images
Content-Type: application/json

{
  "division": "dtl",
  "section": "hero",
  "imageUrl": "https://images.unsplash.com/...",
  "altText": "Lighting in retail store - by Photographer Name",
  "source": "unsplash",
  "sourceId": "abc123",
  "displayOrder": 0
}
```

### Delete Image
```
DELETE /api/images?id=<image-uuid>
```

## Dashboard UI Sections

### Sections Managed
- **🖼️ Hero Banner** - Main hero image section
- **🏠 Discover by Rooms** - Category showcase grid
- **⭐ Featured Products** - Product highlight section
- **🏢 Projects** - Project showcase section
- **📸 Instagram Feed** - Social media feed section

### Workflow
1. Select target division (DTL or DGS)
2. Choose section from dropdown
3. Enter search keywords (e.g., "modern lighting", "green plants")
4. Browse results
5. Click "Add to [section]" to save
6. View saved images in tabs below
7. Delete images with hover buttons

## Unsplash API Limits
- **Free tier**: 50 requests/hour
- **Rate limit headers**: Included in response

## Database Schema
```sql
CREATE TABLE section_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division TEXT NOT NULL CHECK (division IN ('dtl', 'dgs')),
  section TEXT NOT NULL CHECK (section IN ('hero', 'discover_by_rooms', 'featured_products', 'projects', 'instagram')),
  image_url TEXT NOT NULL,
  alt_text TEXT,
  source TEXT DEFAULT 'unsplash' NOT NULL,
  source_id TEXT,
  display_order INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_section_images_division_section 
ON section_images(division, section, is_active);
```

## Troubleshooting

### "Unsplash API key not configured"
- Check `.env` file has `UNSPLASH_ACCESS_KEY`
- Restart dev server after adding key
- Verify key is valid at https://unsplash.com/developers

### No images returned in search
- Check internet connection
- Verify Unsplash API key is active
- Try different search terms
- Check for rate limiting (50 requests/hour)

### Images not saving
- Verify database connection
- Check browser console for errors
- Ensure user has 'admin' role
- Try refreshing page after adding

### Images not displaying on homepage
- Check image URLs are accessible
- Verify `is_active = TRUE` in database
- Ensure correct division/section names
- Check browser console for CORS issues

## Future Enhancements
- [ ] Pexels API integration
- [ ] Batch upload from files
- [ ] Image cropping tool
- [ ] Category-specific images
- [ ] A/B testing support
- [ ] Image optimization/compression
- [ ] Cache management
