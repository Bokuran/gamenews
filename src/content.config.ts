import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Тип новости. Влияет на шаблон заголовка и на фильтры коллектора.
 */
const newsType = z.enum([
  'announce', // анонс игры / тизер
  'release', // дата релиза, релиз
  'delay', // перенос
  'patch', // обновление / патчноут
  'rumor', // слух или утечка
  'industry', // бизнес: студии, сделки, суды
  'review', // обзоры и превью
]);

/**
 * Стадия проекта. Влияет только на подпись в карточке игры.
 */
const gameStatus = z.enum([
  'released', // вышла
  'early-access', // ранний доступ
  'announced', // анонсирована
  'remaster', // переиздание или ремастер
]);

const news = defineCollection({
  loader: glob({
    pattern: '**/[^_]*.{md,mdx}',
    base: './src/content/news',
  }),

  schema: ({ image }) =>
    z.object({
      title: z
        .string()
        .min(12, 'Заголовок новостной карточки должен быть информативным')
        .max(110, 'Google обрезает title длиннее ~110 символов'),

      description: z
        .string()
        .min(40, 'Описание используется в ленте, OG-тегах и сниппете поиска')
        .max(200, 'Длиннее 200 символов обрезается в поисковой выдаче'),

      date: z.coerce.date(),
      updated: z.coerce.date().optional(),

      type: newsType.default('announce'),
      tags: z.array(z.string().min(1)).max(8).default([]),

      // Обязательная гиперссылка на первоисточник — юридическая страховка.
      source: z.string().url(),
      sourceName: z.string().min(2),

      image: image().optional(),
      imageCredit: z.string().optional(),

      draft: z.boolean().default(false),
      featured: z.boolean().default(false),
    }),
});

/**
 * Карточка игры. Заводится вручную, когда о проекте выходит первая новость.
 * Новости подтягиваются автоматически по совпадению тегов с `aliases`.
 */
const games = defineCollection({
  loader: glob({
    pattern: '**/[^_]*.{md,mdx}',
    base: './src/content/games',
  }),

  schema: ({ image }) =>
    z.object({
      title: z.string().min(2).max(80),

      // Теги новостей, которые относятся к этой игре. Заголовок игры
      // участвует в сопоставлении всегда, здесь — только отличия:
      // «Onimusha» для «Onimusha 3», «Shrek» для «Shrek 2».
      aliases: z.array(z.string().min(1)).max(8).default([]),

      description: z
        .string()
        .min(40, 'Описание показывается в карточке и в поиске')
        .max(200, 'Длиннее 200 символов обрезается в карточке'),

      developer: z.string().optional(),
      publisher: z.string().optional(),
      genre: z.string().optional(),
      platforms: z.array(z.string()).default([]),

      // Свободный текст: точная дата есть не у всех проектов.
      release: z.string().optional(),
      status: gameStatus.default('released'),

      cover: image().optional(),
      // Широкий кадр для шапки страницы игры. Если не задан — берётся cover.
      banner: image().optional(),
      links: z
        .object({
          site: z.string().url().optional(),
          steam: z.string().url().optional(),
        })
        .default({}),

      draft: z.boolean().default(false),
    }),
});

export const collections = { news, games };
