// Spawns the real MCP server over stdio against a throwaway data folder.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
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
      'fitscout_approve_messages', 'fitscout_linkedin_queue', 'fitscout_log_reply', 'fitscout_suppress', 'fitscout_import_openoutreach', 'fitscout_research_plan', 'fitscout_save_research']) {
      assert.ok(names.includes(n), `missing ${n}`)
    }
    assert.ok(!names.includes('fitscout_find_with_openoutreach'))
    assert.ok(!names.includes('fitscout_openoutreach_status'))
    for(const name of ['fitscout_premium_status','fitscout_premium_quote','fitscout_premium_run','fitscout_premium_job','fitscout_premium_cancel','fitscout_scanner_state','fitscout_save_scan','fitscout_run_scan','fitscout_growth_state','fitscout_opportunity_scan','fitscout_watch_save','fitscout_watch_check','fitscout_content_brief','fitscout_discovery_quote'])assert.ok(names.includes(name))
    const premium=await client.callTool({name:'fitscout_premium_status',arguments:{}})
    assert.equal(premium.isError,true)
    const call = async (name, args = {}) => {
      const r = await client.callTool({ name, arguments: args })
      assert.ok(!r.isError, `${name} failed: ${r.content?.[0]?.text}`)
      return JSON.parse(r.content[0].text)
    }
    const c = await call('fitscout_create_campaign', { name: 'MCP test', offer: 'Fictional', icp: { industries: ['HVAC'] } })
    const plan = await call('fitscout_research_plan', { campaign_id: c.id, count: 5 })
    assert.equal(plan.budget.provider_credits, 0)
    const added = await call('fitscout_add_leads', { campaign_id: c.id, leads: [{ company: 'Fictional HVAC', email: 'info@hvac.test', source: 'claude_research' }] })
    assert.equal(added.added, 1)
    const ov = await call('fitscout_overview')
    assert.equal(ov.campaigns[0].leads, 1)
    assert.equal(ov.sender_ready, false)
    const csv = join(dataDir, 'openoutreach.csv')
    writeFileSync(csv, 'email,first_name,last_name,company,title,website,linkedin_url,reason,lead_id,qualified_at\n,Sam,Demo,Fictional,Owner,fictional.test,,Fits the sample ICP,123,2026-11-12\n')
    const preview = await call('fitscout_import_openoutreach', { campaign_id: c.id, path: csv, preview_only: true })
    assert.equal(preview.rows, 1)
    assert.equal((await call('fitscout_overview')).campaigns[0].leads, 1)
    const imported = await call('fitscout_import_openoutreach', { campaign_id: c.id, path: csv })
    assert.equal(imported.added, 1)
    assert.equal((await call('fitscout_import_csv', { campaign_id: c.id, path: csv })).duplicates, 1)
    const bad = await client.callTool({ name: 'fitscout_get_lead', arguments: { lead_id: 'nope' } })
    assert.equal(JSON.parse(bad.content[0].text), null)
  } finally {
    await client.close()
  }
})
