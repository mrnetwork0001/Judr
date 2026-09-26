import { ixsVaults } from "@/lib/ixs";
import { FEE_BPS, FEE_FLOOR_MINOR } from "@/lib/vault";
import { formatMinor, splitYield } from "@/lib/yield";
import { Eyebrow, Numeral } from "./Motif";

/*
 * The RWA Vaults section. Idle escrow is dead capital: while a dispute is
 * open, the Judr agent places it in a licensed IXS vault, and Judr's fee comes
 * out of the yield. The table is a live read of IXS's vault list, refreshed
 * with the page; the worked example is computed with the same arithmetic the
 * app settles with, so the numbers here and in the app cannot disagree.
 */

const EXAMPLE_PRINCIPAL = 10_000_000_000n; // 10,000.00 USDC
const EXAMPLE_DAYS = 32;

export default async function Escrow() {
  const snapshot = await ixsVaults();
  const rate = snapshot.vaults.find((v) => v.permissionless)?.ttmRate ?? 0.0307;
  const split = splitYield({
    principal: EXAMPLE_PRINCIPAL,
    annualRate: rate,
    days: EXAMPLE_DAYS,
    feeBps: FEE_BPS,
    feeFloor: FEE_FLOOR_MINOR,
  });
  const usd = (n: bigint) => formatMinor(n, 6);
  const when = new Date(snapshot.fetchedAt).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return (
    <section id="escrow" aria-labelledby="escrow-title" className="section sunken">
      <div className="lp-wrap split">
        <div className="section-head">
          <Eyebrow>RWA Vaults · with IXS</Eyebrow>
          <h2 id="escrow-title">
            Idle escrow is dead capital. <em>Judr puts it to work.</em>
          </h2>
          <p className="lead">
            While a dispute is open the escrow does not sit in a wallet. A SERV reasoning
            step reads IXS&rsquo;s live vault list and places it in a licensed real-world-asset
            yield vault; a deterministic policy refuses anything it cannot reach or should
            not hold. At settlement the escrow is redeemed, Judr takes its fee from the
            yield, and the winner receives principal plus what is left.
          </p>
          <p className="lead" style={{ marginTop: 14 }}>
            That is the business model. Nobody pays out of pocket to have a dispute
            decided; the time the money was stuck pays for it.
          </p>
        </div>

        <div>
          <div className="worked">
            <div className="worked-head">
              <span className="eyebrow" style={{ color: "var(--text-faint)" }}>
                Worked example · {usd(EXAMPLE_PRINCIPAL)} USDC · {EXAMPLE_DAYS} days
              </span>
            </div>
            <dl className="ledger ledger-lg">
              <dt>Principal</dt>
              <dd>{usd(EXAMPLE_PRINCIPAL)}</dd>
              <dt>Yield at {(rate * 100).toFixed(2)}% TTM, as IXS reports it</dt>
              <dd>+ {usd(split.yieldEarned)}</dd>
              <dt>
                Judr fee · {FEE_BPS / 100}% of yield, {usd(FEE_FLOOR_MINOR)} floor, from yield only
              </dt>
              <dd>− {usd(split.fee)}</dd>
              <dt className="total">Paid to the winning party</dt>
              <dd className="total">{usd(split.payout)} USDC</dd>
            </dl>
            <p className="worked-note">
              Principal is never touched. If the window is too short for the yield to cover
              the floor, the fee is whatever was earned and nothing more is owed.
            </p>
          </div>

          <div className="vault-table-wrap">
            <table className="vault-table">
              <caption>
                IXS vaults · {snapshot.source === "live" ? "live read" : "recorded snapshot"} ·{" "}
                {when} UTC
              </caption>
              <thead>
                <tr>
                  <th>Vault</th>
                  <th>Chain</th>
                  <th>Access</th>
                  <th>TTM yield</th>
                  <th>On-chain</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.vaults.map((v) => (
                  <tr key={v.id}>
                    <td>
                      {v.name} <span className="mono dim">{v.symbol}</span>
                    </td>
                    <td>{v.chainName}</td>
                    <td>
                      <span className={`badge ${v.permissionless ? "ok" : ""}`}>
                        {v.permissionless ? "permissionless" : "whitelist"}
                      </span>
                    </td>
                    <td className="mono">{(v.ttmRate * 100).toFixed(2)}%</td>
                    <td className="mono dim">
                      {v.onchain
                        ? `${v.onchain.tvl.toLocaleString("en-US")} ${v.asset.symbol} · share ${v.onchain.sharePrice}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ol className="steps" style={{ marginTop: 40 }}>
            <li>
              <Numeral n={1} />
              <div>
                <h3>The agent proposes; the policy decides</h3>
                <p className="prose">
                  The SERV step sees chain, access terms, reported yield and live on-chain
                  totals, and proposes a vault or proposes holding cash, with its risks
                  stated. The policy is plain code: a vault that requires a whitelist the
                  escrow agent is not on, a paused vault, a zero rate, or a proposal with
                  no stated risk is refused, and the refusal goes on the record.
                </p>
              </div>
            </li>
            <li>
              <Numeral n={2} />
              <div>
                <h3>Transactions are built, not signed</h3>
                <p className="prose">
                  Subscription and redemption requests are built with IXS&rsquo;s own agent
                  SDK as ERC-7540 call data and shown in the trail exactly as a signer
                  would send them. Judr holds no key. The redemption is requested when the
                  verdict posts, because the vault operator finalises on its own schedule.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}
