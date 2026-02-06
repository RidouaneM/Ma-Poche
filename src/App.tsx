import React, { useEffect, useMemo, useState } from "react";

type TxType = "Income" | "Expenses" | "Savings" | "Investments";

type Transaction = {
  id: string;
  date: string; // "YYYY-MM-DD"
  type: TxType;
  category: string;
  amount: number;
  details?: string;
};

type BudgetStore = Record<string, number>; // key = `${monthKey}|${type}|${category}` monthKey = "YYYY-MM"

const TX_STORAGE_KEY = "finance_app_step1_transactions_v1";
const BUDGET_STORAGE_KEY = "finance_app_step2_budgets_v1";

const TYPE_LABELS: Record<TxType, string> = {
  Income: "Income",
  Expenses: "Expenses",
  Savings: "Savings",
  Investments: "Investments",
};

const TYPE_STYLE: Record<
  TxType,
  { bg: string; border: string; text: string; chip: string }
> = {
  Income: {
    bg: "#dcfce7",
    border: "#16a34a",
    text: "#14532d",
    chip: "#16a34a",
  },
  Expenses: {
    bg: "#fee2e2",
    border: "#dc2626",
    text: "#7f1d1d",
    chip: "#dc2626",
  },
  Savings: {
    bg: "#dbeafe",
    border: "#2563eb",
    text: "#1e3a8a",
    chip: "#2563eb",
  },
  Investments: {
    bg: "#ede9fe",
    border: "#7c3aed",
    text: "#581c87",
    chip: "#7c3aed",
  },
};

const CATEGORIES: Record<TxType, string[]> = {
  Income: ["Salary", "Scholarship", "Family Support", "Side hustle"],
  Expenses: [
    "Rent",
    "Transport",
    "Groceries",
    "Phone & Internet",
    "Subscriptions",
    "School & Books",
    "Health",
    "Leisure",
  ],
  Savings: ["Emergency Fund", "Travel", "Other Savings"],
  Investments: ["Crypto", "Stocks", "Other Investment"],
};

function monthKeyFromDate(dateStr: string) {
  return dateStr.slice(0, 7);
}

function money(n: number) {
  if (!Number.isFinite(n)) return "0.00 $";
  return `${n.toFixed(2)} $`;
}

function safeParseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sumByType(transactions: Transaction[], type: TxType) {
  return transactions
    .filter((t) => t.type === type)
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
}

function sumForMonthTypeCategory(
  transactions: Transaction[],
  monthKey: string,
  type: TxType,
  category: string
) {
  return transactions
    .filter(
      (t) =>
        monthKeyFromDate(t.date) === monthKey &&
        t.type === type &&
        t.category === category
    )
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
}

/* ---------- Small UI Components ---------- */

const Card: React.FC<{ title: string; value: string }> = ({ title, value }) => (
  <div
    style={{
      border: "1px solid #ddd",
      borderRadius: 12,
      padding: 14,
      minWidth: 140,
      background: "#fff",
    }}
  >
    <div style={{ fontSize: 13, opacity: 0.75 }}>{title}</div>
    <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
  </div>
);

const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "danger" | "ghost";
  disabled?: boolean;
}> = ({ children, onClick, variant = "primary", disabled }) => {
  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: "#111827",
      color: "white",
      border: "1px solid #111827",
    },
    danger: {
      background: "#b91c1c",
      color: "white",
      border: "1px solid #b91c1c",
    },
    ghost: {
      background: "transparent",
      color: "#111827",
      border: "1px solid #d1d5db",
    },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 14px",
        borderRadius: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        fontWeight: 700,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
};

function Tabs({
  active,
  setActive,
}: {
  active: "tracking" | "plan" | "dashboard";
  setActive: (v: "tracking" | "plan" | "dashboard") => void;
}) {
  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    background: isActive ? "#111827" : "transparent",
    color: isActive ? "white" : "#111827",
    fontWeight: 800,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
      <div style={tabStyle(active === "tracking")} onClick={() => setActive("tracking")}>
        Tracking
      </div>
      <div style={tabStyle(active === "plan")} onClick={() => setActive("plan")}>
        Plan (Budget)
      </div>
      <div style={tabStyle(active === "dashboard")} onClick={() => setActive("dashboard")}>
        Dashboard
      </div>
    </div>
  );
}

