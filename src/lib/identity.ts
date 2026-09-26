/**
 * Wallet as identity.
 *
 * A visitor proves control of an address by signing a message that names the
 * vault, the role they are joining as, and their session. The server verifies
 * the signature; nothing is taken on assertion. No funds move here - this is
 * who you are, not what you hold. Payouts go to the winning party's proven
 * address, and an appeal is accepted only from the losing party's.
 */

import { verifyMessage, isAddress, type Address } from "viem";

export type Role = "plaintiff" | "defendant" | "reviewer";

export const ROLES: Role[] = ["plaintiff", "defendant", "reviewer"];

export interface ChainInfo {
  id: number;
  hex: string;
  name: string;
  explorer: string;
  rpc: string;
}

/** The chains the escrow agent can settle on. Which one is a deployment choice. */
export const CHAINS: Record<"base-sepolia" | "base", ChainInfo> = {
  "base-sepolia": { id: 84532, hex: "0x14a34", name: "Base Sepolia", explorer: "https://sepolia.basescan.org", rpc: "https://sepolia.base.org" },
  base: { id: 8453, hex: "0x2105", name: "Base", explorer: "https://basescan.org", rpc: "https://mainnet.base.org" },
};

export function joinMessage(vaultId: string, role: Role, sessionId: string, address: Address): string {
  return [
    `Judr - join ${vaultId} as ${role}`,
    ``,
    `Address: ${address}`,
    `Session: ${sessionId}`,
    ``,
    `This signature proves control of the address. It authorises nothing and moves no funds.`,
  ].join("\n");
}

export async function verifyJoin(args: {
  vaultId: string;
  role: Role;
  sessionId: string;
  address: string;
  signature: string;
}): Promise<{ ok: true; address: Address } | { ok: false; error: string }> {
  if (!ROLES.includes(args.role)) return { ok: false, error: "Unknown role." };
  if (!isAddress(args.address)) return { ok: false, error: "That is not an EVM address." };
  const address = args.address as Address;
  try {
    const valid = await verifyMessage({
      address,
      message: joinMessage(args.vaultId, args.role, args.sessionId, address),
      signature: args.signature as `0x${string}`,
    });
    return valid ? { ok: true, address } : { ok: false, error: "The signature does not match the address." };
  } catch {
    return { ok: false, error: "The signature could not be verified." };
  }
}
