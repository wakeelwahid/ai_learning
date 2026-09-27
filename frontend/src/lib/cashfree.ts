// Lazy-loads the Cashfree Checkout JS SDK (v3) on first use instead of
// adding it unconditionally to index.html — most visitors never reach a
// payment page, so there's no reason to fetch this for every page load.
//
// Cashfree's SDK exposes a global `Cashfree({mode})` factory that returns a
// checkout instance; `.checkout({paymentSessionId, redirectTarget: "_modal"})`
// opens the same UPI-apps / cards / net-banking / wallets tabbed UI shown in
// Cashfree's hosted checkout, as an in-page overlay.

declare global {
  interface Window {
    Cashfree?: (opts: { mode: "sandbox" | "production" }) => {
      checkout: (opts: {
        paymentSessionId: string;
        redirectTarget?: "_self" | "_blank" | "_modal";
      }) => Promise<{ error?: { message: string }; paymentDetails?: { paymentMessage?: string } }>;
    };
  }
}

const CHECKOUT_SRC = "https://sdk.cashfree.com/js/v3/cashfree.js";

let loadPromise: Promise<void> | null = null;

export function loadCashfreeScript(): Promise<void> {
  if (window.Cashfree) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Cashfree checkout script")));
      return;
    }
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null; // allow a retry on the next call
      reject(new Error("Failed to load Cashfree checkout script"));
    };
    document.body.appendChild(script);
  });

  return loadPromise;
}

/** Opens Cashfree's hosted checkout as an in-page modal and resolves once the
 * user completes or dismisses it. Does NOT itself confirm payment success —
 * the caller must always follow up with a server-side /verify call, since
 * Cashfree's client-side result is not cryptographically verifiable. */
export async function openCashfreeCheckout(
  paymentSessionId: string,
  mode: "sandbox" | "production" | "test_mode"
): Promise<void> {
  if (mode === "test_mode") return;
  await loadCashfreeScript();
  const cashfree = window.Cashfree!({ mode });
  await cashfree.checkout({ paymentSessionId, redirectTarget: "_modal" });
}
