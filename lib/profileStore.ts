"use client";

import { useCallback, useEffect, useState } from "react";
import type { RiderProfile } from "./types";
import { DEFAULT_RIDER_PROFILE } from "./profileDefaults";

const STORAGE_KEY = "repotwin.riderProfile.v1";
const CHANGE_EVENT = "repotwin:rider-profile-changed";

function readStoredProfile(): RiderProfile {
  if (typeof window === "undefined") return DEFAULT_RIDER_PROFILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RIDER_PROFILE;
    return { ...DEFAULT_RIDER_PROFILE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_RIDER_PROFILE;
  }
}

function writeStoredProfile(profile: RiderProfile) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // localStorage unavailable (private browsing etc.) — edits just won't persist.
  }
}

// Client-side rider profile store, backed by localStorage so the demo
// profile survives reloads without needing a backend. Any component using
// this hook re-renders when the profile changes in another component (or
// another tab), so the profile behaves like shared app state.
export function useRiderProfile(): [RiderProfile, (next: RiderProfile) => void, boolean] {
  const [profile, setProfileState] = useState<RiderProfile>(DEFAULT_RIDER_PROFILE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProfileState(readStoredProfile());
    setHydrated(true);
    const onChange = () => setProfileState(readStoredProfile());
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const setProfile = useCallback((next: RiderProfile) => {
    setProfileState(next);
    writeStoredProfile(next);
  }, []);

  return [profile, setProfile, hydrated];
}
