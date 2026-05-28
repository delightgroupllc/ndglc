import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import clerk from '@clerk/astro';
import tailwindcss from '@tailwindcss/vite'; // 1. Import Tailwind's native Vite plugin

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [
    clerk() // 2. Keep Clerk here
  ],
  vite: {
    plugins: [tailwindcss()], // 3. Embed Tailwind inside the Vite layer
  },
});
