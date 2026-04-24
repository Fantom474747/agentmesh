import { Router } from 'express'
import * as queue from '../../agents/queue.js'

const router = Router()

router.get('/', (_req, res) => {
  const limit = Number((_req.query as { limit?: string }).limit) || 100
  res.json(queue.listTasks(limit))
})

router.get('/:id', (req, res) => {
  const task = queue.getTask(req.params.id)
  if (!task) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Task not found' } })
    return
  }
  res.json(task)
})

router.post('/', (req, res) => {
  const { skill, input, agent_id } = req.body as {
    skill?: string
    input?: string
    agent_id?: string
  }
  if (!skill || !input) {
    res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'skill and input are required' } })
    return
  }
  const task = queue.createTask({ skill, input, agent_id })
  res.status(201).json(task)
})

export default router
