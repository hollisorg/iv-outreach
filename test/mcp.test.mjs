// Spawns the real MCP server over stdio against a throwaway data folder.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const server = fileURLToPath(new URL('../src/mcp/server.js', import.meta.url))

test('MCP server lists tools and runs a campaign round trip', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'lw-mcp-'))
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [server],
    env: { ...process.env, LEADWELL_DATA_DIR: dataDir },
    stderr: 'pipe',
  })
  const client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(transport)
  try {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name)
    for (const n of ['leadwell_overview', 'leadwell_create_campaign', 'leadwell_add_leads', 'leadwell_save_drafts',
      'leadwell_approve_messages', 'leadwell_linkedin_queue', 'leadwell_log_reply', 'leadwell_suppress']) {
      assert.ok(names.includes(n), `missing ${n}`)
    }
    const call = async (name, args = {}) => {
      const r = await client.callTool({ name, arguments: args })
      assert.ok(!r.isError, `${name} failed: ${r.content?.[0]?.text}`)
      return JSON.parse(r.content[0].text)
    }
    const c = await call('leadwell_create_campaign', { name: 'MCP test', offer: 'Fictional', icp: { industries: ['HVAC'] } })
    const added = await call('leadwell_add_leads', { campaign_id: c.id, leads: [{ company: 'Fictional HVAC', email: 'info@hvac.test', source: 'claude_research' }] })
    assert.equal(added.added, 1)
    const ov = await call('leadwell_overview')
    assert.equal(ov.campaigns[0].leads, 1)
    assert.equal(ov.sender_ready, false)
    const bad = await client.callTool({ name: 'leadwell_get_lead', arguments: { lead_id: 'nope' } })
    assert.equal(JSON.parse(bad.content[0].text), null)
  } finally {
    await client.close()
  }
})
