/**
 * On-Chain User Manager
 * Direct interface for reading and constructing transactions for the
 * solvency_loop::core Move package on Sui Mainnet.
 */

import { executeTatumSuiRpc } from './tatum-rpc-client'

export interface OnChainUserProfile {
  owner: string
  handle: string
  trustScore: number
  contacts: string[]
  createdAtEpoch: number
  totalSettledVolume: number
}

export interface SplitProposalData {
  id: string
  initiator: string
  description: string
  totalAmount: number
  participants: string[]
  shares: number[]
  settledMask: boolean[]
  isCompleted: boolean
}

export interface CooldownVaultData {
  id: string
  owner: string
  lockedBalanceUsdc: number
  unlockTimestampMs: number
  createdTimestampMs: number
  reason: string
}

export async function fetchUserProfile(registryId: string, userAddress: string): Promise<OnChainUserProfile | null> {
  try {
    const res = await executeTatumSuiRpc<{
      data?: {
        content?: {
          fields?: {
            value?: {
              fields?: {
                owner?: string
                handle?: string
                trust_score?: string
                contacts?: string[]
                created_at_epoch?: string
                total_settled_volume?: string
              }
            }
          }
        }
      }
    }>('suix_getDynamicFieldObject', [
      registryId,
      {
        type: 'address',
        value: userAddress,
      },
    ])

    const fields = res.result?.data?.content?.fields?.value?.fields
    if (!fields) {
      return null
    }

    return {
      owner: fields.owner || userAddress,
      handle: fields.handle || 'solvency_user.sui',
      trustScore: Number(fields.trust_score || 100),
      contacts: fields.contacts || [],
      createdAtEpoch: Number(fields.created_at_epoch || 0),
      totalSettledVolume: Number(fields.total_settled_volume || 0),
    }
  } catch {
    return null
  }
}
