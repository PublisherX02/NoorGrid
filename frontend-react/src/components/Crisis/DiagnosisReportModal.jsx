import { useMemo, useState } from 'react'
import { RISK_COLORS } from '../../constants/grid'
import { sendReport } from '../../services/api'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildEmailHtml(report) {
  const riskColor = RISK_COLORS[report.risk_level] || '#00c46a'
  const cascade = (report.cascade_regions || []).map((c) => `${esc(c.name)} (${esc(c.risk_level)})`).join(', ') || 'None'
  const actions = (report.recommended_actions || [])
    .map((a) => `<li style="margin:0 0 6px 0;">${esc(a)}</li>`)
    .join('')
  let ts
  try { ts = new Date(report.generated_at).toLocaleString('en-GB') } catch { ts = new Date().toLocaleString('en-GB') }

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ffffff;color:#111827;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;margin:0 auto;border-collapse:collapse;">
      <tr><td style="background:#00c46a;color:#ffffff;padding:14px 18px;font-weight:700;font-size:16px;">&#9889; NoorGrid — Opérations réseau STEG</td></tr>
      <tr><td style="background:${riskColor};color:#ffffff;padding:10px 18px;font-size:13px;font-weight:700;">Sévérité : ${esc(report.risk_level)}</td></tr>
      <tr><td style="padding:16px 18px;border-bottom:1px solid #e5e7eb;"><div style="font-size:14px;font-weight:700;margin-bottom:8px;">Aperçu de l'incident</div>
        <div style="font-size:13px;line-height:1.6;">Région : ${esc(report.region)}<br/>Scénario : ${esc(report.scenario_label)}<br/>Source : ${esc(report.source)}<br/>Magnitude : ${esc(report.magnitude_mw)} MW<br/>Généré : ${ts}</div></td></tr>
      <tr><td style="padding:16px 18px;border-bottom:1px solid #e5e7eb;"><div style="font-size:14px;font-weight:700;margin-bottom:8px;">Impact en cascade</div><div style="font-size:13px;line-height:1.6;">${cascade}</div></td></tr>
      <tr><td style="padding:16px 18px;border-bottom:1px solid #e5e7eb;"><div style="font-size:14px;font-weight:700;margin-bottom:8px;">Analyse des causes racines</div><div style="font-size:13px;line-height:1.6;">${esc(report.root_cause)}</div></td></tr>
      <tr><td style="padding:16px 18px;border-bottom:1px solid #e5e7eb;"><div style="font-size:14px;font-weight:700;margin-bottom:8px;">Actions recommandées</div><ol style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;">${actions}</ol></td></tr>
      <tr><td style="padding:16px 18px;border-bottom:1px solid #e5e7eb;"><div style="font-size:14px;font-weight:700;margin-bottom:8px;">Résolution technique</div><div style="font-size:13px;line-height:1.6;">${esc(report.technical_fix)}</div></td></tr>
      <tr><td style="padding:12px 18px;color:#6b7280;font-size:12px;">Généré automatiquement par NoorGrid Intelligence de Crise · ${ts}</td></tr>
    </table>
  </body>
</html>`
}

function Chip({ text, onRemove }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 14, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 12 }}>
      {text}
      <button onClick={onRemove} style={{ border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
    </span>
  )
}

export default function DiagnosisReportModal({ report, onClose, defaultRecipients = [], alertId = null }) {
  const [recipients, setRecipients] = useState(defaultRecipients)
  const [candidate, setCandidate] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const riskColor = RISK_COLORS[report?.risk_level] || '#00ff88'

  const emailHtml = useMemo(() => (report ? buildEmailHtml(report) : ''), [report])

  const addRecipient = () => {
    const value = candidate.trim()
    if (!value || !emailRegex.test(value) || recipients.includes(value)) return
    setRecipients((prev) => [...prev, value])
    setCandidate('')
  }

  const handleSend = async () => {
    if (!report || recipients.length === 0 || sending) return
    setSending(true)
    try {
      await sendReport(recipients, report, alertId)
      setSent(true)
    } catch {
      setSent(false)
    } finally {
      setSending(false)
    }
  }

  if (!report) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: 'min(960px, 100%)', maxHeight: '90vh', overflow: 'auto', borderRadius: 12, border: `1px solid ${riskColor}44`, background: '#0a0f1a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#0d1526', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", color: '#e2e8f0', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em' }}>RAPPORT DE DIAGNOSTIC</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 12 }}>
          <div style={{ background: '#f8fafc', color: '#111827', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, border: `1px solid ${riskColor}`, color: riskColor }}>{report.region}</span>
              <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: '#e2e8f0', color: '#334155' }}>{report.source}</span>
              <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: '#e2e8f0', color: '#334155' }}>{report.magnitude_mw} MW</span>
              <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: '#e2e8f0', color: '#334155' }}>{new Date(report.generated_at).toLocaleString('en-GB')}</span>
            </div>
            {(report.cascade_regions || []).length > 0 && (
              <div style={{ marginBottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(report.cascade_regions || []).map((c) => (
                  <span key={c.name} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, border: `1px solid ${(RISK_COLORS[c.risk_level] || '#94a3b8')}66`, color: RISK_COLORS[c.risk_level] || '#475569' }}>
                    {c.name}
                  </span>
                ))}
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              {(report.prevention_actions || []).map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 12 }}>
                  <input type="checkbox" checked readOnly />
                  <span>{a}</span>
                </div>
              ))}
            </div>

            <div style={{ border: '1px solid #f59e0b66', background: '#fffbeb', borderRadius: 6, padding: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>Cause racine</div>
              <div style={{ fontSize: 12, color: '#374151' }}>{report.root_cause}</div>
            </div>
            <div style={{ border: '1px solid #06b6d466', background: '#ecfeff', borderRadius: 6, padding: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0e7490', marginBottom: 4 }}>Correction technique</div>
              <div style={{ fontSize: 12, color: '#374151' }}>{report.technical_fix}</div>
            </div>
            <div style={{ fontSize: 12, color: '#475569' }}>{report.impact_summary}</div>
          </div>

          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <iframe title="report-email-preview" sandbox="allow-same-origin" srcDoc={emailHtml} style={{ width: '100%', height: 390, border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff' }} />

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {recipients.map((r) => (
                <Chip key={r} text={r} onRemove={() => setRecipients((prev) => prev.filter((x) => x !== r))} />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient() } }}
                placeholder="name@example.com"
                style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 10px', fontSize: 12 }}
              />
              <button onClick={addRecipient} style={{ border: '1px solid #16a34a', background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Ajouter</button>
            </div>

            <button
              onClick={handleSend}
              disabled={sending || recipients.length === 0}
              style={{
                border: `1px solid ${sent ? '#16a34a' : '#15803d'}`,
                background: sent ? '#dcfce7' : '#16a34a',
                color: sent ? '#166534' : '#ffffff',
                borderRadius: 6,
                padding: '9px 12px',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.06em',
                cursor: sending ? 'wait' : 'pointer',
              }}
            >
              {sent ? '✓ RAPPORT ENVOYÉ' : sending ? 'ENVOI EN COURS…' : 'ENVOYER LE RAPPORT'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

