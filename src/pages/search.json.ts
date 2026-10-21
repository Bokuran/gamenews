import type { APIRoute } from 'astro';
import { getPublishedPosts } from '@/lib/posts';
import { newsUrl } from '@/lib/paths';
import { NEWS_TYPES } from '@/lib/site';

/**
 * Индекс для клиентского поиска. Собирается один раз при билде,
 * поэтому поиск работает на статическом хостинге без сервера.
 *
 * Поля короткие намеренно: индекс уезжает в браузер целиком.
 * t — заголовок, d — описание, g — теги, y — тип, u — url, dt — дата.
 */
export const GET: APIRoute = async () => {
  const posts = await getPublishedPosts();

  const index = posts.map((post) => ({
    t: post.data.title,
    d: post.data.description,
    g: post.data.tags.join(' '),
    y: NEWS_TYPES[post.data.type] ?? post.data.type,
    u: newsUrl(post.id),
    dt: post.data.date.toISOString(),
  }));

  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
