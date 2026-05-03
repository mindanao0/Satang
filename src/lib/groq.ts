const API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

function getApiKey(): string {
  return import.meta.env.VITE_GROQ_API_KEY as string
}

export async function callGroq(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  maxTokens = 1024,
): Promise<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `HTTP ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  throw new Error('รูปแบบคำตอบจาก API ไม่ถูกต้อง')
}

async function readGroqSseStream(
  response: Response,
  onDelta: (text: string) => void,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('ไม่สามารถอ่านสตรีมได้')

  const decoder = new TextDecoder()
  let buffer = ''

  const flushLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const data = trimmed.slice(5).trim()
    if (!data || data === '[DONE]') return
    try {
      const json = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>
      }
      const piece = json.choices?.[0]?.delta?.content
      if (piece) onDelta(piece)
    } catch {
      /* chunk ไม่สมบูรณ์ */
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) flushLine(line)
  }

  for (const line of buffer.split('\n')) flushLine(line)
}

/** ข้อความ user เดียว + system */
export async function streamGroq(
  prompt: string,
  systemPrompt: string,
  onDelta: (text: string) => void,
  maxTokens = 2048,
): Promise<void> {
  await streamGroqChat(systemPrompt, [{ role: 'user', content: prompt }], onDelta, maxTokens)
}

/** หลายข้อความ (เช่น แชทมีประวัติ) — ไม่รวม system ใน chatMessages */
export async function streamGroqChat(
  systemPrompt: string,
  chatMessages: { role: 'user' | 'assistant'; content: string }[],
  onDelta: (text: string) => void,
  maxTokens = 4096,
): Promise<void> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      stream: true,
      messages: [{ role: 'system', content: systemPrompt }, ...chatMessages],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `HTTP ${response.status}`)
  }

  await readGroqSseStream(response, onDelta)
}
