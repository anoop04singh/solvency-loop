import { Router } from 'express'
import { tatumRpc, tatumApiBase } from '../tatum-client.mjs'

const router = Router()

// Health check — a present key says nothing about egress, so make a real request.
router.get('/status', async (_req, res) => {
  if (!process.env.TATUM_API_KEY) return res.json({ status: 'no-api-key' })
  try {
    await fetch(tatumApiBase(), { signal: AbortSignal.timeout(8000) })
    res.json({ status: 'connected' })
  } catch (error) {
    res.json({ status: 'egress-failed', error: error.message })
  }
})

// Proxy for Sui Mainnet JSON-RPC requests through Tatum Gateway
router.post('/sui-rpc', async (req, res) => {
  try {
    const payload = req.body
    const response = await tatumRpc('sui', payload, 'mainnet')
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error) {
    console.error('Tatum Sui RPC gateway error:', error)
    res.status(500).json({
      error: {
        code: -32603,
        message: error.message || 'Internal Tatum Sui RPC error',
      },
    })
  }
})

export default router
