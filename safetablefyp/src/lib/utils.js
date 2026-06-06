import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Deterministic prep time based on order ID (15-45 minutes)
export const getTargetPrepTime = (orderId) => {
  if (!orderId) return 30;
  let hash = 0;
  for (let i = 0; i < orderId.length; i++) {
    hash = orderId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return 15 + (Math.abs(hash) % 31);
};
