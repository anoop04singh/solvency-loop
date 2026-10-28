import { Transaction } from "@mysten/sui/transactions";
import {
  tatumSuiClient,
  SUI_MAINNET_USDC_TYPE,
  SUI_NATIVE_TYPE,
} from "./tatum-rpc-client";

const PACKAGE_ID = process.env.NEXT_PUBLIC_SOLVENCY_PACKAGE_ID!;
const REGISTRY_ID = process.env.NEXT_PUBLIC_SOLVENCY_REGISTRY_ID!;

export interface OnChainContact {
  walletAddress: string;
  handle: string;
}

export interface OnChainUserProfile {
  wallet: string;
  handle: string;
  memwalAccountId: string;
  safeFloorUsdc: number;
  contacts: OnChainContact[];
  usdcBalance: number;
  suiBalance: number;
  latestCheckpoint: string;
  isRegisteredOnChain: boolean;
}

export interface OnChainGroupSplit {
  splitId: string;
  creator: string;
  title: string;
  totalBillUsdc: number;
  createdAtMs: number;
  participants: Array<{
    debtor: string;
    amountOwedUsdc: number;
    requiresUpfrontEscrow: boolean;
    isSettled: boolean;
    settledAtMs: number;
  }>;
}

export interface OnChainCooldownVault {
  vaultId: string;
  amountUsdc: number;
  unlockTimeMs: number;
  namespace: string;
}

/**
 * 1. Reads user profile, friend contact graph, live USDC/SUI balances, and checkpoint
 *    directly from Sui Mainnet via Tatum RPC.
 */
