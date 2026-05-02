const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

function getApiKey(): string {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!key) throw new Error('ยังไม่ได้ตั้งค่า VITE_ANTHROPIC_API_KEY ในไฟล์ .env')
  return key
}

export async function callClaude(prompt: string, systemPrompt: string): Promise<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `HTTP ${response.status}`)
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>
  }
  const block = data.content?.[0]
  if (block?.type === 'text' && block.text) return block.text
  throw new Error('รูปแบบคำตอบจาก API ไม่ถูกต้อง')
}

function parseSseDataLines(chunk: string): string[] {
  const datas: string[] = []
  for (const line of chunk.split('\n')) {
    const t = line.trim()
    if (t.startsWith('data:')) datas.push(t.slice(5).trim())
  }
  return datas
}

export async function streamClaude(
  prompt: string,
  systemPrompt: string,
  onDelta: (text: string) => void,
  maxTokens = 4096,
): Promise<void> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `HTTP ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('ไม่สามารถอ่านสตรีมได้')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      for (const data of parseSseDataLines(part)) {
        if (!data || data === '[DONE]') continue
        try {
          const json = JSON.parse(data) as {
            type?: string
            delta?: { type?: string; text?: string }
          }
          if (json.type === 'content_block_delta') {
            const t = json.delta?.text
            if (t) onDelta(t)
          }
        } catch {
          /* ignore partial JSON */
        }
      }
    }
  }

  if (buffer.trim()) {
    for (const data of parseSseDataLines(buffer)) {
      if (!data || data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          type?: string
          delta?: { type?: string; text?: string }
        }
        if (json.type === 'content_block_delta') {
          const t = json.delta?.text
          if (t) onDelta(t)
        }
      } catch {
        /* */
      }
    }
  }
}
