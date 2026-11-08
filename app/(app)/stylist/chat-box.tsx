'use client'
import { useState } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string }

export function ChatBox() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  async function send(e: React.FormEvent) {
    e.preventDefault()
    const q = text.trim()
    if (!q || busy) return
    const next: Msg[] = [...msgs, { role: 'user', content: q }]
    setMsgs(next); setText(''); setBusy(true)
    const r = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next }) })
    const j = await r.json().catch(() => ({}))
    setMsgs([...next, { role: 'assistant', content: r.ok ? j.text : `No pude responder: ${j.error ?? 'error'}` }])
    setBusy(false)
  }
  return (
    <div className="chat">
      {msgs.map((m, i) => (
        <div key={i} className={`msg ${m.role === 'user' ? 'u' : ''}`}><b>{m.role === 'user' ? 'Tú' : 'Estilista'}</b><br />{m.content}</div>
      ))}
      <form onSubmit={send} className="stack">
        <label>Tu pregunta<input value={text} onChange={(e) => setText(e.target.value)} placeholder="¿Qué pantalón me conviene probar primero?" /></label>
        <div className="btns"><button className="btn primary" disabled={busy}>{busy ? 'Pensando…' : 'Preguntar'}</button></div>
      </form>
    </div>
  )
}
