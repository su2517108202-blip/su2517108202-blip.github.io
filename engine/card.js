const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
export function dateLabel(date = new Date()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;
}
export function buildPrompt(gather, ideaCount, materials = []) {
    const system = [
        '你是资深短剧（竖屏微短剧 / 漫剧）策划，擅长把当天的社会热点立刻翻译成能开机的选题。',
        '你的输出必须可以直接交给编剧开工：不要解释、不要客套、不要「以下是我的建议」这类话。',
        '选题要求：中国观众熟悉的情感结构；第一集前 15 秒必须有钩子；避免需要大场面、大特效、大量群演的题材。',
    ].join('\n');
    const boardLines = gather.boards.map((board) => `■ ${board.label}：${board.items.map((i) => i.title).join(' ｜ ')}`);
    const feedLines = gather.feeds.map((item) => `· [${item.source}] ${item.title}`);
    const quoteLine = gather.quote.text.length > 0 ? `金句素材：${gather.quote.text}（${gather.quote.from}）` : '';
    const user = [
        '【今日热榜原料】',
        boardLines.length > 0 ? boardLines.join('\n') : '（今日未取到热榜）',
        '',
        feedLines.length > 0 ? '【真实故事/资讯源】\n' + feedLines.join('\n') : '',
        quoteLine.length > 0 ? `【金句】\n${quoteLine}` : '',
        materials.length > 0
            ? `\n【自有素材（作者自己的资料库，优先从中取材）】\n${materials
                .map((m, i) => `〔素材 ${i + 1}｜${m.name}〕\n${m.excerpt}`)
                .join('\n\n')}`
            : '',
        '',
        `请基于以上原料，产出 ${ideaCount * 2} 个短剧选题（分两组，每组 ${ideaCount} 个，第一组先给全场最有爆点的）。`,
        '只写选题，不要写故事、不要写镜头提示词。严格按下面的 Markdown 结构输出，标题层级和字段名都不要改，不要写任何额外说明：',
        '',
        '## 今日选题',
        '',
        '### 1｜《标题（不超过 12 字）》',
        '- 题材：都市逆袭 / 悬疑 / 家庭伦理 …（两个词以内）',
        '- 钩子：一句话，不超过 30 字，必须让人想点开第一集',
        '- 梗概：三句话讲完主线（每句不超过 40 字）',
        '- 爽点：观众到底爽在哪，一句话',
        '- 由头：对应上面哪条热榜或素材',
        '',
        `（### 2 到 ### ${ideaCount * 2} 同上字段，编号连续不断）`,
    ].join('\n');
    return { system, user };
}
/** 第二/三次调用：把已定好的选题写成小说体正文（读起来像小说，篇幅正好改成两分钟的戏） */
export function buildStoryPrompt(input) {
    const system = [
        '你是短剧的原著作者，写小说体的正文：场景、人物动作、心理和对白自然交织，一口气能读完，读完像看完一集。',
        '绝对不要写工作稿格式：不要分镜、不要时间轴、不要「画面：」「台词：」「拍摄提示」，不要小标题、不要项目符号。',
        '也不要旁白解说腔、不要「明日待续」这类尾注。',
        '输出只有 Markdown 正文：不要解释、不要客套、不要「以下是」。',
    ].join('\n');
    const lines = [
        '【已经定好的选题】',
        input.ideasText.trim(),
        '',
        `请只给上面第 ${input.from} 题到第 ${input.to} 题各写一篇小说体正文（每篇 700～900 字，正好能改成两分钟的戏）。`,
        '严格按下面的 Markdown 结构输出，不要写任何额外说明：',
        '',
        '## 今日小说',
        '',
        `（每篇第一行写：### ${input.from}｜《标题》（与选题对应，不超过 12 字）；下面是正文）`,
        '正文要求：',
        '- 直接分段写小说，一般 8～14 段，段与段之间空行',
        '- 对白用中文引号，可以单独成行，读起来要像人在说话',
        '- 开头三句内出事，中段冲突升级，结尾反转或停在一个画面上',
        '- 每篇要有具体人名、具体场景、至少 4 句对白；不要总结、不要升华',
        '',
        `（重复到第 ${input.to} 题）`,
    ];
    return { system, user: lines.join('\n') };
}
/**
 * 分三次调用生成正文：① 全部选题 → ② 前半故事 → ③ 后半故事 + 开场镜头。
 * 每次输出都短，任何 maxTokens 上限都塞得下，不会再出现「写到一半被切断」。
 */
