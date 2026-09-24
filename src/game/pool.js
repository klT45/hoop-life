// 球员池加载与索引。数据由 scripts/etl/build-player-pool.mjs 生成。
const POOL_URL = new URL('../data/generated/player-pool.json', import.meta.url)

let cached = null

export async function loadPool() {
  if (cached) return cached
  const res = await fetch(POOL_URL)
  if (!res.ok) throw new Error(`球员池加载失败 (${res.status})。请运行 npm run etl:players`)
  cached = await res.json()
  return cached
}

export function getEraList(pool) {
  return Object.keys(pool.seasons)
    .map(Number)
    .sort((a, b) => a - b)
    .map((season) => ({ season, ...pool.seasons[String(season)] }))
}

/** 取某个年代的全部球员，返回展开后的完整对象 */
export function getEraPlayers(pool, season) {
  const era = pool.seasons[String(season)]
  if (!era) return []
  return era.players.map((row) => expandPlayer(pool, season, row))
}

export function expandPlayer(pool, season, row) {
  const [pid, tid, pos, hgt, weight, bornYear, ovr, ...attrs] = row
  const name = pool.dict.names[pid]
  return {
    pid,
    name,
    srId: pool.dict.srIds[pid] || null,
    season,
    tid,
    team: tid >= 0 ? pool.dict.teams[String(tid)] : null,
    pos,
    hgt,
    weight,
    bornYear,
    age: bornYear ? season - bornYear : null,
    ovr,
    attrs: zipAttrs(pool.meta.attrKeys, attrs),
  }
}

export function zipAttrs(keys, values) {
  const out = {}
  keys.forEach((k, i) => { out[k] = values[i] })
  return out
}
