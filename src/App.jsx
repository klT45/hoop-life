import { useEffect, useState } from 'react'
import { loadPool, getEraList } from './game/pool.js'

export default function App() {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    loadPool()
      .then((pool) => setState({ status: 'ready', pool, eras: getEraList(pool) }))
      .catch((err) => setState({ status: 'error', error: String(err) }))
  }, [])

  if (state.status === 'loading') return <div className="boot">正在加载球员池…</div>
  if (state.status === 'error') {
    return (
      <div className="boot boot--error">
        <p>球员池未生成。</p>
        <pre>{state.error}</pre>
        <p className="hint">请先运行：<code>npm run etl:players</code></p>
      </div>
    )
  }

  const { pool, eras } = state
  return (
    <div className="boot">
      <h1>篮球人生 · Hoop Life</h1>
      <p>球员池已就绪：{pool.meta.playerCount} 名球员 / {pool.meta.seasonCount} 个赛季</p>
      <p>可选年代：{eras[0].season} – {eras[eras.length - 1].season}</p>
      <p className="hint">下一步：建球员流程（选年代 → 选位置 → 分配属性点）</p>
    </div>
  )
}
