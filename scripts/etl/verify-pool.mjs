#!/usr/bin/env node
/**
 * 球员池校验：验证归一化后各年代是否真的"可比且合理"。
 * 这是第一步的验收脚本。用法：npm run etl:check
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
function findRepoRoot(start) {
  let dir = start
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
    const p = path.dirname(dir); if (p === dir) break; dir = p
  }
  throw new Error('找不到仓库根')
}
const ROOT = findRepoRoot(__dirname)
const pool = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/generated/player-pool.json'), 'utf8'))

const AK = pool.meta.attrKeys
const CANON = pool.meta.positionGroups
const seasons = Object.keys(pool.seasons).map(Number).sort((a, b) => a - b)
let fail = 0
const ok = (cond, msg) => { console.log((cond ? '  [OK] ' : '  [FAIL] ') + msg); if (!cond) fail++ }
const pad = (v, n) => String(v).padStart(n)

const rowsOf = (s) => pool.seasons[String(s)].players
const expand = (s, r) => {
  const a = r.slice(0, 7), vals = r.slice(7)
  const attrs = {}
  AK.forEach((k, i) => { attrs[k] = vals[i] })
  return { pid: a[0], name: pool.dict.names[a[0]], srId: pool.dict.srIds[a[0]], tid: a[1], pos: a[2], hgt: a[3], weight: a[4], bornYear: a[5], ovr: a[6], attrs }
  // 注意：attrs 必须返回，否则位置均值检查会静默拿到 undefined
}

// ── 1. 结构完整性 ─────────────────────────────────────────────────────
console.log('\n【1】结构完整性')
ok(pool.meta.seasonCount === 77, '赛季数 = 77（实际 ' + pool.meta.seasonCount + '）')
ok(seasons[0] === 1950 && seasons[seasons.length - 1] === 2026, '赛季范围 1950-2026（实际 ' + seasons[0] + '-' + seasons[seasons.length - 1] + '）')
ok(pool.meta.playerCount === 4786, '唯一球员 = 4786（实际 ' + pool.meta.playerCount + '）')
ok(pool.meta.playerSeasonRows === 24963, '球员-赛季行 = 24963（实际 ' + pool.meta.playerSeasonRows + '）')

let badRow = 0, badRange = 0
for (const s of seasons) for (const r of rowsOf(s)) {
  if (r.length !== 7 + AK.length) badRow++
  for (let i = 7; i < r.length; i++) if (!(r[i] >= 25 && r[i] <= 99)) badRange++
}
ok(badRow === 0, '行宽一致（异常 ' + badRow + '）')
ok(badRange === 0, '13 项属性全部落在 [25,99]（越界 ' + badRange + '）')

const noTeam = seasons.reduce((n, s) => n + rowsOf(s).filter((r) => r[1] < 0).length, 0)
ok(noTeam === 0, '每行都有球队归属（无归属 ' + noTeam + '）')
const teamCount = Object.keys(pool.dict.teams).length
ok(teamCount === 57, '球队字典 = 57 支（实际 ' + teamCount + '）')

// ── 2. 年代可比性（核心）────────────────────────────────────────────
console.log('\n【2】年代可比性 —— 每个年代自成一个完整强度体系')
const stats = seasons.map((s) => {
  const ovrs = rowsOf(s).map((r) => r[6]).sort((a, b) => a - b)
  const q = (p) => ovrs[Math.min(ovrs.length - 1, Math.floor(ovrs.length * p))]
  return { s, n: ovrs.length, min: ovrs[0], p50: q(.5), p90: q(.9), max: ovrs[ovrs.length - 1] }
})
const maxSpread = Math.max(...stats.map((x) => x.max)) - Math.min(...stats.map((x) => x.max))
const p50Spread = Math.max(...stats.map((x) => x.p50)) - Math.min(...stats.map((x) => x.p50))
ok(maxSpread <= 15, '各年代最高 OVR 差距 <= 15（实际 ' + maxSpread + '）→ 早期年代不会因数值尺度而不可玩')
ok(p50Spread <= 12, '各年代中位数差距 <= 12（实际 ' + p50Spread + '）')

console.log('\n    年代    人数   min  p50  p90  max')
for (const x of stats.filter((y) => [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020, 2026].includes(y.s)))
  console.log('    ' + x.s + '  ' + pad(x.n, 5) + '  ' + pad(x.min, 3) + '  ' + pad(x.p50, 3) + '  ' + pad(x.p90, 3) + '  ' + pad(x.max, 3))

// ── 3. 合理性抽查：真实球星的巅峰年必须进入当季前列 ───────────────────
//
// 判据用"当季百分位"而不是绝对分数：
//   - 绝对阈值是我拍脑袋定的，源数据本身有噪声（例如张伯伦 1962 的 diq=55
//     明显偏低，属于源数据缺陷），硬卡绝对分会逼我把公式调到过拟合；
//   - 百分位判据与年代、数据质量解耦，更能说明"排序是否正确"。
// 期望：巅峰年应进入当季前 10%，且排名进前 15。
// 不用"前 3%"这种严阈值 —— 同一赛季本来就有多个巨星并列（1996 年
// 乔丹、奥拉朱旺、马龙、罗宾逊都在巅峰），过严的阈值只会逼公式过拟合。
console.log('\n【3】真实球星抽查（巅峰年应进入当季前 10% 且排名前 15）')
const cases = [
  ['Michael Jordan', 1991], ['LeBron James', 2013], ['Kareem Abdul-Jabbar', 1974],
  ['Magic Johnson', 1987], ['Larry Bird', 1986], ["Shaquille O'Neal", 2000],
  ['Tim Duncan', 2003], ['Stephen Curry', 2016], ['Giannis Antetokounmpo', 2020],
  ['Wilt Chamberlain', 1962], ['Bill Russell', 1963], ['Karl Malone', 1997],
]
for (const c of cases) {
  const name = c[0], season = c[1]
  const list = rowsOf(season).map((r) => expand(season, r))
  const found = list.find((p) => p.name === name)
  if (!found) { console.log('  [--]  ' + name + ' ' + season + ': 该赛季不在名单中'); continue }
  const rank = list.slice().sort((a, b) => b.ovr - a.ovr).findIndex((p) => p.name === name) + 1
  const topPct = rank / list.length
  const pass = topPct <= 0.10 && rank <= 15
  if (!pass) fail++
  console.log('  ' + (pass ? '[OK]' : '[FAIL]') + '  ' + name.padEnd(22) + ' ' + season + '  OVR=' + pad(found.ovr, 3) + '  排名 ' + pad(rank, 3) + '/' + pad(list.length, 3) + '  (前 ' + (topPct * 100).toFixed(1) + '%)')
}

// 附加：当季最高 OVR 不得低于 90（否则"超级巨星"档位没人能到）
console.log('\n  当季最高 OVR 检查（应 >= 90）：')
for (const x of stats) {
  if (x.max < 90) { fail++; console.log('  [FAIL]  ' + x.s + ' 最高仅 ' + x.max) }
}
ok(stats.every((x) => x.max >= 90), '所有赛季最高 OVR >= 90（最低 ' + Math.min(...stats.map((x) => x.max)) + '）')

// ── 4. 位置合理性 ────────────────────────────────────────────────────
console.log('\n【4】位置合理性（属性应保留位置特征）')
const acc = {}
for (const s of seasons) for (const r of rowsOf(s)) {
  const pos = r[2]
  if (!acc[pos]) { acc[pos] = {}; AK.forEach((k) => { acc[pos][k] = [] }) }
  AK.forEach((k, i) => acc[pos][k].push(r[7 + i]))
}
const mean = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
const P = (pos, k) => mean(acc[pos][k])
ok(P('C', 'REB') > P('PG', 'REB') + 8, '中锋篮板(' + P('C', 'REB') + ') 显著高于控卫(' + P('PG', 'REB') + ')')
ok(P('C', 'BLK') > P('PG', 'BLK') + 8, '中锋盖帽(' + P('C', 'BLK') + ') 显著高于控卫(' + P('PG', 'BLK') + ')')
ok(P('PG', 'PAS') > P('C', 'PAS') + 8, '控卫传球(' + P('PG', 'PAS') + ') 显著高于中锋(' + P('C', 'PAS') + ')')
ok(P('PG', 'HAN') > P('C', 'HAN') + 8, '控卫护球(' + P('PG', 'HAN') + ') 显著高于中锋(' + P('C', 'HAN') + ')')
console.log('\n    位置  三分 中投 终结 护球 传球 外防 内防 盖帽 篮板 运动 力量 关键')
const show = ['threePT', 'MID', 'FIN', 'HAN', 'PAS', 'PDEF', 'IDEF', 'BLK', 'REB', 'ATH', 'STR', 'CLU']
for (const pos of ['PG', 'SG', 'SF', 'PF', 'C'])
  console.log('    ' + pos + '  ' + show.map((k) => pad(P(pos, k), 4)).join(' '))

// ── 4b. 位置公平性：各位置在当季前 10% 的占比，需按其人口占比归一 ──────
//
// 不能直接看绝对占比：SF 在源数据里占联盟 46%（因为 Basketball GM 用
// 泛化标签 F/GF 表示前锋），所以 SF 在前 10% 里占 45% 其实低于其人口占比。
// 正确的指标是「代表性倍数 = 前10%占比 / 联盟人口占比」，理想值 1.0。
console.log('\n【4b】位置公平性（代表性倍数 = 前10%占比 / 人口占比，理想 1.0）')
const repRatios = []
for (const x of stats.filter((y) => [1962, 1996, 2020].includes(y.s))) {
  const rows = rowsOf(x.s)
  const popShare = {}
  for (const r of rows) popShare[r[2]] = (popShare[r[2]] || 0) + 1
  const sortedRows = rows.slice().sort((a, b) => b[6] - a[6])
  const cut = sortedRows[Math.floor(rows.length * 0.1)][6]
  const top = rows.filter((r) => r[6] >= cut)
  const topShare = {}
  for (const r of top) topShare[r[2]] = (topShare[r[2]] || 0) + 1
  const parts = CANON.map((g) => {
    // 人口为 0 的位置组（如 1962 年源数据完全没有 PF 标签）不参与统计
    if (!popShare[g]) return g + '=--'
    const ratio = ((topShare[g] || 0) / top.length) / (popShare[g] / rows.length)
    if (popShare[g] >= 10) repRatios.push({ season: x.s, pos: g, ratio })
    return g + '=' + ratio.toFixed(2) + 'x'
  })
  console.log('  ' + x.s + ' (前10%共' + top.length + '人): ' + parts.join('  '))
}
{
  const worst = repRatios.reduce((m, r) => (r.ratio > m.ratio ? r : m), repRatios[0])
  ok(worst.ratio <= 1.8, '各位置代表性倍数 <= 1.8（最高 ' + worst.pos + ' ' + worst.season + ' = ' + worst.ratio.toFixed(2) + 'x）')
}

// ── 5. 年龄推导 ──────────────────────────────────────────────────────
console.log('\n【5】年龄推导')
let ageMissing = 0, ageBad = 0
for (const s of seasons) for (const r of rowsOf(s)) {
  if (!r[5]) { ageMissing++; continue }
  const age = s - r[5]
  if (age < 16 || age > 50) ageBad++
}
ok(ageMissing === 0, 'born.year 全覆盖（缺失 ' + ageMissing + '）')
ok(ageBad === 0, '年龄推导合理 16-50 岁（异常 ' + ageBad + '）')

// ── 6. 选秀班 ────────────────────────────────────────────────────────
console.log('\n【6】选秀班')
const draftYears = Object.keys(pool.drafts).map(Number)
ok(draftYears.length === 76, '选秀班 76 届（实际 ' + draftYears.length + '）')
const draftRows = Object.values(pool.drafts).reduce((n, a) => n + a.length, 0)
ok(draftRows === 3038, '选秀班球员 3038 人（实际 ' + draftRows + '）')

// ── 7. 选秀班原始 OVR 校准集（供后续自建 OVR 公式使用）──────────────
console.log('\n【7】选秀班校准集（原始 ovr 标签）')
const labeled = Object.values(pool.drafts).flat().filter((d) => d.rawOvr != null)
ok(labeled.length === 3038, '带 ovr 标签的样本 = 3038（实际 ' + labeled.length + '）')

console.log('\n' + '-'.repeat(62))
console.log(fail === 0 ? '[OK] 全部检查通过' : '[FAIL] ' + fail + ' 项检查未通过')
process.exit(fail === 0 ? 0 : 1)
