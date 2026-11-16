import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => {
    const path = `${dir}/${entry.name}`
    return entry.isDirectory() ? sourceFiles(path) : path
  }))).flat()
}

test('client source contains no removed provider or AI entry points', async () => {
  for (const path of await sourceFiles('src')) {
    if (!/\.(tsx?|css)$/.test(path)) continue
    const content = await readFile(path, 'utf8')
    assert.doesNotMatch(content, /groq|streamGroq|ChatAssistant|AIAnalysis/i, path)
  }
  assert.doesNotMatch(await readFile('.env.example', 'utf8'), /groq/i)
})

test('old analysis bookmarks redirect and finance pages remain available', async () => {
  const app = await readFile('src/App.tsx', 'utf8')
  assert.match(app, /path="analysis" element={<Navigate to="\/" replace \/>}/)
  for (const page of ['Dashboard', 'Transactions', 'Budget', 'TaxCalculator', 'SavingsPlanner', 'NetWorth', 'Settings']) {
    assert.ok(app.includes(`<${page} />`), page)
  }
  assert.doesNotMatch(await readFile('src/components/Sidebar.tsx', 'utf8'), /to: '\/analysis'/)
})
