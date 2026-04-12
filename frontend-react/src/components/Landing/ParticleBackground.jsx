import { useEffect, useRef } from 'react'

const PARTICLE_COUNT = 90
const MAX_DIST       = 130
const PARTICLE_SPEED = 0.3

function rand(min, max) {
  return Math.random() * (max - min) + min
}

export default function ParticleBackground() {
  const canvasRef = useRef(null)
  const stateRef  = useRef({ particles: [], animId: null, mouse: { x: -999, y: -999 } })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Init particles
    const particles = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x:   rand(0, canvas.width),
        y:   rand(0, canvas.height),
        vx:  rand(-PARTICLE_SPEED, PARTICLE_SPEED),
        vy:  rand(-PARTICLE_SPEED, PARTICLE_SPEED),
        r:   rand(1, 2.5),
        // alternate accent / secondary
        color: i % 5 === 0 ? '#06b6d4' : '#00ff88',
        opacity: rand(0.25, 0.7),
      })
    }
    stateRef.current.particles = particles

    const onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect()
      stateRef.current.mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    canvas.addEventListener('mousemove', onMouseMove)

    const draw = () => {
      const { particles, mouse } = stateRef.current
      const w = canvas.width
      const h = canvas.height

      ctx.clearRect(0, 0, w, h)

      // Update & draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        // Subtle mouse repulsion
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 80) {
          const force = (80 - dist) / 80
          p.vx += (dx / dist) * force * 0.08
          p.vy += (dy / dist) * force * 0.08
        }

        // Speed cap
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (speed > 1.2) { p.vx *= 0.95; p.vy *= 0.95 }

        p.x += p.vx
        p.y += p.vy

        // Wrap edges
        if (p.x < 0) p.x = w
        if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h
        if (p.y > h) p.y = 0

        // Draw dot
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.opacity
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Draw connecting lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i]
          const b = particles[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d  = Math.sqrt(dx * dx + dy * dy)
          if (d < MAX_DIST) {
            const alpha = (1 - d / MAX_DIST) * 0.18
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = a.color === '#06b6d4' || b.color === '#06b6d4' ? '#06b6d4' : '#00ff88'
            ctx.globalAlpha = alpha
            ctx.lineWidth   = 0.8
            ctx.stroke()
            ctx.globalAlpha = 1
          }
        }
      }

      stateRef.current.animId = requestAnimationFrame(draw)
    }

    stateRef.current.animId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(stateRef.current.animId)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}
