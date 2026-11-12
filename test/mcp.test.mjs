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
    env: { ...process.env, FITSCOUT_DATA_DIR: dataDir },
    stderr: 'pipe',
  })
  const client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(transport)
  try {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name)
    for (const n of ['fitscout_overview', 'fitscout_create_campaign', 'fitscout_add_leads', 'fitscout_save_drafts',
      'fitscout_approve_messages', 'fitscout_linkedin_queue', 'fitscout_log_reply', 'fitscout_suppress']) {
      assert.ok(names.includes(n), `missing ${n}`)
    }
    const call = async (name, args = {}) => {
      const r = await client.callTool({ name, arguments: args })
      assert.ok(!r.isError, `${name} failed: ${r.content?.[0]?.text}`)
      return JSON.parse(r.content[0].text)
    }
    const c = await call('fitscout_create_campaign', { name: 'MCP test', offer: 'Fictional', icp: { industries: ['HVAC'] } })
    const added = await call('fitscout_add_leads', { campaign_id: c.id, leads: [{ company: 'Fictional HVAC', email: 'info@hvac.test', source: 'claude_research' }] })
    assert.equal(added.added, 1)
    const ov = await call('fitscout_overview')
    assert.equal(ov.campaigns[0].leads, 1)
    assert.equal(ov.sender_ready, false)
    const bad = await client.callTool({ name: 'fitscout_get_lead', arguments: { lead_id: 'nope' } })
    assert.equal(JSON.parse(bad.content[0].text), null)
  } finally {
    await client.close()
  }
})
