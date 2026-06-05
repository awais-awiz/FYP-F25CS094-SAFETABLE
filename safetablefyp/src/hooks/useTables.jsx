/**
 * Tables — Backend Integrated via /api/tables.
 * * Logic:
 * - The backend tracks "active sessions" per table.
 * - 'Occupied' = An active session exists.
 * - 'Available' = No active session.
 */
import { create } from "zustand";
import { tablesApi } from "@/lib/api";

const fromSession = (s, meta = {}) => {
  let status = meta[s.table_number] || "available";
  if (s.is_active) {
    status = "occupied";
  }
  return {
    id:          s.table_number,
    status:      status,
    zone:        s.language === "en" ? "Main Hall" : "Patio",
    seats:       4,
    lastUpdated: s.updated_at || s.created_at || new Date().toISOString(),
    raw:         s,
  };
};

export const useTables = create((set, get) => ({
  tables: [],
  loading: false,
  error: null,

  // Loads active table sessions from the server
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const r = await tablesApi.active();
      const active = (r.active_tables || []).map((t) => fromSession(t, r.meta || {}));
      
      // Generate a default floor plan of 20 tables. 
      // If a table has an active session from the backend, use that data.
      const byId = new Map(active.map((t) => [t.id, t]));
      const meta = r.meta || {};
      const display = Array.from({ length: 20 }, (_, i) => {
        const id = i + 1;
        return byId.get(id) || {
          id,
          status: meta[id] || "available",
          seats: 4,
          zone: "Main Hall",
          lastUpdated: new Date().toISOString(),
        };
      });
      
      set({ tables: display, loading: false });
    } catch (err) {
      set({ loading: false, error: err.message });
    }
  },

  /** * Compatibility: Maps the old manual initialization to the new backend refresh.
   */
  initializeTables: () => get().refresh(),

  /**
   * Updates table status by creating or ending a backend session.
   */
  updateStatus: async (id, status) => {
    try {
      if (status === "available") {
        await tablesApi.endSession(id).catch(() => {});
        await tablesApi.updateStatus(id, "available").catch(() => {});
      } else if (status === "occupied") {
        await tablesApi.createSession(id).catch(() => {});
      } else {
        await tablesApi.updateStatus(id, status).catch(() => {});
      }
    } catch (err) {
      // Logic for permission errors (e.g. only staff can change table status)
      console.warn("[useTables] updateStatus failed:", err.message);
    }
    // Refresh list to show the new state from the server
    await get().refresh();
  },
}));

export default useTables;