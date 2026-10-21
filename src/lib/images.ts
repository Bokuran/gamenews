import type { ImageMetadata } from 'astro';
import type { CollectionEntry } from 'astro:content';

export type NewsImage = NonNullable<CollectionEntry<'news'>['data']['image']>;

/**
 * Content-layer сериализует метаданные картинки, из-за чего `format`
 * приходит опциональным, хотя `<Image>` требует обязательного.
 * Значение создаётся тем же `image()`-хелпером схемы, данных это не меняет —
 * приводим тип, чтобы не дублировать каст в каждом компоненте.
 */
export const asImageMetadata = (image: NewsImage): ImageMetadata => image as ImageMetadata;
