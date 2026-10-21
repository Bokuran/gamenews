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

export const collections = { news };
