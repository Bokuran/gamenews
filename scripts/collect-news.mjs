#!/usr/bin/env node
/**
 * Коллектор игровых новостей.
 *
   node scripts/collect-news.mjs              dry-run: показать кандидатов
 *   node scripts/collect-news.mjs --write     записать черновики в src/content/news/
 *
 * Флаги:
 *   --limit=N        максимум файлов за прогон (default 15)
 *   --max-age=H      переопределить окно свежести из feeds.json
 *   --with-images    скачать картинки даже при images.enabled = false
 *   --reset-state    очистить состояние дедупликации
 *
 * Поведение: черновики создаются с draft: true и проходят zod-схему,
 * поэтому сборка не ломается. Публикация = убрать draft и переписать текст.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithTimeout, fetchText, fetchSteamNews } from './lib/fetch.mjs';
import { parseFeed } from './lib/feeds.mjs';
import { buildDraft } from './lib/draft.mjs';
import { dedupeSimilar } from './lib/dedupe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const NEWS_DIR = join(ROOT, 'src', 'content', 'news');
const STATE_PATH = join(HERE, '.state.json');

const TIER_ORDER = { primary: 0, headline: 1, context: 2 };

// ─── CLI ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const get = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  // Пустое или мусорное значение не должно превращаться в «записать 0 файлов».
  const positiveInt = (name, fallback) => {
    const value = Number(get(name, fallback));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    write: argv.includes('--write'),
    withImages: argv.includes('--with-images'),
    resetState: argv.includes('--reset-state'),
    limit: positiveInt('limit', 15),
    maxAge: positiveInt('max-age', 0),
  };
}

// ─── Config & state ─────────────────────────────────────────────────────

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`[config] не удалось прочитать ${path}: ${error.message}`);
    return fallback;
  }
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { seen: {}, lastRun: null };
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { seen: {}, lastRun: null };
  }
}

function saveState(state) {
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/** Состояние разрастается бесконечно — режем старше 30 дней. */
function pruneState(state, maxDays = 30) {
  const cutoff = Date.now() - maxDays * 86400_000;
  for (const [key, seenAt] of Object.entries(state.seen)) {
    if (new Date(seenAt).getTime() < cutoff) delete state.seen[key];
  }
}

/** Ключ дедупликации: заголовок без пунктуации и пробелов. */
function dedupeKey(title) {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

// ─── Parallelism ────────────────────────────────────────────────────────

/** Пул с ограничением одновременных запросов — фиды отдают 429 без него. */
async function runPool(tasks, size) {
  const results = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      try {
        results[index] = await tasks[index]();
      } catch (error) {
        results[index] = { ok: false, error: error.message, items: [] };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, size) }, worker));
  return results;
}

// ─── Sources ────────────────────────────────────────────────────────────

function feedTask(feed, config) {
  return async () => {
    const xml = await fetchText(feed.url, {
      timeoutMs: config.requestTimeoutMs,
      headers: { 'user-agent': config.userAgent },
    });
    const items = parseFeed(xml);
    if (!items) throw new Error('не RSS/Atom — проверь URL');

    const limited = items.slice(0, config.maxItemsPerFeed);
    return {
      ok: true,
      label: feed.name,
      tier: feed.tier ?? 'context',
      items: limited.map((item) => ({ ...item, sourceName: feed.name })),
    };
  };
}

function steamTask(app, config) {
  return async () => {
    const items = await fetchSteamNews(app.appid, {
      count: config.countPerApp,
      timeoutMs: config.requestTimeoutMs,
    });
    return {
      ok: true,
      label: `Steam · ${app.name}`,
      tier: 'primary',
      // Патчноуты «Update Released» — шум, их отфильтровываем сразу.
      items: (config.skipPatchNotes ? items.filter((i) => !PATCH_NOTE.test(i.title)) : items).map(
        (item) => ({
          title: item.title,
          link: item.link,
          date: item.date,
          description: item.description,
          image: '',
          categories: [app.name, ...(item.tags ?? [])],
          sourceName: `Steam · ${app.name}`,
        }),
      ),
    };
  };
}

