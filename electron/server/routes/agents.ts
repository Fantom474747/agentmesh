import { Router } from 'express'
import * as registry from '../../agents/registry.js'

const router = Router()

router.get('/', (_req, res) => {
  res.json(registry.listAgents())
})

router.get('/:id', (req, res) => {
  const agent = registry.getAgent(req.params.id)
  if (!agent) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } })
    return
  }
  res.json(agent)
})

router.post('/', (req, res) => {
  const { name, type, endpoint, skills, config } = req.body as {
    name?: string
    type?: string
    endpoint?: string
    skills?: string[]
    config?: Record<string, unknown>
  }
  if (!name || !type) {
    res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'name and type are required' } })
    return
  }
  const agent = registry.createAgent({
    name,
    type: type as import('../../../shared/types.js').AgentType,
    endpoint,
    skills: skills ?? [],
    config: config ?? {},
  })
  res.status(201).json(agent)
})

router.delete('/:id', (req, res) => {
  registry.deleteAgent(req.params.id)
  res.status(204).send()
})

export default router
