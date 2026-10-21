import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/site';
import { absoluteUrl, newsUrl } from '@/lib/paths';

export async function GET() {
  const posts = (await getCollection('news', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );

  return rss({
    title: `${SITE_NAME} — новости`,
    description: SITE_DESCRIPTION,
    // Абсолютный URL канала. base уже учтён внутри absoluteUrl().
    site: absoluteUrl('/'),
    // Ссылки вида /news/slug/ — как их отдаёт GitHub Pages без редиректа.
    trailingSlash: true,
    customData: '<language>ru</language>',

    items: posts.slice(0, 40).map((post) => ({
      title: post.data.title,
      link: absoluteUrl(newsUrl(post.id)),
      pubDate: post.data.updated ?? post.data.date,
      description: post.data.description,
      categories: post.data.tags,
      // <source> — штатный способ RSS указать первоисточник материала.
      source: { url: post.data.source, title: post.data.sourceName },
    })),
  });
}
