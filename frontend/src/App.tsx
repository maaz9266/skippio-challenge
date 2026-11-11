import { useCallback, useMemo, useState } from "react";
import "./App.css";
import {
  getDevStore,
  getOrder,
  postPaymentEvent,
  resetDevStore,
  syncOrder,
  type LineItem,
  type OrderView,
} from "./api";
import { calculateTotalCents, formatEurCents } from "./money";

const emptyItem = (): LineItem => ({
  productId: "",
  quantity: 1,
  price: 0,
});

const readOrderFromBody = (body: unknown): OrderView | null => {
  if (!body || typeof body !== "object") {
    return null;
  }
  const order = (body as { order?: unknown }).order;
  if (!order || typeof order !== "object") {
    return null;
  }
  return order as OrderView;
};

const App = () => {
  const [eventId, setEventId] = useState("evt_001");
  const [orderId, setOrderId] = useState("ord_001");
  const [venueId, setVenueId] = useState("venue_001");
  const [items, setItems] = useState<LineItem[]>([
    { productId: "burger", quantity: 2, price: 1200 },
    { productId: "water", quantity: 1, price: 250 },
  ]);
  const [lookupId, setLookupId] = useState("ord_001");
  const [order, setOrder] = useState<OrderView | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "ok" | "error";
    message: string;
  } | null>(null);
  const [showDev, setShowDev] = useState(false);
  const [devStore, setDevStore] = useState<unknown>(null);

  const totalCents = useMemo(() => calculateTotalCents(items), [items]);

  const payload = useMemo(
    () => ({
      eventId,
      type: "payment.succeeded" as const,
      order: {
        id: orderId,
        venueId,
        currency: "EUR" as const,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          price: Number(item.price),
        })),
        total: totalCents,
      },
    }),
    [eventId, orderId, venueId, items, totalCents],
  );

  const setItem = (index: number, patch: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const refreshDev = useCallback(async () => {
    const result = await getDevStore();
    if (result.status === 200) {
      setDevStore(result.body);
    }
  }, []);

  const applyOrderResult = (body: unknown, fallbackMessage: string) => {
    const next = readOrderFromBody(body);
    if (next) {
      setOrder(next);
      setLookupId(next.id);
    }
    const error =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null;
    setFeedback({
      tone: error ? "error" : "ok",
      message: error ?? fallbackMessage,
    });
  };

  const submitPayment = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const result = await postPaymentEvent(payload);
      const duplicate =
        result.body &&
        typeof result.body === "object" &&
        "duplicate" in result.body &&
        Boolean((result.body as { duplicate?: boolean }).duplicate);
      applyOrderResult(
        result.body,
        duplicate
          ? `Duplicate acknowledged (${result.status})`
          : `Payment accepted (${result.status})`,
      );
      if (showDev) {
        await refreshDev();
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Submit failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const lookupOrder = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const result = await getOrder(lookupId.trim());
      if (result.status === 404) {
        setOrder(null);
        setFeedback({ tone: "error", message: "Order not found" });
      } else {
        applyOrderResult(result.body, `Lookup ok (${result.status})`);
      }
      if (showDev) {
        await refreshDev();
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Lookup failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const retrySync = async () => {
    if (!order) {
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const result = await syncOrder(order.id);
      applyOrderResult(result.body, `Sync finished (${result.status})`);
      if (showDev) {
        await refreshDev();
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Sync failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetStore = async () => {
    setLoading(true);
    try {
      await resetDevStore();
      setOrder(null);
      setFeedback({ tone: "ok", message: "Dev store reset" });
      await refreshDev();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Reset failed",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app">
      <header className="header">
        <div>
          <h1>Skippio</h1>
          <p className="muted">
            Submit a payment event, observe the first POS failure, then retry
            sync. Resubmit to demo duplicates.
          </p>
        </div>
      </header>

      {feedback && (
        <p className={feedback.tone === "ok" ? "banner ok" : "banner error"}>
          {feedback.message}
        </p>
      )}

      <section className="panel">
        <h2>Payment event</h2>
        <div className="grid">
          <label>
            Event ID
            <input
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Order ID
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Venue ID
            <input
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Currency
            <input value="EUR" disabled readOnly />
          </label>
        </div>

        <h3>Line items</h3>
        <div className="items">
          {items.map((item, index) => (
            <div className="item-row" key={`item-${index}`}>
              <label>
                Product ID
                <input
                  value={item.productId}
                  onChange={(e) => setItem(index, { productId: e.target.value })}
                  disabled={loading}
                />
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={item.quantity}
                  onChange={(e) =>
                    setItem(index, { quantity: Number(e.target.value) })
                  }
                  disabled={loading}
                />
              </label>
              <label>
                Unit price (cents)
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={item.price}
                  onChange={(e) =>
                    setItem(index, { price: Number(e.target.value) })
                  }
                  disabled={loading}
                />
              </label>
              <button
                type="button"
                className="secondary"
                disabled={loading || items.length <= 1}
                onClick={() =>
                  setItems((prev) => prev.filter((_, i) => i !== index))
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => setItems((prev) => [...prev, emptyItem()])}
        >
          Add line item
        </button>

        <p className="total">
          Calculated total: <strong>{formatEurCents(totalCents)}</strong> (
          {totalCents} cents)
        </p>

        <div className="actions">
          <button type="button" disabled={loading} onClick={() => void submitPayment()}>
            {loading ? "Working…" : "Submit payment event"}
          </button>
          <button type="button" disabled={loading} onClick={() => void submitPayment()}>
            Resubmit same event
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Order lookup</h2>
        <div className="lookup-row">
          <label>
            Order ID
            <input
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              disabled={loading}
            />
          </label>
          <button type="button" disabled={loading} onClick={() => void lookupOrder()}>
            Look up
          </button>
        </div>

        {order ? (
          <div className="order">
            <dl className="meta">
              <div>
                <dt>Order</dt>
                <dd>{order.id}</dd>
              </div>
              <div>
                <dt>Venue</dt>
                <dd>{order.venueId}</dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>{order.paymentStatus}</dd>
              </div>
              <div>
                <dt>POS</dt>
                <dd>{order.posStatus}</dd>
              </div>
              <div>
                <dt>POS attempts</dt>
                <dd>{order.posAttemptCount}</dd>
              </div>
              <div>
                <dt>POS reference</dt>
                <dd>{order.posTransactionRef ?? "—"}</dd>
              </div>
              <div>
                <dt>Refund</dt>
                <dd>
                  {order.refundStatus}
                  {order.refundedAmount !== undefined
                    ? ` (${formatEurCents(order.refundedAmount)})`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{formatEurCents(order.total)}</dd>
              </div>
            </dl>

            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Line</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={`${item.productId}-${item.quantity}-${item.price}`}>
                    <td>{item.productId}</td>
                    <td>{item.quantity}</td>
                    <td>{formatEurCents(item.price)}</td>
                    <td>{formatEurCents(item.quantity * item.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="actions">
              <button
                type="button"
                disabled={loading || order.posStatus !== "failed"}
                onClick={() => void retrySync()}
              >
                Retry POS sync
              </button>
              {order.posStatus === "failed" && (
                <span className="muted">
                  First attempt fails by design — retry should succeed.
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="muted">No order loaded yet.</p>
        )}
      </section>

      <section className="panel">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const next = !showDev;
            setShowDev(next);
            if (next) {
              void refreshDev();
            }
          }}
        >
          {showDev ? "Hide" : "Show"} local /dev store
        </button>
        {showDev && (
          <>
            <div className="actions" style={{ marginTop: "0.75rem" }}>
              <button type="button" disabled={loading} onClick={() => void refreshDev()}>
                Refresh
              </button>
              <button type="button" disabled={loading} onClick={() => void resetStore()}>
                Reset store
              </button>
            </div>
            <pre className="dump">{JSON.stringify(devStore, null, 2)}</pre>
          </>
        )}
      </section>
    </main>
  );
};

export default App;
