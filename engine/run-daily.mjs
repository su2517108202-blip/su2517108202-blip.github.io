/**
 * 云端每日出卡（GitHub Actions，每天 08:00 北京时间）
 *
 * 为什么要有这个：原来出卡靠你电脑上的插件，关机就断更。
 * 这个脚本在 GitHub 的服务器上跑，复用插件里同一套提示词，只把「调模型」换成直连 DeepSeek API。
 *
 * 需要的环境变量：
 *   DEEPSEEK_API_KEY  仓库 Secret（已配）
 * 可选：
 *   DAILY_MODEL       默认 deepseek-chat
 *   SITE_URL          默认 https://www.ss0100.com/
 *   IDEA_COUNT        默认 6
 *
 * 参数：
 *   --dry-run   只生成、打印，不写文件（用来试跑）
 *   --force     今天已经有卡也照生成（默认跳过，避免和电脑那侧重复）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { composeCard, buildPrompt, buildStoryPrompt, dateLabel, localDateKey } from './card.js'
import { splitCard } from './page.js'
import { buildBookPrompt, buildSciencePrompt, buildScriptPrompt } from './science.js'
import { gather } from './sources.js'

const KEY = process.env.DEEPSEEK_API_KEY ?? ''
const MODEL = process.env.DAILY_MODEL ?? 'deepseek-chat'
const SITE = process.env.SITE_URL ?? 'https://www.ss0100.com/'
const IDEAS = Number(process.env.IDEA_COUNT ?? '6')
const DRY = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')

const SOURCES = ['douyin', 'bilibili-hot-search', 'weibo', 'zhihu', 'baidu', 'toutiao', 'tieba']

async function callModel(system, user, maxTokens = 8000) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.9,
      stream: false,
    }),
    signal: AbortSignal.timeout(600000),
  })
  if (!res.ok) throw new Error(`模型返回 HTTP ${res.status}：${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const text = String(json.choices?.[0]?.message?.content ?? '').trim()
  if (text.length === 0) throw new Error('模型没输出内容（可能是 max_tokens 或模型名不对）')
  const usage = json.usage ?? {}
  console.log(`  模型输出 ${text.length} 字，tokens：${usage.prompt_tokens ?? '?'}+${usage.completion_tokens ?? '?'}`)
  return text
}

function loadPool() {
  if (!existsSync('engine/pool.json')) return null
  try {
    const pool = JSON.parse(readFileSync('engine/pool.json', 'utf8'))
    if (pool === null || typeof pool !== 'object') return null
    return {
      science: Array.isArray(pool.science) ? pool.science : [],
      book: Array.isArray(pool.book) ? pool.book : [],
      script: Array.isArray(pool.script) ? pool.script : [],
    }
  } catch {
    return null
  }
}

/** 按天轮换：同一天跑多次拿到的是同一批素材 */
function rotate(list, offset, count) {
  if (list.length === 0) return []
  const out = []
  for (let i = 0; i < Math.min(count, list.length); i++) out.push(list[(offset + i) % list.length])
  return out
}

