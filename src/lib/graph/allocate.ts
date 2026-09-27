/**
 * The allocation step.
 *
 * Where should the escrow sit while the dispute is open? A SERV reasoning step
 * reads the live IXS vault list - chain, permissionless or whitelisted,
 * reported yield, on-chain totals where available - together with the
 * dispute's expected duration, and proposes a vault or proposes holding cash.
 *
 * The model proposes; it does not decide. checkAllocation() is deterministic
 * and refuses anything the policy forbids: a vault that does not exist, one
 * that is paused, one that requires a whitelist the escrow agent is not on,
 * or a rate of zero. A refused proposal is recorded as refused, with the
 * reason, and the escrow stays where it was. This is the same shape as the
 * verdict's citation check: the model's output is the input to a rule, never
 * the rule itself.
 */

import { completeTyped } from "../serv";
import type { JsonSchema } from "./schema";
import type { IxsSnapshot, IxsVaultSummary } from "../ixs";

export interface AllocationDecision {
  allocate: boolean;
  vault_id: string;
  rationale: string;
  expected_hold_days: number;
  risks: string[];
}

export const ALLOCATION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    allocate: { type: "boolean", description: "false to hold cash instead." },
    vault_id: { type: "string", description: "The chosen vault's id, or an empty string when not allocating." },
    rationale: { type: "string", description: "Why this vault, or why cash, in plain language for the parties." },
    expected_hold_days: { type: "number", description: "How long the escrow is expected to stay allocated." },
    risks: { type: "array", items: { type: "string" }, description: "What could go wrong with this allocation. At least one." },
  },
  required: ["allocate", "vault_id", "rationale", "expected_hold_days", "risks"],
  additionalProperties: false,
};

export interface AllocationPolicy {
  /** The agent's wallet is not on any whitelist; only permissionless vaults are reachable. */
  permissionlessOnly: boolean;
  /** Below this the vault's yield cannot cover Judr's fee floor over a typical window. */
  minRate: number;
}

export const POLICY: AllocationPolicy = { permissionlessOnly: true, minRate: 0.005 };

export interface AllocationCheck {
  accepted: boolean;
  reasons: string[];
  vault?: IxsVaultSummary;
}

/** Deterministic. The policy, applied to whatever the model proposed. */
export function checkAllocation(
  decision: AllocationDecision,
  snapshot: IxsSnapshot,
  policy: AllocationPolicy = POLICY,
): AllocationCheck {
  const reasons: string[] = [];
  if (!decision.allocate) {
    return { accepted: true, reasons: ["Holding cash; no vault action."] };
  }
  const vault = snapshot.vaults.find((v) => v.id === decision.vault_id);
  if (!vault) {
    return { accepted: false, reasons: [`Vault "${decision.vault_id}" is not in the IXS list.`] };
  }
  if (vault.status !== "active") reasons.push(`Vault ${vault.symbol} is ${vault.status}, not active.`);
  if (policy.permissionlessOnly && !vault.permissionless) {
    reasons.push(`Vault ${vault.symbol} on ${vault.chainName} requires a whitelist the escrow agent is not on.`);
  }
  if (vault.ttmRate < policy.minRate) {
    reasons.push(`Reported yield ${(vault.ttmRate * 100).toFixed(2)}% is below the ${(policy.minRate * 100).toFixed(2)}% floor.`);
  }
  if (decision.risks.length === 0) reasons.push("No risks were stated; an allocation without a stated risk is refused.");
  return { accepted: reasons.length === 0, reasons, vault };
}

/* ---------------------------------------------------------------- */
/* The SERV step                                                     */
/* ---------------------------------------------------------------- */

export function renderVaults(snapshot: IxsSnapshot): string {
  return snapshot.vaults
    .map((v) => {
      const chain = `${v.chainName} (chainId ${v.chainId})`;
      const access = v.permissionless ? "permissionless" : "whitelist required";
      const rate = `${(v.ttmRate * 100).toFixed(2)}% TTM yield (as reported by IXS)`;
      const live = v.onchain
        ? `on-chain now: ${v.onchain.tvl.toLocaleString("en-US")} ${v.asset.symbol} total assets, share price ${v.onchain.sharePrice}`
        : "on-chain totals not read from here";
      return `[${v.id}] ${v.name} · ${v.symbol}\n    ${chain} · ${access} · status ${v.status}\n    ${rate}\n    ${live}\n    underlying ${v.asset.symbol} (${v.asset.decimals} decimals) at ${v.asset.address}`;
    })
    .join("\n\n");
}

export interface AllocateArgs {
  snapshot: IxsSnapshot;
  escrow: { amount: number; asset: string };
  expectedDays: number;
  /** One line on the position the agent already holds, if any. */
  position?: string;
  onDelta?: (text: string) => void;
  onRepair?: (attempt: number, errors: string[]) => void;
  signal?: AbortSignal;
}

export async function allocate(args: AllocateArgs) {
  const { snapshot, escrow, expectedDays, position, ...rest } = args;
  return completeTyped<AllocationDecision>({
    schema: ALLOCATION_SCHEMA,
    schemaName: "allocation",
    temperature: 0,
    ...rest,
    messages: [
      {
        role: "system",
        content: `You are the treasury agent for an escrow held under arbitration.

The escrow must be available to pay out when the dispute settles, and until then
it may be placed in a licensed real-world-asset yield vault so that it is not
idle. Your job is to propose where it should sit, or to propose holding cash.

Rules:
 - Only propose a vault from the list you are given, by its id. Never invent one.
 - The escrow agent's wallet is on no whitelist. A vault marked "whitelist
   required" cannot be used; if you propose one, say why anyway and it will
   be refused by policy.
 - ERC-7540 vaults settle subscriptions and redemptions asynchronously - the
   operator finalises on its own schedule. State that as a risk when relevant.
 - Operationally: the redemption request is lodged the moment a verdict is
   posted, and payout happens only after an appeal window (days, in
   production). So a vault whose redemptions finalise within that window does
   not delay payout. Weigh that against the yield; do not assume cash is the
   only way to stay payout-ready.
 - Prefer the vault whose chain and access terms let the escrow be redeemed in
   time for settlement. Yield is secondary to being able to pay out.
 - The parties will read your rationale. Write it for them, not for a trader.
 - If holding cash is the better choice, say so; allocate=false is a valid answer.`,
      },
      {
        role: "user",
        content: `ESCROW
${escrow.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${escrow.asset}, expected to remain under dispute for about ${expectedDays} days.

IXS VAULTS (${snapshot.source === "live" ? "live read" : "recorded snapshot"}, ${new Date(snapshot.fetchedAt).toISOString()})
${renderVaults(snapshot)}${position ? `\n\nAGENT'S STANDING POSITION\n${position}` : ""}`,
      },
    ],
  });
}
