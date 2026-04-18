import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { sendMessageToRAG } from '../../services/api'
import { RISK_COLORS } from '../../constants/grid'

// ─── Streaming hook ───────────────────────────────────────────────────────────
// Streams `target` character-by-character when `active` is true.
function useStreamText(target, active) {
  const [text, setText]   = useState('')
  const [done, setDone]   = useState(false)
  const timerRef          = useRef(null)
  const idxRef            = useRef(0)

  useEffect(() => {
    if (!active || !target) {
      setText(target || '')
      setDone(true)
      return
    }
    clearInterval(timerRef.current)
    setText('')
    setDone(false)
    idxRef.current = 0

    timerRef.current = setInterval(() => {
      idxRef.current += 5
      if (idxRef.current >= target.length) {
        setText(target)
        setDone(true)
        clearInterval(timerRef.current)
      } else {
        setText(target.slice(0, idxRef.current))
      }
    }, 12)

    return () => clearInterval(timerRef.current)
  }, [target, active])

  return { text, done }
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, isStreaming, streamedText, locale }) {
  const isUser    = msg.role === 'user'
  const content   = isStreaming ? streamedText : msg.content
  const showCursor = isStreaming && !isUser

  const ts = msg.timestamp
    ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(msg.timestamp))
    : ''

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <div style={{ maxWidth: '80%' }}>
          <div
            style={{
              background: 'rgba(0,255,136,0.1)',
              border: '1px solid rgba(0,255,136,0.25)',
              borderRadius: '10px 10px 2px 10px',
              padding: '8px 12px',
              fontSize: '0.78rem',
              color: '#e2e8f0',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {msg.content}
          </div>
          <div style={{ fontSize: '0.55rem', color: '#4a5568', textAlign: 'right', marginTop: '3px' }}>{ts}</div>
        </div>
      </div>
    )
  }

  // AI message
  const isError    = msg.error
  const isRejected = msg.rejected
  const accentColor = isError ? '#ff3333' : isRejected ? '#ff9500' : '#00ff88'
  const avatarIcon  = isError ? '✕' : isRejected ? '⚠' : '◈'
  const lines = content.split('\n')

  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'flex-start' }}>
      {/* Avatar */}
      <div
        style={{
          width: '22px',
          height: '22px',
          borderRadius: '5px',
          background: `${accentColor}15`,
          border: `1px solid ${accentColor}35`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.7rem',
          flexShrink: 0,
          marginTop: '2px',
        }}
      >
        {avatarIcon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            background: isError ? 'rgba(255,51,51,0.06)' : '#0d1526',
            border: isError
              ? '1px solid rgba(255,51,51,0.2)'
              : '1px solid rgba(255,255,255,0.06)',
            borderRadius: '2px 10px 10px 10px',
            padding: '8px 12px',
            fontSize: '0.73rem',
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: isError ? "'Inter', sans-serif" : "'JetBrains Mono', monospace",
            color: isError ? '#ff9999' : undefined,
          }}
        >
          {isError ? (
            content
          ) : (
            <>
              {lines.map((line, i) => {
                const isSection  = /^[A-Z][A-Z\s\-–·:]{4,}$/.test(line.trim()) && line.trim().length > 0
                const isHeader   = line.startsWith('▸') || line.startsWith('CURRENT') || line.startsWith('AUGUST') || line.startsWith('STEG') || line.startsWith('NOOG') || line.startsWith('TUNIS')
                const isCritical = line.includes('CRITICAL') || line.includes('IMMEDIATE') || line.includes('EMERGENCY') || line.includes('DEFICIT')
                const isGood     = line.includes('✓') || line.includes('Surplus') || line.includes('NOMINAL') || line.includes('No action')
                const isSep      = line.startsWith('─') || line.startsWith('  ─')
                const isFooter   = line.startsWith('Source:') || line.startsWith('Policy Ref') || line.startsWith('NoorGrid:')

                return (
                  <div
                    key={i}
                    style={{
                      color: isSep || isFooter ? '#2a3a4a'
                           : isSection        ? '#06b6d4'
                           : isHeader         ? (isRejected ? '#ff9500' : '#00ff88')
                           : isCritical       ? '#ff6666'
                           : isGood           ? '#00ff88'
                           : '#c8d8e8',
                      fontWeight: isSection ? 700 : 400,
                      marginTop: isSection ? '2px' : 0,
                    }}
                  >
                    {line || '\u00A0'}
                  </div>
                )
              })}
              {showCursor && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '12px',
                    background: '#00ff88',
                    verticalAlign: 'text-bottom',
                    animation: 'blink 0.7s step-end infinite',
                    borderRadius: '1px',
                    marginLeft: '2px',
                  }}
                />
              )}
            </>
          )}
        </div>
        <div style={{ marginTop: '3px' }}>
          <span style={{ fontSize: '0.55rem', color: '#4a5568' }}>{ts}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator({ t }) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'flex-start' }}>
      <div
        style={{
          width: '22px', height: '22px', borderRadius: '5px',
          background: 'rgba(0,255,136,0.12)',
          border: '1px solid rgba(0,255,136,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.7rem', flexShrink: 0, marginTop: '2px',
        }}
      >
        ◈
      </div>
      <div
        style={{
          background: '#0d1526',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '2px 10px 10px 10px',
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: '5px', height: '5px', borderRadius: '50%',
              background: '#00ff88',
              animation: `livePulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              opacity: 0.7,
            }}
          />
        ))}
        <span style={{ fontSize: '0.62rem', color: '#4a5568', marginLeft: '4px', fontFamily: "'JetBrains Mono', monospace" }}>
          {t('chatbot.querying')}
        </span>
      </div>
    </div>
  )
}

// ─── Core chat component ──────────────────────────────────────────────────────
export default function STEGChatbot({ context = {}, style = {}, height = 480 }) {
  const { t, i18n } = useTranslation()
  const uiLocale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const welcomeMessage = useMemo(() => ({
    id: 0,
    role: 'assistant',
    content: t('chatbot.welcome'),
    timestamp: new Date(),
  }), [t, i18n.language])
  const suggestedQuestions = useMemo(() => ([
    t('chatbot.suggested.cause'),
    t('chatbot.suggested.targets'),
    t('chatbot.suggested.riskCalc'),
    t('chatbot.suggested.interconnector'),
    t('chatbot.suggested.maintenance'),
  ]), [t, i18n.language])

  const [messages, setMessages]       = useState([welcomeMessage])
  const [input, setInput]             = useState('')
  const [isLoading, setIsLoading]     = useState(false)
  const [streamingId, setStreamingId] = useState(null)
  const [streamTarget, setStreamTarget] = useState('')
  const scrollRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    setMessages([welcomeMessage])
    setInput('')
    setIsLoading(false)
    setStreamingId(null)
    setStreamTarget('')
  }, [welcomeMessage])

  // Stream the latest AI message
  const { text: streamedText, done: streamDone } = useStreamText(streamTarget, streamingId !== null)

  // Clear streamingId once done
  useEffect(() => {
    if (streamDone && streamingId !== null) {
      setStreamingId(null)
      setStreamTarget('')
    }
  }, [streamDone, streamingId])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamedText, isLoading])

  const send = useCallback(async (text) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    const { content, rejected, error } = await sendMessageToRAG(trimmed, context)
    const aiId = Date.now() + 1
    const aiMsg = {
      id: aiId,
      role: 'assistant',
      content,
      timestamp: new Date(),
      rejected,
      error,
    }

    setMessages((prev) => [...prev, aiMsg])
    setIsLoading(false)

    // Don't stream error messages — show them instantly
    if (!error) {
      setStreamTarget(content)
      setStreamingId(aiId)
    }
  }, [isLoading, context])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const showSuggested = messages.length <= 1 && !isLoading

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(6,10,20,0.9)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(0,255,136,0.15)',
        borderRadius: '10px',
        overflow: 'hidden',
        height: `${height}px`,
        boxShadow: '0 0 40px rgba(0,255,136,0.04)',
        ...style,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid rgba(0,255,136,0.1)',
          background: 'linear-gradient(90deg, rgba(0,255,136,0.06) 0%, transparent 100%)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '26px', height: '26px', borderRadius: '6px',
              background: 'rgba(0,255,136,0.12)',
              border: '1px solid rgba(0,255,136,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.85rem',
            }}
          >
            ◈
          </div>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', fontWeight: 700, color: '#00ff88', letterSpacing: '0.06em' }}>
              {t('chatbot.title')}
            </div>
            <div style={{ fontSize: '0.58rem', color: '#8899aa', marginTop: '1px' }}>
              {t('chatbot.subtitle')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div className="live-dot" style={{ background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
              <span style={{ fontSize: '0.58rem', color: '#00ff88', letterSpacing: '0.08em' }}>{t('chatbot.analyzing')}</span>
            </div>
          )}
          <div
            style={{
              fontSize: '0.58rem', fontWeight: 700, color: '#06b6d4',
              background: 'rgba(6,182,212,0.08)',
              border: '1px solid rgba(6,182,212,0.2)',
              borderRadius: '3px', padding: '2px 6px', letterSpacing: '0.05em',
            }}
          >
            {t('chatbot.badge')}
          </div>
        </div>
      </div>

      {/* ── Messages ── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 12px 4px',
          minHeight: 0,
        }}
      >
        {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isStreaming={msg.id === streamingId}
              streamedText={streamedText}
              locale={uiLocale}
            />
        ))}
        {isLoading && <TypingIndicator t={t} />}
      </div>

      {/* ── Suggested questions ── */}
      {showSuggested && (
        <div
          style={{
            padding: '6px 12px',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '5px',
            flexShrink: 0,
          }}
        >
          {suggestedQuestions.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              style={{
                background: 'rgba(6,182,212,0.06)',
                border: '1px solid rgba(6,182,212,0.2)',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '0.62rem',
                color: '#06b6d4',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { e.target.style.background = 'rgba(6,182,212,0.14)'; e.target.style.borderColor = 'rgba(6,182,212,0.4)' }}
              onMouseLeave={(e) => { e.target.style.background = 'rgba(6,182,212,0.06)'; e.target.style.borderColor = 'rgba(6,182,212,0.2)' }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* ── Input ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          padding: '10px 12px',
          borderTop: '1px solid rgba(0,255,136,0.1)',
          background: 'rgba(0,0,0,0.2)',
          flexShrink: 0,
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('chatbot.placeholder')}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(0,255,136,0.15)',
            borderRadius: '6px',
            padding: '8px 10px',
            fontSize: '0.73rem',
            color: '#e2e8f0',
            fontFamily: "'Inter', sans-serif",
            outline: 'none',
            maxHeight: '80px',
            lineHeight: 1.5,
            caretColor: '#00ff88',
            overflowY: 'auto',
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'rgba(0,255,136,0.4)' }}
          onBlur={(e) => { e.target.style.borderColor = 'rgba(0,255,136,0.15)' }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || isLoading}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            background: input.trim() && !isLoading ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${input.trim() && !isLoading ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.08)'}`,
            cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.85rem',
            color: input.trim() && !isLoading ? '#00ff88' : '#4a5568',
            flexShrink: 0,
            transition: 'all 0.15s',
          }}
        >
          {isLoading ? '…' : '↑'}
        </button>
      </div>

      {/* ── Footer hint ── */}
      <div
        style={{
          padding: '4px 12px 6px',
          fontSize: '0.55rem',
          color: '#2a3a4a',
          fontFamily: "'JetBrains Mono', monospace",
          flexShrink: 0,
        }}
      >
        {t('chatbot.footerHint')}
      </div>
    </div>
  )
}

