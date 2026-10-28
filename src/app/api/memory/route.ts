import { NextRequest, NextResponse } from "next/server";
import {
  createScopedMemWalClient,
  getWalletNamespace,
  SolvencyNamespaceCategory,
} from "../../../lib/walrus-tatum-memory";
import { fetchFullUserStateViaTatum } from "../../../lib/onchain-user-manager";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action,
      walletAddress,
      category = "social_split_trust",
      text,
      query,
      friendWallets,
    } = body;

    if (!walletAddress || !walletAddress.startsWith("0x")) {
      return NextResponse.json(
        { error: "Valid Sui Mainnet wallet address (0x...) is required" },
        { status: 400 }
      );
    }

    const memwal = createScopedMemWalClient(
      walletAddress,
      category as SolvencyNamespaceCategory
    );

    // 1. RECALL: Semantic search across all 3 wallet-scoped namespaces + live Tatum RPC verification
    if (action === "recall_all") {
      const categories: SolvencyNamespaceCategory[] = [
        "social_split_trust",
        "habit_regret",
        "cashflow_elasticity",
      ];

      const [liveState, ...recallResults] = await Promise.all([
        fetchFullUserStateViaTatum(walletAddress),
        ...categories.map((cat) =>
          createScopedMemWalClient(walletAddress, cat)
            .recall({
              query:
                query ||
                "friend alcohol split rules settlement delay regret hours liquidity floor",
              topK: 10,
            })
            .catch(() => ({ results: [] }))
        ),
      ]);

      const combinedMemories = categories.flatMap((cat, idx) =>
        (recallResults[idx]?.results || []).map((item: any) => ({
          ...item,
          namespace: getWalletNamespace(walletAddress, cat),
          category: cat,
        }))
      );

      return NextResponse.json({
        ownerWallet: walletAddress,
        memories: combinedMemories,
        tatumAnchor: {
          gateway: "https://sui-mainnet.gateway.tatum.io",
          checkpoint: liveState.latestCheckpoint,
          usdcBalance: liveState.usdcBalance,
          suiBalance: liveState.suiBalance,
        },
      });
    }

    // 2. REMEMBER: Anchor with live Tatum RPC state and commit to Walrus Mainnet
    if (action === "remember") {
      const liveState = await fetchFullUserStateViaTatum(walletAddress);
      const memoryString = `${text} | [Tatum Sui Mainnet Checkpoint #${liveState.latestCheckpoint} | Wallet Balance: ${liveState.usdcBalance.toFixed(2)} USDC]`;

      const committed = await memwal.rememberAndWait(memoryString, undefined, {
        timeoutMs: 30_000,
      });

      return NextResponse.json({
        status: "COMMITTED_ON_WALRUS_MAINNET",
        namespace: getWalletNamespace(walletAddress, category as SolvencyNamespaceCategory),
        tatumCheckpoint: liveState.latestCheckpoint,
        result: committed,
      });
    }

    // 3. ANALYZE: Extract structured behavioral facts from natural language receipt or reflection
    if (action === "analyze") {
      const analyzed = await memwal.analyze(text);
      return NextResponse.json({
        status: "ANALYZED_ON_WALRUS_MAINNET",
        jobIds: analyzed.job_ids,
        namespace: getWalletNamespace(walletAddress, category as SolvencyNamespaceCategory),
      });
    }

    // 4. SEED 12 REAL MAINNET MEMORIES FOR CONNECTED WALLET & REAL FRIEND WALLETS
    if (action === "seed_12_mainnet") {
      const alexAddr =
        friendWallets?.alex || process.env.NEXT_PUBLIC_ALEX_SUI_WALLET || "0xalex";
      const priyaAddr =
        friendWallets?.priya || process.env.NEXT_PUBLIC_PRIYA_SUI_WALLET || "0xpriya";
      const samAddr =
        friendWallets?.sam || process.env.NEXT_PUBLIC_SAM_SUI_WALLET || "0xsam";

      const liveState = await fetchFullUserStateViaTatum(walletAddress);
      const cp = liveState.latestCheckpoint;

      const dataset: Array<{ cat: SolvencyNamespaceCategory; fact: string }> = [
        {
          cat: "cashflow_elasticity",
          fact: `Memory #01 | Wallet ${walletAddress} receives primary income inflow on the 1st of the month; safe baseline daily spend is 45 USDC. [Tatum Checkpoint #${cp}]`,
        },
        {
          cat: "social_split_trust",
          fact: `Memory #02 | Friend @alex (${alexAddr}) never drinks alcohol; automatically exclude ${alexAddr} from bar and liquor line items on shared receipts. [Tatum Checkpoint #${cp}]`,
        },
        {
          cat: "habit_regret",
          fact: `Memory #03 | Wallet ${walletAddress} logged 92% post-purchase regret on weekday food delivery orders placed between 22:30 and 01:30. [Tatum Checkpoint #${cp}]`,
        },
        {
          cat: "social_split_trust",
          fact: `Memory #04 | Friend @priya (${priyaAddr}) settles GroupSplitEscrow shares on Sui Mainnet within 15 minutes across 4 consecutive splits (100% trust score). [Tatum Checkpoint #${cp}]`,
        },
        {
          cat: "social_split_trust",
          fact: `Memory #05 | Friend @sam (${samAddr}) averages 14.5 days to settle splits above 40 USDC; enforce requires_upfront_escrow=true for ${samAddr} whenever share exceeds 40 USDC. [Tatum Checkpoint #${cp}]`,
        },
        {
          cat: "habit_regret",
          fact: `Memory #06 | Weekend coworking cafe expenses carry 0% post-purchase regret and high productivity utility; exempt from cooldown sweeps. [Tatum Checkpoint #${cp}]`,
        },
        {
          cat: "cashflow_elasticity",
          fact: `Memory #07 | Liquid USDC balance on ${walletAddress} drops by 38% between days 21 and 28 of the month; throttle automated savings sweeps by 75% during that window. [Tatum Checkpoint #${cp}]`,
        },
        {
          cat: "habit_regret",
          fact: `Memory #08 | Unverified 7-day AI SaaS trial auto-renewals carry an 85% regret score; trigger pre-renewal lock 48 hours before billing. [Tatum Checkpoint #${cp}]`,
        },
        {
          cat: "social_split_trust",
          fact: `Memory #09 | Recurring household utility splits between ${walletAddress}, ${alexAddr}, and ${priyaAddr} follow a 50/30/20 room-weighted ratio. [Tatum Checkpoint #${cp}]`,
        },
        {
          cat: "habit_regret",
          fact: `Memory #10 | Impulse gadget/electronics purchases over 80 USDC made without a 24-hour CooldownVault lock carry an 88% regret score. [Tatum Checkpoint #${cp}]`,
        },
        {
          cat: "cashflow_elasticity",
          fact: `Memory #11 | Maintain a hard liquid checking floor of 300 USDC on ${walletAddress} verified via Tatum RPC suix_getAllBalances before allowing discretionary vault sweeps. [Tatum Checkpoint #${cp}]`,
        },
        {
          cat: "social_split_trust",
          fact: `Memory #12 | Group travel budgets over 150 USDC involving ${samAddr} achieve 100% on-time settlement when locked upfront via solvency_loop::core::create_group_split. [Tatum Checkpoint #${cp}]`,
        },
      ];

      const jobs: string[] = [];
      for (const item of dataset) {
        const client = createScopedMemWalClient(walletAddress, item.cat);
        const job = await client.remember(item.fact);
        jobs.push(job.job_id);
      }

      return NextResponse.json({
        status: "SEEDED_12_MAINNET_MEMORIES",
        count: jobs.length,
        jobIds: jobs,
        tatumCheckpoint: cp,
      });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
