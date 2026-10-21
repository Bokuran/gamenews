const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/**
 * Слаг для имени файла. Кириллица транслитерируется — на GitHub Pages
 * URL с %D0%BB%D1%83 читаются плохо и ломаются при копировании.
 */
export function slugify(input, maxLength = 70) {
  const translit = [...input.toLowerCase()].map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch)).join('');
  const slug = translit
    .replace(/ё/g, 'e')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug || `news-${Date.now().toString(36)}`;
}

/** Приводит строку к диапазону длины, требуемой zod-схемой. */
export function fitRange(value, min, max, pad = '') {
  let out = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (out.length > max) out = `${out.slice(0, max - 1).trimEnd()}…`;
  if (out.length < min) out = `${out}${out ? ' —' : ''} ${pad}`.trim();
  // Финальная страховка: pad тоже может выбить за максимум.
  return out.length > max ? out.slice(0, max) : out;
}

const TYPE_RULES = [
  ['delay', /перенос|delay|сдвиг|отложи|отложен/i],
  ['release', /релиз|вышла|вышел|стартовал|release|launch|дата выхода/i],
  ['patch', /патч|обновл|update|patch|hotfix|сезон/i],
  ['rumor', /слух|утечк|инсайдер|rumor|leak|reportedly|сообщает источник/i],
  ['industry', /студи|издател|сделк|выкуп|закрыл|сокращ|суд|инвест|indus|acquisition|layoff|bankrupt/i],
  ['review', /обзор|превью|review|verdict|оценк/i],
];

/** Тип новости по заголовку — влияет на бейдж и на шаблон текста. */
export function inferType(title, categories = []) {
  const haystack = `${title} ${categories.join(' ')}`;
  for (const [type, pattern] of TYPE_RULES) {
    if (pattern.test(haystack)) return type;
  }
  return 'announce';
}

const TAG_STOPWORDS = new Set([
  'news', 'gaming', 'games', 'pc', 'feature', 'features', 'guide', 'guides',
  'review', 'reviews', 'preview', 'opinion', 'industry', 'video',
]);

/** Категории фида → теги: без мусорных слов, максимум 8, как требует схема. */
export function normalizeTags(categories, title) {
  const cleaned = categories
    .map((c) => c.replace(/\s+/g, ' ').trim())
    .filter((c) => c.length > 1 && c.length <= 24 && !TAG_STOPWORDS.has(c.toLowerCase()));

  const fromTitle = title
    .split(/[\s,.—–:;!?()«»"']+/)
    .filter((w) => w.length > 3 && /^[A-ZА-ЯЁ][\wА-ЯЁ-]*$/.test(w))
    .slice(0, 2);

  return [...new Set([...cleaned.slice(0, 6), ...fromTitle])].slice(0, 8);
}

/**
 * YAML-строка в двойных кавычках. JSON.stringify даёт валидный YAML-скаляр,
 * поэтому заголовок с двоеточием больше не ломает разбор фронтматтера.
 */
const yStr = (value) => JSON.stringify(String(value));

function frontmatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    lines.push(`${key}: ${value}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function body(post) {
  return `
<!--
  ВНИМАНИЕ: description во фронтматтере скопирован из фида. Его нужно
  переписать своими словами — иначе на сайте окажется чужой текст.
  Черновик скрыт (draft: true), но после снятия флага попадёт на сайт.
-->

> **Не копируй текст источника.** Перескажи своими словами: охраняется форма подачи,
> а не факты. Дата, платформа и цена — использовать можно, формулировки — нет.
> Ссылка на источник уже прописана в \`source\` и выведется на странице автоматически.

## Что известно

- **Что случилось:** 
- **Когда:** 
- **Платформы:** 
- **Детали:** 

## Контекст

_Чем это было раньше, на что влияет, чего ждать дальше — то, чего нет у источника._

<!--
Перед публикацией:
1. Переписать description и текст своими словами
2. Проверить факты по источнику: ${post.link}
3. Убрать draft: true
4. Взять картинку из официального пресс-кита и заполнить imageCredit
5. npm run check
-->
`;
}

/**
 * Собирает Markdown-файл, который гарантированно проходит zod-схему.
 * Это важно: черновики тоже валидируются при сборке, и битый фронтматтер
 * уронит весь билд, а не только один пост.
 */
export function buildDraft(post) {
  const title = fitRange(post.title, 12, 110, '— подробности у источника');
  const description = fitRange(
    post.description || `${title}. Короткое описание добавит редактор.`,
    40,
    200,
    `Источник — ${post.sourceName}.`,
  );
  const tags = normalizeTags(post.categories ?? [], post.title);
  const type = inferType(title, post.categories ?? []);

  const fm = frontmatter({
    title: yStr(title),
    description: yStr(description),
    date: post.date.toISOString(),
    type,
    tags: JSON.stringify(tags),
    source: yStr(post.link),
    sourceName: yStr(post.sourceName),
    ...(post.imagePath ? { image: yStr(post.imagePath) } : {}),
    draft: 'true',
    featured: 'false',
  });

  return {
    slug: slugify(post.title),
    type,
    content: `${fm}\n${body({ ...post, description, title })}`,
  };
}
