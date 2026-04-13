import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { GOVERNORATES, RISK_COLORS, SOURCE_ICON } from '../../constants/grid'

// Merge weatherMap (keyed by region name) into governorate list
function mergeWeather(govs, weatherMap = {}) {
  return govs.map((g) => {
    const w = weatherMap[g.name]
    return {
      ...g,
      live_wind:       w ? w.wind_ms    : g.mock_wind,
      live_irradiance: w ? w.irradiance : g.mock_irradiance,
      live_output_mw:  w ? w.output_mw  : g.mock_mw,
      live_risk:       w ? w.risk_level : g.mock_risk,
    }
  })
}

function createIcon(risk) {
  const color = RISK_COLORS[risk] || '#00ff88'
  const isPulse = risk === 'CRITICAL' || risk === 'HIGH'
  const size = risk === 'CRITICAL' ? 16 : risk === 'HIGH' ? 14 : 12
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:${size + 12}px;height:${size + 12}px;">
        ${isPulse ? `
          <div style="
            position:absolute;
            width:${size + 12}px;height:${size + 12}px;
            border-radius:50%;
            border:1.5px solid ${color};
            opacity:0.4;
            animation:droneRing 2s ease-out infinite;
          "></div>` : ''}
        <div style="
          width:${size}px;height:${size}px;
          background:${color};
          border-radius:50%;
          box-shadow:0 0 ${isPulse ? 14 : 8}px ${color},0 0 ${isPulse ? 28 : 16}px ${color}55;
          border:1.5px solid ${color}cc;
          flex-shrink:0;
        "></div>
      </div>`,
    iconSize: [size + 12, size + 12],
    iconAnchor: [(size + 12) / 2, (size + 12) / 2],
    popupAnchor: [0, -(size + 12) / 2],
  })
}

function buildPopup(gov) {
  const risk = gov.live_risk || gov.mock_risk
  const color = RISK_COLORS[risk] || '#00ff88'
  const sourceIcon = SOURCE_ICON[gov.source] || '⚡'
  const outputMw = gov.live_output_mw ?? gov.mock_mw
  return `
    <div style="padding:12px 14px;min-width:180px;font-family:'Inter',sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-size:0.9rem;font-weight:700;color:#e2e8f0;">${gov.name}</div>
        <span style="
          font-family:'JetBrains Mono',monospace;font-size:0.58rem;font-weight:700;
          padding:2px 6px;border-radius:4px;letter-spacing:0.08em;
          color:${color};border:1px solid ${color}66;background:${color}15;
        ">${risk}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.75rem;">
        <div>
          <div style="color:#8899aa;margin-bottom:2px;font-size:0.62rem;text-transform:uppercase;letter-spacing:0.06em;">Source</div>
          <div style="color:#e2e8f0;">${sourceIcon} ${gov.source}</div>
        </div>
        <div>
          <div style="color:#8899aa;margin-bottom:2px;font-size:0.62rem;text-transform:uppercase;letter-spacing:0.06em;">Output</div>
          <div style="font-family:'JetBrains Mono',monospace;color:${color};">${outputMw} MW</div>
        </div>
        <div>
          <div style="color:#8899aa;margin-bottom:2px;font-size:0.62rem;text-transform:uppercase;letter-spacing:0.06em;">Wind</div>
          <div style="font-family:'JetBrains Mono',monospace;color:#e2e8f0;">${(gov.live_wind || gov.mock_wind || 0).toFixed(1)} m/s</div>
        </div>
        <div>
          <div style="color:#8899aa;margin-bottom:2px;font-size:0.62rem;text-transform:uppercase;letter-spacing:0.06em;">Irradiance</div>
          <div style="font-family:'JetBrains Mono',monospace;color:#e2e8f0;">${Math.round(gov.live_irradiance || gov.mock_irradiance || 0)} W/m²</div>
        </div>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,255,136,0.1);font-size:0.65rem;color:#8899aa;">
        ${gov.region} · ${gov.hasBackend ? '<span style="color:#00ff88;">Live data</span>' : '<span style="color:#4a5568;">Simulated</span>'}
      </div>
    </div>`
}

export default function TunisiaMap({ weatherMap = {}, selectedGov, onSelectGov, liveRiskMap = {}, style = {} }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const markersRef   = useRef([])

  useEffect(() => {
    if (!containerRef.current) return

    const map = L.map(containerRef.current, {
      center: [34.0, 9.2],
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
    })

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '© OpenStreetMap · © CARTO',
        subdomains: 'abcd',
        maxZoom: 18,
      }
    ).addTo(map)

    // Position zoom control
    map.zoomControl.setPosition('bottomright')

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update markers when data changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear old markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    const govs = mergeWeather(GOVERNORATES, weatherMap)

    govs.forEach((gov) => {
      // Prefer weatherMap risk, then liveRiskMap, then mock
      const risk   = gov.live_risk || liveRiskMap[gov.name] || gov.mock_risk
      const icon   = createIcon(risk)
      const marker = L.marker([gov.lat, gov.lon], { icon })

      // Pass effective risk into popup so it shows the live value
      marker.bindPopup(buildPopup({ ...gov, mock_risk: risk }), { maxWidth: 240, minWidth: 200 })

      marker.on('click', () => {
        if (onSelectGov) onSelectGov(gov)
      })

      marker.addTo(map)
      markersRef.current.push(marker)
    })
  }, [weatherMap, onSelectGov, liveRiskMap])

  // Pan to selected governorate
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedGov) return
    map.flyTo([selectedGov.lat, selectedGov.lon], 8, { duration: 1.2 })
  }, [selectedGov])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        ...style,
      }}
    />
  )
}
