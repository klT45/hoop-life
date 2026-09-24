#!/usr/bin/env node
/**
 * 构建球员池（游戏用）
 *
 * 输入：BBallGMDraftClasses-main/base_leagues/*.json  (77 个赛季，1950-2026)
 *       BBallGMDraftClasses-main/draftclasses/*.json  (76 届选秀班)
 * 输出：src/data/generated/player-pool.json
 *
 * 核心处理：
 *  1. 用 srID 作为跨赛季稳定主键（pid 是每个文件内 0..N-1 的重编号，不可用）
 *  2. 归一化：原始属性按「赛季 × 位置组」转百分位，再映射到 [25,99]
 *     → 每个年代自成一个完整强度体系，可从任意年代开局
 *  3. 由 16 项原始属性推导游戏用的 13 项属性
 *  4. 按位置权重算 OVR
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 从脚本位置向上查找仓库根（含 package.json 且含数据集目录的那一层） */
function findRepoRoot(start) {
  let dir = start
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('找不到仓库根目录（向上 6 层内没有 package.json）')
}

const ROOT = findRepoRoot(__dirname)
// 数据集目录名可覆盖：DATASET_DIR=xxx npm run etl:players
const DATASET_NAME = process.env.DATASET_DIR || 'BBallGMDraftClasses-main'
const SRC = path.isAbsolute(DATASET_NAME) ? DATASET_NAME : path.join(ROOT, DATASET_NAME)
const OUT_DIR = path.join(ROOT, 'src/data/generated')
const OUT_FILE = path.join(OUT_DIR, 'player-pool.json')

if (!fs.existsSync(path.join(SRC, 'base_leagues'))) {
  throw new Error(`数据集目录无效：${SRC}（缺少 base_leagues/）`)
}

// ── 常量 ──────────────────────────────────────────────────────────────
const RAW_KEYS = ['hgt','stre','spd','jmp','endu','ins','dnk','ft','fg','tp','diq','oiq','drb','pss','reb']

const ATTR_MIN = 25
const ATTR_MAX = 99
const SPAN = ATTR_MAX - ATTR_MIN

/**
 * 幂曲线指数：把百分位中段往中间收一点（p^γ 保序，中段压缩强、两端弱）。
 * 用于缓和中锋/控卫在身高、篮板这类属性上的极端跨度。
 */
const POS_GAMMA = 1.12

/**
 * 位置标签 → 候选标准位置集合。
 *
 * 源数据用 Basketball GM 的泛化标签：F / G / GF / FC 很常见
 * （实测 2020 赛季 F 占 10%、GF 占 8%，而纯 PF 标签只有 1%）。
 * 早期数据几乎不用 PF，全用 F 表示前锋。
 *
 * 因此不能把 F 简单归到 SF —— 那会让 SF 占到联盟 44%，严重扭曲位置分布。
 * 正确做法：F 按 SF/PF 混合权重，FC 按 PF/C 混合，GF 按 SG/SF 混合。
 */
const POS_CANDIDATES = {
  PG: ['PG'], SG: ['SG'], SF: ['SF'], PF: ['PF'], C: ['C'],
  G: ['PG', 'SG'], F: ['SF', 'PF'], GF: ['SG', 'SF'], FC: ['PF', 'C'],
}
const CANONICAL = ['PG', 'SG', 'SF', 'PF', 'C']
function posCandidates(pos) {
  const p = String(pos || '').toUpperCase().trim()
  return POS_CANDIDATES[p] || ['SF']
}
/** 代表位置：仅用于分组统计与展示，取候选里第一个 */
function posGroup(pos) {
  return posCandidates(pos)[0]
}
/** 位置权重向量：候选位置等权平均 */
function weightVector(pos) {
  const cands = posCandidates(pos)
  const out = {}
  for (const k of Object.keys(OVR_WEIGHTS.PG)) {
    let s = 0
    for (const c of cands) s += (OVR_WEIGHTS[c][k] ?? 7)
    out[k] = s / cands.length
  }
  return out
}

