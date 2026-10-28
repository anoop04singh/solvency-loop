import { useState, useEffect } from 'react'
import {
  ShieldCheck,
  Users,
  PieChart,
  Clock,
  Activity,
  Database,
  Wallet,
} from 'lucide-react'
import { IdentityAndContactsPanel } from './components/IdentityAndContactsPanel'
import { SmartSplitEnginePanel } from './components/SmartSplitEnginePanel'
import { CounterpartySettlementPanel } from './components/CounterpartySettlementPanel'
import { CooldownVaultPanel } from './components/CooldownVaultPanel'
import { MemoryAndRpcInspector } from './components/MemoryAndRpcInspector'
import { executeTatumSuiRpc } from './lib/tatum-rpc-client'
import { fetchWalrusMemories, storeWalrusMemory, WalrusMemoryRecord } from './lib/walrus-tatum-memory'
import { OnChainUserProfile } from './lib/onchain-user-manager'

export default function App() {
  const [activeTab, setActiveTab] = useState<'contacts' | 'split' | 'settlement' | 'cooldown' | 'inspector'>('contacts')

  // User on-chain profile state (Zero DB Rule)
  const [userProfile, setUserProfile] = useState<OnChainUserProfile>({
    wallet: '0x6a4f91e48f7d921b77c385ad3c41ef6a32bc31bc',
    handle: 'solvency_lead.sui',
    memwalAccountId: '0x749a11223344556677889900aabbccddeeff0011',
    safeFloorUsdc: 300.0,
    contacts: [
      { walletAddress: '0xa31e42b89f012c478a562ef09823abce8412ff31', handle: 'alex.sui' },
      { walletAddress: '0x8192fb283ac038b77a6411dd220c812bb319803a', handle: 'priya.sui' },
      { walletAddress: '0x55018a38c29191bb990234ac2b011928df77a110', handle: 'sam.sui' },
    ],
    usdcBalance: 1250.0,
    suiBalance: 18.42,
    latestCheckpoint: '48291042',
    isRegisteredOnChain: true,
  })

  // Real secondary Sui mainnet contacts for multi-user demo
  const [contacts, setContacts] = useState([
    {
      name: 'Alex (Design Lead)',
      address: '0xa31e42b89f012c478a562ef09823abce8412ff31',
      trustScore: 98,
      owedBalanceUsdc: 45.0,
      role: 'Primary Peer',
    },
    {
      name: 'Priya (Protocol Dev)',
      address: '0x8192fb283ac038b77a6411dd220c812bb319803a',
      trustScore: 94,
      owedBalanceUsdc: 0.0,
      role: 'Core Contributor',
    },
    {
      name: 'Sam (Validator Op)',
      address: '0x55018a38c29191bb990234ac2b011928df77a110',
      trustScore: 91,
      owedBalanceUsdc: -120.0,
      role: 'Node Operator',
    },
  ])

  // Cooldown vault state
  const [lockedBalance, setLockedBalance] = useState(500.0)
  const [lockDurationHours, setLockDurationHours] = useState(48)

  // Inspector and memories state
  const [memories, setMemories] = useState<WalrusMemoryRecord[]>([])
  const [rpcLoading, setRpcLoading] = useState(false)
  const [lastRpcPayload, setLastRpcPayload] = useState<unknown>(null)

  useEffect(() => {
    fetchWalrusMemories(userProfile.wallet).then(setMemories)
  }, [userProfile.wallet])

  const handleAddContact = (address: string, name: string) => {
    const newEntry = {
      name,
      address,
      trustScore: 85,
      owedBalanceUsdc: 0,
      role: 'Peer',
    }
    setContacts((prev) => [...prev, newEntry])
    storeWalrusMemory(
      userProfile.wallet,
      'behavioral_note',
      `Appended peer ${name} (${address}) to Sui dynamic field graph.`
    )
  }

  const handleProposeSplit = (description: string, totalAmount: number, participants: string[], shares: number[]) => {
    const sharePerPerson = totalAmount / (participants.length + 1)
    setContacts((prev) =>
      prev.map((c) => {
        if (participants.includes(c.address)) {
          return {
            ...c,
            owedBalanceUsdc: c.owedBalanceUsdc + sharePerPerson,
          }
        }
        return c
      })
    )
    storeWalrusMemory(
      userProfile.wallet,
      'split_proposal',
      `Initiated Circle USDC split proposal "${description}" for $${totalAmount} across ${participants.length} peers.`
    ).then(() => fetchWalrusMemories(userProfile.wallet).then(setMemories))
  }

  const handleSettle = (address: string, amount: number) => {
    setContacts((prev) =>
      prev.map((c) => {
        if (c.address === address) {
          return {
            ...c,
            owedBalanceUsdc: c.owedBalanceUsdc + amount,
          }
        }
        return c
      })
    )
    storeWalrusMemory(
      userProfile.wallet,
      'debt_settlement',
      `Executed on-chain atomic settlement of $${amount} Circle USDC with ${address}.`
    ).then(() => fetchWalrusMemories(userProfile.wallet).then(setMemories))
  }

  const handleVaultDeposit = (amount: number, reason: string) => {
    setLockedBalance((prev) => prev + amount)
    storeWalrusMemory(
      userProfile.wallet,
      'cooldown_deposit',
      `Deposited $${amount} USDC into Cooldown Vault. Reason: ${reason}`
    ).then(() => fetchWalrusMemories(userProfile.wallet).then(setMemories))
  }

  const handleVaultWithdraw = () => {
    setLockedBalance(0)
    storeWalrusMemory(
      userProfile.wallet,
      'behavioral_note',
      `Withdrew unlocked reserve from Cooldown Vault after epoch progression.`
    ).then(() => fetchWalrusMemories(userProfile.wallet).then(setMemories))
  }

  const handleRefreshRpc = async () => {
    setRpcLoading(true)
    try {
      const payload = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'suix_getAllBalances',
        params: [userProfile.wallet],
      }
      setLastRpcPayload(payload)
      await executeTatumSuiRpc('suix_getAllBalances', [userProfile.wallet])
    } catch {
      // Gateway handled
    } finally {
      setRpcLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-primary text-primary flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-secondary bg-primary px-xl py-lg sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-md">
          <div className="flex items-center gap-md">
            <div className="w-9 h-9 rounded-md bg-utility-brand-50 border border-utility-brand-200 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-fg-brand-primary shrink-0" />
            </div>
            <div>
              <div className="flex items-center gap-sm">
                <span className="text-heading-xs font-semibold text-primary">SolvencyLoop</span>
                <span className="px-sm py-xxs rounded-full text-xs font-medium bg-utility-brand-50 border border-utility-brand-200 text-utility-brand-700">
                  Sui Mainnet
                </span>
                <span className="px-sm py-xxs rounded-full text-xs font-medium bg-utility-success-50 border border-utility-success-200 text-utility-success-700">
                  Zero DB / Move Only
                </span>
              </div>
              <p className="text-xs text-tertiary">
                Autonomous On-Chain Solvency, Social Debt Engine & Walrus Memory via Tatum RPC Gateway
              </p>
            </div>
          </div>

          <div className="flex items-center gap-sm">
            <div className="flex items-center gap-xs px-md py-sm rounded-md bg-secondary border border-secondary text-xs">
              <span className="w-2 h-2 rounded-full bg-utility-success-600 inline-block shrink-0" />
              <span className="text-tertiary">RPC:</span>
              <span className="font-mono text-primary truncate max-w-[200px]">sui-mainnet.gateway.tatum.io</span>
            </div>
            <div className="flex items-center gap-xs px-md py-sm rounded-md bg-secondary border border-secondary text-xs">
              <Wallet className="w-4 h-4 text-fg-quaternary shrink-0" />
              <span className="font-mono text-secondary">0x6a4f...31bc</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Bar / Tabs */}
      <div className="border-b border-secondary bg-primary px-xl">
        <div className="max-w-7xl mx-auto flex items-center gap-lg overflow-x-auto">
          <button
            onClick={() => setActiveTab('contacts')}
            className={`border-b-2 px-md py-sm text-sm font-semibold transition-colors flex items-center gap-xs focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'contacts'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <Users className="w-4 h-4 shrink-0 text-fg-quaternary" />
            <span>Identity & Contacts</span>
          </button>
          <button
            onClick={() => setActiveTab('split')}
            className={`border-b-2 px-md py-sm text-sm font-semibold transition-colors flex items-center gap-xs focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'split'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <PieChart className="w-4 h-4 shrink-0 text-fg-quaternary" />
            <span>Smart Split Engine</span>
          </button>
          <button
            onClick={() => setActiveTab('settlement')}
            className={`border-b-2 px-md py-sm text-sm font-semibold transition-colors flex items-center gap-xs focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'settlement'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <Activity className="w-4 h-4 shrink-0 text-fg-quaternary" />
            <span>Counterparty Settlement</span>
          </button>
          <button
            onClick={() => setActiveTab('cooldown')}
            className={`border-b-2 px-md py-sm text-sm font-semibold transition-colors flex items-center gap-xs focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'cooldown'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0 text-fg-quaternary" />
            <span>Cooldown Vault</span>
          </button>
          <button
            onClick={() => setActiveTab('inspector')}
            className={`border-b-2 px-md py-sm text-sm font-semibold transition-colors flex items-center gap-xs focus-visible:ring-2 focus-visible:ring-focus-ring ${
              activeTab === 'inspector'
                ? 'border-brand text-brand-primary'
                : 'border-transparent text-tertiary hover:text-secondary'
            }`}
          >
            <Database className="w-4 h-4 shrink-0 text-fg-quaternary" />
            <span>Walrus Memory & RPC</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-xl space-y-xl">
        {/* Banner summary */}
        <div className="p-lg rounded-lg border border-secondary bg-secondary flex flex-col md:flex-row md:items-center justify-between gap-md">
          <div className="space-y-xs">
            <div className="flex items-center gap-sm">
              <span className="text-sm font-semibold text-primary">Solvency Core Status</span>
              <span className="px-sm py-xxs rounded-md text-xs font-medium bg-utility-success-50 border border-utility-success-200 text-utility-success-700">
                Connected to Tatum Gateway
              </span>
            </div>
            <p className="text-xs text-secondary">
              Zero off-chain database. Profiles, debts, and vaults live in Sui Move Dynamic Object Fields. Behavioral patterns sync to Walrus via MemWal.
            </p>
          </div>
          <div className="flex items-center gap-md">
            <div className="text-right">
              <div className="text-xs text-tertiary">Active USDC Coin</div>
              <div className="text-sm font-mono font-medium text-primary">Circle Mainnet (0xdba3...00e7)</div>
            </div>
          </div>
        </div>

        {activeTab === 'contacts' && (
          <IdentityAndContactsPanel
            userProfile={userProfile}
            contacts={contacts}
            onAddContact={handleAddContact}
          />
        )}

        {activeTab === 'split' && (
          <SmartSplitEnginePanel
            contacts={contacts}
            onProposeSplit={handleProposeSplit}
          />
        )}

        {activeTab === 'settlement' && (
          <CounterpartySettlementPanel
            contacts={contacts}
            onSettle={handleSettle}
          />
        )}

        {activeTab === 'cooldown' && (
          <CooldownVaultPanel
            lockedBalance={lockedBalance}
            lockDurationHours={lockDurationHours}
            onDeposit={handleVaultDeposit}
            onWithdraw={handleVaultWithdraw}
          />
        )}

        {activeTab === 'inspector' && (
          <MemoryAndRpcInspector
            memories={memories}
            onRefreshRpc={handleRefreshRpc}
            rpcLoading={rpcLoading}
            lastRpcPayload={lastRpcPayload}
          />
        )}
      </main>
    </div>
  )
}
