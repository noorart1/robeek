"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { iraqToday } from "../lib/dates";

// The month a finance ledger shows, kept in the URL (?month=2026-09) so it
// survives switching tabs (the tab links carry it) and reloading.
export function useUrlMonth() {
  const router = useRouter();
  const params = useSearchParams();
  const fromUrl = params.get("month");
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(fromUrl || "") ? fromUrl : iraqToday().slice(0, 7);

  function setMonth(value) {
    const query = new URLSearchParams(params);
    query.set("month", value);
    router.replace(`?${query}`, { scroll: false });
  }

  return [month, setMonth];
}
