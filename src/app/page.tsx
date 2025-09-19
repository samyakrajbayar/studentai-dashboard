"use client"
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Check, Plus, Trash2, LogOut, Settings2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

// Types
type Task = { id: number; title: string; done: 0 | 1 };
type EventItem = { id: number; title: string; start: number; end: number };

type PomodoroState = "idle" | "running" | "paused" | "break";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  // Data state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Settings
  const [accent, setAccent] = useState<string>(() => {
    if (typeof window === "undefined") return "#7c3aed";
    try {
      const saved = localStorage.getItem("theme_settings_v1");
      return saved ? JSON.parse(saved).accent ?? "#7c3aed" : "#7c3aed";
    } catch {
      return "#7c3aed";
    }
  });
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const saved = localStorage.getItem("theme_settings_v1");
      return saved ? !!JSON.parse(saved).dark : false;
    } catch {
      return false;
    }
  });

  // Calendar
  const [date, setDate] = useState<Date | undefined>(new Date());
  const selectedDayEvents = useMemo(() => {
    if (!date) return [] as EventItem[];
    const day = new Date(date);
    return events.filter((e) => {
      const s = new Date(e.start);
      return (
        s.getFullYear() === day.getFullYear() &&
        s.getMonth() === day.getMonth() &&
        s.getDate() === day.getDate()
      );
    });
  }, [date, events]);

  // Pomodoro
  const [state, setState] = useState<PomodoroState>("idle");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [secondsLeft, setSecondsLeft] = useState(focusMinutes * 60);
  const [completedSessions, setCompletedSessions] = useState<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Derived analytics
  const completedTasks = tasks.filter((t) => t.done).length;
  const completionRate = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const upcomingCount = events.filter((e) => e.start > Date.now()).length;

  // Session + initial load
  useEffect(() => {
    if (isPending) return;
    // If not authenticated, redirect to sign-in and stop loading spinner
    if (!session?.user) {
      // Avoid infinite loader when unauthenticated
      setLoading(false);
      router.push("/sign-in");
      return;
    }
    const load = async () => {
      try {
        const [tRes, eRes, sRes] = await Promise.all([
          fetch("/api/tasks"),
          fetch("/api/events"),
          fetch("/api/settings"),
        ]);
        if (tRes.ok) setTasks(await tRes.json());
        if (eRes.ok) setEvents(await eRes.json());
        if (sRes.ok) {
          const s = await sRes.json();
          if (s?.accent) setAccent(s.accent);
          if (typeof s?.dark !== "undefined") setDark(!!s.dark);
          try {
            localStorage.setItem(
              "theme_settings_v1",
              JSON.stringify({ accent: s?.accent ?? accent, dark: typeof s?.dark !== "undefined" ? !!s.dark : dark })
            );
          } catch {}
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isPending, session, router]);

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--sidebar-primary", accent);
    root.style.setProperty("--primary", accent);
    // Material You like surface tones from accent
    root.style.setProperty("--chart-1", accent);
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      localStorage.setItem("theme_settings_v1", JSON.stringify({ accent, dark }));
    } catch {}
  }, [accent, dark]);

  // Pomodoro tick
  useEffect(() => {
    if (state === "running" || state === "break") {
      intervalRef.current = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [state]);

  useEffect(() => {
    if (secondsLeft < 0) return;
    if (secondsLeft === 0) {
      if (state === "running") {
        setCompletedSessions((c) => c + 1);
        setState("break");
        setSecondsLeft(breakMinutes * 60);
      } else if (state === "break") {
        setState("idle");
        setSecondsLeft(focusMinutes * 60);
      }
    }
  }, [secondsLeft, state, breakMinutes, focusMinutes]);

  const startFocus = () => {
    setState("running");
    setSecondsLeft(focusMinutes * 60);
  };
  const pause = () => setState("paused");
  const resume = () => setState("running");
  const reset = () => {
    setState("idle");
    setSecondsLeft(focusMinutes * 60);
  };

  // Handlers: tasks
  const addTask = async (title: string) => {
    if (!title.trim()) return;
    const res = await fetch("/api/tasks", { method: "POST", body: JSON.stringify({ title }), headers: { "Content-Type": "application/json" } });
    if (res.ok) {
      const t = await res.json();
      setTasks((prev) => [t, ...prev]);
    }
  };
  const toggleTask = async (task: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: t.done ? 0 : 1 } : t)));
    await fetch("/api/tasks", { method: "PUT", body: JSON.stringify({ id: task.id, done: task.done ? 0 : 1 }), headers: { "Content-Type": "application/json" } });
  };
  const removeTask = async (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
  };

  // Handlers: events
  const addEvent = async (payload: { title: string; start: number; end: number }) => {
    const res = await fetch("/api/events", { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } });
    if (res.ok) {
      const created = await res.json();
      setEvents((e) => [created, ...e]);
    }
  };
  const removeEvent = async (id: number) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/events?id=${id}`, { method: "DELETE" });
  };

  // Settings save
  const saveSettings = async (next: { accent?: string; dark?: boolean }) => {
    const nextAccent = next.accent ?? accent;
    const nextDark = typeof next.dark === "boolean" ? next.dark : dark;
    setAccent(nextAccent);
    setDark(nextDark);
    try {
      localStorage.setItem("theme_settings_v1", JSON.stringify({ accent: nextAccent, dark: nextDark }));
    } catch {}
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accent: nextAccent, dark: nextDark }),
    });
  };

  // Sign out
  const signOut = async () => {
    const token = localStorage.getItem("bearer_token");
    await authClient.signOut({
      fetchOptions: { headers: { Authorization: `Bearer ${token}` } },
    });
    localStorage.removeItem("bearer_token");
    router.push("/sign-in");
  };

  return isPending || loading ? (
    <div className="min-h-dvh grid place-items-center bg-secondary/40">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="size-12 rounded-full border-4 border-[color-mix(in_oklab,var(--sidebar-primary),transparent_80%)] border-t-[var(--sidebar-primary)] animate-spin" />
        </div>
        <div className="text-sm text-muted-foreground">Preparing your dashboard…</div>
      </div>
    </div>
  ) : !session?.user ? (
    <div className="min-h-dvh grid place-items-center bg-secondary/40 p-6">
      <div className="text-center space-y-3">
        <div className="mx-auto size-12 rounded-full border-4 border-[color-mix(in_oklab,var(--sidebar-primary),transparent_80%)] border-t-[var(--sidebar-primary)] animate-spin" />
        <p className="text-sm text-muted-foreground">Redirecting to sign in…</p>
        <Button onClick={() => router.push("/sign-in")}>Go to Sign in</Button>
      </div>
    </div>
  ) : (
    <div className="min-h-dvh bg-secondary/40">
      {/* Top bar */}
      <div className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-background/60 bg-background/80 border-b">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[var(--sidebar-primary)]" />
            <h1 className="text-xl sm:text-2xl font-semibold">Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-full px-3 py-1.5 bg-secondary">
              <LiveClock accent={accent} />
            </div>
            <Button variant="ghost" size="icon" aria-label="Settings">
              <Settings2 className="size-5" />
            </Button>
            <Button variant="outline" onClick={signOut} aria-label="Sign out">
              <LogOut className="mr-2 size-4" /> Sign out
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Theme</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="darkmode">Dark mode</Label>
                <Switch id="darkmode" checked={dark} onCheckedChange={(v) => saveSettings({ dark: v })} />
              </div>
              <div className="space-y-2">
                <Label>Accent color</Label>
                <div className="flex items-center gap-3">
                  <input
                    aria-label="accent color"
                    type="color"
                    value={accent}
                    onChange={(e) => saveSettings({ accent: e.target.value })}
                    className="size-9 rounded-md border bg-transparent p-0"
                  />
                  <Input value={accent} onChange={(e) => saveSettings({ accent: e.target.value })} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Focus Timer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CircularTimer secondsLeft={secondsLeft} totalSeconds={(state === "break" ? breakMinutes : focusMinutes) * 60} accent={accent} state={state} />
              <div className="grid grid-cols-2 gap-2">
                {state === "idle" && (
                  <Button className="col-span-2" onClick={startFocus}>Start {focusMinutes}m Focus</Button>
                )}
                {state === "running" && (
                  <>
                    <Button onClick={pause} variant="secondary">Pause</Button>
                    <Button onClick={reset} variant="outline">Reset</Button>
                  </>
                )}
                {state === "paused" && (
                  <>
                    <Button onClick={resume}>Resume</Button>
                    <Button onClick={reset} variant="outline">Reset</Button>
                  </>
                )}
                {state === "break" && (
                  <Button className="col-span-2" onClick={reset}>Finish Break</Button>
                )}
              </div>
              <div className="space-y-2">
                <Label>Focus length: {focusMinutes}m</Label>
                <Slider value={[focusMinutes]} min={15} max={60} step={5} onValueChange={(v) => { setFocusMinutes(v[0]); if (state === "idle") setSecondsLeft(v[0] * 60); }} />
              </div>
              <div className="space-y-2">
                <Label>Break length: {breakMinutes}m</Label>
                <Slider value={[breakMinutes]} min={5} max={30} step={5} onValueChange={(v) => { setBreakMinutes(v[0]); }} />
              </div>
              <p className="text-sm text-muted-foreground">Completed sessions today: {completedSessions}</p>
            </CardContent>
          </Card>
        </aside>

        {/* Main */}
        <main className="space-y-6">
          {/* Big Analog Clock */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Clock</CardTitle>
            </CardHeader>
            <CardContent>
              <BigAnalogClock accent={accent} />
            </CardContent>
          </Card>

          {/* Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric title="Tasks Completed" value={completedTasks.toString()} delta={`+${completionRate}%`} />
            <Metric title="Upcoming Events" value={upcomingCount.toString()} delta={"this week"} />
            <Metric title="Focus Minutes" value={(completedSessions * focusMinutes).toString()} delta={"today"} />
            <Metric title="Total Tasks" value={tasks.length.toString()} delta={"tracked"} />
          </div>

          {/* Calendar + Todos */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-base">Upcoming Schedule</CardTitle>
                <AddEvent onAdd={addEvent} date={date} />
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border" />
                <div className="space-y-3">
                  {selectedDayEvents.length === 0 && (
                    <p className="text-muted-foreground text-sm">No events for this day.</p>
                  )}
                  <AnimatePresence mode="popLayout">
                    {selectedDayEvents.map((e) => (
                      <motion.div
                        key={e.id}
                        layout
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.6 }}
                        whileHover={{ scale: 1.01 }}
                        className="rounded-xl border bg-card p-3 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium">{e.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {" – "}
                            {new Date(e.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => removeEvent(e.id)} aria-label={`Delete ${e.title}`}>
                          <Trash2 className="size-4" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Today's Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <TaskList tasks={tasks} onAdd={addTask} onToggle={toggleTask} onRemove={removeTask} />
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}

function Metric({ title, value, delta }: { title: string; value: string; delta: string }) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{delta}</div>
      </CardContent>
    </Card>
  );
}

function TaskList({ tasks, onAdd, onToggle, onRemove }: { tasks: Task[]; onAdd: (title: string) => void; onToggle: (t: Task) => void; onRemove: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const add = () => {
    onAdd(title);
    setTitle("");
  };
  const completed = tasks.filter((t) => t.done).length;
  const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input placeholder="Add a task" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button onClick={add} aria-label="Add task"><Plus className="mr-2 size-4" /> Add</Button>
      </div>
      <div className="space-y-2">
        {tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet. Add your first one!</p>}
        <AnimatePresence mode="popLayout">
          {tasks.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.6 }}
              whileHover={{ scale: 1.01 }}
              className="flex items-center justify-between rounded-xl border bg-card px-3 py-2"
            >
              <button className={`mr-3 size-6 shrink-0 grid place-items-center rounded-full border ${t.done ? "bg-[var(--sidebar-primary)] text-white" : "bg-background"}`} onClick={() => onToggle(t)} aria-label={`Mark ${t.title} ${t.done ? "incomplete" : "complete"}`}>
                {t.done ? <Check className="size-4" /> : null}
              </button>
              <div className="flex-1 truncate text-left">
                <p className={`truncate ${t.done ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => onRemove(t.id)} aria-label={`Delete ${t.title}`}>
                <Trash2 className="size-4" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="space-y-2">
        <Progress value={percent} />
        <p className="text-xs text-muted-foreground">{completed} of {tasks.length} done</p>
      </div>
    </div>
  );
}

