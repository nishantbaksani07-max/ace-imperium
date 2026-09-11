'use client'

import { useState, useRef, useEffect } from 'react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function MentorChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [mode, setMode] = useState('chat')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  async function sendMessage() {
    if (!draft.trim() || sending) return
    const userMsg: ChatMessage = { role: 'user', content: draft }
    setMessages(prev => [...prev, userMsg])
    setDraft('')
    setSending(true)
    try {
      const res = await fetch('/api/business/imperium', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `mode=${mode}\n\n${draft}` }],
          mode,
        }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error connecting to Imperium.' }])
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <main className="business-page imperium-page">
      <h1 className="business-heading">Imperium Business Mentor</h1>
      <div className="imperium-modes">
        {['morning_briefing', 'pre_visit', 'post_day', 'chat'].map(m => (
          <button
            key={m}
            className={`mode-chip ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m === 'morning_briefing' ? 'Morning Briefing' :
             m === 'pre_visit' ? 'Pre-Visit Brief' :
             m === 'post_day' ? 'Post-Day' : 'Chat'}
          </button>
        ))}
      </div>
      <div className="chat-thread">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Ask Imperium about your business.</p>
            <p className="text-muted">Try: "How's my stock looking?" or "What should I focus on today?"</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-message ${m.role}`}>
            {m.content}
          </div>
        ))}
        {sending && <div className="chat-message assistant"><span className="dots">Thinking...</span></div>}
        <div ref={chatEndRef} />
      </div>
      <form className="chat-composer" onSubmit={e => { e.preventDefault(); sendMessage() }}>
        <textarea
          className="chat-input"
          placeholder={`Ask Imperium (${mode})...`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={sending}
        />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim() || sending}>
          Send
        </button>
      </form>
    </main>
  )
}
