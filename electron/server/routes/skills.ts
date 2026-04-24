import { Router } from 'express'
import { getSkills } from '../index.js'

const router = Router()

router.get('/', (_req, res) => {
  res.json(getSkills())
})

export default router
