"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { NavBar } from "./NavBar";
import { BottomNav } from "./BottomNav";
import { cn } from "@/lib/cn";

interface ImmersiveContextValue {
  immersive: boolean;
  setImmersive: (v: boolean) => void;
}

const ImmersiveContext = createContext<ImmersiveContextValue>({
  immersive: false,
  setImmersive: () => {},
});

// Lets a screen (currently: active ride navigation) request the full-screen,
// chrome-free presentation described in the mobile redesign spec — no top
// bar, no bottom nav, no demo banner — without threading a prop through
// every layout file. Call setImmersive(false) on unmount/ride-stop.
export function useImmersive() {
  return useContext(ImmersiveContext);
}

export function AppShell({ children }: { children: ReactNode }) {
  const [immersive, setImmersive] = useState(false);

  return (
    <ImmersiveContext.Provider value={{ immersive, setImmersive }}>
      {!immersive && <NavBar />}
      <main
        className={cn(
          "flex-1",
          immersive ? "" : "mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:pb-8"
        )}
      >
        {children}
      </main>
      {!immersive && <BottomNav />}
    </ImmersiveContext.Provider>
  );
}
