import type { Campaign } from "./api";

export function campaignLabel(c: Campaign): string {
  return `${c.title} (${c.id})`;
}
