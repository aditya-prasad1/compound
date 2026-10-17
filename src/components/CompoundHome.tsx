"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Meal, MealItem } from "@/lib/nutrition";
import { getSupabaseAuthHeaders, getSupabaseBrowserClient } from "@/lib/supabase-browser";
import WorkoutCard from "@/components/WorkoutCard";

type Message = { id: string; role: "user" | "assistant"; text?: string; meal?: Meal; logged?: boolean };
type Entry = { id: string; description: string; meal: Meal; originalMessage: string; createdAt: string };
type Targets = { calories: number; protein: number; carbs: number; fat: number };

const emptyTotals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
const initialMessages: Message[] = [{ id: "welcome", role: "assistant", text: "Tell me what you ate. I’ll estimate it and help you build consistent habits." }];
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const localDateKey = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};
const formatDate = (date: string) => new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
const getTargets = (calories: number, proteinGoal?: number | null): Targets => {
  if (!proteinGoal) return { calories, carbs: Math.round((calories * 0.5) / 4), protein: Math.round((calories * 0.2) / 4), fat: Math.round((calories * 0.3) / 9) };
  const proteinCalories = Math.min(calories, proteinGoal * 4);
  const remainingCalories = calories - proteinCalories;
  return { calories, protein: Math.round(proteinGoal), carbs: Math.round((remainingCalories * 0.625) / 4), fat: Math.round((remainingCalories * 0.375) / 9) };
};

