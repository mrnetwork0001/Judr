import { Eyebrow } from "./Motif";

const STACK = [
  {
    term: "SERV reasoning",
    detail:
      "Every model step runs against SERV's OpenAI-compatible endpoint, bound to a JSON Schema and re-validated locally on the way back. Invalid output is repaired against the validator's own error list rather than accepted.",
  },
  {
    term: "Coinbase AgentKit",
    detail:
      "The escrow agent. A CDP wallet on Base holds the escrow as real USDC, tops itself up from Coinbase's faucet on testnet, and pays the winning party with an on-chain ERC-20 transfer when a case settles. Payouts are capped per address and per day.",
  },
  {
    term: "IXS vaults",
    detail:
      "Where the escrow would earn while a dispute is open. The vault list, whitelist status and reported yield are read live from IXS's API; totals and share price for the Avalanche vault are read on-chain; subscription and redemption requests are built with IXS's own agent SDK as unsigned ERC-7540 call data, shown and not sent.",
  },
  {
    term: "Next.js 16 · React 19",
    detail:
      "Server-streamed arbitration over SSE, vanilla CSS, no UI framework and no state library. Fifty unit tests run on Node's type stripping — no test framework, no build step — including the SERV client against a mock endpoint and the allocation policy against the recorded vault list.",
  },
];

export default function BuiltWith() {
  return (
    <section id="built" aria-labelledby="built-title" className="section sunken">
      <div className="lp-wrap">
        <div className="section-head">
          <Eyebrow>Built with</Eyebrow>
          <h2 id="built-title">What is underneath.</h2>
        </div>
        <dl className="stack">
          {STACK.map((item) => (
            <div key={item.term}>
              <dt>{item.term}</dt>
              <dd>{item.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
