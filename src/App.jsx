import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import Lenis from 'lenis'

const FLAP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-+'
const DASHBOARD_ENDPOINT = 'http://127.0.0.1:8000/api/dashboard/overview'

const FALLBACK_COMMAND_STRIP = [
  ['Carrier', 'Emirates', 'EK'],
  ['Hub pressure', 'Elevated', '78/100'],
  ['Watch routes', '22 affected', '+6 today'],
  ['Signal confidence', '87%', 'rising'],
]

const FALLBACK_HERO = {
  headline: 'Potential disruption detected.',
  body: 'Abnormal delay patterns detected across multiple Middle East routes. Airspace constraints and regional factors are increasing disruption risk over the next operational window.',
  risk_level: 'HIGH',
  risk_change: '+22 pts / 4h',
  confidence: '87',
  active_alerts: '7',
  routes_affected: '22',
  watch_window: '4h',
}

const FALLBACK_RISK_ENGINE = {
  score: 74,
  status: 'Escalating',
  change: '+22 pts / 4h',
  bands: [
    ['Delay spike', 86, 'red'],
    ['Airspace constraint', 72, 'amber'],
    ['DXB congestion', 78, 'red'],
    ['News signal', 54, 'amber'],
  ],
  metrics: [
    ['Window', '4h'],
    ['Affected', '22'],
    ['Confidence', '87%'],
  ],
}

const FALLBACK_REGIONAL_STATS = [
  { l: 'Active zones', v: '2', t: 'red' },
  { l: 'Watch zones', v: '1', t: 'amber' },
  { l: 'Hub status', v: 'Strained', t: 'red' },
  { l: 'Reroutes', v: '14', t: 'default' },
]

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '87'
  const text = String(value)
  return text.endsWith('%') ? text.slice(0, -1) : text
}

function riskTone(status = '') {
  const value = String(status).toUpperCase()
  if (value.includes('DELAY') || value === 'HIGH' || value === 'ACTIVE') return 'red'
  if (value.includes('MONITOR') || value === 'MEDIUM' || value === 'MODERATE') return 'amber'
  if (value.includes('TIME') || value === 'LOW') return 'green'
  return 'default'
}

function normalizeCommandStrip(items) {
  if (!Array.isArray(items) || items.length === 0) return FALLBACK_COMMAND_STRIP
  return items.map((item) => {
    if (Array.isArray(item)) return [item[0], item[1], item[2]]
    return [
      item.label ?? item.title ?? item.name ?? '',
      item.value ?? item.text ?? item.metric ?? '',
      item.meta ?? item.detail ?? item.caption ?? '',
    ]
  })
}

function normalizeBands(bands) {
  if (!Array.isArray(bands) || bands.length === 0) return FALLBACK_RISK_ENGINE.bands
  return bands.map((band) => {
    if (Array.isArray(band)) return [band[0], Number(band[1] ?? 0), band[2] ?? riskTone(band[0])]
    const label = band.label ?? band.name ?? band.title ?? ''
    const value = Number(band.value ?? band.score ?? band.percent ?? 0)
    return [label, value, band.tone ?? band.severity ?? riskTone(label)]
  })
}

function normalizeFlight(flight) {
  const routeText = flight.route ?? ''
  const [routeFrom, routeTo] = typeof routeText === 'string' && routeText.includes('→')
    ? routeText.split('→').map((part) => part.trim())
    : []
  const status = flight.status ?? 'MONITORING'
  return {
    code: flight.code ?? flight.flight ?? flight.flight_number ?? '',
    from: flight.from ?? flight.origin ?? routeFrom ?? '',
    to: flight.to ?? flight.destination ?? routeTo ?? '',
    city: flight.city ?? flight.destination_city ?? '',
    status,
    tone: flight.tone ?? riskTone(status),
    delay: flight.delay ?? '--',
    risk: flight.risk ?? flight.risk_level ?? 'LOW',
  }
}

function normalizeRegionalStats(regional) {
  const stats = regional?.stats ?? regional?.metrics
  if (Array.isArray(stats) && stats.length > 0) {
    return stats.map((item) => ({
      l: item.l ?? item.label ?? item.title ?? item.name ?? '',
      v: item.v ?? item.value ?? item.metric ?? '',
      t: item.t ?? item.tone ?? item.severity ?? 'default',
    }))
  }
  if (regional && typeof regional === 'object') {
    return [
      { l: 'Active zones', v: regional.active_zones ?? FALLBACK_REGIONAL_STATS[0].v, t: 'red' },
      { l: 'Watch zones', v: regional.watch_zones ?? FALLBACK_REGIONAL_STATS[1].v, t: 'amber' },
      { l: 'Hub status', v: regional.hub_status ?? FALLBACK_REGIONAL_STATS[2].v, t: 'red' },
      { l: 'Reroutes', v: regional.reroutes ?? FALLBACK_REGIONAL_STATS[3].v, t: 'default' },
    ]
  }
  return FALLBACK_REGIONAL_STATS
}

function SmoothScrollProvider() {
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return undefined

    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.82,
      touchMultiplier: 1,
      syncTouch: false,
    })
    window.__airsignalLenis = lenis

    let rafId
    function raf(time) {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }

    rafId = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(rafId)
      delete window.__airsignalLenis
      lenis.destroy()
    }
  }, [])

  return null
}

function smoothScrollTo(targetId, duration = 950) {
  const target = document.querySelector(targetId)
  if (!target) return

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const headerOffset = 88
  if (!prefersReducedMotion && window.__airsignalLenis) {
    window.__airsignalLenis.scrollTo(target, {
      offset: -headerOffset,
      duration: duration / 1000,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      onComplete: () => history.replaceState(null, '', targetId),
    })
    return
  }

  const start = window.scrollY
  const end = target.getBoundingClientRect().top + window.scrollY - headerOffset
  const distance = end - start

  if (prefersReducedMotion) {
    window.scrollTo(0, end)
    return
  }

  const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))
  let startTime

  function frame(now) {
    if (!startTime) startTime = now
    const elapsed = now - startTime
    const progress = Math.min(elapsed / duration, 1)
    window.scrollTo(0, start + distance * easeOutExpo(progress))

    if (progress < 1) {
      requestAnimationFrame(frame)
    } else {
      history.replaceState(null, '', targetId)
    }
  }

  requestAnimationFrame(frame)
}

