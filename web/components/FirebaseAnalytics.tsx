"use client";

import { useEffect } from "react";
import { getFirebaseApp } from "@/lib/firebaseClient";

export default function FirebaseAnalytics() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const app = getFirebaseApp();
    if (!app) return;
    let cancelled = false;

    import("firebase/analytics").then(({ getAnalytics, isSupported }) => {
      if (cancelled) return;

      isSupported().then((supported) => {
        if (supported) {
          getAnalytics(app);
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
