import { useEffect, useState } from 'react'
import { startClock } from './core/store'
import { TopBar, type ModuleKey } from './components/shared/TopBar'
import { ChainFeed } from './components/shared/ChainFeed'
import { ConsumerModule } from './components/consumer/ConsumerModule'
import { TopologyModule } from './components/topology/TopologyModule'
import { MerchantModule } from './components/merchant/MerchantModule'
import './app.css'

export function App() {
  const [active, setActive] = useState<ModuleKey>('consumer')

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
