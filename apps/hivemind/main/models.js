// The models IV Hivemind offers for each agent: Claude Code's current models, and the models the person's own Codex
// lists in its picker (its models cache), each led by "your default".
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { codexConfigured } from '../../../src/service/harness.js'

export const CLAUDE_MODELS = [
  { id: '', name: 'Your Claude Code default' },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' },
]

const codexHome = (env = process.env, home = homedir()) => env.CODEX_HOME || join(home, '.codex')

export function codexModels(env = process.env, home = homedir()) {
  const configured = codexConfigured(env, home)
  let listed = []
  try {
    const cache = JSON.parse(readFileSync(join(codexHome(env, home), 'models_cache.json'), 'utf8'))
    listed = (cache.models || []).filter(model => model.visibility !== 'hide' && model.slug)
      .map(model => ({ id: model.slug, name: model.display_name || model.slug }))
  } catch {}
  return [{ id: '', name: configured ? `Your Codex default (${configured})` : 'Your Codex default' }, ...listed]
}

export const modelList = () => ({ claude: CLAUDE_MODELS, codex: codexModels() })
export const validModel = model => typeof model === 'string' && /^[A-Za-z0-9_.:\-[\]]{0,80}$/.test(model)
