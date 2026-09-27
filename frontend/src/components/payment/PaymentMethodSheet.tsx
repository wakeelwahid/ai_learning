import { useState } from "react";
import { X, CreditCard, Landmark, Wallet, Loader2, ShieldCheck } from "lucide-react";

// Shown in place of Cashfree's real hosted checkout only when the backend is
// running in test_mode (no real CASHFREE_APP_ID configured — see
// payment_service/app/services/cashfree_service.py::_is_test_mode). A fake
// test-mode payment_session_id can't be handed to the real Cashfree JS SDK,
// so this gives the same "choose a payment method" visual step Cashfree's
// own checkout would otherwise render, using the exact method set requested
// for this flow. Once real Cashfree keys are configured, `data.key` stops
// being "test_mode" and this sheet is bypassed entirely in favour of
// lib/cashfree.ts's openCashfreeCheckout (Cashfree's real hosted UI).

const UPI_APPS = [
  { id: "phonepe",    label: "PhonePe" },
  { id: "gpay",       label: "Google Pay" },
  { id: "paytm",      label: "Paytm" },
  { id: "amazonpay",  label: "Amazon Pay" },
  { id: "bhim",       label: "BHIM" },
] as const;

const OTHER_METHODS = [
  { id: "card",       label: "Debit / Credit Card", icon: CreditCard },
  { id: "netbanking", label: "Net Banking",          icon: Landmark },
  { id: "wallet",     label: "Wallets",               icon: Wallet },
] as const;

interface Props {
  visible: boolean;
  amountLabel: string;   // e.g. "₹149"
  planName: string;
  onSelect: (method: string) => void;   // resolves once the simulated payment completes
  onCancel: () => void;
}

export default function PaymentMethodSheet({ visible, amountLabel, planName, onSelect, onCancel }: Props) {
  const [processing, setProcessing] = useState<string | null>(null);

  if (!visible) return null;

  const handlePick = (method: string) => {
    if (processing) return;
    setProcessing(method);
    // Simulated gateway round-trip — mirrors the brief "processing" delay a
    // real UPI-intent/card/netbanking redirect would have.
    setTimeout(() => {
      setProcessing(null);
      onSelect(method);
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !processing && onCancel()} />

      <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-white text-lg truncate">Choose Payment Method</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{planName} · {amountLabel}</p>
          </div>
          <button
            onClick={() => !processing && onCancel()}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* UPI Apps */}
          <div>
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" /> UPI Apps
            </p>
            <div className="grid grid-cols-2 gap-2">
              {UPI_APPS.map((app) => (
                <button
                  key={app.id}
                  onClick={() => handlePick(app.label)}
                  disabled={!!processing}
                  className="flex items-center justify-center gap-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-50"
                >
                  {processing === app.label ? <Loader2 className="w-4 h-4 animate-spin" /> : app.label}
                </button>
              ))}
            </div>
          </div>

          {/* Other Methods */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Other Methods</p>
            <div className="space-y-2">
              {OTHER_METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handlePick(m.label)}
                  disabled={!!processing}
                  className="w-full flex items-center gap-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-50"
                >
                  {processing === m.label ? <Loader2 className="w-4 h-4 animate-spin" /> : <m.icon className="w-4 h-4 text-gray-400" />}
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400 pt-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Secured by Cashfree · Test mode — no real charge
          </p>
        </div>
      </div>
    </div>
  );
}