// ─── Floating Chat Widget (for Dashboard) ────────────────────────────────────
export function ChatWidget({ context = {} }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Expanded panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: '72px',
            right: '20px',
            width: '360px',
            zIndex: 1000,
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 8px 48px rgba(0,0,0,0.6), 0 0 40px rgba(0,255,136,0.06)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {/* Title bar with close */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: '#060a14',
              borderBottom: '1px solid rgba(0,255,136,0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#00ff88', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em' }}>
                ◈ {t('chatbot.widgetTitle')}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#8899aa',
                cursor: 'pointer',
                fontSize: '1rem',
                lineHeight: 1,
                padding: '0 2px',
              }}
            >
              ✕
            </button>
          </div>
          <STEGChatbot context={context} height={460} style={{ borderRadius: 0, border: 'none' }} />
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={t('chatbot.widgetTooltip')}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: open ? 'rgba(0,255,136,0.2)' : 'rgba(6,10,20,0.95)',
          border: `2px solid ${open ? '#00ff88' : 'rgba(0,255,136,0.35)'}`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.1rem',
          color: '#00ff88',
          zIndex: 1001,
          boxShadow: `0 0 20px rgba(0,255,136,${open ? '0.25' : '0.1'})`,
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 28px rgba(0,255,136,0.3)' }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = `0 0 20px rgba(0,255,136,${open ? '0.25' : '0.1'})` }}
      >
        {open ? '✕' : '◈'}
      </button>
    </>
  )
}
