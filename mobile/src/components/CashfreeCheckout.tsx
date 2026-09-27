import React, { useMemo } from "react";
import { Modal, View, StyleSheet, TouchableOpacity, ActivityIndicator, Text } from "react-native";
import { WebView, WebViewNavigation } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/theme/colors";

// Cashfree's hosted checkout (UPI apps / cards / net banking / wallets) is
// embedded via their official JS SDK inside a WebView, the same pattern
// previously used for Razorpay's checkout.js. Unlike Razorpay, Cashfree's
// client-side result is never treated as authoritative — completion is
// detected purely by watching for the WebView navigating back to the
// backend's configured return_url (FRONTEND_URL + /payment-return), and the
// caller is responsible for calling /verify afterwards, which re-fetches
// the order's true status directly from Cashfree.

export type CashfreeMode = "sandbox" | "production";

interface Props {
  visible: boolean;
  paymentSessionId: string | null;
  mode: CashfreeMode;
  onComplete: () => void;   // WebView navigated back to /payment-return — go call /verify
  onDismiss: () => void;    // user closed the checkout manually
  onError?: (message: string) => void;
}

function buildCheckoutHtml(paymentSessionId: string, mode: CashfreeMode): string {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
  </head>
  <body style="margin:0;background:#F8FAFC;">
    <script>
      try {
        var cashfree = Cashfree({ mode: "${mode}" });
        cashfree.checkout({
          paymentSessionId: "${paymentSessionId}",
          redirectTarget: "_self"
        });
      } catch (e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "error", message: String(e && e.message || e) }));
      }
    </script>
  </body>
</html>`;
}

export default function CashfreeCheckout({ visible, paymentSessionId, mode, onComplete, onDismiss, onError }: Props) {
  const html = useMemo(
    () => (paymentSessionId ? buildCheckoutHtml(paymentSessionId, mode) : ""),
    [paymentSessionId, mode]
  );

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "error") onError?.(data.message ?? "Payment failed");
    } catch {
      // non-JSON messages are ignored
    }
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    if (navState.url.includes("/payment-return")) {
      onComplete();
    }
  };

  if (!paymentSessionId) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.container}>
        <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={22} color="#374151" />
          <Text style={styles.closeTxt}>Cancel</Text>
        </TouchableOpacity>
        <WebView
          source={{ html }}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={palette.primary600} />
            </View>
          )}
          style={{ flex: 1 }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  closeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingTop: 48, paddingBottom: 8 },
  closeTxt: { fontSize: 14, fontWeight: "600", color: "#374151" },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
});
