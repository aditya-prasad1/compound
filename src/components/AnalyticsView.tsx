"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import type { Meal } from "@/lib/nutrition";
import { getTargets, localDateKey, type Targets } from "@/lib/nutrition";
import { getSupabaseAuthHeaders, getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useTheme } from "@/lib/theme";

type DateRange = "7d" | "30d";

type DayStats = {
  date: string;
  label: string;
  weekday: string;
  dayNumber: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealCount: number;
  hasData: boolean;
};

type EntryRecord = {
  id: string;
  description: string;
  meal: Meal;
  entry_date?: string;
  created_at: string;
};

export default function AnalyticsView() {
  const { effective, mounted, cycleTheme } = useTheme();
  const [range, setRange] = useState<DateRange>("7d");
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [entries, setEntries] = useState<EntryRecord[]>([]);

  const [calorieGoal, setCalorieGoal] = useState(2200);
  const [proteinGoal, setProteinGoal] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const [hoveredCalorieIndex, setHoveredCalorieIndex] = useState<number | null>(null);
  const [hoveredProteinIndex, setHoveredProteinIndex] = useState<number | null>(null);

  const targets: Targets = useMemo(() => getTargets(calorieGoal, proteinGoal), [calorieGoal, proteinGoal]);

  // Load saved preferences & authenticate with Supabase
  useEffect(() => {
    setToday(localDateKey());
    const savedGoal = localStorage.getItem("compound-targets") ?? localStorage.getItem("calorie-targets");
    if (savedGoal) {
      try {
        const goal = JSON.parse(savedGoal) as { calories?: number; protein?: number | null };
        if (goal.calories) setCalorieGoal(Number(goal.calories));
        if (goal.protein) setProteinGoal(Number(goal.protein));
      } catch {
        // fallback to defaults
      }
    }

    const client = getSupabaseBrowserClient();
    if (!client) {
      setAuthReady(true);
      setLoading(false);
      return;
    }

    let mounted = true;
    const syncUser = (user: User | null) => {
      if (!mounted) return;
      setAuthUser(user);
      if (user) {
        localStorage.setItem("compound-user-id", user.id);
      } else {
        localStorage.removeItem("compound-user-id");
        localStorage.removeItem("calorie-user-id");
      }
    };

    client.auth
      .getUser()
      .then(({ data, error }) => {
        if (error) throw error;
        syncUser(data.user);
      })
      .catch(() => {
        // Unauthenticated or network issue
      })
      .finally(() => {
        if (mounted) setAuthReady(true);
      });

    const { data: authSubscription } = client.auth.onAuthStateChange((_event, session) =>
      syncUser(session?.user ?? null)
    );

    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  // Generate continuous list of dates for the selected range (7d or 30d)
  const rangeDates = useMemo(() => {
    if (!today) return [];
    const count = range === "7d" ? 7 : 30;
    const dates: string[] = [];
    const baseDate = new Date(`${today}T12:00:00`);
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() - i);
      dates.push(localDateKey(d));
    }
    return dates;
  }, [range, today]);

  const fromDate = rangeDates[0] ?? "";
  const toDate = rangeDates[rangeDates.length - 1] ?? "";

  // Fetch real data from Supabase for the authenticated user only
  useEffect(() => {
    if (!authReady) return;

    if (!authUser) {
      // Check local cache if available on this device
      const savedEntries = localStorage.getItem("compound-entries") ?? localStorage.getItem("calorie-entries");
      if (savedEntries) {
        try {
          const parsed = JSON.parse(savedEntries) as Array<{
            id: string;
            description: string;
            meal: Meal;
            createdAt?: string;
            created_at?: string;
          }>;
          const mapped: EntryRecord[] = parsed.map((e) => ({
            id: e.id,
            description: e.description,
            meal: e.meal,
            entry_date: (e.createdAt ?? e.created_at ?? "").slice(0, 10),
            created_at: e.createdAt ?? e.created_at ?? new Date().toISOString(),
          }));
          setEntries(mapped);
        } catch {
          setEntries([]);
        }
      } else {
        setEntries([]);
      }
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function fetchAnalyticsData() {
      setLoading(true);
      setError("");
      try {
        const headers = await getSupabaseAuthHeaders();
        const response = await fetch(`/api/log?from=${fromDate}&to=${toDate}`, {
          headers,
          cache: "no-store",
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error ?? `Error loading analytics (${response.status})`);
        }

        const data = await response.json();
        if (cancelled) return;

        if (Array.isArray(data.entries)) {
          setEntries(data.entries);
        } else {
          setEntries([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load nutrition analytics.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchAnalyticsData();
    return () => {
      cancelled = true;
    };
  }, [authReady, authUser, fromDate, toDate]);

  // Aggregate intake day by day across the date range
  const dailyData: DayStats[] = useMemo(() => {
    if (!today || !rangeDates.length) return [];
    return rangeDates.map((dateKey) => {
      const dateObj = new Date(`${dateKey}T12:00:00`);
      const isToday = dateKey === today;
      const weekday = new Intl.DateTimeFormat("en", { weekday: "short" }).format(dateObj);
      const dayNumber = dateObj.getDate();
      const month = new Intl.DateTimeFormat("en", { month: "short" }).format(dateObj);
      const label = isToday ? "Today" : `${weekday}, ${month} ${dayNumber}`;

      const dayEntries = entries.filter((entry) => {
        const entryKey = entry.entry_date ?? entry.created_at?.slice(0, 10);
        return entryKey === dateKey;
      });

      const calories = dayEntries.reduce((sum, e) => sum + (e.meal?.totals?.calories || 0), 0);
      const protein = dayEntries.reduce((sum, e) => sum + (e.meal?.totals?.protein_g || 0), 0);
      const carbs = dayEntries.reduce((sum, e) => sum + (e.meal?.totals?.carbs_g || 0), 0);
      const fat = dayEntries.reduce((sum, e) => sum + (e.meal?.totals?.fat_g || 0), 0);

      return {
        date: dateKey,
        label,
        weekday,
        dayNumber,
        calories: Math.round(calories),
        protein: Math.round(protein * 10) / 10,
        carbs: Math.round(carbs * 10) / 10,
        fat: Math.round(fat * 10) / 10,
        mealCount: dayEntries.length,
        hasData: dayEntries.length > 0,
      };
    });
  }, [rangeDates, entries]);

  // Period summary statistics
  const summary = useMemo(() => {
    const daysCount = dailyData.length;
    const trackedDays = dailyData.filter((d) => d.hasData);
    const trackedCount = trackedDays.length;

    const totalCalories = dailyData.reduce((sum, d) => sum + d.calories, 0);
    const totalProtein = dailyData.reduce((sum, d) => sum + d.protein, 0);

    const avgDailyCalories = daysCount > 0 ? Math.round(totalCalories / daysCount) : 0;
    const avgTrackedCalories = trackedCount > 0 ? Math.round(totalCalories / trackedCount) : 0;

    const avgDailyProtein = daysCount > 0 ? Math.round((totalProtein / daysCount) * 10) / 10 : 0;
    const avgTrackedProtein = trackedCount > 0 ? Math.round((totalProtein / trackedCount) * 10) / 10 : 0;

    const calorieDiff = avgDailyCalories - targets.calories;
    const proteinDiff = Math.round((avgDailyProtein - targets.protein) * 10) / 10;

    return {
      daysCount,
      trackedCount,
      totalCalories,
      totalProtein: Math.round(totalProtein),
      avgDailyCalories,
      avgTrackedCalories,
      avgDailyProtein,
      avgTrackedProtein,
      calorieDiff,
      proteinDiff,
      adherenceRate: daysCount > 0 ? Math.round((trackedCount / daysCount) * 100) : 0,
    };
  }, [dailyData, targets]);

  async function signInWithGoogle() {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setError("Supabase is not configured. Add environment variables to enable authentication.");
      return;
    }
    setError("");
    const redirectTo = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setError(error.message);
  }

  async function signOut() {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) {
      setError(error.message);
      return;
    }
    localStorage.removeItem("compound-entries");
    localStorage.removeItem("calorie-entries");
    setEntries([]);
    setShowSettings(false);
    window.location.replace(`${window.location.origin}/`);
  }

  function handleSaveGoal(cal: number, prot: number | null) {
    setCalorieGoal(cal);
    setProteinGoal(prot);
    localStorage.setItem("compound-targets", JSON.stringify({ calories: cal, protein: prot }));
  }

  const selectedCalorieDay = hoveredCalorieIndex !== null ? dailyData[hoveredCalorieIndex] : null;
  const selectedProteinDay = hoveredProteinIndex !== null ? dailyData[hoveredProteinIndex] : null;

  return (
    <main className="app-shell">
      {/* Navigation Topbar */}
      <header className="topbar">
        <div className="topbar-brand">
          <Link href="/" className="brand">
            compound<span>.</span>
          </Link>
          <div className="eyebrow">small actions, lasting change</div>
        </div>

        <nav className="topbar-nav" aria-label="Main navigation">
          <Link href="/" className="nav-tab">
            Today
          </Link>
          <Link href="/analytics" className="nav-tab active">
            Analytics
          </Link>
        </nav>

        <div className="topbar-actions">
          <button
            className="theme-toggle"
            onClick={cycleTheme}
            aria-label={mounted ? `Theme: ${effective}. Click to toggle` : "Toggle theme"}
            title={mounted ? `Theme: ${effective}` : "Toggle theme"}
            suppressHydrationWarning
          >
            <ThemeIcon mode={effective} />
          </button>
          <button
            className="settings-button"
            onClick={() => setShowSettings(true)}
            aria-label="Open settings"
          >
            <Sliders />
          </button>
        </div>
      </header>

      {/* Analytics Hero / Header */}
      <section className="analytics-hero">
        <div className="analytics-header">
          <div>
            <p className="section-kicker">Nutrition Trends</p>
            <h1 className="analytics-title">Historical Analytics</h1>
            <p className="analytics-subtitle">
              {range === "7d" ? "Past 7 days" : "Past 30 days"} · {formatDateDisplay(fromDate)} –{" "}
              {formatDateDisplay(toDate)}
            </p>
          </div>

          <div className="range-switcher" role="tablist" aria-label="Date range selector">
            <button
              role="tab"
              aria-selected={range === "7d"}
              className={`range-button ${range === "7d" ? "active" : ""}`}
              onClick={() => setRange("7d")}
            >
              7 Days
            </button>
            <button
              role="tab"
              aria-selected={range === "30d"}
              className={`range-button ${range === "30d" ? "active" : ""}`}
              onClick={() => setRange("30d")}
            >
              30 Days
            </button>
          </div>
        </div>

        {/* Auth Notice if unauthenticated */}
        {authReady && !authUser && (
          <div className="auth-callout-banner">
            <div className="auth-callout-text">
              <strong>Sign in to view your real synced history</strong>
              <p>Connect your Google account to analyze your complete historical meals across devices.</p>
            </div>
            <button
              type="button"
              className="track-button compact"
              onClick={() => void signInWithGoogle()}
            >
              Continue with Google
            </button>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="analytics-error-banner">
            <p className="error-note">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="analytics-loading-card">
            <Spinner />
            <span>Loading historical nutrition trends...</span>
          </div>
        ) : (
          <>
            {/* KPI Summary Cards */}
            <div className="stats-grid">
              {/* Calories Average */}
              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-kicker">Average Daily Calories</span>
                  <span className="stat-pill-goal">Goal: {targets.calories} kcal</span>
                </div>
                <div className="stat-value-row">
                  <span className="stat-number">{summary.avgDailyCalories}</span>
                  <span className="stat-unit">kcal / day</span>
                </div>
                <div className="stat-footer">
                  <span
                    className={`delta-badge ${
                      Math.abs(summary.calorieDiff) <= 100
                        ? "neutral"
                        : summary.calorieDiff > 0
                        ? "over"
                        : "under"
                    }`}
                  >
                    {summary.calorieDiff > 0 ? `+${summary.calorieDiff}` : summary.calorieDiff} kcal vs goal
                  </span>
                  {summary.daysCount !== summary.trackedCount && (
                    <span className="stat-subtext">
                      Tracked days avg: {summary.avgTrackedCalories} kcal
                    </span>
                  )}
                </div>
              </div>

              {/* Protein Average */}
              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-kicker">Average Daily Protein</span>
                  <span className="stat-pill-goal">Goal: {targets.protein}g</span>
                </div>
                <div className="stat-value-row">
                  <span className="stat-number">{summary.avgDailyProtein}</span>
                  <span className="stat-unit">g / day</span>
                </div>
                <div className="stat-footer">
                  <span
                    className={`delta-badge ${
                      summary.proteinDiff >= 0 ? "good" : Math.abs(summary.proteinDiff) <= 15 ? "neutral" : "under"
                    }`}
                  >
                    {summary.proteinDiff > 0 ? `+${summary.proteinDiff}g` : `${summary.proteinDiff}g`} vs goal
                  </span>
                  {summary.daysCount !== summary.trackedCount && (
                    <span className="stat-subtext">
                      Tracked days avg: {summary.avgTrackedProtein}g
                    </span>
                  )}
                </div>
              </div>

              {/* Consistency */}
              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-kicker">Tracking Consistency</span>
                  <span className="stat-pill-goal">{summary.adherenceRate}%</span>
                </div>
                <div className="stat-value-row">
                  <span className="stat-number">{summary.trackedCount}</span>
                  <span className="stat-unit">/ {summary.daysCount} days</span>
                </div>
                <div className="stat-footer">
                  <span className="stat-subtext">
                    {summary.daysCount - summary.trackedCount === 0
                      ? "100% of days tracked"
                      : `${summary.daysCount - summary.trackedCount} untracked days in period`}
                  </span>
                </div>
              </div>

              {/* Total period energy */}
              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-kicker">Total Period Intake</span>
                </div>
                <div className="stat-value-row">
                  <span className="stat-number">
                    {summary.totalCalories.toLocaleString()}
                  </span>
                  <span className="stat-unit">kcal</span>
                </div>
                <div className="stat-footer">
                  <span className="stat-subtext">
                    {summary.totalProtein.toLocaleString()}g total protein logged
                  </span>
                </div>
              </div>
            </div>

            {/* Empty State if absolutely zero data across period */}
            {summary.trackedCount === 0 ? (
              <div className="empty-state analytics-empty">
                <div className="empty-mark">+</div>
                <p>No meals logged in the past {range === "7d" ? "7" : "30"} days.</p>
                <Link href="/" className="track-button compact">
                  Track a meal today
                </Link>
              </div>
            ) : (
              <>
                {/* CALORIE INTAKE CHART */}
                <section className="chart-card" aria-label="Daily Calorie Intake Chart">
                  <div className="chart-card-header">
                    <div>
                      <h2 className="chart-title">Daily Calorie Intake</h2>
                      <div className="chart-inspection">
                        {selectedCalorieDay ? (
                          <span>
                            <strong>{selectedCalorieDay.label}:</strong>{" "}
                            {selectedCalorieDay.calories} kcal ·{" "}
                            {selectedCalorieDay.calories - targets.calories >= 0 ? "+" : ""}
                            {selectedCalorieDay.calories - targets.calories} kcal vs goal
                            {selectedCalorieDay.mealCount > 0 &&
                              ` (${selectedCalorieDay.mealCount} ${
                                selectedCalorieDay.mealCount === 1 ? "meal" : "meals"
                              })`}
                          </span>
                        ) : (
                          <span className="inspection-hint">
                            Hover or tap a bar for detailed daily figures
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="chart-legend">
                      <span className="legend-item">
                        <span className="legend-swatch bar-calorie" /> Daily Intake
                      </span>
                      <span className="legend-item">
                        <span className="legend-swatch line-goal" /> Goal ({targets.calories} kcal)
                      </span>
                    </div>
                  </div>

                  <div className="chart-canvas-wrapper">
                    <NutritionChart
                      data={dailyData}
                      dataKey="calories"
                      goal={targets.calories}
                      unit="kcal"
                      barColorClass="calorie"
                      range={range}
                      hoveredIndex={hoveredCalorieIndex}
                      onHoverChange={setHoveredCalorieIndex}
                    />
                  </div>
                </section>

                {/* PROTEIN INTAKE CHART */}
                <section className="chart-card" aria-label="Daily Protein Intake Chart">
                  <div className="chart-card-header">
                    <div>
                      <h2 className="chart-title">Daily Protein Intake</h2>
                      <div className="chart-inspection">
                        {selectedProteinDay ? (
                          <span>
                            <strong>{selectedProteinDay.label}:</strong>{" "}
                            {selectedProteinDay.protein}g protein ·{" "}
                            {selectedProteinDay.protein - targets.protein >= 0 ? "+" : ""}
                            {Math.round((selectedProteinDay.protein - targets.protein) * 10) / 10}g vs
                            goal
                          </span>
                        ) : (
                          <span className="inspection-hint">
                            Hover or tap a bar for detailed daily figures
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="chart-legend">
                      <span className="legend-item">
                        <span className="legend-swatch bar-protein" /> Daily Protein
                      </span>
                      <span className="legend-item">
                        <span className="legend-swatch line-goal" /> Goal ({targets.protein}g)
                      </span>
                    </div>
                  </div>

                  <div className="chart-canvas-wrapper">
                    <NutritionChart
                      data={dailyData}
                      dataKey="protein"
                      goal={targets.protein}
                      unit="g"
                      barColorClass="protein"
                      range={range}
                      hoveredIndex={hoveredProteinIndex}
                      onHoverChange={setHoveredProteinIndex}
                    />
                  </div>
                </section>

                {/* Day-by-Day Historical Log Table */}
                <section className="breakdown-section" aria-label="Daily nutrition log breakdown">
                  <div className="section-title">
                    <div>
                      <p className="section-kicker">Breakdown</p>
                      <h2>Day by Day Log</h2>
                    </div>
                    <span className="breakdown-counter">
                      {summary.trackedCount} of {summary.daysCount} days recorded
                    </span>
                  </div>

                  <div className="breakdown-table">
                    <div className="breakdown-header-row">
                      <span>Date</span>
                      <span>Calories (vs {targets.calories})</span>
                      <span>Protein (vs {targets.protein}g)</span>
                      <span>Status</span>
                    </div>

                    {[...dailyData].reverse().map((day) => {
                      const calProgress = targets.calories > 0 ? (day.calories / targets.calories) * 100 : 0;
                      const protProgress = targets.protein > 0 ? (day.protein / targets.protein) * 100 : 0;

                      return (
                        <div
                          key={day.date}
                          className={`breakdown-row ${!day.hasData ? "untracked" : ""}`}
                        >
                          <div className="breakdown-cell-date">
                            <strong>{day.label}</strong>
                            <small>
                              {day.mealCount > 0
                                ? `${day.mealCount} ${day.mealCount === 1 ? "meal" : "meals"}`
                                : "No meals logged"}
                            </small>
                          </div>

                          <div className="breakdown-cell-macro">
                            <div className="macro-row-inline">
                              <strong>{day.calories} kcal</strong>
                              <small>
                                {day.hasData
                                  ? `${day.calories - targets.calories >= 0 ? "+" : ""}${
                                      day.calories - targets.calories
                                    }`
                                  : "—"}
                              </small>
                            </div>
                            <div className="mini-track">
                              <div
                                style={{
                                  width: `${Math.min(100, calProgress)}%`,
                                  background:
                                    calProgress >= 80 && calProgress <= 115
                                      ? "#35a269"
                                      : calProgress > 0
                                      ? "#d8a623"
                                      : "transparent",
                                }}
                              />
                            </div>
                          </div>

                          <div className="breakdown-cell-macro">
                            <div className="macro-row-inline">
                              <strong>{day.protein}g</strong>
                              <small>
                                {day.hasData
                                  ? `${day.protein - targets.protein >= 0 ? "+" : ""}${
                                      Math.round((day.protein - targets.protein) * 10) / 10
                                    }g`
                                  : "—"}
                              </small>
                            </div>
                            <div className="mini-track">
                              <div
                                style={{
                                  width: `${Math.min(100, protProgress)}%`,
                                  background:
                                    protProgress >= 80
                                      ? "#0071e3"
                                      : protProgress > 0
                                      ? "#86868b"
                                      : "transparent",
                                }}
                              />
                            </div>
                          </div>

                          <div className="breakdown-cell-status">
                            {!day.hasData ? (
                              <span className="status-badge untracked">Untracked</span>
                            ) : calProgress >= 80 && calProgress <= 115 ? (
                              <span className="status-badge on-target">On Target</span>
                            ) : calProgress > 115 ? (
                              <span className="status-badge over">Surplus</span>
                            ) : (
                              <span className="status-badge under">Deficit</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </section>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <section className="settings" onClick={(event) => event.stopPropagation()}>
            <div className="section-title">
              <div>
                <p className="section-kicker">Preferences</p>
                <h2>Daily goals</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                <Close />
              </button>
            </div>
            <label>
              Calories
              <input
                type="number"
                min="1"
                value={calorieGoal}
                onChange={(event) =>
                  handleSaveGoal(Number(event.target.value) || 1, proteinGoal)
                }
              />
            </label>
            <label>
              Protein (g)
              <input
                type="number"
                min="1"
                value={proteinGoal ?? getTargets(calorieGoal).protein}
                onChange={(event) =>
                  handleSaveGoal(
                    calorieGoal,
                    event.target.value ? Number(event.target.value) : null
                  )
                }
              />
            </label>
            <p className="settings-note">
              Default macros use 50% carbs, 20% protein, and 30% fat. A custom protein goal keeps the
              remaining calories split between carbs and fat.
            </p>
            <div className="auth-section">
              <p className="section-kicker">Account</p>
              {authUser ? (
                <>
                  <p className="auth-email">{authUser.email ?? "Google account connected"}</p>
                  <button
                    type="button"
                    className="signout-button"
                    onClick={() => void signOut()}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <p className="settings-note">
                    Sign in with Google to sync your meals and workouts across devices.
                  </p>
                  <button
                    type="button"
                    className="google-button"
                    onClick={() => void signInWithGoogle()}
                  >
                    Continue with Google
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

// -----------------------------------------------------------------------------
// Interactive SVG Chart Component
// -----------------------------------------------------------------------------

type ChartProps = {
  data: DayStats[];
  dataKey: "calories" | "protein";
  goal: number;
  unit: string;
  barColorClass: "calorie" | "protein";
  range: DateRange;
  hoveredIndex: number | null;
  onHoverChange: (index: number | null) => void;
};

function NutritionChart({
  data,
  dataKey,
  goal,
  unit,
  barColorClass,
  range,
  hoveredIndex,
  onHoverChange,
}: ChartProps) {
  const chartHeight = 220;
  const marginTop = 30;
  const marginBottom = 34;
  const marginLeft = 48;
  const marginRight = 16;

  const viewBoxWidth = 800;
  const plotWidth = viewBoxWidth - marginLeft - marginRight;
  const plotHeight = chartHeight - marginTop - marginBottom;

  const maxVal = useMemo(() => {
    const highestDataVal = Math.max(...data.map((d) => d[dataKey]), 0);
    const benchmark = Math.max(highestDataVal, goal);
    return Math.ceil((benchmark * 1.25) / (dataKey === "calories" ? 200 : 20)) *
      (dataKey === "calories" ? 200 : 20) || 100;
  }, [data, dataKey, goal]);

  const yFor = (value: number) => {
    const clamped = Math.max(0, Math.min(value, maxVal));
    return marginTop + plotHeight - (clamped / maxVal) * plotHeight;
  };

  const goalY = yFor(goal);
  const count = data.length;
  const colWidth = plotWidth / count;
  const barWidth = Math.max(4, Math.min(colWidth * 0.65, range === "7d" ? 44 : 14));

  // Determine which X axis labels to show
  const showLabel = (index: number) => {
    if (range === "7d") return true;
    // For 30d, show roughly every 5 days + the last day
    if (index === count - 1) return true;
    return index % 5 === 0;
  };

  return (
    <div className="svg-chart-container">
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${chartHeight}`}
        className="analytics-svg"
        preserveAspectRatio="none"
        onMouseLeave={() => onHoverChange(null)}
      >
        {/* Background Grid Lines & Y-axis scale */}
        {[0, 0.5, 1].map((fraction) => {
          const val = Math.round(maxVal * fraction);
          const y = marginTop + plotHeight - fraction * plotHeight;
          return (
            <g key={`grid-${fraction}`}>
              <line
                x1={marginLeft}
                y1={y}
                x2={viewBoxWidth - marginRight}
                y2={y}
                stroke="var(--line)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <text
                x={marginLeft - 8}
                y={y + 3.5}
                textAnchor="end"
                className="chart-axis-text"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* GOAL REFERENCE LINE */}
        {goalY >= marginTop && goalY <= marginTop + plotHeight && (
          <g className="chart-goal-line-group">
            <line
              x1={marginLeft}
              y1={goalY}
              x2={viewBoxWidth - marginRight}
              y2={goalY}
              stroke="var(--ink)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.5"
            />
            <rect
              x={viewBoxWidth - marginRight - 88}
              y={goalY - 10}
              width="88"
              height="18"
              rx="9"
              fill="var(--card)"
              stroke="var(--line)"
            />
            <text
              x={viewBoxWidth - marginRight - 44}
              y={goalY + 2.5}
              textAnchor="middle"
              className="chart-goal-badge-text"
            >
              Goal: {goal} {unit}
            </text>
          </g>
        )}

        {/* BARS & HOVER COLUMNS */}
        {data.map((day, i) => {
          const val = day[dataKey];
          const xCenter = marginLeft + i * colWidth + colWidth / 2;
          const xBar = xCenter - barWidth / 2;
          const barH = val > 0 ? Math.max(3, (val / maxVal) * plotHeight) : 0;
          const yBar = marginTop + plotHeight - barH;
          const isHovered = hoveredIndex === i;

          // Status fill colors
          let fillColor = "var(--ink)";
          if (barColorClass === "calorie") {
            const ratio = goal > 0 ? val / goal : 0;
            if (val === 0) fillColor = "transparent";
            else if (ratio >= 0.8 && ratio <= 1.15) fillColor = "#35a269";
            else if (ratio > 1.15) fillColor = "#d8a623";
            else fillColor = "#d94b4b";
          } else {
            // Protein
            const ratio = goal > 0 ? val / goal : 0;
            if (val === 0) fillColor = "transparent";
            else if (ratio >= 0.8) fillColor = "#0071e3";
            else fillColor = "#86868b";
          }

          return (
            <g key={day.date} className="chart-bar-group">
              {/* Hover Highlight Column */}
              {isHovered && (
                <rect
                  x={marginLeft + i * colWidth}
                  y={marginTop}
                  width={colWidth}
                  height={plotHeight}
                  fill="var(--soft)"
                  rx="6"
                  opacity="0.8"
                />
              )}

              {/* Untracked indicator dot/dash if 0 */}
              {val === 0 && (
                <line
                  x1={xBar}
                  y1={marginTop + plotHeight - 2}
                  x2={xBar + barWidth}
                  y2={marginTop + plotHeight - 2}
                  stroke="var(--line)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}

              {/* Main Intake Bar */}
              {val > 0 && (
                <rect
                  x={xBar}
                  y={yBar}
                  width={barWidth}
                  height={barH}
                  rx={Math.min(barWidth / 2, 4)}
                  fill={fillColor}
                  opacity={isHovered ? 1 : 0.85}
                  className="chart-bar"
                />
              )}

              {/* X Axis Label */}
              {showLabel(i) && (
                <text
                  x={xCenter}
                  y={chartHeight - 12}
                  textAnchor="middle"
                  className={`chart-x-axis-text ${isHovered ? "active" : ""}`}
                >
                  {range === "7d"
                    ? i === count - 1
                      ? "Today"
                      : `${day.weekday} ${day.dayNumber}`
                    : i === count - 1
                    ? "Today"
                    : `${day.dayNumber}`}
                </text>
              )}

              {/* Invisible interactive Hit Area */}
              <rect
                x={marginLeft + i * colWidth}
                y={0}
                width={colWidth}
                height={chartHeight}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => onHoverChange(i)}
                onTouchStart={() => onHoverChange(i)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Utilities & Icons
// -----------------------------------------------------------------------------

function formatDateDisplay(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(d);
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function Sliders() {
  return (
    <Icon>
      <path d="M4 6h16M7 12h10M10 18h4" />
      <circle cx="8" cy="6" r="1.5" />
      <circle cx="16" cy="12" r="1.5" />
      <circle cx="12" cy="18" r="1.5" />
    </Icon>
  );
}

function Close() {
  return (
    <Icon>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

function ThemeIcon({ mode }: { mode: "light" | "dark" | "system" }) {
  if (mode === "dark") return <Icon><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></Icon>;
  if (mode === "light") return <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></Icon>;
  return <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /><path d="M16 12a4 4 0 0 1-4 4" strokeDasharray="2 2" /></Icon>;
}
