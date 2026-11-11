import { useEffect, useState } from "react";
import "./App.css";

type HealthState =
  | { status: "loading" }
  | { status: "ok"; body: unknown }
  | { status: "error"; message: string };

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

function App() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        const response = await fetch(`${API_BASE}/health`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const body: unknown = await response.json();
        if (!cancelled) {
          setHealth({ status: "ok", body });
        }
      } catch (error) {
        if (!cancelled) {
          setHealth({
            status: "error",
            message:
              error instanceof Error ? error.message : "Unknown health check error",
          });
        }
      }
    }

    void checkHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app">
      <h1>Skippio Challenge</h1>
      <p>Frontend ↔ backend connectivity check</p>

      {health.status === "loading" && <p>Checking backend health…</p>}
      {health.status === "ok" && (
        <pre className="ok">{JSON.stringify(health.body, null, 2)}</pre>
      )}
      {health.status === "error" && (
        <p className="error">
          Backend unreachable: {health.message}. Is it running on port 3001?
        </p>
      )}
    </main>
  );
}

export default App;
