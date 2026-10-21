/**
 * fetch с обязательным таймаутом. Без AbortSignal зависший сокет
 * остановит весь прогон коллектора в CI.
 */
export async function fetchWithTimeout(url, { timeoutMs = 20000, headers = {}, retries = 2 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'GamePulseBot/1.0', ...headers },
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        // Линейная пауза: фиды отдают 429 на агрессивные ретраи.
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`${url}: ${lastError?.message ?? 'unknown error'}`);
}

export async function fetchText(url, options) {
  const response = await fetchWithTimeout(url, options);
  return response.text();
}

/**
 * Steam News API. Ключ не требуется.
 * https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/
 */
export async function fetchSteamNews(appid, { count = 5, timeoutMs = 20000 } = {}) {
  const url =
    `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/` +
    `?appid=${appid}&count=${count}&maxlength=400&format=json`;

  const data = await fetchText(url, { timeoutMs }).then(JSON.parse);
  const items = data?.appnews?.newsitems ?? [];

  return items.map((item) => ({
    title: String(item.title ?? '').trim(),
    link: item.is_external_url
      ? item.url
      : `https://store.steampowered.com/news/app/${appid}/view/${item.gid}`,
    // date в API — unix-секунды
    date: item.date ? new Date(item.date * 1000) : null,
    description: String(item.contents ?? '').trim(),
    feedname: item.feedname ?? '',
    feedlabel: item.feedlabel ?? '',
    tags: item.tags ?? [],
  }));
}