export default function CompoundHome() {
  const [today, setToday] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Meal | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [calorieGoal, setCalorieGoal] = useState(2200);
  const [proteinGoal, setProteinGoal] = useState<number | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const targets = useMemo(() => getTargets(calorieGoal, proteinGoal), [calorieGoal, proteinGoal]);
  const dayEntries = useMemo(() => entries.filter((entry) => entry.createdAt.slice(0, 10) === selectedDate), [entries, selectedDate]);
  const totals = useMemo(() => dayEntries.reduce((sum, entry) => ({ calories: sum.calories + entry.meal.totals.calories, protein_g: sum.protein_g + entry.meal.totals.protein_g, carbs_g: sum.carbs_g + entry.meal.totals.carbs_g, fat_g: sum.fat_g + entry.meal.totals.fat_g }), emptyTotals), [dayEntries]);

  useEffect(() => {
    const currentDay = localDateKey();
    setToday(currentDay); setSelectedDate(currentDay);
    const savedEntries = localStorage.getItem("compound-entries") ?? localStorage.getItem("calorie-entries");
    const savedGoal = localStorage.getItem("compound-targets") ?? localStorage.getItem("calorie-targets");
    if (savedEntries) setEntries(JSON.parse(savedEntries));
    if (savedGoal) {
      const goal = JSON.parse(savedGoal) as { calories?: number; protein?: number | null };
      setCalorieGoal(Number(goal.calories) || 2200);
      if (goal.protein) setProteinGoal(Number(goal.protein));
    }
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        void navigator.serviceWorker.register("/sw.js");
      } else {
        void navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) void registration.unregister();
        });
      }
    }
    const client = getSupabaseBrowserClient();
    if (!client) {
      setAuthReady(true);
      return;
    }

    let mounted = true;
    const syncUser = (user: User | null) => {
      if (!mounted) return;
      setAuthUser(user);
      if (user) localStorage.setItem("compound-user-id", user.id);
      else {
        localStorage.removeItem("compound-user-id");
        localStorage.removeItem("calorie-user-id");
      }
    };

    void client.auth.getUser().then(({ data, error }) => {
      if (error) throw error;
      syncUser(data.user);
    }).catch((error: unknown) => {
      if (mounted) setHistoryError(error instanceof Error ? error.message : "Supabase authentication is unavailable.");
    }).finally(() => {
      if (mounted) setAuthReady(true);
    });

    const { data: authSubscription } = client.auth.onAuthStateChange((_event, session) => syncUser(session?.user ?? null));
    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => { if (today && authReady) void loadHistory(selectedDate); }, [selectedDate, today, authReady]);
  useEffect(() => {   localStorage.setItem("compound-entries", JSON.stringify(entries)); }, [entries]);
  useEffect(() => { localStorage.setItem("compound-targets", JSON.stringify({ calories: calorieGoal, protein: proteinGoal })); }, [calorieGoal, proteinGoal]);
  const busy = pendingRequests > 0 || saving;
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  async function signInWithGoogle() {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setHistoryError("Supabase is not configured. Add the public Supabase environment variables to enable Google sign-in.");
      return;
    }
    setHistoryError("");
    const redirectTo = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setHistoryError(error.message);
  }

  async function signOut() {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) setHistoryError(error.message);
  }

  async function loadHistory(date: string) {
    if (!date) return;
    if (!localStorage.getItem("compound-user-id")) return;
    setHistoryLoading(true); setHistoryError("");
    try {
      const response = await fetch(`/api/log?date=${date}`, { headers: await getSupabaseAuthHeaders(), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.persisted && Array.isArray(data.entries)) {
        const remoteEntries: Entry[] = data.entries.map((entry: { id: string; description: string; meal: Meal; created_at: string }) => ({ id: entry.id, description: entry.description, meal: entry.meal, originalMessage: entry.description, createdAt: entry.created_at }));
        setEntries((current) => [...current.filter((entry) => entry.createdAt.slice(0, 10) !== date), ...remoteEntries]);
      }
    } catch (error) { setHistoryError(error instanceof Error ? error.message : "History could not be loaded."); }
    finally { setHistoryLoading(false); }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const message = draft.trim();
    if (!message || saving) return;
    setDraft(""); setMessages((current) => [...current, { id: makeId(), role: "user", text: message }]);
    const normalized = message.toLowerCase();
    if (/^log it|^save it|yes,? log/i.test(normalized) && pending) { await logMeal(pending, undefined, pendingMessageId ?? undefined); return; }
    if (/cancel|never mind/i.test(normalized) && pending) { setPending(null); setMessages((current) => [...current, { id: makeId(), role: "assistant", text: "Okay, I won’t log that." }]); return; }
    if (/what have i eaten|today's totals|todays totals/i.test(normalized)) { setMessages((current) => [...current, { id: makeId(), role: "assistant", text: dayEntries.length ? `You have logged ${Math.round(totals.calories)} kcal today. That is ${Math.round(totals.protein_g)} g protein, ${Math.round(totals.carbs_g)} g carbs, and ${Math.round(totals.fat_g)} g fat.` : "Nothing is logged for this day yet." }]); return; }
    if (/undo that|undo last/i.test(normalized)) { const last = [...dayEntries].pop(); if (last) { setEntries((current) => current.filter((entry) => entry.id !== last.id)); setMessages((current) => [...current, { id: makeId(), role: "assistant", text: `Removed ${last.description}.` }]); } else setMessages((current) => [...current, { id: makeId(), role: "assistant", text: "There is no recent entry to undo." }]); return; }
    setPendingRequests((count) => count + 1);
    try {
      const response = await fetch("/api/interpret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, context: pending ? JSON.stringify(pending) : "" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const responseMessageId = makeId();
      setPending(data.meal); setPendingMessageId(responseMessageId); setMessages((current) => [...current, { id: responseMessageId, role: "assistant", text: data.reply, meal: data.meal }]);
    } catch (error) { setMessages((current) => [...current, { id: makeId(), role: "assistant", text: error instanceof Error ? error.message : "Something went wrong. Try again." }]); }
    finally { setPendingRequests((count) => Math.max(0, count - 1)); }
  }

  async function logMeal(meal: Meal, description = meal.items.map((item) => item.name).join(" + ") || "Meal", messageId?: string) {
    if (saving) return;
    setSaving(true);
    const entry: Entry = { id: makeId(), description, meal, originalMessage: description, createdAt: `${selectedDate}T${new Date().toTimeString().slice(0, 8)}` };
    setEntries((current) => [...current, entry]);
    if (messageId) setMessages((current) => current.map((message) => message.id === messageId ? { ...message, logged: true } : message));
    if (messageId === pendingMessageId) { setPending(null); setPendingMessageId(null); }
    setMessages((current) => [...current, { id: makeId(), role: "assistant", text: `Logged ${Math.round(meal.totals.calories)} kcal. Your total is now ${Math.round(totals.calories + meal.totals.calories)} kcal.` }]);
    try {
      const response = await fetch("/api/log", { method: "POST", headers: { "Content-Type": "application/json", ...(await getSupabaseAuthHeaders()) }, body: JSON.stringify({ meal, description, date: selectedDate, idempotencyKey: entry.id }) });
      const result = await response.json();
      if (!response.ok || !result.persisted) setHistoryError(result.error ?? "Saved on this device, but not synced to Supabase.");
    } catch { setHistoryError("Saved on this device. Server sync will retry later."); }
    setSaving(false);
  }

  function startListening() {
    const SpeechRecognition = (window as Window & { webkitSpeechRecognition?: new () => { lang: string; start: () => void; onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void } }).webkitSpeechRecognition;
    if (!SpeechRecognition) { setMessages((current) => [...current, { id: makeId(), role: "assistant", text: "Voice input is not supported in this browser." }]); return; }
    const recognition = new SpeechRecognition(); recognition.lang = "en-IN"; setListening(true); recognition.start(); recognition.onresult = (event) => setDraft(event.results[0][0].transcript); recognition.onend = () => setListening(false);
  }

  function updateItem(index: number, patch: Partial<MealItem>) {
    if (!pending) return;
    const items = pending.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    const mealTotals = items.reduce((sum, item) => ({ calories: sum.calories + item.calories, protein_g: sum.protein_g + item.protein_g, carbs_g: sum.carbs_g + item.carbs_g, fat_g: sum.fat_g + item.fat_g }), emptyTotals);
    setPending({ ...pending, items, totals: mealTotals });
  }

  const progress = Math.min(100, (totals.calories / targets.calories) * 100);
  const calorieStatus = progress < 34 ? "low" : progress < 80 ? "mid" : "good";

  return <main className="app-shell">
    <header className="topbar"><div><div className="brand">compound<span>.</span></div><div className="eyebrow">small actions, lasting change</div></div><div className="topbar-actions"><label className="date-control-wrap"><span className="date-control">{selectedDate === today ? "Today" : formatDate(selectedDate)} <ChevronDown /></span><input ref={dateInputRef} className="navbar-date-picker" type="date" value={selectedDate} max={today} onChange={(event) => setSelectedDate(event.target.value)} aria-label="Choose date" /></label><button className="settings-button" onClick={() => setShowSettings(true)} aria-label="Open settings"><Sliders /></button></div></header>
    <section className="hero-summary"><div className="summary-layout"><div className="summary-main"><p className="section-kicker">{selectedDate === today ? "Daily intake" : `History · ${formatDate(selectedDate)}`}</p><div className="compound-line"><h1 className={calorieStatus}>{Math.round(totals.calories)} <span>/ {targets.calories} kcal</span></h1></div><div className={`progress-track ${calorieStatus}`}><div className="progress-fill" style={{ width: `${progress}%` }} /></div><div className="summary-foot"><span>{Math.max(0, Math.round(targets.calories - totals.calories))} kcal remaining</span><span>{Math.round(progress)}% of goal</span></div><div className="hero-actions"><button className="track-button" onClick={() => { setChatOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}><Plus />Track calories</button><button className="logs-button" onClick={() => setLogsOpen(true)}><ListIcon />View logs</button></div></div><div className="summary-meters" aria-label="Macronutrient summary"><Macro label="Protein" value={totals.protein_g} target={targets.protein} tone="dark" /><Macro label="Carbs" value={totals.carbs_g} target={targets.carbs} /><Macro label="Fat" value={totals.fat_g} target={targets.fat} /></div></div></section>
    <WorkoutCard selectedDate={selectedDate} authUserId={authUser?.id ?? null} />
    {logsOpen && <div className="logs-overlay"><section className="logs-panel" aria-label="Food logs"><div className="history-section"><div className="section-title"><div><p className="section-kicker">Journal</p><h2>Food logs</h2></div><button className="close-button" onClick={() => setLogsOpen(false)} aria-label="Close food logs"><Close /></button></div><div className="logs-toolbar"><span>{selectedDate === today ? "Today" : formatDate(selectedDate)}</span><button className="track-button compact" onClick={() => { setChatOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}><Plus />Track calories</button></div>{historyLoading && <span className="loading-label">Syncing</span>}{historyError && <p className="error-note">{historyError}</p>}{dayEntries.length ? <div className="entry-list">{[...dayEntries].reverse().map((entry) => <EntryRow entry={entry} key={entry.id} />)}</div> : <div className="empty-state"><div className="empty-mark">+</div><p>No meals logged {selectedDate === today ? "today" : "on this day"}.</p><button onClick={() => { setChatOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}>Start with a meal</button></div>}</div></section></div>}
    {chatOpen && <div className="chat-overlay"><section className="chat-panel" aria-label="Food logging chat"><div className="chat-header"><div><p className="section-kicker">compound food log</p><h2>What did you eat?</h2></div><button className="close-button" onClick={() => setChatOpen(false)} aria-label="Close chat"><Close /></button></div><div className="chat-messages">{messages.map((message) => <div className={`message ${message.role}`} key={message.id}><div className="message-label">{message.role === "user" ? "You" : "compound."}</div>{message.text && <p>{message.text}</p>}{message.meal && <MealCard meal={message.id === pendingMessageId && pending ? pending : message.meal} pending={!message.logged} onUpdate={updateItem} onLog={() => logMeal(message.id === pendingMessageId && pending ? pending : message.meal!, undefined, message.id)} />}</div>)}{pendingRequests > 0 && <div className="chat-status"><Spinner /> Estimating {pendingRequests > 1 ? `${pendingRequests} meals` : "your meal"}...</div>}<div ref={messagesEndRef} /></div><form className="composer" onSubmit={sendMessage}><input ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="e.g. 2 rotis and dal" aria-label="Food message" /><button type="button" className={listening ? "listening" : ""} onClick={startListening} aria-label="Use voice input"><Mic /></button><button className="send-button" type="submit" disabled={!draft.trim() || saving} aria-label="Send message"><ArrowUp /></button></form></section></div>}
    {showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}><section className="settings" onClick={(event) => event.stopPropagation()}><div className="section-title"><div><p className="section-kicker">Preferences</p><h2>Daily goals</h2></div><button className="close-button" onClick={() => setShowSettings(false)} aria-label="Close settings"><Close /></button></div><label>Calories<input type="number" min="1" value={calorieGoal} onChange={(event) => setCalorieGoal(Number(event.target.value) || 1)} /></label><label>Protein (g)<input type="number" min="1" value={proteinGoal ?? getTargets(calorieGoal).protein} onChange={(event) => setProteinGoal(Number(event.target.value) || null)} /></label><p className="settings-note">Default macros use 50% carbs, 20% protein, and 30% fat. A custom protein goal keeps the remaining calories split between carbs and fat.</p><div className="auth-section"><p className="section-kicker">Account</p>{authUser ? <><p className="auth-email">{authUser.email ?? "Google account connected"}</p><button type="button" className="signout-button" onClick={() => void signOut()}>Sign out</button></> : <><p className="settings-note">Sign in with Google to sync your meals and workouts across devices.</p><button type="button" className="google-button" onClick={() => void signInWithGoogle()}>Continue with Google</button></>}</div></section></div>}
  </main>;
}

function Macro({ label, value, target, tone = "" }: { label: string; value: number; target: number; tone?: string }) { const progress = Math.min(100, (value / target) * 100); const status = progress < 34 ? "low" : progress < 80 ? "mid" : "good"; return <div className={`macro-card ${tone} ${status}`}><div className="macro-top"><span>{label}</span><strong>{Math.round(value)} <small>/ {target}g</small></strong></div><div className="macro-track"><div style={{ width: `${progress}%` }} /></div></div>; }
function EntryRow({ entry }: { entry: Entry }) { return <details className="entry-row"><summary><span><strong>{entry.description}</strong><small>{new Date(entry.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></span><b>{Math.round(entry.meal.totals.calories)} kcal</b><ChevronDown /></summary><div className="entry-detail">{entry.meal.items.map((item) => <div className="item-row" key={`${entry.id}-${item.name}`}><span>{item.quantity} {item.unit} {item.name}</span><span>{Math.round(item.calories)} kcal · {Math.round(item.protein_g)}p · {Math.round(item.carbs_g)}c · {Math.round(item.fat_g)}f</span></div>)}</div></details>; }
function MealCard({ meal, pending, onUpdate, onLog }: { meal: Meal; pending: boolean; onUpdate: (index: number, patch: Partial<MealItem>) => void; onLog: () => void }) { return <div className="meal-card"><div className="meal-items">{meal.items.map((item, index) => <div className="meal-item" key={`${item.name}-${index}`}><span>{item.name}<small>{item.quantity} {item.unit}</small></span><input aria-label={`${item.name} calories`} type="number" min="0" value={item.calories} onChange={(event) => onUpdate(index, { calories: Number(event.target.value) })} /><span>kcal</span></div>)}</div><div className="meal-total"><span>Suggested total</span><strong>{Math.round(meal.totals.calories)} kcal</strong></div>{meal.assumptions.map((assumption) => <div className="assumption" key={assumption}>i&nbsp; {assumption}</div>)}{pending && <button type="button" className="confirm-button" onClick={onLog}>Add {Math.round(meal.totals.calories)} kcal to today <ArrowUp /></button>}</div>; }
function Icon({ children }: { children: React.ReactNode }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>; }
function Plus() { return <Icon><path d="M12 5v14M5 12h14" /></Icon>; }
function ListIcon() { return <Icon><path d="M8 6h11M8 12h11M8 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></Icon>; }
function Close() { return <Icon><path d="m6 6 12 12M18 6 6 18" /></Icon>; }
function ArrowUp() { return <Icon><path d="M12 19V5M6 11l6-6 6 6" /></Icon>; }
function ChevronDown() { return <Icon><path d="m6 9 6 6 6-6" /></Icon>; }
function Sliders() { return <Icon><path d="M4 6h16M7 12h10M10 18h4" /><circle cx="8" cy="6" r="1.5" /><circle cx="16" cy="12" r="1.5" /><circle cx="12" cy="18" r="1.5" /></Icon>; }
function Mic() { return <Icon><rect x="8" y="3" width="8" height="12" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></Icon>; }
function Spinner() { return <span className="spinner" aria-hidden="true" />; }