async function main() {
  if (KEY.length === 0) throw new Error('没有 DEEPSEEK_API_KEY（仓库 Secret 没配或没传进来）')
  const today = localDateKey(new Date())

  let data = { updatedAt: '', pagePath: '.', quota: { used: 0, limit: 3 }, wallpapers: [], days: [] }
  if (existsSync('data.json')) {
    try {
      const parsed = JSON.parse(readFileSync('data.json', 'utf8'))
      if (parsed !== null && typeof parsed === 'object') data = { ...data, ...parsed }
    } catch {
      console.log('data.json 读不动，按空的来')
    }
  }
  const days = Array.isArray(data.days) ? data.days : []
  const newest = days[0]
  if (newest !== undefined && newest.date === today && !FORCE && !DRY) {
    console.log(`今天（${today}）已经有卡了，云端不重复生成。`)
    return
  }

  console.log(`抓热榜（${SOURCES.length} 个榜）…`)
  const gathered = await gather({ sources: SOURCES, perSourceLimit: 10, extraFeeds: [] })
  const hotCount = gathered.boards.reduce((sum, board) => sum + board.items.length, 0)
  console.log(`热榜 ${hotCount} 条，金句：${gathered.quote.text.slice(0, 30)}`)

  const calls = []
  console.log('第 1 步：写选题…')
  const ideaPrompt = buildPrompt(gathered, IDEAS)
  const ideas = await callModel(ideaPrompt.system, ideaPrompt.user)
  calls.push(ideas)

  const half = Math.ceil(IDEAS / 2)
  const batches = [
    [1, half],
    [half + 1, IDEAS],
  ]
  for (const [from, to] of batches) {
    console.log(`第 ${from}～${to} 题：写小说体正文…`)
    const prompt = buildStoryPrompt({ ideasText: ideas, from, to })
    calls.push(await callModel(prompt.system, prompt.user))
  }

  const body = calls.join('\n\n')

  // 科普 / 一本书 / 话术：素材来自仓库里的 engine/pool.json（由本机 tools/build-pool.mjs 摘好）
  let extras = ''
  const pool = loadPool()
  if (pool !== null) {
    const dayIndex = Math.floor(Date.now() / 86400000)
    const scienceCount = Number(process.env.SCIENCE_COUNT ?? '6')
    const sciencePicks = rotate(pool.science, dayIndex * scienceCount, scienceCount)
    if (sciencePicks.length > 0) {
      console.log(`小科普 ${sciencePicks.length} 条…`)
      const prompt = buildSciencePrompt(sciencePicks)
      extras += `\n\n${await callModel(prompt.system, prompt.user)}`
    }
    const book = rotate(pool.book, dayIndex, 1)[0]
    if (book !== undefined) {
      console.log(`今日一本书：${book.heading}…`)
      const prompt = buildBookPrompt(book)
      extras += `\n\n${await callModel(prompt.system, prompt.user, 3000)}`
    }
    const script = rotate(pool.script, dayIndex, 1)[0]
    if (script !== undefined) {
      console.log(`今日话术：${script.heading}…`)
      const prompt = buildScriptPrompt(script)
      extras += `\n\n${await callModel(prompt.system, prompt.user, 3000)}`
    }
  } else {
    console.log('没有 engine/pool.json，这次只出选题 + 小说 + 热榜')
  }

  const markdown = composeCard({
    date: new Date(),
    body: body + extras,
    gather: gathered,
    model: `${MODEL}（云端）`,
    pushNote: '',
    pageUrl: SITE,
  })

  const entry = {
    date: today,
    createdAt: new Date().toISOString(),
    markdown,
    quote: gathered.quote.text,
    hotCount,
    push: '云端生成（无需开机）',
    model: MODEL,
  }

  if (DRY) {
    console.log('\n===== DRY RUN：下面是生成的卡片（前 1500 字）=====\n')
    console.log(markdown.slice(0, 1500))
    return
  }

  // 壁纸池：云端每天换掉最旧的几张（存在仓库里，不占额度）
  try {
    const { saveWallpapersToSite } = await import('./wallpaper.js')
    const walls = await saveWallpapersToSite('.', 30, 6)
    if (walls.length > 0) {
      console.log(`壁纸池：${walls.length} 张（本轮换掉最旧的几张）`)
      if (Array.isArray(data.wallpapers) || true) data.wallpapers = walls
    }
  } catch (error) {
    console.log(`壁纸池这轮没刷成功：${String(error.message ?? error)}`)
  }

  const rest = days.filter((d) => d.date !== today)
  const nextDays = [entry, ...rest].slice(0, 60).map((d) => ({ ...d, split: splitCard(d.markdown) }))
  const next = { ...data, updatedAt: new Date().toISOString(), days: nextDays }
  writeFileSync('data.json', JSON.stringify(next), 'utf8')
  console.log(`\n✅ 已写入 data.json：${dateLabel(new Date())} 的卡（${markdown.length} 字，热榜 ${hotCount} 条）`)
}

main().catch((error) => {
  console.error('出卡失败：', error)
  process.exit(1)
})
