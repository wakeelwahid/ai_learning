import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { store, persistor } from "./store";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

// Clear old Zustand localStorage key to avoid any redux-persist conflicts
try {
  localStorage.removeItem("edtech-admin-auth");
} catch {}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <QueryClientProvider client={queryClient}>
          <App />
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        </QueryClientProvider>
      </PersistGate>
    </Provider>
  </React.StrictMode>
);
