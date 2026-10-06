const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
/** 只收这些域名的直链，避免混进广告或第三方图床 */
const ALLOWED = /^https:\/\/w\.wallhaven\.cc\//;
export async function fetchWallpapers(count = 20, style = 'landscape', timeoutMs = 15000) {
    const want = Math.max(1, Math.min(60, count));
    const out = [];
    const seen = new Set();
    const pages = Math.min(4, Math.ceil(want / 24) + 1);
    for (let page = 1; page <= pages && out.length < want; page++) {
        // categories=100 只要 general（实拍/风景，不含二次元）；categories=010 只要 anime
        const categories = style === 'anime' ? '010' : '100';
        const keyword = style === 'anime' ? '' : '&q=landscape';
        const url = 'https://wallhaven.cc/api/v1/search?sorting=random&categories=' + categories + keyword +
            '&purity=100&ratios=9x16&atleast=1440x2560&page=' + String(page);
        try {
            const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
            if (!res.ok)
                continue;
            const json = (await res.json());
            for (const raw of json.data ?? []) {
                const path = typeof raw.path === 'string' ? raw.path : '';
                if (!ALLOWED.test(path) || seen.has(path))
                    continue;
                const thumb = typeof raw.thumbs?.large === 'string' ? raw.thumbs.large : typeof raw.thumbs?.original === 'string' ? raw.thumbs.original : path;
                seen.add(path);
                out.push({
                    style: style,
                    id: typeof raw.id === 'string' ? raw.id : String(raw.id ?? ''),
                    resolution: typeof raw.resolution === 'string' ? raw.resolution : '',
                    url: path,
                    thumb,
                });
                if (out.length >= want)
                    break;
            }
        }
        catch {
            /* 这一页失败就换下一页 */
        }
    }
    return out;
}
/**
 * 把壁纸下载到自己网站目录（siteDir/wallpapers/），并把不在新清单里的旧图删掉。
 * 这样页面上显示的都是「本站图」，快且稳；每天出卡时换一批，旧照片不会留在那里。
 */
export async function saveWallpapersToSite(dir, target = 30, replacePerRun = 6, timeoutMs = 30000) {
    const { mkdirSync, writeFileSync, readdirSync, rmSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const sub = join(dir, 'wallpapers');
    mkdirSync(sub, { recursive: true });
    // 现有池子按「最旧优先」排序，只换掉最旧的几张（增量替换：池子稳定，git 也不会天天暴涨）
    const existing = [];
    try {
        for (const name of readdirSync(sub)) {
            if (!name.endsWith('.jpg'))
                continue;
            try {
                existing.push({ name, at: statSync(join(sub, name)).mtimeMs });
            }
            catch {
                /* 读不到就忽略 */
            }
        }
    }
    catch {
        /* 目录不存在就是空的 */
    }
    existing.sort((a, b) => a.at - b.at);
    const cap = Math.max(1, Math.min(60, target));
    // 超上限的先删；再挑最旧的几张作为本轮替换对象
    const overflow = existing.slice(0, Math.max(0, existing.length - cap));
    const oldest = existing.slice(overflow.length).slice(0, Math.max(1, replacePerRun));
    const victims = overflow.concat(oldest);
    const keep = new Set(existing.map((e) => e.name));
    for (const v of victims) {
        keep.delete(v.name);
        try {
            rmSync(join(sub, v.name), { force: true });
        }
        catch {
            /* 删不掉就留着 */
        }
    }
    let page = 0;
    for (let i = 0; i < victims.length; i++) {
        const name = victims[i].name;
        let wrote = false;
        for (let attempt = 0; attempt < 3 && !wrote; attempt++) {
            const seed = (Date.now() % 90000) + i * 977 + page * 7919 + attempt * 131;
            page += 1;
            try {
                const res = await fetch('https://picsum.photos/1440/2560?random=' + String(seed), { signal: AbortSignal.timeout(timeoutMs) });
                if (!res.ok)
                    continue;
                const buf = Buffer.from(await res.arrayBuffer());
                if (buf.length < 40000)
                    continue;
                writeFileSync(join(sub, name), buf);
                wrote = true;
            }
            catch {
                /* 换一张再试 */
            }
        }
    }
    // 回读整个池子作为清单
    const out = [];
    try {
        const names = readdirSync(sub).filter((n) => n.endsWith('.jpg')).sort();
        for (const name of names) {
            out.push({ id: 'local-' + name, style: 'local', resolution: '1440x2560', url: 'wallpapers/' + name, thumb: 'wallpapers/' + name });
        }
    }
    catch {
        /* 读不到就返回空 */
    }
    return out;
}
//# sourceMappingURL=wallpaper.js.map