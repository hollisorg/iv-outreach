// Running the person's own Claude Code or Codex headless for Fitscout's chat (ported from IV Studio's agentrun.js).
// The agent gets Fitscout's MCP server plus web search and reading web pages (to research real businesses), and
// nothing else: no shell, no files.
import { spawn } from 'node:child_process'

export const AGENT_NAMES = { claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes' }
export const SERVER = 'fitscout'

export const shellQuote = (a) => `"${String(a).replace(/"/g, '\\"')}"`

// Ends the agent and everything it started (its MCP server, a .cmd's node): on Windows a plain kill stops only the
// top process, so the whole tree goes with taskkill; on Mac and Linux the agent starts in its own process group.
export function killTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill())
  else {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill()
    }
  }
}

// An npm install on Windows is a .cmd, which only runs through the shell (each argument quoted, an empty one too).
export function spawnAgent(exe, args, { cwd, env, platform = process.platform } = {}) {
  const viaShell = platform === 'win32' && /\.cmd$/i.test(exe)
  return spawn(viaShell ? `"${exe}"` : exe, viaShell ? args.map(shellQuote) : args, { cwd, windowsHide: true, shell: viaShell, detached: platform !== 'win32', env })
}

const tomlString = (s) => JSON.stringify(String(s))
const tomlTable = (o) => `{${Object.entries(o).map(([k, v]) => `${k}=${tomlString(v)}`).join(',')}}`

// Claude Code: Fitscout's tools plus its own web search and page reading, everything else off. persist keeps the
// session so the next message can --resume it.
export const WEB_TOOLS = ['WebSearch', 'WebFetch']
export function claudeArgs({ mcpConfigFile, promptFile, model = '', persist = true, resume = null }) {
  return [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--tools', WEB_TOOLS.join(','),
    '--mcp-config', mcpConfigFile,
    '--strict-mcp-config',
    '--allowedTools', [`mcp__${SERVER}`, ...WEB_TOOLS].join(','),
    '--permission-mode', 'dontAsk',
    ...(persist ? [] : ['--no-session-persistence']),
    ...(resume ? ['--resume', resume] : []),
    '--append-system-prompt-file', promptFile,
    ...(model ? ['--model', model] : []),
  ]
}

// Codex: `exec` for the first message, `exec resume <thread>` after, read-only sandbox, live web search on, and
// Fitscout's server passed as config (the person's own config is skipped). tool_timeout_sec leaves room for the
// person to answer an Allow card.
export function codexChatArgs({ mcp, model = '', resume = null }) {
  const key = `mcp_servers.${SERVER}`
  return [
    'exec',
    ...(resume ? ['resume'] : []),
    '--json',
    '--skip-git-repo-check',
    '--ignore-user-config',
    ...(model ? ['-m', model] : []),
    '-c', 'model_reasoning_effort="medium"',
    '-c', 'approval_policy="never"',
    '-c', 'sandbox_mode="read-only"',
    '-c', 'web_search="live"',
    '-c', `${key}.command=${tomlString(mcp.command)}`,
    '-c', `${key}.args=${JSON.stringify(mcp.args)}`,
    '-c', `${key}.env=${tomlTable(mcp.env)}`,
    '-c', `${key}.tool_timeout_sec=900`,
    ...(resume ? [resume] : []),
    '-',
  ]
}

// In the in-app chat, the calls that wait for the person's Allow card: why, in plain words, or null to go ahead.
// Approving is the one that matters most: it's what lets outreach go out under the person's name.
export function chatAsk(name, args = {}) {
  const n = (k) => (Array.isArray(args[k]) ? args[k].length : 0)
  if (name === 'fitscout_approve_messages') return `This approves ${n('message_ids')} message${n('message_ids') === 1 ? '' : 's'} to go out under your name. Approved emails wait in Fitscout's send queue (mailbox sending is the next update); LinkedIn notes go on your send list.`
  if (name === 'fitscout_cancel_messages') return `This cancels ${n('message_ids')} unsent message${n('message_ids') === 1 ? '' : 's'}.`
  if (name === 'fitscout_sender_profile' && Object.keys(args).length) return 'This changes your sender profile (who outreach comes from, your postal address or your daily caps).'
  if (name === 'fitscout_update_campaign' && args.status) return `This sets the campaign to ${args.status}.`
  if (name === 'fitscout_mark_linkedin_sent') return 'This records that you sent these LinkedIn notes yourself.'
  if (name === 'fitscout_export_csv') return 'This writes your leads to a file on this PC.'
  return null
}

