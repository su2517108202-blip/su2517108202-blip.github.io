/**
 * 今日小科普：每天从本机多个技能知识库里轮换取一节素材，
 * 让模型写成 200～300 字、可执行的一段小科普，挂进灵感卡。
 *
 * 素材池（默认，可用配置 scienceSources 覆盖）：
 *   · 狗头军师      → 关系、沟通、情绪、边界
 *   · novel-* 五件套 → 短剧创作：钩子、爽点、节奏、分镜、制作经验
 *   · cangjie-skill/books → 拆书蒸馏出的人生/思维方法论（如纳瓦尔宝典）
 *
 * 轮换逻辑：游标 → 文件序号 = cursor % 文件数；节序号 = floor(cursor / 文件数) % 该文件节数。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
/** 默认素材目录（用户可在配置里改） */
export function defaultScienceSources() {
    const skills = join(homedir(), '.agents', 'skills');
    return [
        join(skills, 'goutoujunshi', 'references'),
        join(skills, 'novel-storyboard'),
        join(skills, 'novel-script'),
        join(skills, 'novel-outline'),
        join(skills, 'novel-characters'),
        join(skills, 'novel-art'),
        join(skills, 'cangjie-skill', 'books'),
    ];
}
const SKIP_FILE = /^(readme|changelog|license|contributing|security|code_of_conduct|github_repo|pull_request_template|skill\.json)/i;
function listMarkdown(dirs) {
    const out = [];
    const seen = new Set();
    for (const dir of dirs) {
        if (!existsSync(dir))
            continue;
        let entries = [];
        try {
            entries = readdirSync(dir, { recursive: true, encoding: 'utf8' });
        }
        catch {
            continue;
        }
        for (const rel of entries) {
            if (!rel.toLowerCase().endsWith('.md'))
                continue;
            const name = rel.split(/[\\/]/).pop() ?? rel;
            if (SKIP_FILE.test(name))
                continue;
            const full = join(dir, rel);
            let size = 0;
            try {
                size = statSync(full).size;
            }
            catch {
                continue;
            }
            if (size < 1500 || size > 600_000)
                continue;
            // 同一篇在不同目录下的副本（books/ 与 dist/ 等）只留一份
            const key = `${name}:${size}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            out.push(full);
        }
    }
    return out.sort();
}
/** 这些节多半是元信息/目录，不适合当科普素材 */
const SKIP_HEADING = /^(基本信息|元信息|元数据|目录|索引|版本|更新日志|变更记录|安装|安装说明|快速开始|开始使用|使用方法|文件结构|目录结构|overview|about|usage|install|faq|changelog)$/i;
/** 把一篇 Markdown 按「## / ### 」切成节；返回 [{ heading, body }] */
function splitSections(markdown) {
    const lines = markdown.split(/\r?\n/);
    const out = [];
    let heading = '';
    let body = [];
    const flush = () => {
        const text = body.join('\n').trim();
        if (heading.length > 0 && text.length > 150 && !SKIP_HEADING.test(heading.trim())) {
            out.push({ heading, body: text });
        }
        body = [];
    };
    for (const line of lines) {
        const m = /^#{2,3}\s+(.+)$/.exec(line);
        if (m !== null) {
            flush();
            heading = m[1].trim();
            continue;
        }
        if (/^#\s+/.test(line))
            continue;
        body.push(line);
    }
    flush();
    return out;
}
/** 取今天这一段素材；素材池不可用时返回 undefined（不阻塞出卡） */
export function pickScience(dirs, cursor, maxChars = 2600) {
    const files = listMarkdown(dirs.length > 0 ? dirs : defaultScienceSources());
    if (files.length === 0)
        return undefined;
    // 轮到「切不出节」的文件就往后跳，最多试 12 篇，避免整段空掉
    for (let step = 0; step < Math.min(files.length, 12); step++) {
        const fileIndex = (((cursor + step) % files.length) + files.length) % files.length;
        const path = files[fileIndex];
        let markdown = '';
        try {
            markdown = readFileSync(path, 'utf8');
        }
        catch {
            continue;
        }
        const sections = splitSections(markdown);
        if (sections.length === 0)
            continue;
        const round = Math.floor(cursor / files.length);
        const sectionIndex = ((round % sections.length) + sections.length) % sections.length;
        const section = sections[sectionIndex];
        const excerpt = section.body.length > maxChars ? `${section.body.slice(0, maxChars)}\n…` : section.body;
        const name = path.split(/[\\/]/).slice(-2).join('/');
        return {
            file: name,
            path,
            heading: section.heading,
            excerpt,
            nextCursor: cursor + step + 1,
            sectionCount: sections.length,
            fileCount: files.length,
        };
    }
    return undefined;
}
/** 「今日一本书」的素材池：拆书库（cangjie books）+ 你自己的素材库 */
export function defaultBookSources() {
    const skills = join(homedir(), '.agents', 'skills');
    return [join(skills, 'cangjie-skill', 'books')];
}
/** 「每日话术」的素材池：狗头军师的实战话术指南 */
export function defaultScriptSources() {
    const skills = join(homedir(), '.agents', 'skills');
    return [join(skills, 'goutoujunshi', 'references', 'practical')];
}
/** 今日一本书：书单号卡片风（一屏看完：金句 + 一句推荐 + 封面字幕 + 标签） */
export function buildBookPrompt(source) {
    const system = [
        '你在给一个「书单号」写卡片文案：一屏就能看完，短、准、能直接做成字幕卡或图文。',
        '不要长口播、不要书评腔、不要念简介；名句只引一句，出处不确定就写「书中」；不许编造书名或句子。',
        '输出只有 Markdown 正文，不要解释、不要客套。',
    ].join('\n');
    const user = [
        `【今日书目素材】来自《${source.file}》的「${source.heading}」一节：`,
        '',
        source.excerpt,
        '',
        '请写今天的「今日一本书」—— 一张书单号卡片（总量 90～130 字），严格按下面结构输出，不要写任何额外说明：',
        '',
        '## 今日一本书',
        '',
        '### 《书名》· 作者',
        '- 金句：「……」（不超过 30 字，一句就能发出去）—— 出处',
        '- 一句推荐：不超过 25 字，说清它解决什么问题',
        '- 适合谁：一句话',
        '- 封面字幕：不超过 12 字（做成视频封面用）',
        '- 发布标签：#…… #…… #……',
        '',
        '要求：书名和作者必须真实存在；素材本身如果不是书，就推荐与它最相关的一本书。',
    ].join('\n');
    return { system, user };
}
/** 每日话术：基于素材给 3 句能直接照抄的话 */
export function buildScriptPrompt(source) {
    const system = [
        '你是教人把话说好的沟通教练。给能马上照抄的句子，不讲大道理、不油腻、不教操控。',
        '所有句子都要口语、短、能直接发出去；不承诺结果，不制造焦虑。',
        '输出只有 Markdown 正文，不要解释、不要客套。',
    ].join('\n');
    const user = [
        `【今日素材】来自《${source.file}》的「${source.heading}」一节：`,
        '',
        source.excerpt,
        '',
        '请写今天的「今日话术」，严格按下面结构输出，不要写任何额外说明：',
        '',
        '## 今日话术',
        '',
        '### 《场景名（不超过 12 字）》',
        '- 什么时候用：一句话',
        '- 照抄这三句：',
        '  1. 「……」',
        '  2. 「……」',
        '  3. 「……」',
        '- 为什么管用：1～2 句，讲机制，不灌鸡汤',
        '- 别说这句：「……」—— 一句容易踩雷的说法，并说明为什么',
        '- 语气提示：一句话（快慢 / 称呼 / 表情）',
        '',
        '要求：三句都必须是能直接发出去的原话，每句不超过 40 字；场景要具体（谁对谁说、什么时机）。',
    ].join('\n');
    return { system, user };
}
export function buildSciencePrompt(sources) {
    const system = [
        '你在给一个做短剧、也过日子的人写「今日小科普」：每天几条，读完能懂一个机制、能做一件事。',
        '领域跟着素材走：关系与沟通、情绪与心理、短剧创作与内容制作、思维与决策、生活常识都可能。',
        '风格：先给结论，再讲为什么，最后给能马上做的一件小事；口语化、不说教、不灌鸡汤、不堆术语、不承诺结果。',
        '输出只有 Markdown 正文，不要解释、不要客套、不要「以下是我的建议」。',
    ].join('\n');
    const blocks = [];
    sources.forEach((source, index) => {
        blocks.push('', `〔素材 ${index + 1}〕来自《${source.file}》的「${source.heading}」一节：`, '', source.excerpt);
    });
    const user = [
        `【今日素材】共 ${sources.length} 段，取自本机技能知识库：`,
        ...blocks,
        '',
        `请给上面每一段素材各写一条「今日小科普」——共 ${sources.length} 条，顺序与素材一一对应，角度不要重复。`,
        '严格按下面结构输出，不要写任何额外说明：',
        '',
        '## 今日小科普',
        '',
        '### 《标题（不超过 14 字，像钩子，不要学术味）》',
        '- 一句话结论：不超过 30 字，一眼就懂',
        '- 为什么：用素材里的机制讲清楚，2～3 句，不要术语堆砌',
        '- 今天可以做的一件小事：具体、可执行、可退出；如果是创作类素材，就给一个今天能试的写法（不超过 40 字）',
        '- 别踩的坑：一句提醒（边界、误读或常见误区）',
        '',
        `（按同样结构重复 ${sources.length} 次）`,
        '',
        '要求：每条 200～300 字；不要写成论文摘要，也不要点评素材本身；标题里别出现书名。',
    ].join('\n');
    return { system, user };
}
//# sourceMappingURL=science.js.map