function LiveClock({ accent }: { accent: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-sm text-muted-foreground">{now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
      <span className="font-semibold" style={{ color: accent }}>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
  );
}

function CircularTimer({ secondsLeft, totalSeconds, accent, state }: { secondsLeft: number; totalSeconds: number; accent: string; state: PomodoroState }) {
  const pct = Math.max(0, Math.min(100, Math.round(((totalSeconds - secondsLeft) / totalSeconds) * 100)));
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = (secondsLeft % 60).toString().padStart(2, "0");
  const gradient = `conic-gradient(${accent} ${pct}%, color-mix(in oklab, ${accent}, transparent 85%) ${pct}%)`;
  const label = state === "break" ? "Break" : "Focus";
  return (
    <div className="grid place-items-center">
      <div className="relative size-36">
        <div className="absolute inset-0 rounded-full" style={{ background: gradient }} />
        <div className="absolute inset-[6px] rounded-full bg-card grid place-items-center">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold tabular-nums">{minutes}:{seconds}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddEvent({ onAdd, date }: { onAdd: (e: { title: string; start: number; end: number }) => void; date?: Date }) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState<string>("10:00");
  const [end, setEnd] = useState<string>("11:00");

  const create = () => {
    if (!title.trim() || !date) return;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const startDate = new Date(date);
    startDate.setHours(sh, sm, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(eh, em, 0, 0);
    onAdd({ title, start: startDate.getTime(), end: endDate.getTime() });
    setTitle("");
  };

  return (
    <div className="flex items-center gap-2">
      <Input placeholder="New event" value={title} onChange={(e) => setTitle(e.target.value)} className="w-36 sm:w-48" />
      <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-[5.5rem]" />
      <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-[5.5rem]" />
      <Button onClick={create} size="icon" aria-label="Add event"><Plus className="size-4" /></Button>
    </div>
  );
}

function BigAnalogClock({ accent }: { accent: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  const hourDeg = hours * 30 + minutes * 0.5; // 360/12 = 30deg per hour + minute offset
  const minuteDeg = minutes * 6 + seconds * 0.1; // 360/60 = 6deg per minute + second offset
  const secondDeg = seconds * 6; // 360/60 = 6deg per second

  return (
    <div className="w-full grid place-items-center py-4">
      <div className="relative aspect-square w-full max-w-md">
        {/* Dial */}
        <div className="absolute inset-0 rounded-full border bg-card shadow-sm" />
        {/* Ticks */}
        {[...Array(60)].map((_, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 origin-[0_0]"
            style={{
              transform: `rotate(${i * 6}deg) translateX(45%)`,
            }}
          >
            <div
              className={`${i % 5 === 0 ? "h-4 w-[3px] bg-foreground/70" : "h-2 w-[2px] bg-foreground/40"} rounded-full`}
            />
          </div>
        ))}
        {/* Center */}
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative size-3 rounded-full" style={{ backgroundColor: accent }} />
        </div>
        {/* Hands */}
        <div className="absolute inset-0 grid place-items-center">
          {/* Hour hand */}
          <div
            className="absolute h-[24%] w-[4px] rounded-full bg-foreground/90 origin-bottom"
            style={{ transform: `translateY(-24%) rotate(${hourDeg}deg)` }}
          />
          {/* Minute hand */}
          <div
            className="absolute h-[34%] w-[3px] rounded-full bg-foreground/80 origin-bottom"
            style={{ transform: `translateY(-34%) rotate(${minuteDeg}deg)` }}
          />
          {/* Second hand */}
          <div
            className="absolute h-[40%] w-[2px] rounded-full origin-bottom"
            style={{ backgroundColor: accent, transform: `translateY(-40%) rotate(${secondDeg}deg)` }}
          />
        </div>
        {/* Accent ring (Material You vibe) */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow: `0 0 0 6px color-mix(in oklab, ${accent}, transparent 88%), inset 0 0 0 2px color-mix(in oklab, ${accent}, transparent 86%)`,
          }}
        />
      </div>
    </div>
  );
}