export async function fetchFullUserStateViaTatum(
  walletAddress: string
): Promise<OnChainUserProfile> {
  const [balances, checkpoint, dynamicFieldObj] = await Promise.all([
    tatumSuiClient.getAllBalances({ owner: walletAddress }),
    tatumSuiClient.getLatestCheckpointSequenceNumber(),
    REGISTRY_ID && !REGISTRY_ID.includes("deployed")
      ? tatumSuiClient
          .getDynamicFieldObject({
            parentId: REGISTRY_ID,
            name: { type: "address", value: walletAddress },
          })
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const usdcRaw =
    balances.find((b: any) => b.coinType === SUI_MAINNET_USDC_TYPE)?.totalBalance || "0";
  const suiRaw =
    balances.find((b: any) => b.coinType === SUI_NATIVE_TYPE || b.coinType?.endsWith("::sui::SUI"))
      ?.totalBalance || "0";

  if (
    !dynamicFieldObj ||
    !dynamicFieldObj.data ||
    dynamicFieldObj.data.content?.dataType !== "moveObject"
  ) {
    return {
      wallet: walletAddress,
      handle: `sui:${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
      memwalAccountId: process.env.NEXT_PUBLIC_MEMWAL_ACCOUNT_ID || "0x0",
      safeFloorUsdc: 300,
      contacts: [],
      usdcBalance: Number(usdcRaw) / 1e6,
      suiBalance: Number(suiRaw) / 1e9,
      latestCheckpoint: checkpoint,
      isRegisteredOnChain: false,
    };
  }

  const valueFields = (dynamicFieldObj.data.content as any).fields.value.fields;
  const rawContactEntries = valueFields.contacts?.fields?.contents || [];

  const contacts: OnChainContact[] = rawContactEntries.map((item: any) => ({
    walletAddress: item.fields.key,
    handle: item.fields.value,
  }));

  return {
    wallet: walletAddress,
    handle: valueFields.handle,
    memwalAccountId: valueFields.memwal_account_id,
    safeFloorUsdc: Number(valueFields.safe_floor_usdc) / 1e6,
    contacts,
    usdcBalance: Number(usdcRaw) / 1e6,
    suiBalance: Number(suiRaw) / 1e9,
    latestCheckpoint: checkpoint,
    isRegisteredOnChain: true,
  };
}

/**
 * 2. Queries active GroupSplitEscrow shared objects on Sui Mainnet via Tatum RPC Events + multiGetObjects
 */
export async function fetchActiveGroupSplitsViaTatum(): Promise<OnChainGroupSplit[]> {
  if (!PACKAGE_ID || PACKAGE_ID.includes("deployed")) return [];

  const events = await tatumSuiClient.queryEvents({
    query: { MoveEventType: `${PACKAGE_ID}::core::SplitCreatedEvent` },
    limit: 20,
    order: "descending",
  });

  const splitIds = events.data
    .map((e: any) => e.parsedJson?.split_id)
    .filter(Boolean);

  if (splitIds.length === 0) return [];

  const objects = await tatumSuiClient.multiGetObjects({
    ids: splitIds,
    options: { showContent: true },
  });

  return objects
    .filter((obj: any) => obj.data?.content?.dataType === "moveObject")
    .map((obj: any) => {
      const fields = (obj.data!.content as any).fields;
      const rawParticipants = fields.participants?.fields?.contents || [];

      return {
        splitId: obj.data!.objectId,
        creator: fields.creator,
        title: fields.title,
        totalBillUsdc: Number(fields.total_bill_amount) / 1e6,
        createdAtMs: Number(fields.created_at_ms),
        participants: rawParticipants.map((p: any) => {
          const val = p.fields.value.fields;
          return {
            debtor: val.debtor,
            amountOwedUsdc: Number(val.amount_owed) / 1e6,
            requiresUpfrontEscrow: Boolean(val.requires_upfront_escrow),
            isSettled: Boolean(val.is_settled),
            settledAtMs: Number(val.settled_at_ms),
          };
        }),
      };
    });
}

/**
 * 3. Queries owned CooldownVault objects for the connected wallet via Tatum RPC
 */
export async function fetchOwnedCooldownVaultsViaTatum(
  walletAddress: string
): Promise<OnChainCooldownVault[]> {
  if (!PACKAGE_ID || PACKAGE_ID.includes("deployed")) return [];

  const owned = await tatumSuiClient.getOwnedObjects({
    owner: walletAddress,
    filter: { StructType: `${PACKAGE_ID}::core::CooldownVault<${SUI_MAINNET_USDC_TYPE}>` },
    options: { showContent: true },
  });

  return owned.data
    .filter((o: any) => o.data?.content?.dataType === "moveObject")
    .map((o: any) => {
      const fields = (o.data!.content as any).fields;
      return {
        vaultId: o.data!.objectId,
        amountUsdc: Number(fields.locked_balance) / 1e6,
        unlockTimeMs: Number(fields.unlock_time_ms),
        namespace: fields.trigger_memory_namespace,
      };
    });
}

/**
 * 4. Transaction Builder: Register User Profile + Real Friend Wallet Contacts
 */
export function buildRegisterUserAndContactsTx(params: {
  handle: string;
  memwalAccountId: string;
  safeFloorUsdc: number;
  friends: Array<{ address: string; handle: string }>;
}) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::core::register_user`,
    arguments: [
      tx.object(REGISTRY_ID),
      tx.pure.string(params.handle),
      tx.pure.address(params.memwalAccountId),
      tx.pure.u64(Math.round(params.safeFloorUsdc * 1e6)),
      tx.object("0x6"),
    ],
  });

  for (const friend of params.friends) {
    if (friend.address && friend.address.startsWith("0x")) {
      tx.moveCall({
        target: `${PACKAGE_ID}::core::add_contact`,
        arguments: [
          tx.object(REGISTRY_ID),
          tx.pure.address(friend.address),
          tx.pure.string(friend.handle),
        ],
      });
    }
  }

  return tx;
}

/**
 * 5. Transaction Builder: Deploy Multi-Wallet GroupSplitEscrow on Sui Mainnet
 */
export function buildCreateGroupSplitTx(params: {
  coinType?: string;
  title: string;
  totalAmountUsdc: number;
  shares: Array<{
    debtorAddress: string;
    amountUsdc: number;
    requiresUpfrontEscrow: boolean;
  }>;
}) {
  const tx = new Transaction();
  const coinType = params.coinType || SUI_MAINNET_USDC_TYPE;

  tx.moveCall({
    target: `${PACKAGE_ID}::core::create_group_split`,
    typeArguments: [coinType],
    arguments: [
      tx.pure.string(params.title),
      tx.pure.u64(Math.round(params.totalAmountUsdc * 1e6)),
      tx.pure.vector(
        "address",
        params.shares.map((s) => s.debtorAddress)
      ),
      tx.pure.vector(
        "u64",
        params.shares.map((s) => Math.round(s.amountUsdc * 1e6))
      ),
      tx.pure.vector(
        "bool",
        params.shares.map((s) => s.requiresUpfrontEscrow)
      ),
      tx.object("0x6"),
    ],
  });

  return tx;
}

/**
 * 6. Transaction Builder: Counterparty Settles Their Split Share with Real Mainnet USDC
 */
export async function buildSettleSplitShareTx(params: {
  payerAddress: string;
  splitObjectId: string;
  amountUsdc: number;
  coinType?: string;
}) {
  const coinType = params.coinType || SUI_MAINNET_USDC_TYPE;
  const requiredBaseUnits = BigInt(Math.round(params.amountUsdc * 1e6));

  // Query payer's live USDC coin objects via Tatum RPC
  const coins = await tatumSuiClient.getCoins({
    owner: params.payerAddress,
    coinType,
  });

  if (!coins.data.length) {
    throw new Error(`No ${coinType} coins found in wallet ${params.payerAddress}`);
  }

  const tx = new Transaction();
  const primaryCoin = tx.object(coins.data[0].coinObjectId);

  if (coins.data.length > 1) {
    tx.mergeCoins(
      primaryCoin,
      coins.data.slice(1).map((c: any) => tx.object(c.coinObjectId))
    );
  }

  const [exactPaymentCoin] = tx.splitCoins(primaryCoin, [
    tx.pure.u64(requiredBaseUnits),
  ]);

  tx.moveCall({
    target: `${PACKAGE_ID}::core::settle_split_share`,
    typeArguments: [coinType],
    arguments: [
      tx.object(params.splitObjectId),
      exactPaymentCoin,
      tx.object("0x6"),
    ],
  });

  return tx;
}

/**
 * 7. Transaction Builder: Sweep Idle USDC into 24-Hour Regret Cooldown Vault
 */
export async function buildLockInCooldownVaultTx(params: {
  ownerAddress: string;
  amountUsdc: number;
  lockDurationMs: number;
  namespace: string;
  coinType?: string;
}) {
  const coinType = params.coinType || SUI_MAINNET_USDC_TYPE;
  const amountBaseUnits = BigInt(Math.round(params.amountUsdc * 1e6));

  const coins = await tatumSuiClient.getCoins({
    owner: params.ownerAddress,
    coinType,
  });

  if (!coins.data.length) {
    throw new Error(`Insufficient USDC in wallet ${params.ownerAddress}`);
  }

  const tx = new Transaction();
  const primaryCoin = tx.object(coins.data[0].coinObjectId);

  if (coins.data.length > 1) {
    tx.mergeCoins(
      primaryCoin,
      coins.data.slice(1).map((c: any) => tx.object(c.coinObjectId))
    );
  }

  const [sweepCoin] = tx.splitCoins(primaryCoin, [tx.pure.u64(amountBaseUnits)]);

  tx.moveCall({
    target: `${PACKAGE_ID}::core::lock_in_cooldown_vault`,
    typeArguments: [coinType],
    arguments: [
      sweepCoin,
      tx.pure.u64(params.lockDurationMs),
      tx.pure.string(params.namespace),
      tx.object("0x6"),
    ],
  });

  return tx;
}

/**
 * 8. Transaction Builder: Unlock Expired Cooldown Vault
 */
export function buildUnlockCooldownVaultTx(params: {
  vaultObjectId: string;
  coinType?: string;
}) {
  const coinType = params.coinType || SUI_MAINNET_USDC_TYPE;
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::core::unlock_cooldown_vault`,
    typeArguments: [coinType],
    arguments: [tx.object(params.vaultObjectId), tx.object("0x6")],
  });

  return tx;
}
