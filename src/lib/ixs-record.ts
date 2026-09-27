/**
 * The deposit request the agent made into the IXS vault, as it stands on
 * chain. Written by scripts/ixs-deposit.mjs when the request was sent; the
 * live state (pending, finalised, shares) is always read from the chain.
 */
import type { RecordedRequest } from "./ixs-position";

export const RECORDED_REQUEST: RecordedRequest | null = null;
