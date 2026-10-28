export interface ComputedParticipantShare {
  handle: string;
  ruleApplied: string;
  walletAddress: string;
  amountUsdc: number;
  requiresUpfrontEscrow: boolean;
}

interface Props {
  splitTitle: string;
  setSplitTitle: (v: string) => void;
  foodUsdc: number;
  setFoodUsdc: (v: number) => void;
  drinksUsdc: number;
  setDrinksUsdc: (v: number) => void;
  escrowThresholdUsdc?: number;
  memoryRecallEnabled: boolean;
  setMemoryRecallEnabled: (v: boolean) => void;
  shares: ComputedParticipantShare[];
  loading: boolean;
  onDeployGroupSplit: () => void;
}

export function SmartSplitEnginePanel({
  splitTitle,
  setSplitTitle,
  foodUsdc,
  setFoodUsdc,
  drinksUsdc,
  setDrinksUsdc,
  memoryRecallEnabled,
  setMemoryRecallEnabled,
  shares,
  loading,
  onDeployGroupSplit,
}: Props) {
  const totalBill = foodUsdc + drinksUsdc;

  return (
    <section className="rounded-xl border border-secondary bg-primary p-xl space-y-md shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
            2. Memory-Calibrated Group Split & Escrow Engine
          </h2>
          <p className="text-xs text-secondary mt-xxs">
            Recalls Walrus Mainnet social rules before deploying GroupSplitEscrow&lt;USDC&gt;
          </p>
        </div>

        <button
          onClick={() => setMemoryRecallEnabled(!memoryRecallEnabled)}
          className={`inline-flex items-center gap-xs text-xs px-md py-xs rounded-full font-mono font-medium border transition-colors ${
            memoryRecallEnabled
              ? "bg-utility-success-50 text-utility-success-700 border-utility-success-200"
              : "bg-secondary text-tertiary border-secondary"
          }`}
        >
          {memoryRecallEnabled
            ? "WALRUS MEMORY: ACTIVE (Epoch #12)"
            : "COLD START: 0 MEMORIES"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-md text-xs">
        <div className="flex flex-col gap-sm">
          <label className="text-sm font-medium text-secondary">Expense Title</label>
          <input
            value={splitTitle}
            onChange={(e) => setSplitTitle(e.target.value)}
            className="rounded-md bg-primary px-lg py-sm text-sm text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </div>
        <div className="flex flex-col gap-sm">
          <label className="text-sm font-medium text-secondary">Food Subtotal (USDC)</label>
          <input
            type="number"
            step="0.5"
            value={foodUsdc}
            onChange={(e) => setFoodUsdc(Number(e.target.value))}
            className="rounded-md bg-primary px-lg py-sm text-sm font-mono text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </div>
        <div className="flex flex-col gap-sm">
          <label className="text-sm font-medium text-secondary">Alcohol / Drinks Subtotal (USDC)</label>
          <input
            type="number"
            step="0.5"
            value={drinksUsdc}
            onChange={(e) => setDrinksUsdc(Number(e.target.value))}
            className="rounded-md bg-primary px-lg py-sm text-sm font-mono text-primary placeholder:text-placeholder border border-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </div>
      </div>

      <div className="space-y-sm">
        {shares.map((s, idx) => (
          <div
            key={idx}
            className="flex flex-wrap items-center justify-between gap-sm border border-secondary bg-secondary p-md rounded-lg text-xs"
          >
            <div>
              <div className="font-semibold text-primary">
                {s.handle}{" "}
                <span className="text-secondary font-normal">
                  — {s.ruleApplied}
                </span>
              </div>
              <div className="font-mono text-xs text-tertiary">
                Wallet: {s.walletAddress || "Not configured"}
              </div>
            </div>

            <div className="flex items-center gap-md">
              {s.requiresUpfrontEscrow ? (
                <span className="inline-flex items-center px-sm py-xxs rounded-full bg-utility-warning-50 text-utility-warning-700 border border-utility-warning-200 font-mono text-xs">
                  UPFRONT ESCROW REQUIRED
                </span>
              ) : (
                <span className="inline-flex items-center px-sm py-xxs rounded-full bg-secondary text-secondary border border-secondary font-mono text-xs">
                  STANDARD SPLIT
                </span>
              )}
              <span className="font-mono text-sm font-bold text-utility-success-700">
                {s.amountUsdc.toFixed(2)} USDC
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-sm border-t border-secondary text-xs">
        <span className="text-secondary">
          Total Bill: <strong className="text-primary font-mono">{totalBill.toFixed(2)} USDC</strong> (4-way split incl. Creator)
        </span>
        <button
          onClick={onDeployGroupSplit}
          disabled={loading}
          className="inline-flex items-center justify-center gap-sm rounded-lg border border-transparent bg-brand-solid px-lg py-sm text-sm font-semibold text-primary-on-brand shadow-xs hover:bg-brand-solid-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
        >
          Deploy GroupSplitEscrow on Sui Mainnet
        </button>
      </div>
    </section>
  );
}