/**
 * OVR 位置权重（0.01 精度，各位置权重和均为 1.00）。
 *
 * 校准过程：初版按"篮球常识"给权重，结果顶级内线被系统性低估 ——
 * 2020 赛季前 10% 里只有 4 名中锋（占联盟 17%），Shaq 2000 年只排第 27。
 * 原因是对中锋/大前也要求三分、中投、护球、传球（权重合计约 0.35），
 * 而这些恰恰是内线的弱项，等于用后卫的尺子量中锋。
 *
 * 调整方向：内线大幅提高 FIN/IDEF/REB/BLK/STR 权重，
 * 把 threePT/MID/HAN/PAS 压到象征性水平，让"统治内线"能换来高总评。
 */
const OVR_WEIGHTS = {
  PG: { HAN: 14, PAS: 14, threePT: 10, MID: 10, PDEF: 10, ATH: 8,  CLU: 8,  FIN: 7,  DNK: 6,  IDEF: 5,  STR: 4,  REB: 3,  BLK: 1 },
  SG: { threePT: 12, MID: 12, FIN: 11, CLU: 10, PDEF: 10, HAN: 8, ATH: 8, PAS: 7, DNK: 7, STR: 5, IDEF: 4, REB: 4, BLK: 2 },
  SF: { threePT: 10, MID: 10, FIN: 12, PDEF: 10, DNK: 8, HAN: 7, IDEF: 9, ATH: 8, PAS: 6, REB: 8, STR: 7, CLU: 7, BLK: 4 },
  PF: { FIN: 16, IDEF: 15, REB: 12, STR: 10, BLK: 9,  ATH: 8, PDEF: 7, DNK: 6, MID: 6, threePT: 4, PAS: 3, HAN: 2, CLU: 2 },
  C:  { FIN: 18, IDEF: 17, REB: 13, BLK: 11, STR: 10, ATH: 8, PDEF: 7, DNK: 6, MID: 4, threePT: 2, PAS: 2, HAN: 1, CLU: 1 },
}

// ── 工具 ──────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** 0 视为缺失（数据里 233 个 0 值，如 Spud Webb 的 hgt=0），用位置组中位数兜底 */
function cleanRaw(raw, medians) {
  const out = {}
  for (const k of RAW_KEYS) {
    const v = raw[k]
    out[k] = (isNum(v) && v > 0) ? v : medians[k]
  }
  return out
}

/**
 * 一组数值的百分位查找表。
 * 并列值取平均秩；单元素返回 0.5；结果落在 [0,1]。
 * 用 Map 预聚合，避免每次查询都线性扫描并列段。
 */
function makePercentile(values) {
  const n = values.length
  if (n === 0) return () => 0.5
  const sorted = [...values].sort((a, b) => a - b)
  if (n === 1) return () => 0.5

  // 预计算每个不同值的平均秩
  const rankOf = new Map()
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && sorted[j + 1] === sorted[i]) j++
    rankOf.set(sorted[i], (i + j) / 2)
    i = j + 1
  }
  return (v) => {
    const r = rankOf.get(v)
    if (r === undefined) {
      // 不在样本内（理论上不会发生）：二分找插入位
      let lo = 0, hi = n
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < v) lo = mid + 1; else hi = mid }
      return clamp(lo / (n - 1), 0, 1)
    }
    return clamp(r / (n - 1), 0, 1)
  }
}

const pctToAttr = (p) => Math.round(ATTR_MIN + p * SPAN)

/**
 * OVR 分布锚点：把每季的 OVR 分位数映射到统一目标分位。
 * 保持季内排序不变（单调映射），只统一各年代的分布形状，
 * 这样"≥95 超级巨星 / ≥85 全明星"这类档位在 1950 和 2026 年同样成立。
 */
const OVR_ANCHORS = [
  [0.00, 40], [0.20, 50], [0.50, 62], [0.75, 72],
  [0.90, 82], [0.97, 91], [0.995, 96], [1.00, 99],
]

