import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import { GOVERNORATES, RISK_COLORS } from '../../constants/grid'

const EN_ROUTE_MS = 8_000
const PATROL_MS = 12_000
const RETURN_MS = 8_000
const TICK_MS = 100
const PATROL_RADIUS = 0.04

const BASES = {
  north: [37.1, 9.5],   // Mateur area — on land, near Bizerte (37.5 is in the Mediterranean)
  centre: [35.5, 9.8],
  south: [33.5, 9.6],   // Gabès hinterland — safely inland above the Gulf coast
}

const govMap = Object.fromEntries(GOVERNORATES.map((g) => [g.name, g]))

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

function getBaseByTarget([lat]) {
  if (lat >= 36) return BASES.north
  if (lat >= 34.5) return BASES.centre
  return BASES.south
}

function droneIcon(color) {
  return L.divIcon({
    className: '',
    html: `
      <div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;">
        <div style="
          width:22px;height:22px;border-radius:50%;
          border:1px solid ${color};background:${color}22;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 0 8px ${color}88;
          font-size:12px;line-height:1;
        ">✈</div>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function etaIcon(seconds, color) {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        padding:1px 6px;border-radius:8px;
        font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;
        color:${color};border:1px solid ${color}55;background:#0a0f1acc;
        white-space:nowrap;
      ">~${Math.max(0, Math.ceil(seconds))}s</div>
    `,
  })
}

function buildMissions(activeAlert, cascadeAlerts) {
  if (!activeAlert) return []
  const regions = [
    { name: activeAlert.region, risk_level: activeAlert.risk_level },
    ...(cascadeAlerts || []),
  ]

  return regions
    .map((r) => {
      const gov = govMap[r.name]
      if (!gov) return null
      const target = [gov.lat, gov.lon]
      const risk = r.risk_level || 'HIGH'
      const color = RISK_COLORS[risk] || '#00ff88'
      const count = risk === 'CRITICAL' ? 3 : 2
      return { region: r.name, risk, color, target, origin: getBaseByTarget(target), count }
    })
    .filter(Boolean)
}

export default function DroneLayer({ map, activeAlert, cascadeAlerts = [], onDronesReturned }) {
  const objectsRef = useRef([])
  const timerRef = useRef(null)
  const doneRef = useRef(false)
  const totalMissionTime = EN_ROUTE_MS + PATROL_MS + RETURN_MS

  const missions = useMemo(
    () => buildMissions(activeAlert, cascadeAlerts),
    [activeAlert, cascadeAlerts]
  )

  useEffect(() => {
    if (!map) return undefined

    const clearAll = () => {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      objectsRef.current.forEach((o) => {
        o.marker?.remove()
        o.etaMarker?.remove()
        o.traveled?.remove()
        o.remaining?.remove()
        o.patrolCircle?.remove()
      })
      objectsRef.current = []
      doneRef.current = false
    }

    if (!activeAlert || missions.length === 0) {
      clearAll()
      return undefined
    }

    clearAll()
    const now = Date.now()
    const drones = []

    missions.forEach((m) => {
      for (let i = 0; i < m.count; i += 1) {
        const marker = L.marker(m.origin, { icon: droneIcon(m.color), interactive: false }).addTo(map)
        const etaMarker = L.marker(m.origin, { icon: etaIcon(totalMissionTime / 1000, m.color), interactive: false }).addTo(map)
        const traveled = L.polyline([m.origin, m.origin], { color: m.color, weight: 2.4, opacity: 0.85 }).addTo(map)
        const remaining = L.polyline([m.origin, m.target], { color: m.color, weight: 1.8, opacity: 0.45, dashArray: '5,6' }).addTo(map)
        const patrolCircle = L.circle(m.target, {
          radius: 0,
          color: m.color,
          weight: 1.2,
          opacity: 0.3,
          fillOpacity: 0,
          dashArray: '6,6',
        }).addTo(map)

        drones.push({
          id: `drone-${m.region}-${i}`,
          startAt: now + i * 200,
          color: m.color,
          origin: m.origin,
          target: m.target,
          marker,
          etaMarker,
          traveled,
          remaining,
          patrolCircle,
        })
      }
    })

    objectsRef.current = drones

    timerRef.current = setInterval(() => {
      const t = Date.now()
      let returned = 0

      drones.forEach((d) => {
        const elapsed = Math.max(0, t - d.startAt)
        const phaseMs = Math.min(totalMissionTime, elapsed)
        const left = (totalMissionTime - phaseMs) / 1000
        let pos = d.origin
        let status = 'en-route'

        if (phaseMs < EN_ROUTE_MS) {
          const p = phaseMs / EN_ROUTE_MS
          pos = lerp(d.origin, d.target, p)
          d.traveled.setLatLngs([d.origin, pos])
          d.remaining.setLatLngs([pos, d.target])
          d.patrolCircle.setRadius(0)
        } else if (phaseMs < EN_ROUTE_MS + PATROL_MS) {
          status = 'patrolling'
          const patrolT = (phaseMs - EN_ROUTE_MS) / PATROL_MS
          const angle = patrolT * 2 * Math.PI
          pos = [
            d.target[0] + PATROL_RADIUS * Math.cos(angle),
            d.target[1] + PATROL_RADIUS * Math.sin(angle),
          ]
          d.traveled.setLatLngs([d.origin, d.target])
          d.remaining.setLatLngs([])
          d.patrolCircle.setLatLng(d.target)
          d.patrolCircle.setRadius(4_200)
        } else if (phaseMs < totalMissionTime) {
          status = 'returning'
          const p = (phaseMs - EN_ROUTE_MS - PATROL_MS) / RETURN_MS
          pos = lerp(d.target, d.origin, p)
          d.traveled.setLatLngs([d.origin, d.target])
          d.remaining.setLatLngs([pos, d.origin])
          d.patrolCircle.setRadius(0)
        } else {
          status = 'returned'
          pos = d.origin
          d.traveled.setLatLngs([d.origin, d.target])
          d.remaining.setLatLngs([])
          d.patrolCircle.setRadius(0)
          returned += 1
        }

        d.marker.setLatLng(pos)
        d.etaMarker.setLatLng([pos[0] + 0.03, pos[1] + 0.03])
        d.etaMarker.setIcon(etaIcon(left, d.color))
        if (status === 'returned') d.etaMarker.remove()
      })

      if (!doneRef.current && returned === drones.length && drones.length > 0) {
        doneRef.current = true
        onDronesReturned?.()
      }
    }, TICK_MS)

    return clearAll
  }, [map, activeAlert, missions, onDronesReturned, totalMissionTime])

  return null
}
