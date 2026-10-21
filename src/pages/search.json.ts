import type { APIRoute } from 'astro';
import { getPublishedPosts } from '@/lib/posts';
import { getGamesWithPosts } from '@/lib/games';
import { gameUrl, newsUrl } from '@/lib/paths';
import { NEWS_TYPES } from '@/lib/site';

/**
 * Индекс для клиентского поиска. Собирается один раз при билде,
 * поэтому поиск работает на статическом хостинге без сервера.
 *
 * Поля короткие намеренно: индекс уезжает в браузер целиком.
 * t — заголовок, d — описание, g — теги, y — тип, u — url, dt — дата.
 */
export const GET: APIRoute = async () => {
  const [posts, games] = await Promise.all([getPublishedPosts(), getGamesWithPosts()]);

  const newsIndex = posts.map((post) => ({
    t: post.data.title,
    d: post.data.description,
    g: post.data.tags.join(' '),
    y: NEWS_TYPES[post.data.type] ?? post.data.type,
    u: newsUrl(post.id),
    dt: post.data.date.toISOString(),
  }));

  // Карточки игр тоже ищутся: иначе поиск «по всему сайту» их пропускает.
  const gamesIndex = games.map(({ game, latest }) => ({
    t: game.data.title,
    d: game.data.description,
    g: [game.data.genre, game.data.developer, ...game.data.aliases].filter(Boolean).join(' '),
    y: 'Игра',
    u: gameUrl(game.id),
    dt: (latest ?? new Date(0)).toISOString(),
  }));

  const index = [...newsIndex, ...gamesIndex];

  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
