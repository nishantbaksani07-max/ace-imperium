'use client'

import { useEffect, useState } from 'react'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import styles from './finance.module.css'
import FinanceHeader from './FinanceHeader'
import Ticker from './Ticker'
import SubsView from './SubsView'
import StocksView from './StocksView'
import CryptoView from './CryptoView'
import SpendStrip from './SpendStrip'
import TabBar from './TabBar'
import { MOUNTED_TABS } from './types'
import type { TabKey } from './types'
import { useFinanceState } from './state'

/**
 * Root of the Finance module. THE RADAR (launch, 2026-07-12): Finance is a
 * core tile pared down to what feeds Vee — the subscription radar — now with a
 * second mounted tab, stocks (market brief + live holdings). Net worth / orders
 * / wishlist / coach stay PARKED (their views + state slices stay on disk, just
 * not mounted here) so the launch Finance is base, simple, and honest. Holds
 * the single state instance, the rotating-subscription ticker, and the bottom
 * tab bar that switches between subs and stocks.
 */
export default function FinanceModule() {
  const finance = useFinanceState()
  // Hydration guard: avoid mismatch on SSR (state loads post-mount). Render an
  // empty shell on the first paint, then swap in the hydrated tree once
  // useFinanceState reports ready.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted || !finance.ready) {
    return (
      <main className={`${styles.page} grain-overlay`}>
        <WelcomeBackdrop />
        <div className={styles.shell}>
          <div className={styles.skeletonHeader} aria-hidden />
          <div className={styles.skeletonTicker} aria-hidden />
          <div className={styles.skeletonHero} aria-hidden />
          <div className={styles.skeletonRow} aria-hidden>
            <div className={styles.skeletonCard} />
            <div className={styles.skeletonCard} />
          </div>
          <span className={styles.srOnly} role="status">Loading your finances…</span>
        </div>
      </main>
    )
  }

  const { state, actions, fmt, rates, quotes, refreshQuotes, cryptoQuotes, refreshCryptoQuotes } = finance

  // Two mounted tabs: subs (the radar) + stocks. activeTab persists in
  // FinanceState via setActiveTab; the parked tabs (net/orders/wish/coach) can
  // still linger in the stored value, so anything that isn't 'stocks' resolves
  // to the subscription radar.
  const activeTab: TabKey =
    state.activeTab === 'stocks' ? 'stocks' : state.activeTab === 'crypto' ? 'crypto' : 'subs'

  return (
    <main className={`${styles.page} grain-overlay`}>
      <WelcomeBackdrop />
      <div className={styles.shell}>
        <FinanceHeader
          currency={state.currency}
          onCurrencyChange={actions.setCurrency}
        />

        <Ticker
          subscriptions={state.subscriptions}
          currency={state.currency}
          rates={rates}
        />

        <div key={activeTab} className={styles.tabView}>
          {activeTab === 'subs' ? (
            <>
              <SubsView
                state={state}
                actions={actions}
                fmt={fmt}
                rates={rates}
              />
              <SpendStrip
                state={state}
                actions={actions}
                fmt={fmt}
                rates={rates}
              />
            </>
          ) : activeTab === 'stocks' ? (
            <StocksView
              state={state}
              actions={actions}
              fmt={fmt}
              quotes={quotes}
              refreshQuotes={refreshQuotes}
            />
          ) : (
            <CryptoView
              state={state}
              actions={actions}
              fmt={fmt}
              cryptoQuotes={cryptoQuotes}
              refreshCryptoQuotes={refreshCryptoQuotes}
            />
          )}
        </div>

        <TabBar active={activeTab} onChange={actions.setActiveTab} tabs={MOUNTED_TABS} />
      </div>
    </main>
  )
}