function FlapTile({ target, delay = 0, tone = 'default', size = 'standard', cycle = 0 }) {
  const [ch, setCh] = useState(' ')
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    setSettled(false)
    let mounted = true
    let interval
    const start = setTimeout(() => {
      let ticks = 0
      interval = setInterval(() => {
        if (!mounted) return
        ticks++
        if (ticks >= 5) {
          clearInterval(interval)
          setCh(target)
          setSettled(true)
        } else {
          setCh(FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)])
        }
      }, 55)
    }, delay)
    return () => {
      mounted = false
      clearTimeout(start)
      clearInterval(interval)
    }
  }, [target, delay, cycle])

  const toneText =
    tone === 'red' ? 'text-[#FF7A6F]' :
    tone === 'green' ? 'text-[#8BE0AA]' :
    tone === 'amber' ? 'text-[#FFD179]' :
    'text-[#F2EBD8]'

  const isSpace = target === ' '
  const tileSize = size === 'compact'
    ? { tile: 'w-[10px] h-[19px] sm:w-[12px] sm:h-[22px]', gap: 'w-[5px] h-[19px] sm:w-[7px] sm:h-[22px]', text: 'text-[9px] sm:text-[11px]' }
    : { tile: 'w-[12px] h-[22px] sm:w-[15px] sm:h-[26px]', gap: 'w-[6px] h-[22px] sm:w-[8px] sm:h-[26px]', text: 'text-[11px] sm:text-[13px]' }

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center align-middle ${isSpace ? tileSize.gap : tileSize.tile} ${isSpace ? '' : 'bg-[#15181D]'} rounded-[2px] overflow-hidden`}
      style={isSpace ? {} : { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -10px 18px rgba(0,0,0,0.22), 0 1px 1px rgba(0,0,0,0.22)' }}
    >
      {!isSpace && (
        <>
          <motion.span
            key={ch + (settled ? '-s' : '-r')}
            initial={{ rotateX: -90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className={`font-mono ${tileSize.text} leading-none tracking-normal ${toneText}`}
            style={{ transformOrigin: 'center top', textShadow: '0 0 10px currentColor' }}
          >
            {ch}
          </motion.span>
          <span className="pointer-events-none absolute inset-x-0 top-0 h-[45%] bg-white/[0.035]" />
          <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-px bg-black/60" />
          <span className="pointer-events-none absolute left-0 right-0 top-[calc(50%+1px)] h-px bg-white/[0.045]" />
        </>
      )}
    </span>
  )
}

function SplitFlapStatus({ text, tone = 'default', baseDelay = 0, size = 'standard' }) {
  const chars = useMemo(() => text.split(''), [text])
  const ref = useRef(null)
  const inView = useInView(ref, { amount: 0.72, margin: '-8% 0px -8% 0px' })
  const [cycle, setCycle] = useState(0)
  const shell = size === 'compact'
    ? 'gap-[1px] px-[5px] py-[5px] sm:gap-[2px] sm:px-[7px] sm:py-[6px] rounded-[5px]'
    : 'gap-[1px] px-[5px] py-[5px] sm:gap-[2px] sm:px-[7px] sm:py-[6px] rounded-[6px]'

  useEffect(() => {
    if (inView) setCycle((value) => value + 1)
  }, [inView])

  return (
    <span
      ref={ref}
      className={`inline-flex items-center ${shell} bg-[#0B0E13] ring-1 ring-black/20`}
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 18px -14px rgba(0,0,0,0.7)' }}
    >
      {chars.map((c, i) => (
        <FlapTile key={`${text}-${i}`} target={c} delay={baseDelay + i * 55} tone={tone} size={size} cycle={cycle} />
      ))}
    </span>
  )
}

function EmiratesMark({ className = '' }) {
  return (
    <svg viewBox="0 0 40 16" className={className} aria-hidden="true">
      <g fill="#C8362B">
        <path d="M2 11 C 6 5, 12 3, 19 3 C 14 4, 9 7, 5 11 Z" />
        <path d="M6 11 C 11 6, 18 4, 26 4 C 19 6, 13 9, 9 11 Z" />
        <path d="M11 11 C 17 7, 24 6, 33 6 C 25 8, 18 10, 14 11 Z" />
        <path d="M16 11 C 22 9, 30 8, 38 9 C 30 10, 22 11, 19 11 Z" />
      </g>
    </svg>
  )
}

function JetLagsLogo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="10" fill="none" stroke="rgba(246,250,255,0.82)" strokeWidth="1.2" />
        <path d="M3 11 L11 3 L19 11 L11 19 Z" fill="none" stroke="rgba(246,250,255,0.82)" strokeWidth="1.2" />
        <circle cx="11" cy="11" r="2" fill="#6EA8FF" />
      </svg>
      <span className="font-serif text-[19px] tracking-tight font-semibold text-ink">JetLags</span>
      <span className="ml-1 hidden text-[10px] uppercase tracking-[0.18em] text-graphite/70 font-medium pt-[3px] sm:inline">Aviation Intelligence</span>
    </div>
  )
}

