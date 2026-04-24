import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as yaml from 'js-yaml'
import { z } from 'zod'
import type { SkillManifest } from '../../shared/types.js'

// ── Shared Zod schema (used for both formats) ────────────────────────────────

const SkillFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  compatible_runners: z.array(z.string()).default([]),
  tools: z.array(z.string()).optional(),
  model: z.string().optional(),
  allow_all_runners: z.boolean().optional(),
  preferred_agent: z.string().optional(),
  require_online: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  timeout_ms: z.number().int().positive().optional(),
  retry: z.number().int().min(0).max(10).optional(),
  tool_sandbox: z.string().optional(),
  tool_timeout_ms: z.number().int().positive().optional(),
  inject_date: z.boolean().optional(),
  inject_cwd: z.boolean().optional(),
  context_template: z.string().optional(),
  chain: z.array(z.string()).optional(),
  fallback_skill: z.string().optional(),
  tags: z.array(z.string()).optional(),
  icon: z.string().optional(),
  hidden: z.boolean().optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  input_schema: z.record(z.unknown()).default({ type: 'object', properties: {} }),
  output_schema: z.record(z.unknown()).default({ type: 'object', properties: {} }),
  // manifest.yaml only — system_prompt lives in the body for SKILL.md
  system_prompt: z.string().optional(),
})

const SkillYamlSchema = SkillFrontmatterSchema.extend({
  id: z.string(),
  system_prompt: z.string(),
})

// ── SKILL.md parser ──────────────────────────────────────────────────────────

function parseSkillMd(raw: string, id: string): SkillManifest | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return null

  const [, frontmatter, body] = match
  let parsed: unknown
  try {
    parsed = yaml.load(frontmatter)
  } catch {
    return null
  }

  const result = SkillFrontmatterSchema.safeParse(parsed)
  if (!result.success) return null

  const d = result.data
  return {
    id,
    name: d.name,
    description: d.description,
    compatible_runners: d.compatible_runners as SkillManifest['compatible_runners'],
    system_prompt: body.trim(),
    tools: d.tools,
    model: d.model,
    allow_all_runners: d.allow_all_runners,
    preferred_agent: d.preferred_agent,
    require_online: d.require_online,
    temperature: d.temperature,
    max_tokens: d.max_tokens,
    timeout_ms: d.timeout_ms,
    retry: d.retry,
    tool_sandbox: d.tool_sandbox,
    tool_timeout_ms: d.tool_timeout_ms,
    inject_date: d.inject_date,
    inject_cwd: d.inject_cwd,
    context_template: d.context_template,
    chain: d.chain,
    fallback_skill: d.fallback_skill,
    tags: d.tags,
    icon: d.icon,
    hidden: d.hidden,
    version: d.version,
    author: d.author,
    input_schema: d.input_schema,
    output_schema: d.output_schema,
    source: 'markdown',
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function loadSkills(skillsDir: string): SkillManifest[] {
  if (!existsSync(skillsDir)) return []
  const skills: SkillManifest[] = []

  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const id = entry.name

    // Prefer manifest.yaml; fall back to SKILL.md
    const yamlPath = join(skillsDir, id, 'manifest.yaml')
    const mdPath = join(skillsDir, id, 'SKILL.md')

    if (existsSync(yamlPath)) {
      try {
        const raw = yaml.load(readFileSync(yamlPath, 'utf8'))
        const parsed = SkillYamlSchema.parse({ id, ...(raw as object) }) as SkillManifest
        skills.push({ ...parsed, source: 'yaml' })
      } catch (err) {
        console.warn(`[skills] Skipping ${id}/manifest.yaml: ${(err as Error).message}`)
      }
    } else if (existsSync(mdPath)) {
      try {
        const raw = readFileSync(mdPath, 'utf8')
        const skill = parseSkillMd(raw, id)
        if (skill) {
          skills.push(skill)
        } else {
          console.warn(`[skills] Skipping ${id}/SKILL.md: could not parse frontmatter`)
        }
      } catch (err) {
        console.warn(`[skills] Skipping ${id}/SKILL.md: ${(err as Error).message}`)
      }
    }
  }

  return skills
}

// Build the raw file content for a skill (used by IPC read + MCP read tool)
export function buildSkillMd(manifest: SkillManifest): string {
  const frontmatter: Record<string, unknown> = {
    name: manifest.name,
    description: manifest.description,
  }
  if (manifest.allow_all_runners) {
    frontmatter.allow_all_runners = true
  } else {
    frontmatter.compatible_runners = manifest.compatible_runners
  }
  if (manifest.model) frontmatter.model = manifest.model
  if (manifest.tools?.length) frontmatter.tools = manifest.tools
  if (manifest.preferred_agent) frontmatter.preferred_agent = manifest.preferred_agent
  if (manifest.require_online) frontmatter.require_online = true
  if (manifest.temperature !== undefined) frontmatter.temperature = manifest.temperature
  if (manifest.max_tokens !== undefined) frontmatter.max_tokens = manifest.max_tokens
  if (manifest.timeout_ms !== undefined) frontmatter.timeout_ms = manifest.timeout_ms
  if (manifest.retry !== undefined) frontmatter.retry = manifest.retry
  if (manifest.tool_sandbox) frontmatter.tool_sandbox = manifest.tool_sandbox
  if (manifest.tool_timeout_ms !== undefined) frontmatter.tool_timeout_ms = manifest.tool_timeout_ms
  if (manifest.inject_date) frontmatter.inject_date = true
  if (manifest.inject_cwd) frontmatter.inject_cwd = true
  if (manifest.context_template) frontmatter.context_template = manifest.context_template
  if (manifest.chain?.length) frontmatter.chain = manifest.chain
  if (manifest.fallback_skill) frontmatter.fallback_skill = manifest.fallback_skill
  if (manifest.tags?.length) frontmatter.tags = manifest.tags
  if (manifest.icon) frontmatter.icon = manifest.icon
  if (manifest.hidden) frontmatter.hidden = true
  if (manifest.version) frontmatter.version = manifest.version
  if (manifest.author) frontmatter.author = manifest.author
  if (Object.keys(manifest.input_schema).length > 0) frontmatter.input_schema = manifest.input_schema
  if (Object.keys(manifest.output_schema).length > 0) frontmatter.output_schema = manifest.output_schema

  return `---\n${yaml.dump(frontmatter).trimEnd()}\n---\n\n${manifest.system_prompt}\n`
}

export function buildSkillYaml(manifest: SkillManifest): string {
  const { source: _source, ...rest } = manifest
  return yaml.dump(rest)
}

// Read raw file content + format for a given skill id
export function readSkillRaw(
  skillsDir: string,
  id: string,
): { content: string; format: 'yaml' | 'markdown' } | null {
  const yamlPath = join(skillsDir, id, 'manifest.yaml')
  const mdPath = join(skillsDir, id, 'SKILL.md')

  if (existsSync(yamlPath)) {
    return { content: readFileSync(yamlPath, 'utf8'), format: 'yaml' }
  }
  if (existsSync(mdPath)) {
    return { content: readFileSync(mdPath, 'utf8'), format: 'markdown' }
  }
  return null
}
