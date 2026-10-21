const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const games = [
  { slug: 'heavy-wake', appid: 4235660 },
  { slug: 'project-zomboid', appid: 108600 },
  { slug: 'headcutter', appid: 4603230 },
  { slug: 'crimson-desert', appid: 3321460 },
  { slug: 'shrek-2', appid: /* appid Shrek 2 */ 0 },
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

(async () => {
  for (const { slug, appid } of games) {
    const details = await fetchJson(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`,
    );
    const data = details[appid].data;
    const gameDir = path.join('src/img/games', slug);
    const newsDir = path.join('src/img/news', slug);
    fs.mkdirSync(gameDir, { recursive: true });
    fs.mkdirSync(newsDir, { recursive: true });

    // Шапка нужна и для новости, и как фолбэк для обложки.
    const headerTmp = path.join(newsDir, 'header-src.jpg');
    await download(data.header_image, headerTmp);

    // Баннер 16:9
    const bgUrl = data.background_raw || data.background;
    const bgTmp = path.join(gameDir, 'banner-src');
    await download(bgUrl, bgTmp);
    const bgStats = await sharp(bgTmp).stats();
    const flat = bgStats.channels[0].stdev < 12;
    let bannerSource = bgTmp;

    if (flat) {
      bannerSource = path.join(gameDir, 'shot-src.jpg');
      await download(data.screenshots[0].path_full, bannerSource);
    }

    await sharp(bannerSource)
      .resize({ width: 1200 })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(gameDir, 'banner.jpg'));

    // Обложка 600x900: библиотечный постер Steam, иначе шапка.
    let coverTmp = null;
    if (data.library_600x900) {
      coverTmp = path.join(gameDir, 'cover-src.jpg');
      await download(data.library_600x900, coverTmp);
    }
    await sharp(coverTmp || headerTmp)
      .resize(600, 900, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(path.join(gameDir, 'cover.jpg'));

    // Картинка новости 1000x1000
    await sharp(headerTmp)
      .resize(1000, 1000, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(path.join(newsDir, `${slug}.jpg`));

    // Чистка временных файлов (banner.jpg / cover.jpg / news не трогаем)
    for (const tmp of [bgTmp, bannerSource, headerTmp, coverTmp]) {
      if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }

    const banner = await sharp(path.join(gameDir, 'banner.jpg')).metadata();
    const cover = await sharp(path.join(gameDir, 'cover.jpg')).metadata();
    console.log(
      `${slug}: banner ${banner.width}x${banner.height}` +
      `${flat ? ' (скриншот: фон пустой)' : ''}, ` +
      `cover ${cover.width}x${cover.height}, news 1000x1000`,
    );
  }
})().catch((e) => {
  console.error('ОШИБКА:', e.message);
  process.exit(1);
});