function TopNav() {
  const items = [
    ['Overview', '#overview'],
    ['Intelligence', '#intelligence'],
    ['Flights', '#flights'],
    ['Alerts', '#regional'],
    ['Reports', '#reports'],
  ]
  return (
    <header className="sticky top-0 z-30 border-b hairline bg-[#07111F]/82 backdrop-blur-xl">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-[58px] sm:h-[60px] flex items-center justify-between gap-3">
        <JetLagsLogo />
        <nav className="hidden md:flex items-center gap-1">
          {items.map(([it, href], i) => (
            <a
              key={it}
              className={`px-3 py-1.5 text-[13px] rounded-md transition-colors ${i === 0 ? 'text-ink font-medium bg-black/[0.04]' : 'text-graphite hover:text-ink hover:bg-black/[0.03]'}`}
              href={href}
              onClick={(event) => {
                event.preventDefault()
                smoothScrollTo(href)
              }}
            >
              {it}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <button className="hidden text-[12px] text-graphite hover:text-ink sm:flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-signal-green pulse-dot" />
            Live
          </button>
          <div className="hidden h-5 w-px bg-white/10 sm:block" />
          <button className="flex items-center gap-2 px-2 py-1.5 sm:px-2.5 rounded-md border hairline glass-soft shadow-soft hover:shadow-panel transition">
            <EmiratesMark className="w-5 h-2" />
            <span className="text-[12.5px] font-medium text-ink">Emirates</span>
            <span className="hidden text-[10px] text-graphite/70 font-mono sm:inline">EK / UAE</span>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 4 L5 7 L8 4" fill="none" stroke="rgba(246,250,255,0.82)" strokeWidth="1.2" /></svg>
          </button>
        </div>
      </div>
    </header>
  )
}

function RiskLineChart() {
  const points = [
    [0, 60], [40, 58], [80, 55], [120, 56], [160, 50],
    [200, 48], [240, 44], [280, 42], [320, 36], [360, 32],
    [400, 30], [440, 25], [480, 22], [520, 18], [560, 14], [600, 10],
  ]
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ')
  const area = `${path} L 600 90 L 0 90 Z`
  return (
    <svg viewBox="0 0 600 120" className="w-full h-[110px] sm:h-[142px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="riskGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#FF5F57" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#FF5F57" stopOpacity="0" />
        </linearGradient>
        <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 20" fill="none" stroke="rgba(180,200,230,0.08)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="600" height="120" fill="url(#grid)" />
      <line x1="0" y1="30" x2="600" y2="30" stroke="rgba(255,95,87,0.22)" strokeDasharray="6 6" />
      <line x1="0" y1="62" x2="600" y2="62" stroke="rgba(246,180,72,0.16)" strokeDasharray="6 6" />
      <motion.path
        d={area.replaceAll('90', '112')}
        fill="url(#riskGrad)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      />
      <motion.path
        d={path}
        fill="none"
        stroke="#FF5F57"
        strokeWidth="2.4"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      />
      {points.slice(-1).map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="10" fill="#FF5F57" opacity="0.16" />
          <circle cx={p[0]} cy={p[1]} r="3.5" fill="#FF5F57" />
        </g>
      ))}
      <g fontFamily="Cascadia Mono, Consolas, monospace" fontSize="8" fill="rgba(210,225,245,0.48)">
        <text x="4" y="114">06:00</text>
        <text x="200" y="114">10:00</text>
        <text x="400" y="114">14:00</text>
        <text x="568" y="114">NOW</text>
        <text x="6" y="27">HIGH</text>
        <text x="6" y="59">WATCH</text>
      </g>
    </svg>
  )
}

function RiskEnginePanel({ riskEngine }) {
  const data = riskEngine || FALLBACK_RISK_ENGINE
  const score = data.score ?? FALLBACK_RISK_ENGINE.score
  const status = data.status ?? FALLBACK_RISK_ENGINE.status
  const change = data.change ?? data.risk_change ?? FALLBACK_RISK_ENGINE.change
  const bands = normalizeBands(data.bands)
  const metrics = Array.isArray(data.metrics) && data.metrics.length > 0
    ? data.metrics.map((item) => Array.isArray(item)
      ? [item[0], item[1]]
      : [item.label ?? item.title ?? item.name ?? '', item.value ?? item.metric ?? ''])
    : [
      ['Window', data.window ?? data.watch_window ?? FALLBACK_HERO.watch_window],
      ['Affected', data.affected ?? data.routes_affected ?? FALLBACK_HERO.routes_affected],
      ['Confidence', data.confidence ?? `${FALLBACK_HERO.confidence}%`],
    ]

  return (
    <div className="rounded-xl border hairline glass-panel px-3 py-3 shadow-panel sm:px-4 sm:py-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-graphite/60 font-semibold">Risk Engine</div>
          <div className="mt-1 font-serif text-[34px] leading-none tracking-[-0.04em] text-ink font-semibold tabular sm:text-[42px]">{score}<span className="text-[16px] text-graphite/40 sm:text-[18px]">/100</span></div>
        </div>
        <div className="rounded-lg border border-signal-red/30 bg-signal-red/[0.10] px-3 py-2 text-right shadow-soft">
          <div className="text-[9px] uppercase tracking-[0.18em] text-signal-red font-semibold">{status}</div>
          <div className="font-mono text-[12px] text-ink tabular">{change}</div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border hairline bg-[#06101D]/72 px-2 pt-2 pb-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:mt-5 sm:px-3 sm:pt-3 sm:pb-2">
        <RiskLineChart />
      </div>

      <div className="mt-4 space-y-3">
        {bands.map(([label, value, tone]) => (
          <div key={label} className="grid grid-cols-[1fr_52px] items-center gap-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] text-graphite">{label}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${value}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                  className={`h-full rounded-full ${tone === 'red' ? 'bg-signal-red' : 'bg-signal-amber'}`}
                />
              </div>
            </div>
            <div className={`font-mono text-[12px] tabular text-right ${tone === 'red' ? 'text-signal-red' : 'text-signal-amber'}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-lg border hairline bg-white/[0.045] px-3 py-2">
            <div className="text-[9px] uppercase tracking-[0.14em] text-graphite/55">{label}</div>
            <div className="font-mono text-[13px] text-ink tabular">{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommandStrip({ items }) {
  const commandItems = normalizeCommandStrip(items)

  return (
    <section className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border hairline glass-panel p-2 shadow-panel sm:mb-5 lg:grid-cols-4 lg:gap-3">
      {commandItems.map(([label, value, meta], i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.04 }}
          className="border hairline bg-white/[0.045] px-3 py-3 shadow-soft rounded-xl sm:px-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] uppercase tracking-[0.14em] text-graphite/60 font-semibold sm:text-[9.5px] sm:tracking-[0.18em]">{label}</span>
            <span className="font-mono text-[10px] text-graphite/50">{meta}</span>
          </div>
          <div className={`mt-1 font-serif text-[18px] leading-none tracking-[-0.03em] font-semibold sm:text-[22px] ${i === 1 ? 'text-signal-red' : 'text-ink'}`}>{value}</div>
        </motion.div>
      ))}
    </section>
  )
}

function HeroPanel({ hero, carrier, riskEngine }) {
  const heroData = hero || FALLBACK_HERO
  const carrierName = carrier?.name ?? carrier?.label ?? carrier ?? 'Emirates'
  const carrierCode = carrier?.code ?? carrier?.iata ?? 'UAE'
  const headline = heroData.headline ?? heroData.title ?? FALLBACK_HERO.headline
  const body = heroData.body ?? heroData.summary ?? heroData.supporting_text ?? heroData.description ?? FALLBACK_HERO.body
  const riskLevel = heroData.risk_level ?? heroData.risk ?? FALLBACK_HERO.risk_level
  const riskChange = heroData.risk_change ?? heroData.change ?? FALLBACK_HERO.risk_change
  const confidence = formatPercent(heroData.confidence ?? FALLBACK_HERO.confidence)
  const activeAlerts = heroData.active_alerts ?? heroData.alerts ?? FALLBACK_HERO.active_alerts
  const routesAffected = heroData.routes_affected ?? heroData.affected_routes ?? FALLBACK_HERO.routes_affected
  const watchWindow = heroData.watch_window ?? heroData.window ?? FALLBACK_HERO.watch_window
  const headlineContent = String(headline).toLowerCase().includes('potential disruption detected')
    ? <>Potential disruption<br />detected.</>
    : headline
  const [updated, setUpdated] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setUpdated(new Date()), 60000)
    return () => clearInterval(t)
  }, [])
  const time = updated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  const localTime = updated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })

  return (
    <motion.section
      id="overview"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border hairline glass-panel shadow-panel"
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        <defs>
          <radialGradient id="heroGlow" cx="85%" cy="20%" r="60%">
            <stop offset="0%" stopColor="#C8362B" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#C8362B" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#heroGlow)" />
        <g stroke="rgba(31,79,168,0.07)" fill="none" strokeWidth="0.6">
          <circle cx="92%" cy="22%" r="60" />
          <circle cx="92%" cy="22%" r="110" />
          <circle cx="92%" cy="22%" r="170" />
          <circle cx="92%" cy="22%" r="240" />
        </g>
        <g stroke="rgba(14,17,22,0.06)" fill="none">
          <path d="M 0 220 Q 300 180 600 230 T 1200 200" strokeDasharray="2 4" />
          <path d="M 0 270 Q 280 240 580 280 T 1180 260" strokeDasharray="2 4" />
        </g>
      </svg>

      <div className="relative px-4 pt-5 pb-5 sm:px-6 sm:pt-6 sm:pb-6 lg:px-8 lg:pt-7 lg:pb-7">
        <div className="flex flex-col gap-3 mb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.055] border hairline">
              <EmiratesMark className="w-4 h-1.5" />
              <span className="text-[10.5px] uppercase tracking-[0.16em] text-graphite font-semibold">{carrierName} / Carrier Watch</span>
            </span>
            <span className="text-[11px] text-graphite/70 font-mono">{carrierCode} / DXB hub</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-graphite/70">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-signal-green pulse-dot" />
            <span className="font-mono tabular">Updated {localTime} GST</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
          <div className="lg:col-span-7">
            <div className="mb-5 max-w-full overflow-hidden inline-flex rounded-xl border border-black/10 bg-[#11151B] p-2.5 sm:p-3 shadow-[0_12px_30px_-22px_rgba(14,17,22,0.7)]">
              <div className="flex flex-col gap-1">
                <SplitFlapStatus text="DXB OPERATIONS" tone="default" size="compact" />
                <SplitFlapStatus text={`DISRUPTION RISK ${String(riskLevel).toUpperCase()}`} tone="red" baseDelay={280} size="compact" />
                <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
                  <span className="text-[8.5px] uppercase tracking-[0.18em] text-white/40 font-mono">Updated</span>
                  <span className="text-[9px] uppercase tracking-[0.12em] text-white/60 font-mono tabular">{localTime} local</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-signal-red pulse-dot" />
              <span className="text-[10.5px] uppercase tracking-[0.18em] text-signal-red font-semibold">Disruption Signal / Active</span>
            </div>
            <h1 className="font-serif text-[36px] leading-[0.98] tracking-[-0.035em] text-ink font-semibold sm:text-[44px] lg:text-[48px]">
              {headlineContent}
            </h1>
            <p className="mt-4 text-[15px] leading-[1.5] text-graphite max-w-[560px]">
              {body}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:flex sm:items-center sm:gap-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-graphite/70 font-medium mb-1.5">Risk Level</div>
                <div className="flex items-baseline gap-2">
                  <span className="font-serif text-[30px] font-semibold text-signal-red leading-none">{riskLevel}</span>
                  <span className="text-[11px] font-mono text-graphite">{riskChange}</span>
                </div>
              </div>
              <div className="hidden h-12 w-px bg-white/10 sm:block" />
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-graphite/70 font-medium mb-1.5">Confidence</div>
                <div className="flex items-baseline gap-2">
                  <span className="font-serif text-[30px] font-semibold text-ink leading-none tabular">{confidence}<span className="text-graphite/50 text-[18px]">%</span></span>
                </div>
              </div>
              <div className="hidden h-12 w-px bg-white/10 sm:block" />
              <div className="col-span-2 sm:col-span-1">
                <div className="text-[10px] uppercase tracking-[0.16em] text-graphite/70 font-medium mb-1.5">Auto-updated</div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-signal-green pulse-dot" />
                  <span className="text-[13px] font-mono text-ink tabular">{time} UTC</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10.5px] uppercase tracking-[0.18em] text-graphite font-semibold">Disruption Risk / Engine</div>
              <div className="flex items-center gap-3 text-[10px] font-mono text-graphite/70">
                <span className="flex items-center gap-1"><span className="w-2 h-px bg-signal-red" /> RISK</span>
                <span>0-100</span>
              </div>
            </div>
            <RiskEnginePanel riskEngine={riskEngine} />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { k: 'Active alerts', v: activeAlerts },
                { k: 'Routes affected', v: routesAffected },
                { k: 'Watch window', v: watchWindow },
              ].map((s) => (
                <div key={s.k} className="rounded-lg border hairline bg-white/[0.045] px-3 py-2">
                  <div className="text-[9.5px] uppercase tracking-[0.14em] text-graphite/70">{s.k}</div>
                  <div className="font-serif text-[18px] text-ink tabular">{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  )
}

const FLIGHTS = [
  { code: 'EK001', from: 'DXB', to: 'LHR', city: 'London Heathrow', status: 'DELAYED', tone: 'red', delay: '+48m', risk: 'HIGH' },
  { code: 'EK215', from: 'DXB', to: 'LAX', city: 'Los Angeles', status: 'ON TIME', tone: 'green', delay: '--', risk: 'LOW' },
  { code: 'EK923', from: 'DXB', to: 'CAI', city: 'Cairo', status: 'MONITORING', tone: 'amber', delay: '+20m', risk: 'MEDIUM' },
  { code: 'EK507', from: 'DXB', to: 'BOM', city: 'Mumbai', status: 'ON TIME', tone: 'green', delay: '--', risk: 'LOW' },
  { code: 'EK247', from: 'DXB', to: 'SYD', city: 'Sydney', status: 'DELAYED', tone: 'red', delay: '+1h 35m', risk: 'HIGH' },
]

function RiskBar({ level }) {
  const map = {
    HIGH: {
      text: 'text-signal-red',
      dot: 'bg-signal-red',
      border: 'border-signal-red/25',
      bg: 'bg-signal-red/[0.10]',
      glow: 'shadow-[0_0_28px_-18px_rgba(255,95,87,0.9)]',
      meter: 'w-[82%]',
    },
    MEDIUM: {
      text: 'text-signal-amber',
      dot: 'bg-signal-amber',
      border: 'border-signal-amber/25',
      bg: 'bg-signal-amber/[0.10]',
      glow: 'shadow-[0_0_28px_-18px_rgba(246,180,72,0.9)]',
      meter: 'w-[56%]',
    },
    LOW: {
      text: 'text-signal-green',
      dot: 'bg-signal-green',
      border: 'border-signal-green/25',
      bg: 'bg-signal-green/[0.10]',
      glow: 'shadow-[0_0_28px_-18px_rgba(58,211,139,0.9)]',
      meter: 'w-[28%]',
    },
  }
  const tone = map[level] || map.LOW

  return (
    <div className={`min-w-[92px] rounded-lg border ${tone.border} ${tone.bg} ${tone.glow} px-2.5 py-1.5 backdrop-blur-md`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone.dot} pulse-dot`} />
        <span className={`font-mono text-[10.5px] font-semibold tracking-[0.12em] ${tone.text}`}>{level}</span>
      </div>
      <div className="mt-1.5 h-[2px] overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${tone.dot} ${tone.meter}`} />
      </div>
    </div>
  )
}

function FlightsTable({ flights = FLIGHTS }) {
  const visibleFlights = Array.isArray(flights) && flights.length > 0 ? flights : FLIGHTS
  return (
    <section id="flights" className="rounded-2xl border hairline glass-panel shadow-panel overflow-hidden scroll-mt-24">
      <div className="flex flex-col gap-3 px-4 py-3.5 border-b hairline sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <span className="text-[10.5px] uppercase tracking-[0.18em] text-graphite font-semibold">Live Flights / Emirates</span>
          <span className="hidden text-[11px] font-mono text-graphite/60 sm:inline">DXB outbound / 5 of 312</span>
        </div>
        <div className="flex items-center justify-between gap-4 sm:justify-start">
          <div className="flex items-center gap-1.5 text-[11px] text-graphite">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-signal-green pulse-dot" />
            <span className="font-mono">streaming</span>
          </div>
          <div className="flex items-center gap-1 rounded-md border hairline p-0.5 bg-paper/40">
            {['DEPARTURES', 'ARRIVALS'].map((t, i) => (
              <button key={t} className={`text-[10.5px] tracking-[0.12em] px-2.5 py-1 rounded ${i === 0 ? 'bg-white/10 shadow-soft text-ink' : 'text-graphite'}`}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-2.5 text-[10px] uppercase tracking-[0.16em] text-graphite/60 font-medium border-b hairline">
        <div className="col-span-2">Flight</div>
        <div className="col-span-4">Route</div>
        <div className="col-span-3">Status</div>
        <div className="col-span-1 tabular text-right">Delay</div>
        <div className="col-span-2 text-right">Risk</div>
      </div>

      <div className="md:hidden divide-y divide-white/10">
        {visibleFlights.map((f, i) => (
          <motion.div
            key={`mobile-${f.code || f.flight || i}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 * i }}
            className="px-4 py-4"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[14px] font-semibold text-ink tabular">{f.code || f.flight}</span>
                  <span className="text-[9px] uppercase tracking-[0.14em] text-graphite/60 px-1.5 py-0.5 rounded bg-white/[0.055]">A380</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[12px] text-graphite">
                  <span className="font-mono text-ink">{f.from}</span>
                  <span className="text-graphite/50">→</span>
                  <span className="font-mono text-ink">{f.to}</span>
                  <span className="truncate">{f.city}</span>
                </div>
              </div>
              <RiskBar level={f.risk} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <SplitFlapStatus text={f.status} tone={f.tone} baseDelay={120 + i * 90} />
              <div className={`font-mono tabular text-[13px] ${f.tone === 'red' ? 'text-signal-red' : f.tone === 'amber' ? 'text-signal-amber' : 'text-graphite/50'}`}>
                {f.delay}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="hidden md:block">
        {visibleFlights.map((f, i) => (
          <motion.div
            key={f.code || f.flight || i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 * i }}
            className="grid grid-cols-12 gap-4 px-6 py-3.5 items-center border-b hairline last:border-b-0 hover:bg-paper/40 transition-colors group"
          >
            <div className="col-span-2 flex items-center gap-2">
              <span className="font-mono text-[13.5px] font-semibold text-ink tabular">{f.code || f.flight}</span>
              <span className="text-[9.5px] uppercase tracking-[0.14em] text-graphite/60 px-1.5 py-0.5 rounded bg-black/[0.035]">A380</span>
            </div>
            <div className="col-span-4 flex items-center gap-3">
              <span className="font-mono text-[13px] text-ink tabular">{f.from}</span>
              <svg width="48" height="10" viewBox="0 0 48 10" aria-hidden="true" className="text-graphite/40 group-hover:text-signal-blue transition-colors">
                <path d="M2 5 L42 5" stroke="currentColor" strokeDasharray="2 3" strokeWidth="1" />
                <path d="M40 1 L46 5 L40 9" stroke="currentColor" fill="none" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <span className="font-mono text-[13px] text-ink tabular">{f.to}</span>
            <span className="hidden text-[11.5px] text-graphite/70 lg:inline">{f.city}</span>
            </div>
            <div className="col-span-3">
              <SplitFlapStatus text={f.status} tone={f.tone} baseDelay={120 + i * 90} />
            </div>
            <div className={`col-span-1 text-right font-mono tabular text-[13px] ${f.tone === 'red' ? 'text-signal-red' : f.tone === 'amber' ? 'text-signal-amber' : 'text-graphite/50'}`}>
              {f.delay}
            </div>
            <div className="col-span-2 flex justify-end">
              <RiskBar level={f.risk} />
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function ModuleShell({ kicker, title, children, footer }) {
  return (
    <motion.div
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className="relative rounded-2xl border hairline glass-soft p-5 shadow-soft hover:shadow-panel hover:-translate-y-0.5 transition"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9.5px] uppercase tracking-[0.18em] text-graphite/70 font-semibold">{kicker}</span>
      </div>
      <h3 className="text-[13.5px] font-semibold tracking-tight text-ink mb-3">{title}</h3>
      {children}
      {footer && <div className="mt-4 pt-3 border-t hairline">{footer}</div>}
    </motion.div>
  )
}

function DelaySpikeModule() {
  const data = [22, 24, 21, 25, 28, 32, 30, 38, 44, 52, 58, 64, 72]
  const max = 80
  const w = 220, h = 56
  const step = w / (data.length - 1)
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - (v / max) * h}`).join(' ')
  return (
    <ModuleShell
      kicker="Signal A / Delay"
      title="DELAY SPIKE DETECTED"
      footer={
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-graphite">Routes affected</span>
          <span className="font-mono tabular text-ink font-semibold">22</span>
        </div>
      }
    >
      <div className="text-[11.5px] text-graphite mb-3">Region / <span className="text-ink">Middle East &amp; North Africa</span></div>
      <div className="rounded-lg bg-paper/50 border hairline px-3 py-3">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[56px]">
          <defs>
            <linearGradient id="dsGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#C8362B" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#C8362B" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill="url(#dsGrad)" />
          <motion.path d={path} fill="none" stroke="#C8362B" strokeWidth="1.4" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1 }} />
          <circle cx={(data.length - 1) * step} cy={h - (data[data.length - 1] / max) * h} r="2.6" fill="#C8362B" />
        </svg>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-graphite/70">Impact</span>
        <span className="text-[11.5px] text-signal-red font-medium">High / spreading</span>
      </div>
    </ModuleShell>
  )
}

function AirspaceRestrictionModule() {
  return (
    <ModuleShell
      kicker="Signal B / Airspace"
      title="AIRSPACE RESTRICTION"
      footer={
        <div className="grid grid-cols-3 gap-2 text-[10.5px]">
          <div><div className="text-graphite/70 uppercase tracking-[0.12em] text-[9px]">Status</div><div className="text-signal-red font-medium">Active</div></div>
          <div><div className="text-graphite/70 uppercase tracking-[0.12em] text-[9px]">Expires</div><div className="font-mono text-ink tabular">18:30 UTC</div></div>
          <div><div className="text-graphite/70 uppercase tracking-[0.12em] text-[9px]">Severity</div><div className="text-signal-amber font-medium">Moderate</div></div>
        </div>
      }
    >
      <div className="text-[11.5px] text-graphite mb-3">Region / <span className="text-ink">Iraq &amp; Eastern Med.</span></div>
      <div className="rounded-lg bg-[#0E1116] relative overflow-hidden h-[88px]">
        <div className="absolute inset-0">
          <svg viewBox="0 0 200 88" className="w-full h-full">
            <defs>
              <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#1F4FA8" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#1F4FA8" stopOpacity="0" />
              </radialGradient>
              <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#C8362B" strokeWidth="1" opacity="0.5" />
              </pattern>
            </defs>
            <g stroke="rgba(124,165,255,0.18)" fill="none">
              <circle cx="100" cy="44" r="14" />
              <circle cx="100" cy="44" r="26" />
              <circle cx="100" cy="44" r="38" />
              <line x1="62" y1="44" x2="138" y2="44" />
              <line x1="100" y1="6" x2="100" y2="82" />
            </g>
            <g className="radar-sweep" style={{ transformOrigin: '100px 44px' }}>
              <path d="M 100 44 L 138 44 A 38 38 0 0 1 116 76 Z" fill="url(#radarGlow)" />
            </g>
            <path d="M 75 30 Q 100 22 125 32 Q 130 50 110 58 Q 88 56 75 30 Z" fill="url(#hatch)" stroke="#C8362B" strokeOpacity="0.6" strokeWidth="0.6" />
            <circle cx="100" cy="44" r="2" fill="#7BD8A1" />
            <text x="105" y="42" fontSize="6" fill="rgba(255,255,255,0.6)" fontFamily="Cascadia Mono, Consolas, monospace">DXB</text>
          </svg>
        </div>
        <div className="absolute top-2 left-2 text-[8.5px] uppercase tracking-[0.18em] text-white/50 font-mono">FIR / OIIX</div>
        <div className="absolute bottom-2 right-2 text-[8.5px] text-white/50 font-mono tabular">42.3N / 44.1E</div>
      </div>
    </ModuleShell>
  )
}

function AirportCongestionModule() {
  const bars = [42, 55, 48, 62, 70, 78, 72, 65, 58, 51, 60, 68]
  return (
    <ModuleShell
      kicker="Signal C / Hub Load"
      title="AIRPORT CONGESTION"
      footer={
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-graphite">Status</span>
          <span className="text-signal-red font-medium">High</span>
        </div>
      }
    >
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[11.5px] text-graphite">Airport / <span className="text-ink font-medium">DXB</span></div>
        <div className="flex items-baseline gap-1">
          <span className="font-serif text-[28px] text-ink leading-none tabular font-semibold">78</span>
          <span className="text-[11px] text-graphite/60 font-mono">/100</span>
        </div>
      </div>
      <div className="rounded-lg bg-paper/50 border hairline p-3">
        <div className="flex items-end justify-between gap-1 h-[58px]">
          {bars.map((v, i) => (
            <motion.div
              key={i}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.5, delay: 0.05 * i, ease: 'easeOut' }}
              style={{ height: `${v}%`, transformOrigin: 'bottom' }}
              className={`flex-1 rounded-t-sm ${v > 70 ? 'bg-signal-red' : v > 55 ? 'bg-signal-amber' : 'bg-graphite/40'}`}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2 text-[8.5px] font-mono text-graphite/60 tabular">
          <span>06</span><span>09</span><span>12</span><span>15</span><span>18</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10.5px]">
        <div className="flex justify-between"><span className="text-graphite/70">Taxi-out</span><span className="font-mono tabular text-ink">28m</span></div>
        <div className="flex justify-between"><span className="text-graphite/70">Stand util.</span><span className="font-mono tabular text-ink">94%</span></div>
      </div>
    </ModuleShell>
  )
}

function NewsSignalsModule() {
  const items = [
    { t: '14:42', src: 'REUTERS', txt: 'Regional airspace advisory extended', tone: 'red' },
    { t: '13:08', src: 'NOTAM', txt: 'OIIX FIR - restricted corridor active', tone: 'amber' },
    { t: '11:55', src: 'METAR', txt: 'OMDB convective activity easing', tone: 'green' },
  ]
  return (
    <ModuleShell
      kicker="Signal D / OSINT"
      title="NEWS SIGNALS"
      footer={
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-graphite">Outlook</span>
          <span className="text-signal-amber font-medium">Unstable</span>
        </div>
      }
    >
      <div className="text-[11.5px] text-graphite mb-3">Regional tension and weather events under active monitoring.</div>
      <div className="rounded-lg border hairline bg-paper/40 divide-y divide-white/10">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-2.5 px-3 py-2">
            <span className={`mt-1.5 inline-block w-1.5 h-1.5 rounded-full ${it.tone === 'red' ? 'bg-signal-red' : it.tone === 'amber' ? 'bg-signal-amber' : 'bg-signal-green'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[9.5px] font-mono text-graphite/70">
                <span className="tabular">{it.t}</span>
                <span className="tracking-[0.14em]">{it.src}</span>
              </div>
              <div className="text-[12px] text-ink truncate">{it.txt}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10.5px]">
        <span className="text-graphite/70 uppercase tracking-[0.14em]">Signal volume</span>
        <span className="font-mono tabular text-ink">12 reports / 6h</span>
      </div>
    </ModuleShell>
  )
}

function OperationsIntelligence() {
  return (
    <div id="intelligence" className="space-y-4 scroll-mt-24">
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.18em] text-graphite font-semibold">Operations Intelligence</div>
          <div className="text-[11px] text-graphite/60 font-mono">4 active signals / auto-correlated</div>
        </div>
        <button className="shrink-0 text-[11px] text-signal-blue hover:underline">View console -&gt;</button>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <DelaySpikeModule />
        <AirspaceRestrictionModule />
        <AirportCongestionModule />
        <NewsSignalsModule />
      </div>
    </div>
  )
}

function RegionalSituation({ regional }) {
  const cities = [
    { name: 'Istanbul', x: 120, y: 60, code: 'IST', risk: 'med' },
    { name: 'Tehran', x: 270, y: 95, code: 'IKA', risk: 'high' },
    { name: 'Cairo', x: 110, y: 165, code: 'CAI', risk: 'med' },
    { name: 'Dubai', x: 305, y: 175, code: 'DXB', risk: 'high', hub: true },
  ]
  const stats = normalizeRegionalStats(regional)
  return (
    <section id="regional" className="rounded-2xl border hairline glass-panel shadow-panel overflow-hidden scroll-mt-24">
      <div className="flex flex-col gap-3 px-4 py-4 border-b hairline sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex items-center gap-3">
          <span className="text-[10.5px] uppercase tracking-[0.18em] text-graphite font-semibold">Regional Situation</span>
          <span className="text-[11px] font-mono text-graphite/60">Middle East / Eastern Med.</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-graphite/70">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-signal-red/30 border border-signal-red/60" /> High risk</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-signal-amber/25 border border-signal-amber/60" /> Watch</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-paper border hairline" /> Nominal</span>
        </div>
      </div>
      <div className="relative px-5 py-5">
        <svg viewBox="0 0 460 240" className="w-full h-[180px] sm:h-[220px]">
          <defs>
            <pattern id="risk-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="#C8362B" strokeWidth="1" opacity="0.35" />
            </pattern>
            <pattern id="watch-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="#C97A1F" strokeWidth="1" opacity="0.3" />
            </pattern>
            <pattern id="grid2" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(14,17,22,0.04)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="460" height="240" fill="url(#grid2)" />

          <g fill="rgba(14,17,22,0.045)" stroke="rgba(14,17,22,0.18)" strokeWidth="0.6">
            <path d="M 60 30 Q 130 20 200 40 Q 260 30 310 50 Q 360 45 410 65 L 415 90 Q 360 95 310 90 Q 260 105 200 95 Q 130 110 70 95 Z" />
            <path d="M 70 105 Q 140 100 210 115 Q 270 110 330 125 L 340 175 Q 290 185 240 175 Q 180 195 120 185 Q 80 175 65 150 Z" />
            <path d="M 240 130 Q 300 125 360 140 Q 410 145 430 175 Q 410 205 360 210 Q 310 215 270 200 Q 240 175 240 130 Z" />
            <path d="M 60 165 Q 120 160 170 175 Q 200 200 175 220 Q 130 230 90 220 Q 55 200 60 165 Z" />
          </g>

          <path d="M 230 70 Q 290 55 340 85 Q 360 115 320 130 Q 270 130 240 110 Q 220 90 230 70 Z" fill="url(#risk-hatch)" stroke="#C8362B" strokeOpacity="0.4" strokeWidth="0.7" strokeDasharray="3 3" />
          <path d="M 80 130 Q 140 120 180 140 Q 200 165 160 175 Q 110 178 85 160 Q 70 145 80 130 Z" fill="url(#watch-hatch)" stroke="#C97A1F" strokeOpacity="0.4" strokeWidth="0.7" strokeDasharray="3 3" />

          <g stroke="rgba(31,79,168,0.4)" strokeWidth="0.8" fill="none" strokeDasharray="2 3">
            <path d="M 305 175 Q 200 100 120 60" />
            <path d="M 305 175 Q 250 130 270 95" />
            <path d="M 305 175 Q 200 170 110 165" />
          </g>

          {cities.map((c) => (
            <g key={c.name}>
              {c.hub && <circle cx={c.x} cy={c.y} r="14" fill="#1F4FA8" opacity="0.08" />}
              {c.hub && <circle cx={c.x} cy={c.y} r="8" fill="#1F4FA8" opacity="0.14" />}
              <circle cx={c.x} cy={c.y} r={c.hub ? 4 : 3} fill={c.risk === 'high' ? '#C8362B' : c.risk === 'med' ? '#C97A1F' : '#1F7A47'} />
              <circle cx={c.x} cy={c.y} r={c.hub ? 4 : 3} fill="none" stroke="#fff" strokeWidth="1.2" />
              <text x={c.x + 9} y={c.y - 5} fontSize="10" fontWeight="600" fill="#0E1116" fontFamily="Segoe UI, Arial, sans-serif">{c.name}</text>
              <text x={c.x + 9} y={c.y + 6} fontSize="8" fill="rgba(14,17,22,0.5)" fontFamily="Cascadia Mono, Consolas, monospace">{c.code}</text>
            </g>
          ))}

          <g fontFamily="Cascadia Mono, Consolas, monospace" fontSize="7" fill="rgba(14,17,22,0.35)">
            <text x="6" y="14">30N</text>
            <text x="6" y="124">25N</text>
            <text x="6" y="234">20N</text>
          </g>
        </svg>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {stats.map((s) => (
            <div key={s.l} className="rounded-lg border hairline px-3 py-2">
              <div className="text-[9.5px] uppercase tracking-[0.14em] text-graphite/70">{s.l}</div>
              <div className={`font-serif text-[18px] tabular ${s.t === 'red' ? 'text-signal-red' : s.t === 'amber' ? 'text-signal-amber' : 'text-ink'}`}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AirSignalDashboard() {
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true

    async function loadDashboardData() {
      try {
        setLoading(true)
        const response = await fetch(DASHBOARD_ENDPOINT)
        if (!response.ok) throw new Error('Failed to fetch dashboard data')
        const data = await response.json()
        console.log("Dashboard data from backend:", data)
        if (!active) return
        setDashboardData(data)
        setError(null)
      } catch (err) {
        if (!active) return
        console.error('Dashboard fetch error:', err)
        setDashboardData(null)
        setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadDashboardData()

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="app-shell text-ink relative">
      <SmoothScrollProvider />
      <TopNav />
      <main className="max-w-[1440px] mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        {loading && (
          <div className="mb-4 rounded-xl border hairline glass-soft px-4 py-3 text-[11px] font-mono text-graphite">
            Loading intelligence feed...
          </div>
        )}
        <CommandStrip items={dashboardData?.command_strip} />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:gap-6">
          <div className="space-y-5 xl:col-span-8 xl:space-y-6">
            <HeroPanel hero={dashboardData?.hero} carrier={dashboardData?.carrier} riskEngine={dashboardData?.risk_engine} />
            <FlightsTable flights={dashboardData?.flights || FLIGHTS} />
          </div>
          <div className="space-y-5 xl:col-span-4 xl:space-y-6">
            <OperationsIntelligence />
            <RegionalSituation regional={dashboardData?.regional} />
          </div>
        </div>
        <footer className="mt-8 flex flex-col gap-3 border-t hairline pt-5 text-[11px] text-graphite/60 font-mono sm:mt-10 sm:flex-row sm:items-center sm:justify-between sm:pt-6">
          <div id="reports" className="scroll-mt-24">JetLags / Aviation Intelligence Prototype</div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <span>v0.4.2</span>
            <span>/</span>
            <span>Data: simulated</span>
            {error && (
              <>
                <span>/</span>
                <span className="text-signal-amber">Backend offline / using simulated data</span>
              </>
            )}
            <span>/</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-signal-green pulse-dot" /> stream healthy</span>
          </div>
        </footer>
      </main>
    </div>
  )
}

export default function App() {
  return <AirSignalDashboard />
}