function LegendItem({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: color,
          display: "inline-block",
        }}
      />
      <span style={{ opacity: 0.9, fontWeight: 700 }}>{label}</span>
    </div>
  );
}

/* ---------- Simple Bar Chart (no libs) ---------- */
function BarChart({
  labels,
  series,
  colors,
}: {
  labels: string[];
  series: number[][];
  colors: string[];
}) {
  const allValues = series.flat();
  const max = Math.max(1, ...allValues.map((v) => (Number.isFinite(v) ? v : 0)));
  const steps = 4; // nombre de graduations
const ticks = Array.from({ length: steps + 1 }, (_, i) =>
  Math.round((max * (steps - i)) / steps)
);

function LineChart({
  labels,
  values,
  color,
}: {
  labels: string[];
  values: number[];
  color: string;
}) {
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));

  return (
    <div style={{ overflowX: "auto", padding: 8 }}>
      <svg width={labels.length * 80} height={220}>
        <line x1="40" y1="10" x2="40" y2="190" stroke="#ccc" />
        <line x1="40" y1="190" x2={labels.length * 80} y2="190" stroke="#ccc" />

        {values.map((v, i) => {
          const x = 40 + i * 80;
          const y = 190 - (v / max) * 160;
          const prevX = i > 0 ? 40 + (i - 1) * 80 : x;
          const prevY = i > 0 ? 190 - (values[i - 1] / max) * 160 : y;

          return (
            <g key={i}>
              {i > 0 && (
                <line x1={prevX} y1={prevY} x2={x} y2={y} stroke={color} strokeWidth="3" />
              )}
              <circle cx={x} cy={y} r="5" fill={color} />
              <text x={x} y={205} textAnchor="middle" fontSize="12">
                {labels[i]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

return (
  <div style={{ display: "flex", alignItems: "stretch" }}>
    {/* Axe Y en $ */}
    <div
      style={{
        width: 60,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        fontSize: 12,
        opacity: 0.75,
        paddingRight: 6,
      }}
    >
      {ticks.map((v, i) => (
        <div key={i}>{money(v)}</div>
      ))}
    </div>

    {/* Graphique */}
    <div style={{ overflowX: "auto", flex: 1 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(
            1,
            labels.length
          )}, minmax(52px, 1fr))`,
          gap: 10,
          alignItems: "end",
          padding: 8,
        }}
      >
        {labels.map((lab, i) => (
          <div key={lab} style={{ textAlign: "center" }}>
            <div
              style={{
                height: 180,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                gap: 5,
              }}
            >
              {series.map((s, j) => {
                const v = Number.isFinite(s[i]) ? s[i] : 0;
                const h = (v / max) * 100;
                return (
                  <div
                    key={j}
                    title={`${lab}: ${money(v)}`}
                    style={{
                      width: 14,
                      height: `${h}%`,
                      background: colors[j] ?? "#999",
                      borderRadius: 6,
                    }}
                  />
                );
              })}
            </div>
            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.85 }}>{lab}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"tracking" | "plan" | "dashboard">("tracking");

  /* ----------------------------
   * Transactions (Tracking)
   * ---------------------------- */
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    safeParseJSON<Transaction[]>(localStorage.getItem(TX_STORAGE_KEY), [])
  );

  useEffect(() => {
    localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(transactions));
  }, [transactions]);

  // Form state
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const defaultDate = `${yyyy}-${mm}-${dd}`;

  const [date, setDate] = useState(defaultDate);
  const [type, setType] = useState<TxType>("Expenses");
  const [category, setCategory] = useState(CATEGORIES["Expenses"][0]);
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");

  useEffect(() => {
    setCategory(CATEGORIES[type][0] ?? "");
  }, [type]);

  const totals = useMemo(() => {
    const income = sumByType(transactions, "Income");
    const expenses = sumByType(transactions, "Expenses");
    const savings = sumByType(transactions, "Savings");
    const investments = sumByType(transactions, "Investments");
    const net = income - expenses - savings - investments;
    return { income, expenses, savings, investments, net };
  }, [transactions]);

  function addTransaction() {
    const n = Number(amount);
    if (!date || !type || !category || !Number.isFinite(n)) return;

    const tx: Transaction = {
      id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())) as string,
      date,
      type,
      category,
      amount: n,
      details: details.trim() ? details.trim() : undefined,
    };

    setTransactions((prev) => [tx, ...prev]);
    setAmount("");
    setDetails("");
  }

  function deleteTransaction(id: string) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  function clearAll() {
    if (!confirm("Clear all transactions?")) return;
    setTransactions([]);
  }

  /* ----------------------------
   * Budgets (Plan)
   * ---------------------------- */
  const [budgets, setBudgets] = useState<BudgetStore>(() =>
    safeParseJSON<BudgetStore>(localStorage.getItem(BUDGET_STORAGE_KEY), {})
  );

  useEffect(() => {
    localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(budgets));
  }, [budgets]);

  const allMonthsInTx = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) set.add(monthKeyFromDate(t.date));
    return Array.from(set).sort();
  }, [transactions]);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => `${yyyy}-${mm}`);

  function getBudget(monthKey: string, t: TxType, cat: string) {
    return budgets[`${monthKey}|${t}|${cat}`] ?? 0;
  }

  function setBudget(monthKey: string, t: TxType, cat: string, value: number) {
    const key = `${monthKey}|${t}|${cat}`;
    setBudgets((prev) => ({ ...prev, [key]: Number.isFinite(value) ? value : 0 }));
  }

  function monthBudgetTotal(monthKey: string, t: TxType) {
    return CATEGORIES[t].reduce((acc, cat) => acc + getBudget(monthKey, t, cat), 0);
  }

  function monthTrackedTotal(monthKey: string, t: TxType) {
    return CATEGORIES[t].reduce(
      (acc, cat) => acc + sumForMonthTypeCategory(transactions, monthKey, t, cat),
      0
    );
  }

  /* ----------------------------
   * Dashboard calculations
   * ---------------------------- */
  useEffect(() => {
    if (allMonthsInTx.length === 0) return;
    if (!selectedMonth || selectedMonth.length !== 7) {
      setSelectedMonth(allMonthsInTx[allMonthsInTx.length - 1]);
    }
  }, [allMonthsInTx]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthTotals = useMemo(() => {
    return allMonthsInTx.map((m) => {
      const income = monthTrackedTotal(m, "Income");
      const expenses = monthTrackedTotal(m, "Expenses");
      const savings = monthTrackedTotal(m, "Savings");
      const investments = monthTrackedTotal(m, "Investments");
      return {
        month: m,
        income,
        expenses,
        savings,
        investments,
        net: income - expenses - savings - investments,
      };
    });
  }, [allMonthsInTx, transactions]);

  const selectedMonthStats = useMemo(() => {
    const found = monthTotals.find((x) => x.month === selectedMonth);
    return (
      found ?? {
        month: selectedMonth,
        income: 0,
        expenses: 0,
        savings: 0,
        investments: 0,
        net: 0,
      }
    );
  }, [monthTotals, selectedMonth]);

  function budgetSumForType(monthKey: string, t: TxType) {
    return CATEGORIES[t].reduce((acc, cat) => acc + getBudget(monthKey, t, cat), 0);
  }

  function trackedSumForType(monthKey: string, t: TxType) {
    return CATEGORIES[t].reduce(
      (acc, cat) => acc + sumForMonthTypeCategory(transactions, monthKey, t, cat),
      0
    );
  }

  const dashboardBudgetVsTracked = useMemo(() => {
    const m = selectedMonth;
    return {
      budget: {
        Income: budgetSumForType(m, "Income"),
        Expenses: budgetSumForType(m, "Expenses"),
        Savings: budgetSumForType(m, "Savings"),
        Investments: budgetSumForType(m, "Investments"),
      },
      tracked: {
        Income: trackedSumForType(m, "Income"),
        Expenses: trackedSumForType(m, "Expenses"),
        Savings: trackedSumForType(m, "Savings"),
        Investments: trackedSumForType(m, "Investments"),
      },
    };
  }, [selectedMonth, budgets, transactions]);

  const topExpenses = useMemo(() => {
    const m = selectedMonth;
    const rows = CATEGORIES.Expenses
      .map((c) => ({
        category: c,
        total: sumForMonthTypeCategory(transactions, m, "Expenses", c),
      }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    return rows;
  }, [selectedMonth, transactions]);



  /* ----------------------------
   * UI
   * ---------------------------- */
  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto", fontFamily: "serif" }}>
      <h1
        style={{
          margin: 0,
          fontSize: "2.6rem",
          fontWeight: 700,
          color: "#e7b202",
          letterSpacing: "1px",
        }}
      >
        MA POCHE
      </h1>

      <div style={{ opacity: 0.75, marginTop: 6 }}>Mes finances dans ma poche et sous mes yeux !</div>

      <Tabs active={activeTab} setActive={setActiveTab} />

      {/* ---------------- Tracking Tab ---------------- */}
      {activeTab === "tracking" && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
            <Card title="Income" value={money(totals.income)} />
            <Card title="Expenses" value={money(totals.expenses)} />
            <Card title="Savings" value={money(totals.savings)} />
            <Card title="Investments" value={money(totals.investments)} />
            <Card title="Net" value={money(totals.net)} />
          </div>

          <div
            style={{
              marginTop: 18,
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 14,
              background: "#fff",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Add transaction</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Date</div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid #d1d5db",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Type</div>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as TxType)}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid #d1d5db",
                  }}
                >
                  {(Object.keys(TYPE_LABELS) as TxType[]).map((k) => (
                    <option key={k} value={k}>
                      {TYPE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Category</div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid #d1d5db",
                  }}
                >
                  {CATEGORIES[type].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Amount</div>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 25.50"
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid #d1d5db",
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Details (optional)</div>
              <input
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="note..."
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <Button onClick={addTransaction}>Add</Button>
              <Button variant="danger" onClick={clearAll}>
                Clear all
              </Button>

              <Button variant="ghost" onClick={() => downloadJSON("finance-transactions.json", transactions)}>
                Export
              </Button>

              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                Import
                <input
                  type="file"
                  accept="application/json"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    const data = safeParseJSON<Transaction[]>(text, []);
                    setTransactions(data);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <h2 style={{ marginBottom: 8 }}>Transactions ({transactions.length})</h2>

            <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: 12 }}>Date</th>
                    <th style={{ padding: 12 }}>Type</th>
                    <th style={{ padding: 12 }}>Category</th>
                    <th style={{ padding: 12 }}>Amount</th>
                    <th style={{ padding: 12 }}>Details</th>
                    <th style={{ padding: 12 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td style={{ padding: 12, opacity: 0.7 }} colSpan={6}>
                        No transactions yet. Add one above.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((t) => (
                      <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: 12 }}>{t.date}</td>
                        <td style={{ padding: 12 }}>{t.type}</td>
                        <td style={{ padding: 12 }}>{t.category}</td>
                        <td style={{ padding: 12 }}>{money(t.amount)}</td>
                        <td style={{ padding: 12 }}>{t.details ?? ""}</td>
                        <td style={{ padding: 12 }}>
                          <Button variant="ghost" onClick={() => deleteTransaction(t.id)}>
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ---------------- Plan Tab ---------------- */}
      {activeTab === "plan" && (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Planning</h2>

          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Selected month</div>
              <input
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                placeholder="YYYY-MM (e.g. 2026-01)"
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  minWidth: 220,
                }}
              />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                Months detected in your Tracking:{" "}
                {allMonthsInTx.length ? allMonthsInTx.join(", ") : "none yet"}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
            {(Object.keys(CATEGORIES) as TxType[]).map((t) => {
              const budgetTotal = monthBudgetTotal(selectedMonth, t);
              const trackedTotal = monthTrackedTotal(selectedMonth, t);
              const variance = budgetTotal - trackedTotal;
              const st = TYPE_STYLE[t];

              return (
                <div
                  key={t}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    background: "#fff",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: 12,
                      borderBottom: "1px solid #e5e7eb",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    {/* ✅ Header type (no CSS, no className) */}
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        fontWeight: 900,
                        fontSize: 16,
                        color: st.text,
                        background: st.bg,
                        borderLeft: `6px solid ${st.border}`,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: st.chip,
                          display: "inline-block",
                        }}
                      />
                      {TYPE_LABELS[t]}
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ opacity: 0.9 }}>
                        Budget: <b>{money(budgetTotal)}</b>
                      </div>
                      <div style={{ opacity: 0.9 }}>
                        Tracked: <b>{money(trackedTotal)}</b>
                      </div>
                      <div style={{ opacity: 0.9 }}>
                        Variance (Budget - Tracked): <b>{money(variance)}</b>
                      </div>
                    </div>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left", borderBottom: "1px solid #f3f4f6" }}>
                          <th style={{ padding: 12 }}>Category</th>
                          <th style={{ padding: 12 }}>Budget</th>
                          <th style={{ padding: 12 }}>Tracked</th>
                          <th style={{ padding: 12 }}>Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CATEGORIES[t].map((cat) => {
                          const b = getBudget(selectedMonth, t, cat);
                          const tr = sumForMonthTypeCategory(transactions, selectedMonth, t, cat);
                          const v = b - tr;

                          return (
                            <tr key={cat} style={{ borderBottom: "1px solid #f9fafb" }}>
                              <td style={{ padding: 12 }}>{cat}</td>
                              <td style={{ padding: 12 }}>
                                <input
                                  value={String(b)}
                                  onChange={(e) => setBudget(selectedMonth, t, cat, Number(e.target.value))}
                                  style={{
                                    padding: 8,
                                    borderRadius: 10,
                                    border: "1px solid #d1d5db",
                                    width: 140,
                                  }}
                                />
                              </td>
                              <td style={{ padding: 12 }}>{money(tr)}</td>
                              <td style={{ padding: 12 }}>{money(v)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- Dashboard Tab ---------------- */}
      {activeTab === "dashboard" && (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Dashboard</h2>

          <div
            style={{
              marginTop: 12,
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              background: "#fff",
            }}
          >
            <div style={{ fontWeight: 800 }}>Selected month:</div>

            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
                minWidth: 160,
              }}
            >
              {allMonthsInTx.length === 0 ? (
                <option value={`${yyyy}-${mm}`}>{`${yyyy}-${mm}`}</option>
              ) : (
                allMonthsInTx.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))
              )}
            </select>

            <div style={{ marginLeft: "auto", opacity: 0.8 }}>
              {allMonthsInTx.length === 0 ? "Add transactions to see charts." : `Available months: ${allMonthsInTx.length}`}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
            <Card title={`Income (${selectedMonth})`} value={money(selectedMonthStats.income)} />
            <Card title={`Expenses (${selectedMonth})`} value={money(selectedMonthStats.expenses)} />
            <Card title={`Savings (${selectedMonth})`} value={money(selectedMonthStats.savings)} />
            <Card title={`Investments (${selectedMonth})`} value={money(selectedMonthStats.investments)} />
            <Card title={`Net (${selectedMonth})`} value={money(selectedMonthStats.net)} />
          </div>

          <div
            style={{
              marginTop: 14,
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              background: "#fff",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Monthly evolution</div>

            {allMonthsInTx.length < 1 ? (
              <div style={{ opacity: 0.7 }}>No data.</div>
            ) : (
              <BarChart
                labels={monthTotals.map((x) => x.month)}
                series={[
                  monthTotals.map((x) => x.income),
                  monthTotals.map((x) => x.expenses),
                  monthTotals.map((x) => x.savings),
                  monthTotals.map((x) => x.investments),
                ]}
                colors={[
                  TYPE_STYLE.Income.border,
                  TYPE_STYLE.Expenses.border,
                  TYPE_STYLE.Savings.border,
                  TYPE_STYLE.Investments.border,
                ]}
              />
            )}

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
              <LegendItem label="Income" color={TYPE_STYLE.Income.border} />
              <LegendItem label="Expenses" color={TYPE_STYLE.Expenses.border} />
              <LegendItem label="Savings" color={TYPE_STYLE.Savings.border} />
              <LegendItem label="Investments" color={TYPE_STYLE.Investments.border} />
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              background: "#fff",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Budget vs Tracked — {selectedMonth}</div>

            <BarChart
              labels={["Income", "Expenses", "Savings", "Investments"]}
              series={[
                [
                  dashboardBudgetVsTracked.budget.Income,
                  dashboardBudgetVsTracked.budget.Expenses,
                  dashboardBudgetVsTracked.budget.Savings,
                  dashboardBudgetVsTracked.budget.Investments,
                ],
                [
                  dashboardBudgetVsTracked.tracked.Income,
                  dashboardBudgetVsTracked.tracked.Expenses,
                  dashboardBudgetVsTracked.tracked.Savings,
                  dashboardBudgetVsTracked.tracked.Investments,
                ],
              ]}
              colors={["#0f172a", "#9ca3af"]}
            />

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
              <LegendItem label="Budget" color="#0f172a" />
              <LegendItem label="Tracked" color="#9ca3af" />
            </div>
          </div>

          <div   
          >
            
            
          </div>
        </div>
      )}
    </div>
  );
}
