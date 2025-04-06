"use client";
import { useEffect } from "react";

export default function ViewTransitionWrapper({ children }) {
  useEffect(() => {
    if (document.startViewTransition) {
      document.startViewTransition(() => Promise.resolve());
    }
  }, []);
  return children;
}