const LABELS = {
  fitscout_overview: 'Checked where things stand',
  fitscout_sender_profile: 'Looked at your sender profile',
  fitscout_read_website: 'Read a website',
  fitscout_create_campaign: 'Set up a campaign',
  fitscout_update_campaign: 'Updated the campaign',
  fitscout_list_campaigns: 'Looked at your campaigns',
  fitscout_add_leads: 'Added leads',
  fitscout_import_csv: 'Imported a CSV',
  fitscout_enrich_leads: 'Researched lead websites',
  fitscout_list_leads: 'Looked at your leads',
  fitscout_get_lead: 'Opened a lead',
  fitscout_update_lead: 'Updated a lead',
  fitscout_score_leads: 'Scored fit',
  fitscout_save_drafts: 'Wrote drafts',
  fitscout_list_messages: 'Looked at messages',
  fitscout_approve_messages: 'Approved messages',
  fitscout_cancel_messages: 'Cancelled messages',
  fitscout_email_queue: 'Checked the email queue',
  fitscout_linkedin_queue: 'Checked the LinkedIn list',
  fitscout_mark_linkedin_sent: 'Marked LinkedIn notes sent',
  fitscout_log_reply: 'Logged a reply',
  fitscout_suppress: 'Added to do-not-contact',
  fitscout_export_csv: 'Exported leads',
  fitscout_show_in_app: 'Showed you in the app',
  WebSearch: 'Searched the web',
  WebFetch: 'Read a web page',
  web_search: 'Searched the web',
}
export const stepLabel = (tool) => LABELS[tool] || `${String(tool).charAt(0).toUpperCase()}${String(tool).slice(1).replace(/_/g, ' ')}`
const toolOf = (name) => String(name || '').replace(new RegExp(`^mcp__${SERVER}__`), '')

function textOf(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((c) => c?.text || '').join(' ').trim()
  return ''
}

// One line of the agent's output as chat events: session, compact, usage, say, step, stepError, end.
export function parseLine(engine, line) {
  let m
  try {
    m = JSON.parse(line)
  } catch {
    return []
  }
  const out = []
  if (engine === 'claude') {
    if (m.type === 'system' && m.subtype === 'init' && m.session_id) out.push({ type: 'session', id: m.session_id })
    if (m.type === 'system' && m.subtype === 'compact_boundary') out.push({ type: 'compact', trigger: m.compact_metadata?.trigger || 'auto', before: Number(m.compact_metadata?.pre_tokens) || null })
    if (m.type === 'assistant' && m.message?.usage) {
      const u = m.message.usage
      out.push({ type: 'usage', context: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) })
    }
    if (m.type === 'assistant') {
      for (const c of m.message?.content || []) {
        if (c.type === 'text' && c.text?.trim()) out.push({ type: 'say', text: c.text.trim() })
        if (c.type === 'tool_use' || c.type === 'server_tool_use') out.push({ type: 'step', tool: toolOf(c.name), label: stepLabel(toolOf(c.name)), id: c.id })
      }
    } else if (m.type === 'user') {
      for (const c of m.message?.content || []) if (c.type === 'tool_result' && c.is_error) out.push({ type: 'stepError', id: c.tool_use_id, text: textOf(c.content) })
    } else if (m.type === 'result') {
      const u = m.usage || {}
      const mu = Object.entries(m.modelUsage || {})[0]
      out.push({ type: 'usage', turn: { input: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), cached: u.cache_read_input_tokens || 0, output: u.output_tokens || 0, apiUsd: Number(m.total_cost_usd) || 0 }, ...(mu ? { model: mu[0], window: mu[1]?.contextWindow || null } : {}) })
      out.push({ type: 'end', ok: !m.is_error && m.subtype === 'success', text: String(m.result || '').trim() })
    }
    return out
  }
  // codex exec --json
  const it = m.item
  if (m.type === 'thread.started' && m.thread_id) out.push({ type: 'session', id: m.thread_id })
  else if (m.type === 'item.started' && it?.type === 'mcp_tool_call') out.push({ type: 'step', tool: it.tool, label: stepLabel(it.tool), id: it.id })
  else if (m.type === 'item.started' && it?.type === 'web_search') out.push({ type: 'step', tool: 'web_search', label: stepLabel('web_search'), id: it.id })
  else if (m.type === 'item.completed' && it?.type === 'mcp_tool_call' && (it.status === 'failed' || it.error)) out.push({ type: 'stepError', id: it.id, text: textOf(it.error?.message || it.result?.content) })
  else if (m.type === 'item.completed' && it?.type === 'agent_message' && it.text?.trim()) out.push({ type: 'say', text: it.text.trim() })
  else if (m.type === 'turn.completed') {
    const u = m.usage || {}
    out.push({ type: 'usage', turn: { input: u.input_tokens || 0, cached: u.cached_input_tokens || 0, output: (u.output_tokens || 0) + (u.reasoning_output_tokens || 0) } })
    out.push({ type: 'end', ok: true, text: null })
  } else if (/compact/i.test(m.type || '') || /compact/i.test(it?.type || '')) out.push({ type: 'compact', trigger: 'auto', before: null })
  else if (m.type === 'turn.failed' || m.type === 'error') out.push({ type: 'end', ok: false, text: String(m.error?.message || m.message || 'The agent stopped with an error.') })
  return out
}
