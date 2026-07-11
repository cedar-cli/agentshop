import { useEffect, useState } from 'react'
import { startClock } from './core/store'
import { TopBar, type ModuleKey } from './components/shared/TopBar'
import { ChainFeed } from './components/shared/ChainFeed'
import { ConsumerModule } from './components/consumer/ConsumerModule'
import { TopologyModule } from './components/topology/TopologyModule'
import { MerchantModule } from './components/merchant/MerchantModule'
import './app.css'

export function App() {
  const requestedModule = new URLSearchParams(window.location.search).get('module')
  const initialModule: ModuleKey =
    requestedModule === 'consumer' ||
    requestedModule === 'topology' ||
    requestedModule === 'merchant'
      ? requestedModule
      : 'consumer'
  const [active, setActive] = useState<ModuleKey>(initialModule)

  useEffect(() => startClock(), [])

  return (
    <>
      <TopBar active={active} onSwitch={setActive} />
      <div className="app-body">
        <main className="app-main">
          {active === 'consumer' && <ConsumerModule />}
          {active === 'topology' && <TopologyModule />}
          {active === 'merchant' && <MerchantModule />}
        </main>
        {active === 'topology' && <ChainFeed />}
      </div>
    </>
  )
}