export async function generateBody(llm, route, gather, ideaCount, materials = []) {
    const notes = [];
    const ideasPrompt = buildPrompt(gather, ideaCount, materials);
    const ideas = await callModel(llm, route, ideasPrompt.system, ideasPrompt.user);
    if (ideas.trim().length === 0)
        return { body: '', notes: ['选题没生成出来'] };
    const total = Math.max(2, ideaCount * 2);
    const half = Math.ceil(total / 2);
    const chunks = [ideas];
    const ranges = [
        { from: 1, to: half },
        { from: half + 1, to: total },
    ];
    for (const range of ranges) {
        const prompt = buildStoryPrompt({ ideasText: ideas, from: range.from, to: range.to });
        try {
            const part = await callModel(llm, route, prompt.system, prompt.user);
            if (part.trim().length === 0) {
                notes.push(`第 ${range.from}～${range.to} 题的故事没生成出来`);
                continue;
            }
            // 两次都会带一个「## 小故事」标题，页面端会自动合并成同一分区
            chunks.push(part);
        }
        catch (error) {
            notes.push(`第 ${range.from}～${range.to} 题的故事出错：${String(error.message ?? error)}`);
        }
    }
    return { body: chunks.join('\n\n'), notes };
}
/** 调一次模型拿全文；超时不会挂死循环，只返回已收到的部分 */
export async function callModel(llm, route, system, user, timeoutMs = 600000) {
    let text = '';
    let timedOut = false;
    const stream = llm.stream({
        provider: route.provider,
        model: route.model,
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
        temperature: 0.8,
        maxTokens: 8000,
    });
    const chunkTypes = {};
    const consume = (async () => {
        for await (const chunk of stream) {
            chunkTypes[chunk.type] = (chunkTypes[chunk.type] ?? 0) + 1;
            if (chunk.type === 'text-delta' && typeof chunk.text === 'string')
                text += chunk.text;
        }
    })();
    await Promise.race([
        consume,
        new Promise((resolve) => setTimeout(() => {
            timedOut = true;
            resolve();
        }, timeoutMs)),
    ]);
    if (text.trim().length === 0) {
        const summary = Object.entries(chunkTypes)
            .map(([k, v]) => `${k}×${v}`)
            .join(' ');
        if (timedOut)
            throw new Error(`模型 ${timeoutMs}ms 内没有输出（${summary || '零分块'}）`);
        throw new Error(`模型没有输出正文（${route.provider}/${route.model}：${summary || '零分块'}）`);
    }
    return text.trim();
}
/** 「今日热榜原料」一节的行（插件生成与定时刷新共用同一套格式） */
export function composeHotLines(gather) {
    const out = ['## 今日热榜'];
    for (const board of gather.boards) {
        out.push('');
        out.push(`### ${board.label}`);
        // 同一榜内不混用两种写法：多数条目有热度值就只显示热度，没有价值的条目留空；
        // 整个榜都拿不到数值（微博/百度这类）才统一显示「榜 N」。
        const withValue = board.items.filter((item) => typeof item.hotValue === 'number' && item.hotValue > 0).length;
        const useRank = withValue < Math.ceil(board.items.length / 2);
        for (const [index, item] of board.items.slice(0, 10).entries()) {
            const link = typeof item.url === 'string' && /^https?:\/\//.test(item.url) ? item.url : '';
            const heat = item.hot !== undefined && item.hot.length > 0 ? item.hot : useRank ? `榜 ${item.rank ?? index + 1}` : '';
            const head = link.length > 0 ? `[${item.title}](${link})` : item.title;
            out.push(heat.length > 0 ? `- ${head} · ${heat}` : `- ${head}`);
        }
    }
    return out;
}
/** 组装最终卡片：外壳（日期/金句/热榜）由插件生成，中间正文来自模型 */
export function composeCard(input) {
    const lines = [];
    lines.push(`# 散帅灵感库 · ${dateLabel(input.date)}`);
    lines.push('');
    if (input.gather.quote.text.length > 0) {
        lines.push(`> ${input.gather.quote.text} —— ${input.gather.quote.from}`);
        lines.push('');
    }
    lines.push(input.body.trim());
    lines.push('');
    if (input.gather.boards.length > 0) {
        lines.push(...composeHotLines(input.gather));
        lines.push('');
    }
    // 卡片不再带「模型 / 生成时间 / 归档地址」这类技术尾注（用户要求页面上只留内容）
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}
//# sourceMappingURL=card.js.map