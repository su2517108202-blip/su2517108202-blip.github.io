/**
 * 云端热榜刷新（GitHub Actions，每 15 分钟一次）
 *
 * 干什么：抓 7 个平台的热榜 → 重写 data.json 里「今日热榜」一节 → 提交推送。
 * 特点：不需要你的电脑开着，也不调任何模型（不花额度）。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCES = [
  ['douyin', '抖音热点'],
  ['bilibili-hot-search', 'B站热搜'],
  ['weibo', '微博热搜'],
  ['zhihu', '知乎热榜'],
  ['baidu', '百度热搜'],
  ['toutiao', '今日头条'],
  ['tieba', '贴吧热议'],
]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const HEAT_SOURCE_OF = { douyin: ['douyin'], toutiao: ['toutiao'], tieba: ['tieba'] }

function normalizeKey(text) {
  return String(text)
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s\u3000]/g, '')
    .replace(/[·・•\-—_/\\|,，。.、:：;；!！?？"'“”‘’()（）[\]【】《》<>]/g, '')
    .toLowerCase()
}

function formatHeat(value) {
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}亿`
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`
  return String(Math.round(value))
}

function normalizeHeat(text) {
  const t = String(text).trim()
  if (!t) return ''
  const m = t.match(/^([\d.]+)\s*([wW万]|亿)?/)
  if (m === null) return t
  const num = Number(m[1])
  if (!Number.isFinite(num)) return t
  if (m[2] === '万' || m[2] === 'w' || m[2] === 'W') return `${num.toFixed(1)}w`
  if (m[2] === '亿') return `${num.toFixed(1)}亿`
  return formatHeat(num)
}

function parseHeatText(text) {
  const m = String(text).match(/([\d.]+)\s*(亿|万|[wW])?/)
  if (m === null) return 0
  const num = Number(m[1])
  if (!Number.isFinite(num)) return 0
  if (m[2] === '亿') return num * 100000000
  if (m[2] === '万' || m[2] === 'w' || m[2] === 'W') return num * 10000
  return num
}

async function fetchBoard(id, limit) {
  const url = `https://newsnow.busiyi.world/api/s?id=${encodeURIComponent(id)}`
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`${id} HTTP ${res.status}`)
  const json = await res.json()
  const items = []
  for (const raw of json.items ?? []) {
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    if (!title) continue
    const item = { title, rank: items.length + 1 }
    if (typeof raw.url === 'string' && raw.url) {
      item.url = id === 'douyin' ? `https://www.douyin.com/search/${encodeURIComponent(title)}` : raw.url
    }
    if (typeof raw.extra?.info === 'string') {
      const heat = normalizeHeat(raw.extra.info)
      if (heat) {
        item.hot = heat
        item.hotValue = parseHeatText(heat)
      }
    }
    items.push(item)
  }
  return items.slice(0, limit)
}

async function fetchHeatMaps() {
  const tasks = [
    {
      id: 'douyin',
      url: 'https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/',
      pick: (j) =>
        ((j.word_list ?? []) || [])
          .map((it) => [String(it.word ?? '').trim(), Number(it.hot_value ?? 0)])
          .filter(([t, v]) => t && v > 0),
    },
    {
      id: 'toutiao',
      url: 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc',
      pick: (j) =>
        ((j.data ?? []) || [])
          .map((it) => [String(it.Title ?? '').trim(), Number(it.HotValue ?? 0)])
          .filter(([t, v]) => t && v > 0),
    },
    {
      id: 'tieba',
      url: 'https://tieba.baidu.com/hottopic/browse/topicList',
      pick: (j) =>
        ((j.data?.bang_topic?.topic_list ?? []) || [])
          .map((it) => [String(it.topic_name ?? '').trim(), Number(it.discuss_num ?? 0)])
          .filter(([t, v]) => t && v > 0),
    },
  ]
  const out = {}
  await Promise.all(
    tasks.map(async (task) => {
      try {
        const res = await fetch(task.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) })
        if (!res.ok) return
        const bucket = new Map()
        for (const [title, value] of task.pick(await res.json())) {
          const label = formatHeat(value)
          const key = normalizeKey(title)
          if (key && label && !bucket.has(key)) bucket.set(key, { text: label, value })
        }
        out[task.id] = bucket
      } catch {
        /* 这一路失败就跳过 */
      }
    }),
  )
  return out
}

