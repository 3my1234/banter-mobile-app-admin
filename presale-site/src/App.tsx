import { FormEvent, useMemo, useState } from "react";
import banterLogo from "./assets/banter-logo.jpg";
import rolLogo from "./assets/rol-logo.png";

const PRESALE_MIN_ROL = 10;
const PRESALE_MAX_ROL = 10_000;
const PRESALE_UNIT_PRICE_USD = 0.5;
const QUICK_PICK_AMOUNTS = [10, 100, 1_000, 5_000, 10_000];

const checkoutBase =
  import.meta.env.VITE_PRESALE_CHECKOUT_BASE_URL?.trim() || "";
const supportEmail =
  import.meta.env.VITE_SUPPORT_EMAIL?.trim() || "support@sportbanter.online";
const salesDomain =
  import.meta.env.VITE_PRESALE_DOMAIN?.trim() || "buy.sportbanter.online";

const formatRol = (amount: number) => `${amount.toLocaleString()} ROL`;
const formatUsd = (amount: number) => `$${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function App() {
  const [rolAmountInput, setRolAmountInput] = useState("1000");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [banterHandle, setBanterHandle] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const parsedRolAmount = useMemo(() => {
    const cleaned = rolAmountInput.replace(/[^\d]/g, "");
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : 0;
  }, [rolAmountInput]);

  const clampedRolAmount = useMemo(
    () =>
      Math.min(
        PRESALE_MAX_ROL,
        Math.max(PRESALE_MIN_ROL, Math.floor(parsedRolAmount || PRESALE_MIN_ROL))
      ),
    [parsedRolAmount]
  );

  const totalPriceUsd = useMemo(
    () => Number((clampedRolAmount * PRESALE_UNIT_PRICE_USD).toFixed(2)),
    [clampedRolAmount]
  );

  const setRolAmount = (nextAmount: number) => {
    const normalized = Math.min(PRESALE_MAX_ROL, Math.max(PRESALE_MIN_ROL, Math.floor(nextAmount)));
    setRolAmountInput(String(normalized));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);

    if (!fullName.trim() || !email.trim() || !banterHandle.trim()) {
      setNotice("Full name, email, and Banter handle are required.");
      return;
    }

    if (!Number.isInteger(parsedRolAmount) || parsedRolAmount < PRESALE_MIN_ROL || parsedRolAmount > PRESALE_MAX_ROL) {
      setNotice(`ROL amount must be a whole number between ${PRESALE_MIN_ROL} and ${PRESALE_MAX_ROL}.`);
      return;
    }

    if (!checkoutBase) {
      setNotice(
        "Checkout base URL is not configured yet. Set VITE_PRESALE_CHECKOUT_BASE_URL before going live."
      );
      return;
    }

    const params = new URLSearchParams({
      rolAmount: String(parsedRolAmount),
      fullName: fullName.trim(),
      email: email.trim(),
      banterHandle: banterHandle.trim(),
      walletAddress: walletAddress.trim(),
    });

    window.location.href = `${checkoutBase}?${params.toString()}`;
  };

  return (
    <div className="page-shell">
      <header className="hero">
          <div className="hero-copy">
          <div className="eyebrow">Early Allocation Access</div>
          <h1>Banter x Rolley Presale</h1>
          <p className="hero-text">
            Secure a reserved ROL allocation linked to your Banter account. Presale allocations
            are tracked against your Banter identity and prepared for later token claim or
            distribution.
          </p>
          <div className="hero-actions">
            <a className="primary-cta" href="#checkout">
              Reserve Allocation
            </a>
            <a className="secondary-cta" href={`mailto:${supportEmail}`}>
              Contact Team
            </a>
          </div>
          <div className="domain-pill">Planned domain: {salesDomain}</div>
        </div>

        <div className="brand-panel">
          <div className="logo-stack">
            <img src={banterLogo} alt="Banter" className="brand-logo banter" />
            <div className="brand-divider">×</div>
            <img src={rolLogo} alt="ROL" className="brand-logo rol" />
          </div>
          <div className="brand-card">
            <div className="stat-label">Checkout Branding</div>
            <div className="stat-value">Banter x Rolley</div>
            <p>
              Use the same cobranded identity on Flutterwave checkout so buyers see a consistent
              payment flow tied back to Banter.
            </p>
          </div>
        </div>
      </header>

      <main className="content-grid">
        <section className="panel offers-panel">
          <div className="section-heading">
            <span>Allocation</span>
            <h2>Select an early allocation</h2>
          </div>
          <p className="section-note">
            Choose any amount between <strong>{PRESALE_MIN_ROL.toLocaleString()} ROL</strong> and{" "}
            <strong>{PRESALE_MAX_ROL.toLocaleString()} ROL</strong>. Pricing is fixed at{" "}
            <strong>${PRESALE_UNIT_PRICE_USD.toFixed(2)} per ROL</strong>.
          </p>
          <div className="allocation-builder">
            <label className="amount-field">
              Enter ROL amount
              <input
                type="number"
                min={PRESALE_MIN_ROL}
                max={PRESALE_MAX_ROL}
                step={1}
                value={rolAmountInput}
                onChange={(e) => setRolAmountInput(e.target.value)}
              />
            </label>
            <div className="amount-hint">
              Allowed range: {PRESALE_MIN_ROL.toLocaleString()} to {PRESALE_MAX_ROL.toLocaleString()} ROL
            </div>
            <div className="quick-picks">
              {QUICK_PICK_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className={`quick-pick${clampedRolAmount === amount ? " active" : ""}`}
                  onClick={() => setRolAmount(amount)}
                >
                  {amount.toLocaleString()} ROL
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel info-panel">
          <div className="section-heading">
            <span>How it works</span>
            <h2>Account-linked, not anonymous</h2>
          </div>
          <div className="info-list">
            <article>
              <strong>1. Buyer identity</strong>
              <p>Each purchase must be tied to a Banter handle and email used in your account.</p>
            </article>
            <article>
              <strong>2. Flutterwave checkout</strong>
              <p>Payment is processed on your branded Flutterwave checkout flow using live keys.</p>
            </article>
            <article>
              <strong>3. Allocation ledger</strong>
              <p>After successful payment, the backend should write the reserved ROL allocation to a presale ledger.</p>
            </article>
            <article>
              <strong>4. Claim later</strong>
              <p>The buyer sees a reserved allocation now, then receives claim/distribution when token launch opens.</p>
            </article>
          </div>
        </section>

        <section className="panel checkout-panel" id="checkout">
          <div className="section-heading">
            <span>Checkout</span>
            <h2>Reserve {formatRol(clampedRolAmount)}</h2>
          </div>

          <form className="checkout-form" onSubmit={handleSubmit}>
            <label>
              Full name
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Oba Emmanuel" />
            </label>
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <label>
              Banter handle
              <input value={banterHandle} onChange={(e) => setBanterHandle(e.target.value)} placeholder="@banteruser" />
            </label>
            <label>
              Wallet address
              <input
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="Optional now, can be confirmed later"
              />
            </label>

            <div className="checkout-summary">
              <div>
                <span>Selected allocation</span>
                <strong>{formatRol(clampedRolAmount)}</strong>
              </div>
              <div>
                <span>Unit price</span>
                <strong>{formatUsd(PRESALE_UNIT_PRICE_USD)}</strong>
              </div>
              <div>
                <span>Total price</span>
                <strong>{formatUsd(totalPriceUsd)}</strong>
              </div>
            </div>

            {notice ? <div className="notice">{notice}</div> : null}

            <button className="primary-cta wide" type="submit">
              Proceed to secure checkout
            </button>
            <p className="form-footnote">
              This frontend expects a backend checkout URL in{" "}
              <code>VITE_PRESALE_CHECKOUT_BASE_URL</code>. Without it, the site stays in safe
              prelaunch mode.
            </p>
          </form>
        </section>

      </main>
    </div>
  );
}
