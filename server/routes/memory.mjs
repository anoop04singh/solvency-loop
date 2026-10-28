import { Router } from 'express'

const router = Router()

// Walrus Decentralized Memory Relayer proxy
router.get('/', async (req, res) => {
  const agentId = req.query.agentId || '0x_default_agent'
  res.json({
    agentId,
    memories: [
      {
        id: 'mem_walrus_1',
        timestamp: Date.now() - 3600000 * 3,
        agentId,
        actionType: 'split_proposal',
        content: 'Historical split analysis: Alex consistently settles within 4h. Credit rating optimal (0.98).',
        walrusBlobId: 'walrus://blob/0x91fa498a12bc02ac',
        confidenceScore: 0.98,
      },
      {
        id: 'mem_walrus_2',
        timestamp: Date.now() - 3600000 * 8,
        agentId,
        actionType: 'debt_settlement',
        content: 'Impulse risk evaluation: Cooldown vault prevented premature withdrawal of 500 USDC.',
        walrusBlobId: 'walrus://blob/0x81fa0991bce4710a',
        confidenceScore: 0.95,
      },
      {
        id: 'mem_walrus_3',
        timestamp: Date.now() - 3600000 * 24,
        agentId,
        actionType: 'behavioral_note',
        content: 'Solvency graph density increased: 3 validated peer nodes on Sui Mainnet.',
        walrusBlobId: 'walrus://blob/0x74ba8901eefa3391',
        confidenceScore: 0.99,
      },
    ],
  })
})

router.post('/', async (req, res) => {
  const { agentId, actionType, content } = req.body
  res.json({
    success: true,
    blobId: `walrus://blob/0x${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`,
    agentId,
    actionType,
    storedAt: Date.now(),
  })
})

export default router
