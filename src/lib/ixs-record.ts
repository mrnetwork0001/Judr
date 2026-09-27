/**
 * The deposit request the agent made into the IXS vault, as it stands on
 * chain. Written by scripts/ixs-deposit.mjs when the request was sent; the
 * live state (pending, finalised, shares) is always read from the chain.
 */
import type { RecordedRequest } from "./ixs-position";

export const RECORDED_REQUEST: RecordedRequest | null = {
  "txHash": "0x13718493f700f26c3d3acae254d5a4ff0bf5d76d5193b023feddb797854c4c0c",
  "requestId": "10",
  "assetsUsdc": "100",
  "requestedAt": "2026-09-27T12:24:57.540Z",
  "block": 96258448
};
