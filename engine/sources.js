/**
 * 数据源层：热榜 + 每日金句 + 自定义 RSS。
 * 全部免 key、免登录；任何一路挂掉只记 note，不影响整体出卡。
 *
 * 实测（2026-10，本机）：
 *  - newsnow API   https://newsnow.busiyi.world/api/s?id=<id>  ✅ 可用
 *  - 一言 hitokoto https://v1.hitokoto.cn/                      ✅ 可用
 *  - 抽屉新热榜 RSS https://dig.ichouti.cn/feed.xml             ✅ 可用
 *  - api-hot.imsyy.top（DailyHotApi 公共实例）本机 TLS 连不上，已不作为默认源
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
/** newsnow 的 source id → 中文名（只列实测/常用的那些） */
export const NEWS_SOURCE_LABELS = {
    douyin: '抖音热点',
    weibo: '微博热搜',
    zhihu: '知乎热榜',
    baidu: '百度热搜',
    toutiao: '今日头条',
    tieba: '贴吧热议',
    'bilibili-hot-search': 'B站热搜',
    kuaishou: '快手热点',
    thepaper: '澎湃热榜',
    ithome: 'IT之家',
    juejin: '掘金热榜',
    sspai: '少数派',
    '36kr-quick': '36氪快讯',
    'github-trending-today': 'GitHub 趋势',
};
export const KNOWN_SOURCES = Object.keys(NEWS_SOURCE_LABELS);
async function getText(url, timeoutMs) {
    const response = await fetch(url, {
        headers: { 'user-agent': UA, accept: '*/*' },
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    return await response.text();
}
/** 热榜：单榜失败返回 undefined */
export async function fetchBoard(id, limit, timeoutMs = 12000) {
    const label = NEWS_SOURCE_LABELS[id] ?? id;
    try {
        const text = await getText(`https://newsnow.busiyi.world/api/s?id=${encodeURIComponent(id)}`, timeoutMs);
        const parsed = JSON.parse(text);
        const items = [];
        for (const raw of parsed.items ?? []) {
            const title = typeof raw.title === 'string' ? raw.title.trim() : '';
            if (title.length === 0)
                continue;
            const url = typeof raw.url === 'string' ? raw.url : undefined;
            const info = typeof raw.extra?.info === 'string' ? normalizeHeat(raw.extra.info) : '';
            const item = { title, rank: items.length + 1 };
            if (url !== undefined) {
                // 抖音的 /hot/<id> 在桌面端会落到「精选」信息流（不是普通抖音），改成搜索页：
                // 电脑点开＝普通抖音里这个话题的结果页；手机点开＝唤起抖音 App 搜索这个话题
                item.url = id === 'douyin' ? `https://www.douyin.com/search/${encodeURIComponent(title)}` : url;
            }
            if (info.length > 0) {
                item.hot = info;
                const value = parseHeatText(info);
                if (value > 0)
                    item.hotValue = value;
            }
            items.push(item);
            if (items.length >= limit)
                break;
        }
        if (items.length === 0)
            return undefined;
        return { id, label, items };
    }
    catch {
        return undefined;
    }
}
/** 每日金句：一句话素材（c=d 文学 / c=i 诗词 / c=k 哲学，这里混着取） */
export async function fetchQuote(timeoutMs = 10000) {
    try {
        const text = await getText('https://v1.hitokoto.cn/?encode=json&c=d&c=i&c=k', timeoutMs);
        const parsed = JSON.parse(text);
        const hitokoto = typeof parsed.hitokoto === 'string' ? parsed.hitokoto.trim() : '';
        const from = typeof parsed.from === 'string' ? parsed.from : '';
        const who = typeof parsed.from_who === 'string' ? parsed.from_who : '';
        if (hitokoto.length === 0)
            return { text: '', from: '' };
        const suffix = [who, from].filter((part) => part.length > 0).join('《').replace(/^(.*)《(.*)$/, '$1《$2》');
        return { text: hitokoto, from: from.length > 0 ? (who.length > 0 ? `${who}《${from}》` : `《${from}》`) : suffix };
    }
    catch {
        return { text: '', from: '' };
    }
}
function decodeEntities(input) {
    return input
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/<[^>]+>/g, '')
        .trim();
}
/** 极简 RSS/Atom 解析：只要标题与链接，够用且零依赖 */
export function parseFeed(xml, source, limit) {
    const out = [];
    const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/g) ?? [];
    for (const block of blocks) {
        const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) ?? block.match(/<link[^>]*href="([^"]+)"/i);
        const title = titleMatch !== null ? decodeEntities(titleMatch[1]) : '';
        if (title.length === 0)
            continue;
        const link = linkMatch !== null ? decodeEntities(linkMatch[1]) : undefined;
        out.push(link !== undefined && /^https?:/.test(link) ? { title, link, source } : { title, source });
        if (out.length >= limit)
            break;
    }
    return out;
}
export async function fetchFeed(url, limit = 6, timeoutMs = 12000) {
    try {
        const xml = await getText(url, timeoutMs);
        const host = (() => {
            try {
                return new URL(url).hostname;
            }
            catch {
                return url;
            }
        })();
        return parseFeed(xml, host, limit);
    }
    catch {
        return [];
    }
}
/** 归一化标题用于跨源匹配：全角转半角、去空白、去标点、转小写 */
export function normalizeKey(text) {
    return text
        .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
        .replace(/[\s\u3000]/g, '')
        .replace(/[·・•\-—_/\\|,，。.、:：;；!！?？"'“”‘’()（）[\]【】《》<>]/g, '')
        .toLowerCase();
}
/** 把原始热度数字换成互联网习惯写法：12098958 → 1209.9w；过亿才用亿 */
export function formatHeat(value) {
    if (!Number.isFinite(value) || value <= 0)
        return '';
    if (value >= 1e8)
        return `${(value / 1e8).toFixed(1)}亿`;
    if (value >= 1e4)
        return `${(value / 1e4).toFixed(1)}w`;
    return String(Math.round(value));
}
/** 归一化数据源自带的热度文案：「1007 万热度」→「1007w」 */
export function normalizeHeat(text) {
    return text
        .replace(/\s*热度\s*/g, '')
        .replace(/万/g, 'w')
        .replace(/\s+/g, '')
        .trim();
}
/** 把「1007w」「1.2亿」「8563」这类文本还原成数值，用于排序；认不出返回 0 */
export function parseHeatText(text) {
    const match = /^([\d.]+)\s*(亿|w|万)?/.exec(text.trim());
    if (match === null)
        return 0;
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0)
        return 0;
    const unit = match[2] ?? '';
    if (unit === '亿')
        return value * 1e8;
    if (unit === 'w' || unit === '万')
        return value * 1e4;
    return value;
}
export async function fetchHeatMaps(timeoutMs = 12000) {
    const tasks = [
        {
            id: 'douyin',
            url: 'https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/',
            pick: (json) => {
                const list = json.word_list ?? [];
                return list
                    .map((it) => [typeof it.word === 'string' ? it.word.trim() : '', typeof it.hot_value === 'number' ? it.hot_value : 0])
                    .filter(([title, value]) => title.length > 0 && value > 0);
            },
        },
        {
            id: 'toutiao',
            url: 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc',
            pick: (json) => {
                const list = json.data ?? [];
                return list
                    .map((it) => [typeof it.Title === 'string' ? it.Title.trim() : '', typeof it.HotValue === 'number' ? it.HotValue : 0])
                    .filter(([title, value]) => title.length > 0 && value > 0);
            },
        },
        {
            id: 'tieba',
            url: 'https://tieba.baidu.com/hottopic/browse/topicList',
            pick: (json) => {
                const list = json.data?.bang_topic
                    ?.topic_list ?? [];
                return list
                    .map((it) => [typeof it.topic_name === 'string' ? it.topic_name.trim() : '', typeof it.discuss_num === 'number' ? it.discuss_num : 0])
                    .filter(([title, value]) => title.length > 0 && value > 0);
            },
        },
    ];
    const out = {};
    await Promise.all(tasks.map(async (task) => {
        try {
            const text = await getText(task.url, timeoutMs);
            const bucket = new Map();
            for (const [title, value] of task.pick(JSON.parse(text))) {
                const label = formatHeat(value);
                const key = normalizeKey(title);
                if (key.length > 0 && label.length > 0 && !bucket.has(key))
                    bucket.set(key, { text: label, value });
            }
            out[task.id] = bucket;
        }
        catch {
            /* 这一路拿不到热度就算了 */
        }
    }));
    return out;
}
/** 哪个榜可以从哪个热度接口取数（不在表里的榜一律不匹配，避免串号） */
export const HEAT_SOURCE_OF = {
    douyin: ['douyin'],
    toutiao: ['toutiao'],
    tieba: ['tieba'],
};
/** 汇总当天所有原料；并发抓取，互不阻塞 */
export async function gather(options) {
    const notes = [];
    const boardResults = await Promise.all(options.sources.map(async (id) => await fetchBoard(id, options.perSourceLimit)));
    const boards = [];
    for (const [index, board] of boardResults.entries()) {
        if (board === undefined) {
            notes.push(`热榜源不可用：${NEWS_SOURCE_LABELS[options.sources[index]] ?? options.sources[index]}`);
            continue;
        }
        boards.push(board);
    }
    const [quote, feedGroups, heatMaps] = await Promise.all([
        fetchQuote(),
        Promise.all(options.extraFeeds.map(async (url) => await fetchFeed(url))),
        fetchHeatMaps(),
    ]);
    // 用原生接口补热度（知乎的热度来自 newsnow 的 extra.info，这里只补缺的）
    let heatFilled = 0;
    for (const board of boards) {
        // 热度只在「同一个来源」内部匹配：抖音的数字不能串到百度榜里去
        const heatSources = HEAT_SOURCE_OF[board.id] ?? [];
        for (const item of board.items) {
            if (typeof item.hot === 'string' && item.hot.length > 0)
                continue;
            let entry;
            for (const sourceId of heatSources) {
                const found = heatMaps[sourceId]?.get(normalizeKey(item.title));
                if (found !== undefined) {
                    entry = found;
                    break;
                }
            }
            if (entry !== undefined && entry.text.length > 0) {
                item.hot = entry.text;
                item.hotValue = entry.value;
                heatFilled += 1;
            }
        }
        // 按热度从高到低排；没有热度数值的条目保持原榜顺序排在后面（sort 稳定）
        board.items.sort((a, b) => (b.hotValue ?? -1) - (a.hotValue ?? -1));
    }
    if (heatFilled === 0 && Object.keys(heatMaps).length === 0)
        notes.push('热度接口本次都没取到（仅显示榜单名次）');
    const feeds = feedGroups.flat();
    if (quote.text.length === 0)
        notes.push('金句源（一言）本次未取到');
    return { boards, feeds, quote, notes };
}
//# sourceMappingURL=sources.js.map