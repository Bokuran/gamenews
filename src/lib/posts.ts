import { getCollection, type CollectionEntry } from 'astro:content';

export type NewsPost = CollectionEntry<'news'>;

/**
 * Новости лежат в папках по названию игры, поэтому `post.id` выглядит как
 * «subnautica-2/subnautica-2-early-access-2-0». В URL идёт только имя файла —
 * так адреса статей не меняются при перекладывании папок.
 */
export function postSlug(id: string): string {
  return id.split('/').pop() ?? id;
}

/**
 * Все опубликованные новости, свежие первыми.
 * Сортировка по дате, затем по id — чтобы порядок был детерминированным
 * при одинаковых метках времени (бывает при пакетной генерации черновиков).
 */
export async function getPublishedPosts(): Promise<NewsPost[]> {
  const posts = await getCollection('news', ({ data }) => !data.draft);
  return posts.sort((a, b) => {
    const diff = b.data.date.getTime() - a.data.date.getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

export function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

export function countByTag(posts: NewsPost[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

/** Теги для облака: сначала популярные, затем алфавитно. */
export function sortedTags(posts: NewsPost[]): { tag: string; count: number }[] {
  return [...countByTag(posts).entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'));
}

export function postsByTag(posts: NewsPost[], tag: string): NewsPost[] {
  const needle = tag.toLowerCase();
  return posts.filter((p) => p.data.tags.some((t) => t.toLowerCase() === needle));
}
