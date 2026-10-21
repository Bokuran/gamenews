/**
 * Все внутренние ссылки сайта должны проходить через эти функции.
 *
 * Причина: на GitHub Pages project-site сайт лежит в подпапке (/repo/),
 * и захардкоженные '/news/foo' дадут 404. BASE_URL подставляет astro.config.
 */
const base = import.meta.env.BASE_URL.replace(/\/+$/, '');

/**
 * Пути к файлам (.xml, .png, .svg) живут без завершающего слэша — иначе
 * GitHub Pages ищет каталог вместо файла и отдаёт 404.
 */
function hasExtension(path: string): boolean {
  return /\.[a-z0-9]+$/i.test(path);
}

export function url(path = '/'): string {
  const clean = path.replace(/\/+$/, '');
  const withBase = clean === '' ? `${base}/` : `${base}${clean.startsWith('/') ? clean : `/${clean}`}`;
  if (hasExtension(withBase)) return withBase;
  return withBase.endsWith('/') ? withBase : `${withBase}/`;
}

export function newsUrl(id: string): string {
  return url(`/news/${id}`);
}

export function tagUrl(tag: string): string {
  return url(`/tags/${encodeURIComponent(tag)}`);
}

export function gameUrl(slug: string): string {
  return url(`/games/${slug}`);
}

/** Первая страница намеренно ведёт на /news, а не на /news/page/1 */
export function pageUrl(page: number): string {
  return page <= 1 ? url('/news') : url(`/news/page/${page}`);
}

/**
 * Абсолютный URL для OG-тегов, canonical и JSON-LD.
 *
 * На вход может прийти путь как с base, так и без него:
 * `Astro.url.pathname` и `image.src` от Astro уже содержат base,
 * а пути из `public/` — нет. Функция идемпотентна для обоих случаев.
 */
export function absoluteUrl(path = '/'): string {
  const origin = import.meta.env.SITE?.replace(/\/+$/, '') ?? '';
  const alreadyBased = base === '' || path === base || path.startsWith(`${base}/`);
  const withBase = alreadyBased ? path : url(path);
  return `${origin}${withBase}`;
}