/** 在锚点上做单调分段线性插值 */
function anchorMap(p) {
  const A = OVR_ANCHORS
  if (p <= A[0][0]) return A[0][1]
  for (let i = 1; i < A.length; i++) {
    if (p <= A[i][0]) {
      const [x0, y0] = A[i - 1], [x1, y1] = A[i]
      const t = x1 === x0 ? 0 : (p - x0) / (x1 - x0)
      return y0 + t * (y1 - y0)
    }
  }
  return A[A.length - 1][1]
}

/**
 * 按位置校准 OVR（当前停用，见下方 ovrOffsets 注释）。
 * 保留此函数以便后续在样本量充足时重新启用。
 * 若要启用，务必先按组样本量收缩偏移，避免小样本组（如 2020 年仅 6 名 PF）失真。
 */
function computeOvrOffsets(byPos) {
  const OVR_TARGET = 62
  const raw = {}
  for (const g of CANONICAL) raw[g] = byPos[g].map((o) => o).sort((a, b) => a - b)
  const medians = {}
  for (const g of CANONICAL) {
    const a = raw[g]
    medians[g] = a.length ? a[a.length >> 1] : OVR_TARGET
  }
  const offsets = {}
  for (const g of CANONICAL) offsets[g] = clamp(OVR_TARGET - medians[g], -12, 12)
  return offsets
}

