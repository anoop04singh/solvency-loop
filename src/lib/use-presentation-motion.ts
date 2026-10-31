"use client";

import { useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

/** Keep the server and first browser render identical, then honor the live preference. */
export function usePresentationMotion() {
  const reduced = useReducedMotion();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated && reduced === false;
}