const PATCH_NOTE = /(update released|patch notes|hotfix|обновление вышло|патч)\b/i;

// ─── Filtering ──────────────────────────────────────────────────────────

function compile(patterns) {
  return patterns
    .filter(Boolean)
    .map((p) => {
      try {
        return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function haystack(item) {
  return `${item.title} ${item.description ?? ''} ${(item.categories ?? []).join(' ')}`;
}

// ─── Images (opt-in) ────────────────────────────────────────────────────

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

/**
 * Картинки по умолчанию НЕ качаются: превью из RSS принадлежат СМИ.
 * Включай точечно, когда уверен, что изображение из пресс-кита.
 */
async function downloadImage(url, slug, config) {
  const response = await fetchWithTimeout(url, {
    timeoutMs: config.requestTimeoutMs,
    retries: 1,
    headers: { 'user-agent': config.userAgent },
  });
  const type = response.headers.get('content-type')?.split(';')[0] ?? '';
  if (!type.startsWith('image/')) throw new Error(`не картинка: ${type}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > 8 * 1024 * 1024) throw new Error('файл больше 8 МБ');

  const ext = EXT_BY_TYPE[type] ?? 'jpg';
  const file = `${slug}.${ext}`;
  writeFileSync(join(NEWS_DIR, file), buffer);
  return `./${file}`;
}

// ─── Output ─────────────────────────────────────────────────────────────

function uniquePath(slug) {
  let candidate = slug;
  let suffix = 2;
  while (existsSync(join(NEWS_DIR, `${candidate}.md`))) {
    candidate = `${slug}-${suffix++}`;
  }
  return candidate;
}

function report(candidates, problems, mutedCount, duplicates = 0) {
  console.log('\n' + '─'.repeat(72));
  console.log(
    `Кандидатов к публикации: ${candidates.length}   mute: ${mutedCount}   дублей убрано: ${duplicates}   ошибок источников: ${problems.length}`,
  );

  for (const problem of problems) console.log(`  ! ${problem}`);

  if (!candidates.length) {
    console.log('\nНет новых материалов — все совпадения уже в состоянии.');
    return;
  }

  console.log('\nТоп по приоритету (must-фильтр → уровень источника → свежесть):\n');
  for (const item of candidates.slice(0, 15)) {
    const flag = item._must ? '★' : ' ';
    const when = item.date.toISOString().slice(0, 16).replace('T', ' ');
    console.log(`  ${flag} [${item.tier.padEnd(8)}] ${when}  ${item.title.slice(0, 72)}`);
    console.log(`    ${item.sourceName} · ${item.link.slice(0, 90)}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const feedsConfig = readJson(join(HERE, 'feeds.json'), {});
  const appsConfig = readJson(join(HERE, 'apps.json'), { apps: [] });

  const config = {
    userAgent: feedsConfig.userAgent ?? 'GamePulseBot/1.0',
    maxAgeHours: args.maxAge || feedsConfig.maxAgeHours || 36,
    concurrency: feedsConfig.concurrency ?? 6,
    requestTimeoutMs: feedsConfig.requestTimeoutMs ?? 20000,
    maxItemsPerFeed: feedsConfig.maxItemsPerFeed ?? 40,
    countPerApp: appsConfig.countPerApp ?? 5,
    skipPatchNotes: appsConfig.skipPatchNotes ?? true,
    downloadImages: (feedsConfig.images?.enabled ?? false) || args.withImages,
  };

  const feeds = feedsConfig.feeds ?? [];
  if (!feeds.length) {
    console.error('feeds.json: список feeds пуст — нечего опрашивать');
    process.exit(1);
  }

  const state = args.resetState ? { seen: {}, lastRun: null } : loadState();
  pruneState(state);

  const muteRe = compile(feedsConfig.filters?.mute ?? []);
  const mustRe = compile(feedsConfig.filters?.must ?? []);

  const tasks = feeds.map((feed) => feedTask(feed, config));
  if (appsConfig.enabled) {
    tasks.push(...(appsConfig.apps ?? []).map((app) => steamTask(app, config)));
  }

  console.log(`\nОпрашиваю ${feeds.length} фидов и ${tasks.length - feeds.length} Steam-лент…`);

  const started = Date.now();
  const results = await runPool(tasks, config.concurrency);
  const failed = results.filter((r) => !r?.ok);
  const problems = failed.map((r, i) => `источник №${i}: ${r?.error ?? 'нет ответа'}`);
  const okCount = results.length - failed.length;

  console.log(`Готово за ${((Date.now() - started) / 1000).toFixed(1)}с: ${okCount} источников ответили, ${failed.length} с ошибкой`);

  const cutoff = Date.now() - config.maxAgeHours * 3600_000;
  const mutedStats = { mute: 0, stale: 0, seen: 0, invalid: 0 };
  const candidates = [];

  for (const result of results) {
    if (!result?.ok) continue;
    for (const item of result.items) {
      if (!item.title || !item.link || !/^https?:\/\//.test(item.link) || !item.date) {
        mutedStats.invalid++;
        continue;
      }
      if (item.date.getTime() > Date.now() + 60_000 || item.date.getTime() < cutoff) {
        mutedStats.stale++;
        continue;
      }
      if (muteRe.some((re) => re.test(haystack(item)))) {
        mutedStats.mute++;
        continue;
      }
      const key = dedupeKey(item.title);
      if (state.seen[key]) {
        mutedStats.seen++;
        continue;
      }

      candidates.push({
        ...item,
        tier: result.tier,
        _key: key,
        _must: mustRe.some((re) => re.test(`${item.title} ${(item.categories ?? []).join(' ')}`)),
      });
    }
  }

  candidates.sort((a, b) => {
    if (a._must !== b._must) return a._must ? -1 : 1;
    const tier = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
    if (tier !== 0) return tier;
    return b.date - a.date;
  });

  // Сортировка выше ставит лучший источник первым, поэтому из группы
  // похожих заголовков остаётся именно он.
  const unique = dedupeSimilar(candidates);
  const duplicates = candidates.length - unique.length;

  report(unique, problems, mutedStats.mute, duplicates);
  console.log(
    `\nОтсев: негодных ${mutedStats.invalid} · старых ${mutedStats.stale} · уже виденных ${mutedStats.seen} · mute ${mutedStats.mute} · дублей ${duplicates}`,
  );

  if (!args.write) {
    console.log('\nРежим просмотра. Добавь --write, чтобы создать черновики.\n');
    return;
  }

  mkdirSync(NEWS_DIR, { recursive: true });
  const written = [];

  for (const item of unique.slice(0, args.limit)) {
    const base = buildDraft(item);
    const slug = uniquePath(base.slug);

    let imagePath;
    if (config.downloadImages && item.image) {
      try {
        imagePath = await downloadImage(item.image, slug, config);
      } catch (error) {
        console.log(`  ! картинку не скачал (${slug}): ${error.message}`);
      }
    }

    const draft = imagePath ? buildDraft({ ...item, imagePath }) : base;
    writeFileSync(join(NEWS_DIR, `${slug}.md`), draft.content, 'utf8');
    written.push({ slug, type: draft.type, title: item.title });

    // В состояние пишем только реально записанное — остальное подхватится в следующий раз.
    state.seen[item._key] = new Date().toISOString();
  }

  state.lastRun = new Date().toISOString();
  saveState(state);

  console.log(`\nСоздано черновиков: ${written.length}`);
  for (const { slug, type } of written) console.log(`  · src/content/news/${slug}.md  [${type}]`);
  console.log('\nДальше: открыть черновик, переписать текст своими словами, убрать draft: true, npm run check.\n');
}

main().catch((error) => {
  console.error(`\nКоллектор упал: ${error.stack ?? error.message}\n`);
  process.exit(1);
});
