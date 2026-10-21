/**
 * Нечёткая дедупликация.
 *
 * Точное сравнение заголовков не работает: «Shrek 2 Remastered официально
 * анонсирована» и «Shrek 2 Remastered получила список достижений» — одна
 * история у четырёх источников. Сравниваем множества значимых слов.
 */

const STOPWORDS = new Set([
  // ru
  'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то',
  'все', 'она', 'так', 'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за',
  'бы', 'по', 'только', 'ее', 'мне', 'было', 'вот', 'от', 'меня', 'еще',
  'нет', 'о', 'из', 'ему', 'теперь', 'когда', 'даже', 'ну', 'вдруг', 'ли',
  'если', 'уже', 'или', 'ни', 'быть', 'был', 'него', 'до', 'вас', 'нибудь',
  'опять', 'уж', 'вам', 'ведь', 'там', 'потом', 'себя', 'ничего', 'ей',
  'может', 'они', 'тут', 'где', 'есть', 'надо', 'ней', 'для', 'мы', 'тебя',
  'их', 'чем', 'была', 'сам', 'чтоб', 'без', 'будто', 'чего', 'раз', 'тоже',
  'себе', 'под', 'будет', 'ж', 'тогда', 'кто', 'этот', 'того', 'потому',
  'этого', 'какой', 'совсем', 'ним', 'здесь', 'этом', 'один', 'почти',
  'мой', 'тем', 'чтобы', 'нее', 'были', 'куда', 'зачем', 'всех', 'никогда',
  'можно', 'при', 'наконец', 'два', 'об', 'другой', 'хоть', 'после',
  'над', 'больше', 'тот', 'через', 'эти', 'нас', 'про', 'всего', 'них',
  'какая', 'много', 'разве', 'три', 'эту', 'моя', 'впрочем', 'хорошо',
  'свою', 'этой', 'перед', 'иногда', 'лучше', 'чуть', 'том', 'нельзя',
  'такой', 'им', 'более', 'всегда', 'конечно', 'всю', 'между', 'игра',
  'игры', 'игр', 'новости', 'выход', 'стала', 'стал', 'стали', 'известно',
  'сообщает', 'появилась', 'появился', 'пока', 'также', 'кроме', 'самом',
  // en
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'of', 'to', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'is', 'was', 'are', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'can', 'could', 'this', 'that', 'these', 'those', 'it', 'its',
  'you', 'your', 'they', 'their', 'we', 'our', 'i', 'my', 'he', 'she', 'his',
  'her', 'not', 'so', 'than', 'too', 'very', 'just', 'about', 'into', 'after',
  'new', 'game', 'games', 'announced', 'revealed', 'gets', 'get',
]);

/** Значимые слова заголовка: без пунктуации, стоп-слов и коротких токенов. */
export function tokensOf(title) {
  return new Set(
    title
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word)),
  );
}

/** Доля общих слов от более короткого заголовка (overlap coefficient). */
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / Math.min(a.size, b.size);
}

function sharedCount(a, b) {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared;
}

/**
 * Оставляет по одному представителю на группу похожих заголовков.
 *
 * Список должен быть отсортирован по убыванию приоритета: первым
 * в группу попадает лучший материал, остальные отбрасываются.
 *
 * Обычный Jaccard здесь не работает: «Shrek 2 Remastered анонсирована»
 * и «Shrek 2 Remastered получила список достижений» дают ~0.27, хотя
 * это одна история. Поэтому два условия одновременно:
 *   1) приличное пересечение слов (overlap coefficient);
 *   2) минимум два общих РЕДКИХ слова — тех, что редко встречаются
 *      в других заголовках пачки. Это и есть «о чём новость».
 */
export function dedupeSimilar(items, { overlapThreshold = 0.34, minSharedRare = 2 } = {}) {
  const tokens = items.map((item) => tokensOf(item.title));

  // Частотное слово («remastered», «обновление») не признак одной темы.
  const documentFrequency = new Map();
  for (const set of tokens) {
    for (const word of set) documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
  }
  const rareCeiling = Math.max(2, Math.round(items.length * 0.15));
  const rare = tokens.map(
    (set) => new Set([...set].filter((word) => (documentFrequency.get(word) ?? 0) <= rareCeiling)),
  );

  const kept = [];
  const keptIndex = [];

  for (let i = 0; i < items.length; i++) {
    let isDuplicate = false;

    for (let j = 0; j < kept.length; j++) {
      const k = keptIndex[j];
      const sharesRare = sharedCount(rare[i], rare[k]);
      if (sharesRare >= minSharedRare && overlap(tokens[i], tokens[k]) >= overlapThreshold) {
        items[i]._duplicateOf = kept[j].title;
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      kept.push(items[i]);
      keptIndex.push(i);
    }
  }

  return kept;
}
