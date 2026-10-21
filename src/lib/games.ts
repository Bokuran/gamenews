import { getCollection, type CollectionEntry } from 'astro:content';
import { getPublishedPosts, type NewsPost } from '@/lib/posts';
import type { NewsImage } from '@/lib/images';

export type GameEntry = CollectionEntry<'games'>;

/** Подписи стадий проекта для карточки игры. */
export const GAME_STATUS: Record<string, string> = {
  released: 'Вышла',
  'early-access': 'Ранний доступ',
  announced: 'Анонсирована',
  remaster: 'Ремастер',
};

/**
 * Ключи сопоставления с тегами новостей: заголовок игры плюс алиасы.
 * Сравнение регистронезависимое — «Cyberpunk 2077» и «cyberpunk 2077» равны.
 */
export function gameAliases(game: GameEntry): string[] {
  return [game.data.title, ...game.data.aliases].map((alias) => alias.toLowerCase());
}

/**
 * Новости об игре. Отдельного поля в новости нет намеренно: связь идёт
 * по тегам, поэтому карточка заводится без правки уже опубликованных статей.
 */
export function postsForGame(game: GameEntry, posts: NewsPost[]): NewsPost[] {
  const aliases = gameAliases(game);
  return posts.filter((post) =>
    post.data.tags.some((tag) => aliases.includes(tag.toLowerCase())),
  );
}

export interface GameWithPosts {
  game: GameEntry;
  posts: NewsPost[];
  /** Дата самой свежей новости — null, если новостей ещё нет. */
  latest: Date | null;
  /** Обложка игры, а если её не задали — картинка первой новости. */
  cover: NewsImage | undefined;
  /** Широкий кадр 16:9 для шапки страницы и карточки в сетке. */
  banner: NewsImage | undefined;
}

/**
 * Игры вместе с новостями. Порядок: сначала проекты с большим числом
 * материалов, затем по свежести последней новости, затем по алфавиту.
 */
export async function getGamesWithPosts(): Promise<GameWithPosts[]> {
  const [games, posts] = await Promise.all([
    getCollection('games', ({ data }) => !data.draft),
    getPublishedPosts(),
  ]);

  return games
    .map((game) => {
      const gamePosts = postsForGame(game, posts);
      const withImage = gamePosts.find((post) => post.data.image);
      const cover = game.data.cover ?? withImage?.data.image;
      return {
        game,
        posts: gamePosts,
        latest: gamePosts[0]?.data.date ?? null,
        cover,
        // Баннер 16:9 — основной кадр: карточка и шапка страницы режут его
        // без потерь. Если баннера нет, подойдёт обложка или картинка новости.
        banner: game.data.banner ?? cover,
      };
    })
    .sort((a, b) => {
      const byCount = b.posts.length - a.posts.length;
      if (byCount !== 0) return byCount;
      const byDate = (b.latest?.getTime() ?? 0) - (a.latest?.getTime() ?? 0);
      if (byDate !== 0) return byDate;
      return a.game.data.title.localeCompare(b.game.data.title, 'ru');
    });
}
