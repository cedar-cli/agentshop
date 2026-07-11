import { useWorld } from '../../core/store'

export function ActiveScenes() {
  const scenes = useWorld((s) => s.activeScenes)
  const toggleScene = useWorld((s) => s.toggleScene)
  const triggerScene = useWorld((s) => s.triggerScene)

  return (
    <ul className="scene-list">
      {scenes.map((sc) => (
        <li
          key={sc.id}
          className={`scene-card ${sc.armed ? 'armed' : ''} ${
            sc.triggered ? 'fired' : ''
          }`}
        >
          <div className="scene-top">
            <div className="scene-title">{sc.title}</div>
            <button
              className={`scene-switch ${sc.armed ? 'on' : ''}`}
              onClick={() => toggleScene(sc.id)}
              aria-label="监测开关"
            >
              <span />
            </button>
          </div>
          <div className="scene-sample">{sc.sample}</div>
          <div className="scene-desc">{sc.desc}</div>
          <div className="scene-progress">
            <span
              className="scene-progress-fill"
              style={{ width: `${sc.progress}%` }}
            />
          </div>
          <div className="scene-foot">
            {sc.triggered ? (
              <span className="scene-fired-tag">已触发下单</span>
            ) : sc.armed ? (
              <button
                className="scene-trigger"
                onClick={() => triggerScene(sc.id)}
              >
                模拟触发 · 监测 {Math.round(sc.progress)}%
              </button>
            ) : (
              <span className="scene-off">监测已关闭</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
