/**
 * 把「今日小科普 / 今日一本书 / 今日话术」需要的素材摘录，从本机技能库里摘出来存成 engine/pool.json。
 *
 * 为什么要这样做：云端（GitHub Actions）读不到你电脑上的技能库，
 * 但读得到仓库里的文件 —— 所以把素材提前摘好放仓库，云端就能照常出这三个栏目。
 *
 * 用法（在本机跑）：node tools/build-pool.mjs
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { defaultBookSources, defaultScienceSources, defaultScriptSources, pickScience } from '../engine/science.js'

const materials = join(homedir(), '.dsh', 'daily-inspiration', 'materials')
const SCIENCE_DIRS = defaultScienceSources().concat([materials])
const BOOK_DIRS = defaultBookSources().concat([materials])
const SCRIPT_DIRS = defaultScriptSources().concat([materials])

function collect(dirs, count, step) {
  const out = []
  const seen = new Set()
  const cursors = []
  for (let i = 0; i < count * 6 && out.length < count; i++) cursors.push(i * step)
  for (const cursor of cursors) {
    const picked = pickScience(dirs, cursor, 1400)
    if (!picked) continue
    const key = `${picked.file}:${picked.heading}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ file: picked.file, heading: picked.heading, excerpt: picked.excerpt })
    if (out.length >= count) break
  }
  return out
}

const pool = {
  generatedAt: new Date().toISOString(),
  science: collect(SCIENCE_DIRS, 24, 3),
  book: collect(BOOK_DIRS, 10, 5),
  script: collect(SCRIPT_DIRS, 10, 5),
}

const target = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'engine', 'pool.json')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, JSON.stringify(pool, null, 1), 'utf8')
console.log(`已写出 pool.json：科普素材 ${pool.science.length} 条 / 书目 ${pool.book.length} 条 / 话术 ${pool.script.length} 条`)
if (!existsSync(target)) console.log('（警告：文件似乎没写成功）')