function buildSectionLines(boards) {
  const lines = ['## 今日热榜']
  for (const board of boards) {
    lines.push('', `### ${board.label}`)
    const withValue = board.items.filter((i) => typeof i.hotValue === 'number' && i.hotValue > 0).length
    const useRank = withValue < Math.ceil(board.items.length / 2)
    board.items.slice(0, 10).forEach((item, index) => {
      const link = typeof item.url === 'string' && /^https?:\/\//.test(item.url) ? item.url : ''
      const heat = item.hot ? item.hot : useRank ? `榜 ${item.rank ?? index + 1}` : ''
      const head = link ? `[${item.title}](${link})` : item.title
      lines.push(heat ? `- ${head} · ${heat}` : `- ${head}`)
    })
  }
  return lines
}

/** 把 markdown 里的「今日热榜」一节换成新的（节尾遇到下一个 ## 或 <sub> 时停） */
function replaceSection(markdown, sectionLines) {
  const lines = String(markdown).split('\n')
  const start = lines.findIndex((l) => /^##\s*(今日)?热榜(原料)?\s*$/.test(l))
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i]) || /^<sub>/.test(lines[i])) {
      end = i
      break
    }
  }
  return [...lines.slice(0, start), ...sectionLines, '', ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n')
}

async function main() {
  const boards = []
  for (const [id, label] of SOURCES) {
    try {
      boards.push({ id, label, items: await fetchBoard(id, 10) })
    } catch (error) {
      console.log(`跳过 ${label}：${String(error.message ?? error)}`)
    }
  }
  if (boards.length === 0) {
    console.log('一个榜都没抓到，什么都不改')
    return
  }
  const heatMaps = await fetchHeatMaps()
  let filled = 0
  for (const board of boards) {
    const allowed = HEAT_SOURCE_OF[board.id] ?? []
    for (const item of board.items) {
      if (item.hot) continue
      for (const sourceId of allowed) {
        const found = heatMaps[sourceId]?.get(normalizeKey(item.title))
        if (found) {
          item.hot = found.text
          item.hotValue = found.value
          filled += 1
          break
        }
      }
    }
    item_sort(board)
  }
  console.log(`热度补齐 ${filled} 条`)

  const sectionLines = buildSectionLines(boards)
  const raw = readFileSync('data.json', 'utf8')
  const data = JSON.parse(raw)
  const day = (data.days ?? [])[0]
  if (!day) {
    console.log('data.json 里没有卡片，什么都不改')
    return
  }
  const nextMarkdown = replaceSection(day.markdown, sectionLines)
  if (nextMarkdown === null) {
    console.log('卡片里没有「今日热榜」一节，什么都不改')
    return
  }
  if (nextMarkdown === day.markdown) {
    console.log('热榜没有变化')
    return
  }
  day.markdown = nextMarkdown

  // 页面是用 split.sections 渲染的，同步把那节换成新榜
  const items = boards.map((board) => {
    const lines = [`### ${board.label}`]
    const withValue = board.items.filter((i) => typeof i.hotValue === 'number' && i.hotValue > 0).length
    const useRank = withValue < Math.ceil(board.items.length / 2)
    board.items.slice(0, 10).forEach((item, index) => {
      const link = typeof item.url === 'string' && /^https?:\/\//.test(item.url) ? item.url : ''
      const heat = item.hot ? item.hot : useRank ? `榜 ${item.rank ?? index + 1}` : ''
      const head = link ? `[${item.title}](${link})` : item.title
      lines.push(heat ? `- ${head} · ${heat}` : `- ${head}`)
    })
    return { title: board.label, body: lines.join('\n') }
  })
  if (Array.isArray(day.split?.sections)) {
    const at = day.split.sections.findIndex((s) => /热榜/.test(s.title))
    if (at >= 0) day.split.sections[at].items = items
  }
  if (typeof day.hotCount === 'number') {
    day.hotCount = boards.reduce((sum, b) => sum + b.items.length, 0)
  }
  data.updatedAt = new Date().toISOString()
  writeFileSync('data.json', JSON.stringify(data), 'utf8')
  console.log(`已更新热榜：${boards.length} 个榜，${boards.reduce((s, b) => s + b.items.length, 0)} 条`)
}

function item_sort(board) {
  board.items.sort((a, b) => (b.hotValue ?? -1) - (a.hotValue ?? -1))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
