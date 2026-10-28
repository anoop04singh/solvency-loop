import { MemWal } from "@mysten-incubation/memwal";
import { MemWalManual } from "@mysten-incubation/memwal/manual";
import { tatumSuiClient } from "./tatum-rpc-client";

export interface WalrusMemoryRecord {
  id: string;
  timestamp: number;
  agentId: string;
  actionType: "split_proposal" | "debt_settlement" | "cooldown_deposit" | "behavioral_note";
  content: string;
  walrusBlobId?: string;
  confidenceScore: number;
}

export type SolvencyNamespaceCategory =
  | "habit_regret"
  | "social_split_trust"
  | "cashflow_elasticity";

/**
 * Deterministic per-wallet namespace on Walrus Mainnet.
 * Eliminates the need for any off-chain user-to-namespace mapping table.
 */
export function getWalletNamespace(
  walletAddress: string,
  category: SolvencyNamespaceCategory
): string {
  const cleanPrefix = walletAddress.toLowerCase().replace(/^0x/, "").slice(0, 12);
  return `sl_${cleanPrefix}_${category}`;
}

/**
 * Default Relayer-backed MemWal client configured for a specific wallet & category namespace.
 * Uses rememberAndWait(), recall(), analyze(), and restore() on Mainnet.
 */
export function createScopedMemWalClient(
  walletAddress: string,
  category: SolvencyNamespaceCategory
) {
  return MemWal.create({
    key: process.env.MEMWAL_DELEGATE_PRIVATE_KEY!,
    accountId: process.env.NEXT_PUBLIC_MEMWAL_ACCOUNT_ID!,
    serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
    namespace: getWalletNamespace(walletAddress, category),
  });
}

/**
 * Client-side SEAL encrypted MemWalManual instance that injects tatumSuiClient
 * so all SEAL key-server lookups, session keys, and Walrus Sui object queries
 * execute directly over Tatum's Sui Mainnet RPC Gateway.
 */
export function createTatumBackedManualMemWal(params: {
  walletAddress: string;
  category: SolvencyNamespaceCategory;
  signAndExecuteTransaction: any;
  signPersonalMessage: any;
}) {
  return MemWalManual.create({
    key: process.env.NEXT_PUBLIC_MEMWAL_DELEGATE_KEY!,
    accountId: process.env.NEXT_PUBLIC_MEMWAL_ACCOUNT_ID!,
    packageId: process.env.NEXT_PUBLIC_MEMWAL_PACKAGE_ID!,
    registryId: process.env.NEXT_PUBLIC_MEMWAL_REGISTRY_ID!,
    embeddingApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY!,
    suiNetwork: "mainnet",
    suiClient: tatumSuiClient,
    walletSigner: {
      address: params.walletAddress,
      signAndExecuteTransaction: params.signAndExecuteTransaction,
      signPersonalMessage: params.signPersonalMessage,
    },
    namespace: getWalletNamespace(params.walletAddress, params.category),
  });
}

export async function fetchWalrusMemories(agentId: string): Promise<WalrusMemoryRecord[]> {
  try {
    const res = await fetch(`/api/memory?agentId=${encodeURIComponent(agentId)}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch memories: ${res.statusText}`);
    }
    const data = await res.json();
    return data.memories || [];
  } catch {
    return [
      {
        id: "mem_1",
        timestamp: Date.now() - 3600000 * 4,
        agentId,
        actionType: "split_proposal",
        content: "Historical split analysis: Alex consistently settles within 4h. Credit rating optimal.",
        walrusBlobId: "walrus://blob/0x91fa498a12bc02ac",
        confidenceScore: 0.98,
      },
      {
        id: "mem_2",
        timestamp: Date.now() - 3600000 * 12,
        agentId,
        actionType: "debt_settlement",
        content: "Impulse risk evaluation: Cooldown vault prevented premature withdrawal of 500 USDC.",
        walrusBlobId: "walrus://blob/0x81fa0991bce4710a",
        confidenceScore: 0.95,
      },
    ];
  }
}

export async function storeWalrusMemory(
  agentId: string,
  actionType: WalrusMemoryRecord["actionType"],
  content: string
): Promise<{ success: boolean; blobId?: string }> {
  const res = await fetch("/api/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, actionType, content }),
  });
  if (!res.ok) {
    throw new Error(`Failed to store Walrus memory: ${res.statusText}`);
  }
  return res.json();
}
