import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: false,
  // Эти теги должны быть массивами даже когда элемент один — иначе
  // код сломается на фиде с единственной новостью.
  isArray: (name) => ['item', 'entry', 'category', 'link', 'media:thumbnail', 'media:content'].includes(name),
});

/** Разворачивает строку | { '#text' } | число | массив в скаляр. */
function text(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === 'object') {
    if ('#text' in value) return text(value['#text']);
    return '';
  }
  return '';
}

export function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Atom: берём rel="alternate", иначе первый link с href. */
function atomLink(links) {
  const withHref = (links ?? []).map((l) => (typeof l === 'string' ? { '@_href': l } : l));
  const alternate = withHref.find((l) => l['@_rel'] === 'alternate' || !l['@_rel']);
  return alternate?.['@_href'] ?? withHref[0]?.['@_href'] ?? '';
}

function firstImageUrl(item) {
  const mediaContent = (item['media:content'] ?? []).find((m) => m['@_url']) ??
    (Array.isArray(item['media:content']) ? item['media:content'][0] : item['media:content']);
  const thumb = Array.isArray(item['media:thumbnail'])
    ? item['media:thumbnail'][0]
    : item['media:thumbnail'];

  const candidates = [
    mediaContent?.['@_url'],
    thumb?.['@_url'],
    typeof item.enclosure === 'object' ? item.enclosure['@_url'] : '',
    // YouTube-фиды кладут превью в media:group
    item['media:group']?.['media:thumbnail']?.['@_url'],
  ];
  return candidates.find(Boolean) ?? '';
}

function parseDate(item) {
  const raw =
    item.pubDate ?? item.published ?? item.updated ?? item.date ?? item['dc:date'] ?? '';
  const parsed = new Date(text(raw));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function categoriesOf(item) {
  const cats = (item.category ?? [])
    .map((c) => (typeof c === 'string' ? c : text(c)))
    .map((c) => c.trim())
    .filter(Boolean);
  return [...new Set(cats)].slice(0, 6);
}

/**
 * Разбирает RSS 2.0 или Atom в плоский список.
 * Возвращает null, если документ не похож ни на один из форматов.
 */
export function parseFeed(xml) {
  const doc = parser.parse(xml);

  const rawItems = doc?.rss?.channel?.item ?? doc?.feed?.item ?? null;
  if (rawItems) {
    return (Array.isArray(rawItems) ? rawItems : [rawItems]).map((item) => ({
      title: stripHtml(text(item.title)),
      link: text(item.link),
      date: parseDate(item),
      description: stripHtml(text(item['description'] ?? item['media:description'])),
      contentHtml: text(item['content:encoded'] ?? item['dc:content']),
      image: firstImageUrl(item),
      categories: categoriesOf(item),
      author: stripHtml(text(item['dc:creator'] ?? item.author)),
    }));
  }

  const entries = doc?.feed?.entry;
  if (entries) {
    return (Array.isArray(entries) ? entries : [entries]).map((entry) => ({
      title: stripHtml(text(entry.title)),
      link: atomLink(entry.link),
      date: parseDate(entry),
      description: stripHtml(text(entry.summary ?? entry.description)),
      contentHtml: text(entry.content),
      image: firstImageUrl(entry),
      categories: categoriesOf(entry),
      author: stripHtml(text(entry.author?.name ?? entry.author)),
    }));
  }

  return null;
}
