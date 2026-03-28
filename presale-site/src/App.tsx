import { FormEvent, useMemo, useState } from "react";
import banterLogo from "./assets/banter-logo.jpg";
import rolLogo from "./assets/rol-logo.png";

type PackageOption = {
  id: string;
  label: string;
  rol: string;
  price: string;
  note: string;
};

const PACKAGE_OPTIONS: PackageOption[] = [
  {
    id: "starter",
    label: "Starter Allocation",
    rol: "100,000 ROL",
    price: "$100",
    note: "For early supporters who want a smaller reserved allocation.",
  },
  {
    id: "core",
    label: "Core Allocation",
    rol: "250,000 ROL",
    price: "$250",
    note: "Balanced allocation for early buyers who want stronger exposure.",
  },
  {
    id: "treasury",
    label: "Treasury Allocation",
    rol: "1,000,000 ROL",
    price: "$1,000",
    note: "Reserved for committed early backers supporting scale and liquidity.",
  },
];

const checkoutBase =
  import.meta.env.VITE_PRESALE_CHECKOUT_BASE_URL?.trim() || "";
const supportEmail =
  import.meta.env.VITE_SUPPORT_EMAIL?.trim() || "support@sportbanter.online";
const salesDomain =
  import.meta.env.VITE_PRESALE_DOMAIN?.trim() || "buy.sportbanter.online";

export default function App() {
  const [selectedPackageId, setSelectedPackageId] = useState(PACKAGE_OPTIONS[1].id);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [banterHandle, setBanterHandle] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const selectedPackage = useMemo(
    () => PACKAGE_OPTIONS.find((item) => item.id === selectedPackageId) || PACKAGE_OPTIONS[1],
    [selectedPackageId]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);

    if (!fullName.trim() || !email.trim() || !banterHandle.trim()) {
      setNotice("Full name, email, and Banter handle are required.");
      return;
    }

    if (!checkoutBase) {
      setNotice(
        "Checkout base URL is not configured yet. Set VITE_PRESALE_CHECKOUT_BASE_URL before going live."
      );
      return;
    }

    const params = new URLSearchParams({
      packageId: selectedPackage.id,
      packageLabel: selectedPackage.label,
      rolAmount: selectedPackage.rol,
      fiatAmount: selectedPackage.price,
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
            Secure a reserved ROL allocation linked to your Banter account. This page is built
            for early supporters funding scale, liquidity, and launch operations.
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
            <span>Packages</span>
            <h2>Select an early allocation</h2>
          </div>
          <div className="offers-grid">
            {PACKAGE_OPTIONS.map((item) => {
              const active = item.id === selectedPackage.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`offer-card${active ? " active" : ""}`}
                  onClick={() => setSelectedPackageId(item.id)}
                >
                  <div className="offer-label">{item.label}</div>
                  <div className="offer-rol">{item.rol}</div>
                  <div className="offer-price">{item.price}</div>
                  <p>{item.note}</p>
                </button>
              );
            })}
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
            <h2>Reserve {selectedPackage.rol}</h2>
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
                <span>Selected package</span>
                <strong>{selectedPackage.label}</strong>
              </div>
              <div>
                <span>Allocation</span>
                <strong>{selectedPackage.rol}</strong>
              </div>
              <div>
                <span>Price</span>
                <strong>{selectedPackage.price}</strong>
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

        <section className="panel faq-panel">
          <div className="section-heading">
            <span>FAQ</span>
            <h2>What this site already solves</h2>
          </div>
          <div className="faq-list">
            <article>
              <strong>Can this use your Namecheap domain?</strong>
              <p>Yes. Point a subdomain like <code>buy.sportbanter.online</code> to Coolify/VPS.</p>
            </article>
            <article>
              <strong>Can it sit on Coolify?</strong>
              <p>Yes. Deploy this folder as its own static Vite site.</p>
            </article>
            <article>
              <strong>Can Flutterwave show Banter + Rolley branding?</strong>
              <p>Yes, but Flutterwave accepts one logo URL, so use a single cobranded image asset.</p>
            </article>
            <article>
              <strong>Does this update a live wallet balance?</strong>
              <p>No. It should update a presale allocation ledger until token claim/distribution is live.</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
