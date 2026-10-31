"use client";

import React, { useState } from "react";
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
} from "@mysten/dapp-kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@mysten/dapp-kit/dist/index.css";
import { tatumSuiClient } from '@/lib/tatum-rpc-client';

const { networkConfig } = createNetworkConfig({
  mainnet: {
    url: "/api/tatum-rpc",
    network: "mainnet",
  },
});

export function SolvencyProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="mainnet" createClient={() => tatumSuiClient}>
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
