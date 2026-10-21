/**
 * Единая точка правки для всего, что уходит в шапку, RSS и разметку схемы.
 */
export const SITE_NAME = 'Game Pulse';
export const SITE_DESCRIPTION =
  'Игровые новости: анонсы, даты релиза, переносы и патчноуты — коротко и со ссылкой на первоисточник.';
// Соцсети не рендерят SVG в og:image — только растер.
export const DEFAULT_OG_IMAGE = '/og-default.png';
export const RSS_TITLE = `${SITE_NAME} — лента новостей`;
export const POSTS_PER_PAGE = 12;
export const HOMEPAGE_POSTS = 8;

/** Порядок и подписи типов новостей для бейджей и фильтров. */
export const NEWS_TYPES: Record<string, string> = {
  announce: 'Анонс',
  release: 'Релиз',
  delay: 'Перенос',
  patch: 'Обновление',
  rumor: 'Слухи',
  industry: 'Индустрия',
  review: 'Обзор',
};

export const LOCALE_DATE = 'ru-RU';

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE_DATE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE_DATE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Человекочитаемая «N часов назад» — важна для новостной ленты. */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const diff = Math.round((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'только что';
  const minutes = Math.round(diff / 60);
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} дн назад`;
  return formatDate(date);
}
