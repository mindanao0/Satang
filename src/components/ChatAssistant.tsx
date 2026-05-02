import { useCallback, useEffect, useRef, useState } from 'react'
import { getAllStoragePayload } from '../lib/storage'
import { streamGroqChat } from '../lib/groq'
import { Spinner } from './Spinner'

type ChatMessage = { role: 'user' | 'assistant'; text: string }

export function ChatAssistant() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming, open])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')

    const data = JSON.stringify(getAllStoragePayload())
    const system = `คุณคือที่ปรึกษาการเงินส่วนตัว ตอบเป็นภาษาไทย ข้อมูลผู้ใช้: ${data}`

    const chatMessages: { role: 'user' | 'assistant'; content: string }[] = [
      ...messages.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user', content: text },
    ]

    setMessages((m) => [...m, { role: 'user', text }, { role: 'assistant', text: '' }])
    setStreaming(true)

    let assistant = ''

    try {
      await streamGroqChat(
        system,
        chatMessages,
        (delta) => {
          assistant += delta
          setMessages((m) => {
            const copy = [...m]
            const last = copy[copy.length - 1]
            if (last?.role === 'assistant') {
              copy[copy.length - 1] = { role: 'assistant', text: assistant }
            }
            return copy
          })
        },
        4096,
      )
    } catch {
      setMessages((m) => {
        const copy = [...m]
        const last = copy[copy.length - 1]
        if (last?.role === 'assistant' && !last.text) {
          copy[copy.length - 1] = {
            role: 'assistant',
            text: 'ขออภัย ไม่สามารถเชื่อมต่อ AI ได้ กรุณาตรวจสอบ API Key',
          }
        }
        return copy
      })
    } finally {
      setStreaming(false)
    }
  }, [input, streaming, messages])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-800 text-white shadow-lg hover:bg-blue-900 dark:bg-sky-700 dark:hover:bg-sky-600 md:bottom-8 md:right-8"
        aria-label="เปิดผู้ช่วยแชท"
      >
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-end bg-black/40 p-4 dark:bg-black/60 md:items-center md:justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="ผู้ช่วยการเงิน"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl dark:border dark:border-slate-600 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">ผู้ช่วย AI</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">ถามเรื่องการเงินได้ตลอด</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="ปิด"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">พิมพ์คำถามเพื่อเริ่มสนทนา</p>
              ) : null}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-blue-800 text-white dark:bg-sky-700'
                        : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {msg.text || (streaming && i === messages.length - 1 ? '…' : '')}
                  </div>
                </div>
              ))}
              {streaming ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Spinner className="!h-4 !w-4" /> กำลังตอบ...
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-slate-200 p-3 dark:border-slate-700">
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="พิมพ์ข้อความ..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  disabled={streaming}
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={streaming || !input.trim()}
                  className="rounded-xl bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-50 dark:bg-sky-700 dark:hover:bg-sky-600"
                >
                  ส่ง
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
