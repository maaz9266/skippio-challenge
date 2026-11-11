import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

const SAMPLE_EVENT = {
  eventId: "evt_001",
  type: "payment.succeeded",
  order: {
    id: "ord_001",
    venueId: "venue_001",
    currency: "EUR",
    items: [
      { productId: "burger", quantity: 2, price: 1200 },
      { productId: "water", quantity: 1, price: 250 },
    ],
    total: 2650,
  },
};

type LogEntry = { at: string; label: string; body: unknown };

const App = () => {
  const [storeDump, setStoreDump] = useState<unknown>(null);
  const [orderLookup, setOrderLookup] = useState<unknown>(null);
  const [health, setHealth] = useState<string>("checking…");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const pushLog = useCallback((label: string, body: unknown) => {
    setLogs((prev) =>
      [{ at: new Date().toLocaleTimeString(), label, body }, ...prev].slice(
        0,
        12,
      ),
    );
  }, []);

  const refreshStore = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/dev/store`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const body: unknown = await response.json();
      setStoreDump(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load store");
    }
  }, []);

  const lookupOrder = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/orders/ord_001`);
      const body: unknown = await response.json().catch(() => null);
      setOrderLookup({ status: response.status, body });
    } catch (err) {
      setOrderLookup({
        error: err instanceof Error ? err.message : "Lookup failed",
      });
    }
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch(`${API_BASE}/health`);
        setHealth(response.ok ? "ok" : `HTTP ${response.status}`);
      } catch {
        setHealth("unreachable — start backend on :3001");
      }
    };
    void check();
    void refreshStore();
    void lookupOrder();
  }, [refreshStore, lookupOrder]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    const id = window.setInterval(() => {
      void refreshStore();
      void lookupOrder();
    }, 1000);
    return () => window.clearInterval(id);
  }, [autoRefresh, refreshStore, lookupOrder]);

  const run = async (label: string, action: () => Promise<Response>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await action();
      const body: unknown = await response.json().catch(() => null);
      pushLog(`${label} → ${response.status}`, body);
      await refreshStore();
      await lookupOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const submitSamplePayment = () =>
    run("POST /payment-events", () =>
      fetch(`${API_BASE}/payment-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(SAMPLE_EVENT),
      }),
    );

  const replaySameEvent = () =>
    run("POST /payment-events (duplicate)", () =>
      fetch(`${API_BASE}/payment-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(SAMPLE_EVENT),
      }),
    );

  const syncOnce = () =>
    run("POST /orders/ord_001/sync", () =>
      fetch(`${API_BASE}/orders/ord_001/sync`, { method: "POST" }),
    );

  const raceTwoSyncs = async () => {
    setBusy(true);
    setError(null);
    try {
      const [a, b] = await Promise.all([
        fetch(`${API_BASE}/orders/ord_001/sync?delayMs=120`, { method: "POST" }),
        fetch(`${API_BASE}/orders/ord_001/sync?delayMs=120`, { method: "POST" }),
      ]);
      const [bodyA, bodyB] = await Promise.all([a.json(), b.json()]);
      pushLog(`race A → ${a.status}`, bodyA);
      pushLog(`race B → ${b.status}`, bodyB);
      await refreshStore();
      await lookupOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Race request failed");
    } finally {
      setBusy(false);
    }
  };

  const resetStore = () =>
    run("POST /dev/store/reset", () =>
      fetch(`${API_BASE}/dev/store/reset`, { method: "POST" }),
    );

  return (
    <main className="app">
      <header className="header">
        <div>
          <h1>Skippio challenge</h1>
          <p className="muted">
            Spec APIs: payment-events, orders lookup/sync. Dev store panel kept
            for local inspection.
          </p>
        </div>
        <p className="health">
          Backend: <strong>{health}</strong>
        </p>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="panel">
        <h2>Actions</h2>
        <div className="actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitSamplePayment()}
          >
            1. Submit sample payment
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void replaySameEvent()}
          >
            2. Replay same event
          </button>
          <button type="button" disabled={busy} onClick={() => void syncOnce()}>
            3. POST /orders/ord_001/sync
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void raceTwoSyncs()}
          >
            4. Race two syncs
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void lookupOrder()}
          >
            GET /orders/ord_001
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void refreshStore()}
          >
            Refresh /dev/store
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resetStore()}
          >
            Reset store
          </button>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh every 1s
        </label>
      </section>

      <section className="panel">
        <h2>GET /orders/ord_001</h2>
        <pre className="dump">{JSON.stringify(orderLookup, null, 2)}</pre>
      </section>

      <section className="panel">
        <h2>GET /dev/store</h2>
        <pre className="dump">{JSON.stringify(storeDump, null, 2)}</pre>
      </section>

      <section className="panel">
        <h2>Recent responses</h2>
        {logs.length === 0 && <p className="muted">No actions yet.</p>}
        <ul className="logs">
          {logs.map((entry) => (
            <li key={`${entry.at}-${entry.label}`}>
              <div className="log-meta">
                <span>{entry.at}</span>
                <strong>{entry.label}</strong>
              </div>
              <pre className="dump">{JSON.stringify(entry.body, null, 2)}</pre>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};

export default App;