// ── 主流程 ────────────────────────────────────────────────────────────
function main() {
  const leagueDir = path.join(SRC, 'base_leagues')
  const draftDir = path.join(SRC, 'draftclasses')

  const leagueFiles = fs.readdirSync(leagueDir).filter((f) => f.endsWith('.json')).sort()
  const draftFiles = fs.readdirSync(draftDir).filter((f) => f.endsWith('.json')).sort()

  // 字典
  const names = [], srIds = [], teamMap = new Map(), srIdToIdx = new Map()
  const addPlayer = (p) => {
    const key = p.srID || ('nm:' + p.name)
    if (srIdToIdx.has(key)) {
      const idx = srIdToIdx.get(key)
      // 名字以最早出现为准（避免后期拼写漂移）
      return idx
    }
    const idx = names.length
    names.push(p.name)
    srIds.push(p.srID || null)
    srIdToIdx.set(key, idx)
    return idx
  }
  const addTeam = (t) => {
    const key = t.region + ' ' + t.name
    if (!teamMap.has(key)) teamMap.set(key, { id: teamMap.size, region: t.region, name: t.name, abbrev: t.abbrev })
    return teamMap.get(key).id
  }

  // 第一遍：读原始数据
  const rawSeasons = new Map()   // season -> [{pid, tid, pos, raw, born, meta}]
  const rawDrafts = new Map()    // year -> [{pid, pos, raw, born, college, draft}]
  const gameAttributes = {}
  const teamNamesBySeason = {}

  for (const f of leagueFiles) {
    const j = JSON.parse(fs.readFileSync(path.join(leagueDir, f), 'utf8'))
    const season = j.startingSeason
    gameAttributes[season] = j.gameAttributes || null
    teamNamesBySeason[season] = (j.teams || []).map(addTeam)
    const rows = []
    for (const p of j.players || []) {
      const pid = addPlayer(p)
      const ratings = (p.ratings || [])[0] || {}
      rows.push({
        pid,
        tid: -1, // 下一轮循环用 teams 数组修正
        pos: p.pos,
        hgtRaw: p.hgt, weight: p.weight,
        bornYear: p.born?.year ?? null, bornLoc: p.born?.loc ?? null,
        college: p.college ?? null, draft: p.draft ?? null,
        raw: ratings,
      })
    }
    // 修正 tid：用 teams 数组里的真实下标
    const teamList = j.teams || []
    ;(j.players || []).forEach((p, i) => {
      if (isNum(p.tid) && p.tid >= 0 && p.tid < teamList.length) {
        rows[i].tid = addTeam(teamList[p.tid])
      } else {
        rows[i].tid = -1
      }
    })
    rawSeasons.set(season, rows)
  }

  for (const f of draftFiles) {
    const j = JSON.parse(fs.readFileSync(path.join(draftDir, f), 'utf8'))
    // 用文件名年份，不用 startingSeason：2024draft.json 与 2025draft.json 的
    // startingSeason 都是 2025，用后者做键会互相覆盖（76 届丢成 75 届）
    const year = Number(f.match(/(\d{4})/)?.[1] ?? j.startingSeason)
    const rows = []
    for (const p of j.players || []) {
      const pid = addPlayer(p)
      const ratings = (p.ratings || [])[0] || {}
      rows.push({
        pid, pos: p.pos, hgtRaw: p.hgt, weight: p.weight,
        bornYear: p.born?.year ?? null, bornLoc: p.born?.loc ?? null,
        college: p.college ?? null, draft: p.draft ?? null,
        raw: ratings, rawOvr: ratings.ovr, rawPot: ratings.pot,
      })
    }
    rawDrafts.set(year, rows)
  }

  // 第二遍：按「赛季 × 位置组」归一化
  const seasonsOut = {}
  const eraBaselines = {}

  for (const season of [...rawSeasons.keys()].sort((a, b) => a - b)) {
    const rows = rawSeasons.get(season)

    // 按位置组分组，求中位数（兜底用）
    const byGroup = new Map(CANONICAL.map((g) => [g, []]))
    for (const r of rows) byGroup.get(posGroup(r.pos)).push(r)
    const mediansByGroup = {}
    for (const [g, list] of byGroup) {
      mediansByGroup[g] = {}
      for (const k of RAW_KEYS) {
        const vals = list.map((r) => r.raw[k]).filter((v) => isNum(v) && v > 0).sort((a, b) => a - b)
        mediansByGroup[g][k] = vals.length ? vals[vals.length >> 1] : 50
      }
    }
    const globalMedians = {}
    for (const k of RAW_KEYS) {
      const vals = rows.map((r) => r.raw[k]).filter((v) => isNum(v) && v > 0).sort((a, b) => a - b)
      globalMedians[k] = vals.length ? vals[vals.length >> 1] : 50
    }

    /**
     * 归一化策略（关键设计，踩过两次坑后定稿）：
     *
     *   ① 属性用「赛季内全局百分位」——所有球员一起排序。
     *      这样"中锋篮板强于后卫"这类位置特征被完整保留。
     *
     *   ② 位置校准放在 OVR 层，不放在属性层。
     *      全局百分位会让各位置的 OVR 天然有高有低（中锋权重偏内线，
     *      而内线属性恰好中锋占优），所以最后按位置把 OVR 中位数拉齐，
     *      保证"中锋和控卫的总评可以横向比较"。
     *
     *   反例（已实测踩坑）：若按位置组各自归一化，每组中位数都落在 0.5，
     *   结果所有位置、所有属性均值全变成 62 —— 位置特征被彻底抹平，
     *   中锋篮板和控卫篮板一样高。
     *
     *   注意：百分位必须用「赛季内全体球员」，不能分位置组。
     *   分位置组会踩到样本量陷阱：2020 赛季只有 6 名 PF，Giannis 在 6 人组里
     *   样样第一 → 百分位全接近 1.0 → 13 项属性虚高到 93~99，而 OVR 只有 81，
     *   出现"属性全满但总评很低"的矛盾。1962 年的 C 组同样只有 20 人。
     *   位置特征交给 OVR 权重表达即可，属性本身用全局排序。
     *
     *   POS_GAMMA：用幂曲线把中段往中间收一点（p^γ 保序，中段压缩强、两端弱），
     *   避免中锋/控卫在身高、篮板这类属性上跨度过于极端。
     */
    const globalPct = {}
    for (const k of RAW_KEYS) {
      globalPct[k] = makePercentile(rows.map((r) => cleanRaw(r.raw, globalMedians)[k]))
    }
    /**
     * 身高按「位置组」归一化，其余属性按全局。
     *
     * 原因：身高是位置决定项 —— 中锋 84 英寸、控卫 74 英寸都是各自位置的正常值。
     * 用全局百分位会让"高个子"等价于"中锋"，既没信息量，也让 C 的 BLK
     * （权重含 hgt 0.5）被系统性抬高。按位置组归一化后，hgt 表示
     * "在你的位置上有多高"，这才是有意义的信号。
     * 这里的样本量陷阱不存在：hgt 是连续量，即使组内只有 6 人也能稳定排序。
     */
    const hgtPctByGroup = {}
    for (const g of CANONICAL) {
      const list = byGroup.get(g) || []
      hgtPctByGroup[g] = makePercentile(list.map((r) => cleanRaw(r.raw, globalMedians).hgt))
    }
    const normPct = (k, cleanVal, g) => {
      const raw = k === 'hgt' ? hgtPctByGroup[g](cleanVal) : globalPct[k](cleanVal)
      return clamp(Math.pow(raw, POS_GAMMA), 0, 1)
    }

    // 第一趟：算加权 OVR（未校准）
    const preOvrByPos = Object.fromEntries(CANONICAL.map((g) => [g, []]))
    const preOvr = rows.map((r) => {
      const g = posGroup(r.pos)
      const clean = cleanRaw(r.raw, globalMedians)
      const n = {}
      for (const k of RAW_KEYS) n[k] = pctToAttr(normPct(k, clean[k], g))
      const a = {
        threePT: n.tp,
        MID: Math.round(n.fg * 0.85 + n.ft * 0.15),
        FIN: Math.round(n.ins * 0.65 + n.dnk * 0.35),
        DNK: n.dnk,
        HAN: Math.round(n.drb * 0.85 + n.spd * 0.15),
        PAS: n.pss,
        PDEF: Math.round(n.diq * 0.6 + n.spd * 0.4),
        IDEF: Math.round(n.diq * 0.6 + n.stre * 0.4),
        BLK: Math.round(n.hgt * 0.5 + n.jmp * 0.3 + n.stre * 0.2),
        REB: n.reb,
        ATH: Math.round(n.spd * 0.5 + n.jmp * 0.5),
        STR: n.stre,
        CLU: Math.round(n.oiq * 0.6 + n.endu * 0.2 + n.ft * 0.2),
      }
      for (const k of Object.keys(a)) a[k] = clamp(a[k], ATTR_MIN, ATTR_MAX)
      // 泛化位置（F/GF/FC）用混合权重，避免被当成纯 SF 而虚高
      const w = weightVector(r.pos)
      let ovr = 0
      for (const k of Object.keys(a)) ovr += a[k] * ((w[k] ?? 7) / 100)
      const weighted = clamp(Math.round(ovr), ATTR_MIN, ATTR_MAX)
      preOvrByPos[g].push(weighted)
      return { g, a, weighted }
    })
    /**
     * 位置偏移：默认关闭。
     *
     * 曾尝试"按位置把 OVR 中位数拉齐"，但小样本位置组会严重失真：
     * 2020 赛季全联盟只有 6 名 PF，这 6 人的 OVR 中位数偏高，
     * 算出 -12 的偏移把 Giannis 从 94.5 硬砍到 83。
     * 位置公平性改由「赛季内全局百分位 + 位置权重」表达，
     * 各年代分布一致性由下面的锚点映射保证。
     */
    const ovrOffsets = Object.fromEntries(CANONICAL.map((g) => [g, 0]))

    const outRows = []
    const ovrs = []

    for (let ri = 0; ri < rows.length; ri++) {
      const r = rows[ri]
      const { g, a } = preOvr[ri]
      // OVR：加权值 + 位置校准偏移 → 再套分布锚点
      const calibrated = preOvr[ri].weighted + ovrOffsets[g]
      ovrs.push(calibrated)
      outRows.push([r.pid, r.tid, g, r.hgtRaw ?? null, r.weight ?? null, r.bornYear ?? 0, calibrated,
        a.threePT, a.MID, a.FIN, a.DNK, a.HAN, a.PAS, a.PDEF,
        a.IDEF, a.BLK, a.REB, a.ATH, a.STR, a.CLU])
    }

    // 季内 OVR 分位 → 统一锚点（保序，只统一分布形状）
    const sortedCal = [...ovrs].sort((x, y) => x - y)
    const pctOf = new Map()
    sortedCal.forEach((v, i) => {
      if (!pctOf.has(v)) pctOf.set(v, sortedCal.length > 1 ? i / (sortedCal.length - 1) : 0.5)
    })
    for (const row of outRows) row[6] = clamp(Math.round(anchorMap(pctOf.get(row[6]) ?? 0.5)), ATTR_MIN, ATTR_MAX)

    // 每季基准（用于评奖/难度）
    const sortedOvr = [...ovrs].sort((a, b) => a - b)
    const q = (p) => sortedOvr[Math.min(sortedOvr.length - 1, Math.floor(sortedOvr.length * p))]
    eraBaselines[season] = {
      avgOvr: Math.round(ovrs.reduce((s, v) => s + v, 0) / (ovrs.length || 1)),
      maxOvr: sortedOvr[sortedOvr.length - 1],
      p50: q(0.5), p75: q(0.75), p90: q(0.90), p97: q(0.97), p99: q(0.99),
      teams: (teamNamesBySeason[season] || []).length,
      players: outRows.length,
      ovrOffsets,
    }

    seasonsOut[season] = { players: outRows }
  }

  // 选秀班
  const draftsOut = {}
  for (const year of [...rawDrafts.keys()].sort((a, b) => a - b)) {
    const rows = rawDrafts.get(year)
    draftsOut[year] = rows.map((r) => ({
      pid: r.pid, pos: posGroup(r.pos),
      college: r.college, draft: r.draft,
      rawOvr: r.rawOvr ?? null, rawPot: r.rawPot ?? null,
    }))
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    source: 'BBallGMDraftClasses-main (Basketball GM 格式)',
    seasonCount: Object.keys(seasonsOut).length,
    playerCount: names.length,
    playerSeasonRows: Object.values(seasonsOut).reduce((s, e) => s + e.players.length, 0),
    attrKeys: ['threePT','MID','FIN','DNK','HAN','PAS','PDEF','IDEF','BLK','REB','ATH','STR','CLU'],
    rawAttrKeys: RAW_KEYS,
    attrRange: [ATTR_MIN, ATTR_MAX],
    positionGroups: CANONICAL,
    normalization: '赛季内全局百分位（身高按位置组）→ 幂曲线收中段 → 映射到 [25,99]；保留位置特征，每个年代自成一个完整强度体系',
    ovrCalibration: 'OVR = Σ(属性 × 位置权重)，泛化位置用混合权重；再按当季分位套统一锚点，保证"≥95 超级巨星"各年代同样成立',
    posGamma: POS_GAMMA,
    ovrAnchors: OVR_ANCHORS,
    ovrWeights: OVR_WEIGHTS,
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(OUT_FILE, JSON.stringify({
    meta,
    dict: {
      names,
      srIds,
      teams: Object.fromEntries([...teamMap.entries()].map(([k, v]) => [v.id, v])),
    },
    baselines: eraBaselines,
    seasons: seasonsOut,
    drafts: draftsOut,
  }))

  const mb = (fs.statSync(OUT_FILE).size / 1048576).toFixed(1)
  console.log('✓ 球员池已生成:', path.relative(ROOT, OUT_FILE))
  console.log('  赛季:', meta.seasonCount, '| 唯一球员:', meta.playerCount, '| 球员-赛季行:', meta.playerSeasonRows)
  console.log('  文件大小:', mb, 'MB')
  console.log('  年代基准抽样:', [1950, 1970, 1996, 2026].map((y) => y + ':avg' + eraBaselines[y]?.avgOvr + '/max' + eraBaselines[y]?.maxOvr).join('  '))
}

main()
