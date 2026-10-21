import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages: site — домен, base — имя репозитория.
// В CI эти значения подставляет deploy.yml из github context, дефолты ниже —
// чтобы локальная сборка совпадала с боевой. Для user-site (bokuran.github.io)
// нужен SITE_BASE='/'.
const site = process.env.SITE_URL ?? 'https://bokuran.github.io';
const base = process.env.SITE_BASE ?? '/gamenews';

export default defineConfig({
  site,
  base,
  // GitHub Pages отдаёт каталог только по адресу /news/, а на /news/ делает
  // 301. Держим слэш во всех ссылках, чтобы не платить лишним round trip.
  trailingSlash: 'always',
  output: 'static',

  integrations: [sitemap()],

  image: {
    responsiveStyles: true,
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
  },

  markdown: {
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },

  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    plugins: [
      ViteImageOptimizer({
        cache: true,
        cacheLocation: 'node_modules/.cache/image-optimizer',
        jpg: { quality: 80 },
        jpeg: { quality: 80 },
        png: { quality: 80 },
        webp: { quality: 80 },
        avif: { quality: 80 },
        svg: {
          multipass: true,
          plugins: ['preset-default', 'sortAttrs'],
        },
        logStats: true,
      }),
    ],
    build: {
      reportCompressedSize: false,
    },
  },
});