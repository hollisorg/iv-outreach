// Hivemind's chat tools as a tiny stdio MCP server (newline-delimited JSON-RPC, no dependencies). Hivemind starts it
// for its own chat only, with its own Electron binary in Node mode; every call goes to the main process through the
// token-protected loopback bridge, which applies the selected business.
import { createInterface } from 'node:readline'
import { callBridge } from '../main/bridge.js'

const instructions = 'Hivemind tools work in the IV apps for the business selected in Hivemind: reopen existing handoffs, keep IV memory, and use IV Outreach, IV Signal and IV Studio through their own tools (iv_app_tools, iv_app_tool, iv_app_call). Each app keeps its own rules: anything that approves, spends, deletes, sends or changes settings waits for the person to allow it in Hivemind.'
const APP = { type: 'string', enum: ['outreach', 'signal', 'studio'], description: 'outreach (IV Outreach: leads, research, outreach drafts), signal (IV Signal: social posts, brand brain, calendar) or studio (IV Studio: video shots, pictures, voices, music, edits).' }
const tools = [
  {
    name: 'hivemind_find_handoffs',
    title: 'Look through handoffs',
    description: 'List saved handoffs (Studio projects and Signal drafts started from another IV app) for the business selected in Hivemind. Read only. Optional words narrow the list by title, goal, campaign or channel.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        search: { type: 'string', maxLength: 300, description: 'Words from the title, goal, campaign or channel.' },
        app: { type: 'string', enum: ['studio', 'signal'], description: 'Only handoffs that open in this app.' },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'hivemind_reopen',
    title: 'Reopen a handoff',
    description: 'Reopen an existing Studio project or Signal draft in its app. Pass the person\'s words as search (and app when they named Studio/project or Signal/draft/post). If exactly one handoff matches, its app opens it and returns to the item already made, without a copy. If several match, nothing opens: it returns choices, and you must ask the person which one. Pass handoffId only for the handoff the person picked. Never use this to create, approve or publish.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        search: { type: 'string', maxLength: 300, description: 'The person\'s words describing the item.' },
        app: { type: 'string', enum: ['studio', 'signal'], description: 'The app the item lives in, when the person said.' },
        handoffId: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$', description: 'Only the ID of the handoff the person chose.' },
      },
    },
    // Opening returns to an item the app already made: nothing is deleted or overwritten, and repeating it is safe.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'hivemind_remember',
    title: 'Remember a fact',
    description: 'Save one short, lasting fact to IV memory, which every IV app chat reads: something about the person (about "you") or about the business selected in Hivemind (about "business"), such as a preference, how they like things written, a goal, a decision, their audience or offer. Save when they tell you something durable about themselves or their work, or ask you to remember it. One fact per call, in plain words, under 600 characters. Never save passwords, keys, codes, account numbers, one-off details or private facts about other people.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['text'],
      properties: {
        text: { type: 'string', minLength: 3, maxLength: 600, description: 'The fact, in a short sentence.' },
        about: { type: 'string', enum: ['you', 'business'], description: '"you" for the person, "business" for the selected business.' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'hivemind_recall',
    title: 'Look in IV memory',
    description: 'Search IV memory about the person and the selected business. The most recent memories already come with each message; use this to look for something specific that is not there.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: { query: { type: 'string', maxLength: 200, description: 'Words to look for.' } },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'iv_app_tools',
    title: 'Find an IV app\'s tools',
    description: 'List or search the tools of an installed IV app, with the app\'s own guide. Use words for what you want to do ("draft post", "render shot", "leads"). Each tool is marked look (reads) or change. Then call iv_app_tool for one tool\'s inputs.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['app'], properties: { app: APP, search: { type: 'string', maxLength: 200, description: 'Words for what you want to do. Leave out to list everything briefly.' } } },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'iv_app_tool',
    title: 'Read one IV app tool',
    description: 'The full description and input schema of one tool from iv_app_tools. Read it before calling the tool.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['app', 'tool'], properties: { app: APP, tool: { type: 'string', maxLength: 80 } } },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'iv_app_call',
    title: 'Use an IV app tool',
    description: 'Run one tool in an IV app, exactly as that app\'s own chat would. The app brings itself up so the person can watch. Anything the app asks permission for (approving, spending, deleting, sending, changing settings) waits for the person\'s Allow in Hivemind; if they choose Don\'t allow, it does not run and you must not retry unless they ask. Long work such as renders returns a job to check with the app\'s own status tool.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['app', 'tool'], properties: { app: APP, tool: { type: 'string', maxLength: 80 }, arguments: { type: 'object', description: 'The tool\'s inputs, matching its input schema.' } } },
    // Local IV apps on this PC. Their own Allow cards gate anything that approves, spends, deletes or sends.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
]
const operationOf = { hivemind_find_handoffs: 'find', hivemind_reopen: 'reopen', hivemind_remember: 'remember', hivemind_recall: 'recall', iv_app_tools: 'app_tools', iv_app_tool: 'app_tool', iv_app_call: 'app_call' }

const write = message => process.stdout.write(`${JSON.stringify(message)}\n`)
async function handle(message) {
  const { id, method, params = {} } = message
  if (id === undefined || id === null) return
  if (method === 'initialize') {
    return write({ jsonrpc: '2.0', id, result: {
      protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18',
      capabilities: { tools: {} }, serverInfo: { name: 'hivemind', version: '0.6.0' }, instructions,
    } })
  }
  if (method === 'ping') return write({ jsonrpc: '2.0', id, result: {} })
  if (method === 'tools/list') return write({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const operation = operationOf[params.name]
    if (!operation) return write({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown tool.' } })
    try {
      const value = await callBridge(operation, params.arguments || {})
      return write({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(value) }] } })
    } catch (error) {
      return write({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: error.message }] } })
    }
  }
  write({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
}

createInterface({ input: process.stdin }).on('line', line => {
  if (!line.trim()) return
  let message
  try { message = JSON.parse(line) } catch { return write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) }
  handle(message).catch(error => write({ jsonrpc: '2.0', id: message.id ?? null, error: { code: -32603, message: error.message } }))
})
