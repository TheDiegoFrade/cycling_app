// GENERADO por scripts/build-edge.mjs desde src/core/edge-entry.ts. No lo edites: corre `npm run build:edge`.

// src/engine/analytics.ts
var NP_WINDOW_S = 30;
function average(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
function rollingAverages(values, windowS) {
  if (values.length < windowS) return [];
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= windowS) sum -= values[i - windowS];
    if (i >= windowS - 1) out.push(sum / windowS);
  }
  return out;
}
function normalizedPower(powers) {
  const rolling = rollingAverages(powers, Math.min(NP_WINDOW_S, powers.length || 1));
  if (rolling.length === 0) return average(powers);
  const meanFourthPower = average(rolling.map((p) => p ** 4));
  return Math.pow(meanFourthPower, 0.25);
}

// src/engine/plan.ts
function buildPlan(intervals) {
  const segStart = [];
  let acc = 0;
  for (const interval of intervals) {
    segStart.push(acc);
    acc += interval.duration_s;
  }
  return { intervals, segStart, totalDuration: acc };
}
function intervalIndexAt(plan, t) {
  let i = 0;
  while (i < plan.intervals.length - 1 && t >= plan.segStart[i + 1]) i++;
  return i;
}
function targetWattsAt(plan, t, ftp, bias) {
  const i = intervalIndexAt(plan, t);
  const interval = plan.intervals[i];
  if (interval.watts !== void 0) return Math.round(interval.watts * bias);
  const into = t - plan.segStart[i];
  const fromPct = interval.power_pct;
  const toPct = interval.ramp_to_pct ?? interval.power_pct;
  const frac = interval.duration_s > 0 ? Math.min(1, Math.max(0, into / interval.duration_s)) : 0;
  const pct = fromPct + (toPct - fromPct) * frac;
  return Math.round(pct / 100 * ftp * bias);
}

// src/core/workout-estimate.ts
var NON_MAIN_TYPES = /* @__PURE__ */ new Set(["warmup", "cooldown", "recovery"]);
function estimateWorkout(intervals, ftp) {
  const plan = buildPlan(intervals);
  const powers = [];
  for (let t = 0; t < plan.totalDuration; t++) powers.push(targetWattsAt(plan, t, ftp, 1));
  const np = normalizedPower(powers);
  const intensityFactor = ftp > 0 ? np / ftp : null;
  const tss = ftp > 0 && intensityFactor !== null ? plan.totalDuration * np * intensityFactor / (ftp * 3600) * 100 : null;
  const mainIntervals = intervals.filter((iv) => !NON_MAIN_TYPES.has(iv.type));
  const candidates = mainIntervals.length ? mainIntervals : intervals;
  const wattsOf = (iv) => {
    const from = Math.round(iv.power_pct / 100 * ftp);
    const to = Math.round((iv.ramp_to_pct ?? iv.power_pct) / 100 * ftp);
    return [from, to];
  };
  const allWatts = candidates.flatMap(wattsOf);
  const wattsRange = allWatts.length ? [Math.min(...allWatts), Math.max(...allWatts)] : [0, 0];
  return {
    durationS: plan.totalDuration,
    tss: tss !== null ? Math.round(tss) : null,
    wattsRange
  };
}

// src/engine/pmc.ts
var CTL_TIME_CONSTANT_DAYS = 42;
var ATL_TIME_CONSTANT_DAYS = 7;
function emaFactor(timeConstantDays) {
  return 1 - Math.exp(-1 / timeConstantDays);
}
function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}
function computePmc(entries) {
  if (entries.length === 0) return [];
  const tssByDate = /* @__PURE__ */ new Map();
  for (const e of entries) tssByDate.set(e.dateKey, (tssByDate.get(e.dateKey) ?? 0) + e.tss);
  const dates = Array.from(tssByDate.keys()).sort();
  const start = parseDateKey(dates[0]);
  const end = parseDateKey(dates[dates.length - 1]);
  const ctlFactor = emaFactor(CTL_TIME_CONSTANT_DAYS);
  const atlFactor = emaFactor(ATL_TIME_CONSTANT_DAYS);
  const points = [];
  let ctl = 0;
  let atl = 0;
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateKey2 = toDateKey(d);
    const tsb = ctl - atl;
    const tss = tssByDate.get(dateKey2) ?? 0;
    ctl = ctl + (tss - ctl) * ctlFactor;
    atl = atl + (tss - atl) * atlFactor;
    points.push({ dateKey: dateKey2, ctl, atl, tsb });
  }
  return points;
}

// src/core/day-key.ts
function pad(n) {
  return String(n).padStart(2, "0");
}
function localDateKey(d, timeZone) {
  if (timeZone) {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dayKeyOf(iso, timeZone) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso.slice(0, 10) : localDateKey(new Date(t), timeZone);
}

// src/engine/streaks.ts
function mondayOfWeek(dateKey2) {
  const [y, m, d] = dateKey2.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

// src/core/plan-week.ts
function pad2(n) {
  return String(n).padStart(2, "0");
}
function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isoWeekLabel(mondayKey2) {
  const d = parseKey(mondayKey2);
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const week = Math.floor((thursday.getTime() - yearStart.getTime()) / (7 * 864e5)) + 1;
  return `${thursday.getFullYear()}-W${pad2(week)}`;
}

// src/core/session-kind.ts
var NON_BIKE_KINDS = ["strength", "running", "crossfit", "swimming", "mobility", "flexibility", "other"];
function isNonBikeKind(kind) {
  return kind !== null && kind !== void 0 && NON_BIKE_KINDS.includes(kind);
}
function isBikeSession(s) {
  return !isNonBikeKind(s.kind);
}
function wasTrained(s) {
  return s.completion !== "skipped";
}

// src/core/monthly-report.ts
var INTENSITY_LABELS = {
  recovery: "Suave",
  endurance: "Resistencia",
  tempo: "Tempo / SS",
  threshold: "Umbral",
  vo2: "VO2 / anaer\xF3bico"
};
var INTENSITY_ORDER = ["recovery", "endurance", "tempo", "threshold", "vo2"];
var PMC_WINDOW_DAYS = 60;
var AEROBIC_MIN_S = 60 * 60;
var AEROBIC_MAX_IF = 0.8;
var KEY_SESSIONS = 5;
function parseKey2(key) {
  return Date.parse(`${key}T00:00:00Z`);
}
function toKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
function addDays(key, days) {
  return toKey(parseKey2(key) + days * 864e5);
}
function monthStart(monthKey) {
  return `${monthKey}-01`;
}
function monthEnd(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return toKey(Date.UTC(y, m, 0));
}
function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
function defaultReviewMonth(todayKey) {
  return shiftMonth(todayKey.slice(0, 7), -1);
}
var MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function monthName(monthKey) {
  return MONTHS_ES[Number(monthKey.slice(5, 7)) - 1];
}
function weekOfLabel(mondayKey2) {
  return `semana del ${Number(mondayKey2.slice(8, 10))} ${MONTHS_ES[Number(mondayKey2.slice(5, 7)) - 1].slice(0, 3)}`;
}
function dateOf(s) {
  return s.dayKey ?? dayKeyOf(s.startedAt);
}
function durationS(s) {
  return Math.max(0, (Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 1e3);
}
function inRange(key, from, to) {
  return key >= from && key <= to;
}
function maxOf(values) {
  const nums = values.filter((v) => v !== null && Number.isFinite(v) && v > 0);
  return nums.length ? Math.max(...nums) : null;
}
function avgOf(values) {
  const nums = values.filter((v) => v !== null && Number.isFinite(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
function intensityBucket(intensityFactor) {
  if (intensityFactor < 0.65) return "recovery";
  if (intensityFactor < 0.75) return "endurance";
  if (intensityFactor < 0.85) return "tempo";
  if (intensityFactor < 0.95) return "threshold";
  return "vo2";
}
function compliance(from, to, todayKey, bike, nonBike, workouts, routines) {
  const days = [];
  let planned = 0;
  let done = 0;
  for (let key = from; key <= to; key = addDays(key, 1)) {
    const isRideKind = (k) => k === "outdoor" || k === "skills";
    const dayRoutines = routines.filter((r) => r.scheduledDate === key);
    const plannedBike = workouts.filter((w) => w.scheduledDate === key).length + dayRoutines.filter((r) => isRideKind(r.kind)).length;
    const plannedOther = dayRoutines.filter((r) => !isRideKind(r.kind)).length;
    const dayBike = bike.filter((s) => dateOf(s) === key);
    const dayOther = nonBike.filter((s) => dateOf(s) === key);
    const trainedBike = dayBike.filter(wasTrained);
    const trainedOther = dayOther.filter(wasTrained);
    const tss = trainedBike.reduce((sum, s) => sum + (s.tss ?? 0), 0);
    const p = plannedBike + plannedOther;
    const d = Math.min(plannedBike, trainedBike.length) + Math.min(plannedOther, trainedOther.length);
    const anyPartial = [...trainedBike, ...trainedOther].some((s) => s.completion === "partial");
    const future = key > todayKey;
    if (!future) {
      planned += p;
      done += d;
    }
    let status;
    if (future) status = "future";
    else if (p === 0) status = trainedBike.length + trainedOther.length > 0 ? "extra" : "rest";
    else if (d === 0) status = "miss";
    else if (d < p || anyPartial) status = "part";
    else status = "done";
    days.push({ dateKey: key, status, tss: Math.round(tss) });
  }
  return { planned, done, days };
}
function keySessions(bike) {
  const picks = /* @__PURE__ */ new Map();
  const pick = (s, note) => {
    if (s && !picks.has(s.id)) picks.set(s.id, note);
  };
  const byMax = (f) => bike.reduce((best, s) => (f(s) ?? -Infinity) > ((best && f(best)) ?? -Infinity) ? s : best, void 0);
  const b20 = byMax((s) => s.best20);
  if (b20?.best20) pick(b20, `Mejor 20 min del mes (${Math.round(b20.best20)} W).`);
  const b5 = byMax((s) => s.best5);
  if (b5?.best5) pick(b5, `Mejor 5 min del mes (${Math.round(b5.best5)} W).`);
  const longest = byMax(durationS);
  if (longest)
    pick(longest, longest.decouplingPct !== null && durationS(longest) >= AEROBIC_MIN_S ? `Sesi\xF3n m\xE1s larga \xB7 desacople ${longest.decouplingPct.toFixed(1)} %.` : "Sesi\xF3n m\xE1s larga del mes.");
  const topTss = byMax((s) => s.tss);
  if (topTss?.tss) pick(topTss, "Mayor carga del mes.");
  const hardest = byMax((s) => s.rpe !== null && s.rpe >= 9 ? s.rpe : null);
  if (hardest) pick(hardest, `RPE ${hardest.rpe}: la m\xE1s dura del mes.`);
  return [...picks.entries()].slice(0, KEY_SESSIONS).map(([id, note]) => {
    const s = bike.find((x) => x.id === id);
    return {
      dateKey: dateOf(s),
      name: s.workoutName,
      durationS: durationS(s),
      np: s.np,
      intensityFactor: s.intensityFactor,
      tss: s.tss,
      rpe: s.rpe,
      source: s.source,
      note
    };
  }).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}
function buildMonthlyReport(input) {
  const { monthKey, todayKey } = input;
  const startKey = monthStart(monthKey);
  const fullEnd = monthEnd(monthKey);
  const inProgress = todayKey >= startKey && todayKey < fullEnd;
  const endKey = inProgress ? todayKey : fullEnd;
  const prevMonth = shiftMonth(monthKey, -1);
  const prevStart = monthStart(prevMonth);
  const prevEnd = inProgress ? addDays(prevStart, Number(todayKey.slice(8, 10)) - 1) : monthEnd(prevMonth);
  const sessions = input.sessions.filter((s) => s.source !== "strava").map((s) => ({ ...s, dayKey: dayKeyOf(s.startedAt, input.timeZone) }));
  const bikeAll = sessions.filter(isBikeSession);
  const trainedBike = bikeAll.filter(wasTrained);
  const nonBikeAll = sessions.filter((s) => !isBikeSession(s));
  const bikeMonth = trainedBike.filter((s) => inRange(dateOf(s), startKey, endKey));
  const bikePrev = trainedBike.filter((s) => inRange(dateOf(s), prevStart, prevEnd));
  const nonBikeMonth = nonBikeAll.filter((s) => inRange(dateOf(s), startKey, endKey));
  const sumHours = (rows) => rows.reduce((sum, s) => sum + durationS(s), 0) / 3600;
  const sumTss = (rows) => rows.reduce((sum, s) => sum + (s.tss ?? 0), 0);
  const entries = trainedBike.filter((s) => dateOf(s) <= endKey).map((s) => ({ dateKey: dateOf(s), tss: s.tss ?? 0 }));
  const windowStart = addDays(endKey, -(PMC_WINDOW_DAYS - 1));
  const full = entries.length ? computePmc([{ dateKey: windowStart, tss: 0 }, ...entries, { dateKey: endKey, tss: 0 }]).filter((p) => p.dateKey <= endKey) : [];
  const pmcAt = (key) => {
    let found = null;
    for (const p of full) if (p.dateKey <= key) found = p;
    return found;
  };
  const pmc = full.filter((p) => p.dateKey >= windowStart);
  const dailyTss = /* @__PURE__ */ new Map();
  for (const e of entries) if (e.dateKey >= windowStart) dailyTss.set(e.dateKey, (dailyTss.get(e.dateKey) ?? 0) + e.tss);
  const startPoint = pmcAt(addDays(startKey, -1));
  const endPoint = pmcAt(endKey);
  const tsbEnd = endPoint ? endPoint.ctl - endPoint.atl : 0;
  const workoutsMonth = input.workouts.filter((w) => w.scheduledDate && inRange(w.scheduledDate, startKey, fullEnd));
  const workoutsPrev = input.workouts.filter((w) => w.scheduledDate && inRange(w.scheduledDate, prevStart, prevEnd));
  const routinesMonth = input.routines.filter((r) => inRange(r.scheduledDate, startKey, fullEnd));
  const routinesPrev = input.routines.filter((r) => inRange(r.scheduledDate, prevStart, prevEnd));
  const comp = compliance(startKey, fullEnd, todayKey, bikeAll.filter((s) => inRange(dateOf(s), startKey, fullEnd)), nonBikeMonth, workoutsMonth, routinesMonth);
  const compPrev = compliance(prevStart, prevEnd, todayKey, bikeAll.filter((s) => inRange(dateOf(s), prevStart, prevEnd)), nonBikeAll.filter((s) => inRange(dateOf(s), prevStart, prevEnd)), workoutsPrev, routinesPrev);
  const pct = (c) => c.planned > 0 ? Math.round(c.done / c.planned * 100) : null;
  const weeks = [];
  for (let monday = mondayOfWeek(startKey); monday <= fullEnd; monday = addDays(monday, 7)) {
    const sunday = addDays(monday, 6);
    const plannedTss = input.workouts.filter((w) => w.scheduledDate && inRange(w.scheduledDate, monday, sunday)).reduce((sum, w) => sum + (estimateWorkout(w.intervals, input.ftp).tss ?? 0), 0);
    const doneTss = sumTss(trainedBike.filter((s) => inRange(dateOf(s), monday, sunday)));
    weeks.push({ mondayKey: monday, label: `S${Number(isoWeekLabel(monday).slice(-2))}`, plannedTss: Math.round(plannedTss), doneTss: Math.round(doneTss) });
  }
  const best90Start = addDays(endKey, -89);
  const bestsOf = (label, f) => ({
    label,
    month: maxOf(bikeMonth.map(f)),
    prev: maxOf(bikePrev.map(f)),
    best90: maxOf(trainedBike.filter((s) => inRange(dateOf(s), best90Start, endKey)).map(f))
  });
  const intensityHours = /* @__PURE__ */ new Map();
  let hoursWithoutPower = 0;
  for (const s of bikeMonth) {
    const h = durationS(s) / 3600;
    if (s.intensityFactor === null || !(s.intensityFactor > 0)) hoursWithoutPower += h;
    else {
      const b = intensityBucket(s.intensityFactor);
      intensityHours.set(b, (intensityHours.get(b) ?? 0) + h);
    }
  }
  const aerobic = weeks.map((w) => {
    const rides = trainedBike.filter(
      (s) => inRange(dateOf(s), w.mondayKey, addDays(w.mondayKey, 6)) && inRange(dateOf(s), startKey, endKey) && durationS(s) >= AEROBIC_MIN_S && s.intensityFactor !== null && s.intensityFactor <= AEROBIC_MAX_IF
    );
    return { mondayKey: w.mondayKey, label: w.label, decouplingPct: avgOf(rides.map((s) => s.decouplingPct)), ef: avgOf(rides.map((s) => s.efficiencyFactor)) };
  });
  const routines = ["strength", "mobility", "flexibility"].map((kind) => ({
    kind,
    planned: routinesMonth.filter((r) => r.kind === kind && r.scheduledDate <= todayKey).length,
    done: nonBikeMonth.filter((s) => s.kind === kind && wasTrained(s)).length
  })).filter((r) => r.planned > 0 || r.done > 0);
  const lastFtp = (rows) => {
    const sorted = [...rows].filter((s) => s.ftp).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    return sorted.length ? sorted[sorted.length - 1].ftp : null;
  };
  return {
    monthKey,
    startKey,
    endKey,
    inProgress,
    hasData: bikeMonth.length + nonBikeMonth.length > 0,
    kpis: {
      hours: sumHours(bikeMonth),
      hoursPrev: sumHours(bikePrev),
      tss: Math.round(sumTss(bikeMonth)),
      tssPrev: Math.round(sumTss(bikePrev)),
      plannedCount: comp.planned,
      doneCount: comp.done,
      compliancePct: pct(comp),
      compliancePrevPct: pct(compPrev),
      ctlStart: startPoint?.ctl ?? 0,
      ctlEnd: endPoint?.ctl ?? 0,
      ftp: lastFtp(bikeMonth),
      ftpPrev: lastFtp(bikePrev),
      tsbEnd
    },
    pmc,
    dailyTss,
    weeks,
    days: comp.days,
    bests: [bestsOf("1 min", (s) => s.best1), bestsOf("5 min", (s) => s.best5), bestsOf("20 min", (s) => s.best20)],
    intensity: INTENSITY_ORDER.map((bucket) => ({ bucket, hours: intensityHours.get(bucket) ?? 0 })),
    hoursWithoutPower,
    aerobic,
    keySessions: keySessions(bikeMonth),
    routines,
    srpeTotal: Math.round(nonBikeMonth.filter(wasTrained).reduce((sum, s) => sum + (s.srpeLoad ?? 0), 0))
  };
}
var round1 = (n) => Math.round(n * 10) / 10;
var r1OrNull = (n) => n === null ? null : round1(n);
function reviewAiContext(r, athleteId, athlete, coachDraft) {
  const k = r.kpis;
  return {
    athleteId,
    monthKey: r.monthKey,
    inProgress: r.inProgress,
    athlete: {
      name: athlete.name,
      ftp: athlete.ftp && athlete.ftp > 0 ? athlete.ftp : null,
      weightKg: athlete.weightKg && athlete.weightKg > 0 ? athlete.weightKg : null,
      discipline: athlete.discipline,
      injuries: athlete.injuries?.slice(0, 500) ?? null,
      goal: athlete.goal?.slice(0, 300) ?? null
    },
    kpis: {
      hours: round1(k.hours),
      hoursPrev: round1(k.hoursPrev),
      tss: k.tss,
      tssPrev: k.tssPrev,
      plannedCount: k.plannedCount,
      doneCount: k.doneCount,
      compliancePct: k.compliancePct,
      compliancePrevPct: k.compliancePrevPct,
      ctlStart: round1(k.ctlStart),
      ctlEnd: round1(k.ctlEnd),
      ftp: k.ftp,
      ftpPrev: k.ftpPrev,
      tsbEnd: round1(k.tsbEnd)
    },
    weeks: r.weeks.map((w) => ({ label: weekOfLabel(w.mondayKey), plannedTss: w.plannedTss, doneTss: w.doneTss })),
    bests: r.bests.map((b) => ({ label: b.label, month: b.month, prev: b.prev, best90: b.best90 })),
    intensityHours: Object.fromEntries(r.intensity.map((i) => [INTENSITY_LABELS[i.bucket], round1(i.hours)])),
    hoursWithoutPower: round1(r.hoursWithoutPower),
    aerobic: r.aerobic.map((a) => ({ label: weekOfLabel(a.mondayKey), decouplingPct: r1OrNull(a.decouplingPct), ef: a.ef === null ? null : Math.round(a.ef * 100) / 100 })),
    routines: r.routines.map((x) => ({ kind: x.kind, planned: x.planned, done: x.done })),
    srpeTotal: r.srpeTotal,
    keySessions: r.keySessions.map((s) => ({
      date: s.dateKey,
      name: s.name.slice(0, 120),
      minutes: Math.round(s.durationS / 60),
      np: s.np === null ? null : Math.round(s.np),
      intensityFactor: s.intensityFactor === null ? null : Math.round(s.intensityFactor * 100) / 100,
      tss: s.tss === null ? null : Math.round(s.tss),
      rpe: s.rpe,
      note: s.note.slice(0, 200)
    })),
    missedDays: r.days.filter((d) => d.status === "miss").length,
    partialDays: r.days.filter((d) => d.status === "part").length,
    coachDraft: coachDraft.slice(0, 4e3)
  };
}

// src/core/monthly-report-email.ts
var nf = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
var nf1 = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function signedNumber(n, digits = 0) {
  const v = digits ? nf1.format(Math.abs(n)) : nf.format(Math.abs(Math.round(n)));
  return n > 0 ? `+${v}` : n < 0 ? `\u2212${v}` : v;
}
function tsbZone(tsb) {
  if (tsb > 5) return "Fresca";
  if (tsb >= -10) return "Transici\xF3n";
  if (tsb >= -30) return "Zona productiva";
  return "Fatiga alta";
}
function emailKpis(r) {
  const k = r.kpis;
  const prev = monthName(shiftMonth(r.monthKey, -1));
  const vs = (n, unit, digits = 0) => {
    if (n === null || !Number.isFinite(n)) return "sin comparaci\xF3n";
    const v = digits ? Math.round(n * 10) / 10 : Math.round(n);
    return v === 0 ? `igual que ${prev}` : `${v > 0 ? "+" : "\u2212"}${digits ? nf1.format(Math.abs(v)) : nf.format(Math.abs(v))}${unit} vs. ${prev}`;
  };
  return [
    { label: "Horas de bici", value: `${nf1.format(k.hours)} h`, delta: vs(k.hours - k.hoursPrev, " h", 1) },
    { label: "Carga (TSS)", value: nf.format(k.tss), delta: vs(k.tssPrev > 0 ? (k.tss - k.tssPrev) / k.tssPrev * 100 : null, " %") },
    { label: "Cumplimiento", value: k.compliancePct === null ? "\u2014" : `${k.compliancePct} %`, delta: k.compliancePct === null ? "sin plan agendado" : `${k.doneCount} de ${k.plannedCount} sesiones` },
    { label: "Fitness (CTL)", value: nf.format(k.ctlEnd), delta: `${signedNumber(k.ctlEnd - k.ctlStart)} desde ${nf.format(k.ctlStart)}` },
    { label: "FTP", value: k.ftp ? `${nf.format(k.ftp)} W` : "\u2014", delta: k.ftp && k.ftpPrev ? vs(k.ftp - k.ftpPrev, " W") : "sin comparaci\xF3n" },
    { label: "Forma (TSB)", value: signedNumber(k.tsbEnd), delta: tsbZone(k.tsbEnd) }
  ];
}

// src/core/self-report-start.ts
var SHORT_FIRST_MONTH_DAYS = 14;
function daysToMonthEnd(startedOn) {
  const end = monthEnd(startedOn.slice(0, 7));
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${startedOn}T00:00:00Z`)) / 864e5) + 1;
}
function startPhase(startedOn, monthKey) {
  if (!startedOn) return { kind: "regular" };
  const start = monthStart(monthKey);
  const end = monthEnd(monthKey);
  if (startedOn > start && startedOn <= end) {
    const days = daysToMonthEnd(startedOn);
    return days < SHORT_FIRST_MONTH_DAYS ? { kind: "skip_short_first", startedOn, days } : { kind: "first_partial", startedOn };
  }
  const prevStart = monthStart(shiftMonth(monthKey, -1));
  if (startedOn > prevStart && startedOn < start && daysToMonthEnd(startedOn) < SHORT_FIRST_MONTH_DAYS) {
    return { kind: "first_full_after_short", startedOn };
  }
  return { kind: "regular" };
}

// src/core/eval-week.ts
var DAY_MS = 864e5;
function mondayKey(dateKey2) {
  const d = /* @__PURE__ */ new Date(`${dateKey2}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
function planWeekOf(startDate, dateKey2) {
  const diff = Date.parse(`${mondayKey(dateKey2)}T00:00:00Z`) - Date.parse(`${mondayKey(startDate)}T00:00:00Z`);
  return Math.round(diff / DAY_MS / 7);
}
function evalWeekTarget(startDate, todayKey) {
  const current = planWeekOf(startDate, todayKey);
  const isSunday = (/* @__PURE__ */ new Date(`${todayKey}T00:00:00Z`)).getUTCDay() === 0;
  const evaluated = isSunday ? current : current - 1;
  if (evaluated < 0) return null;
  return { evaluated, target: evaluated + 1 };
}
function planTotalWeeks(blocks) {
  return blocks.reduce((s, b) => s + b.weeks, 0);
}

// src/core/intake.ts
var CHRONIC_CONDITION_LABELS = {
  hypertension: "Presi\xF3n alta",
  diabetes: "Diabetes",
  metabolic: "Metab\xF3lica (tiroides, resistencia a la insulina\u2026)",
  asthma: "Asma",
  heart: "Del coraz\xF3n",
  dysautonomia: "Disautonom\xEDa o POTS",
  vertigo: "V\xE9rtigo o mareos",
  other: "Otra"
};
var NO_HIGH_INTENSITY_CONDITIONS = ["heart", "dysautonomia", "vertigo"];
var METABOLIC_CONDITIONS = ["diabetes", "metabolic"];
var SHORT_SLEEP_H = 6;
var bump = (l) => l === "low" ? "medium" : "high";
function startingProfile(p) {
  const i = p.intake;
  const healthFirst = !!i && (i.conditions.length > 0 || i.takesMedication);
  const reasons = [];
  if (i?.conditions.length) reasons.push("tiene una condici\xF3n de salud: primero que lo vea su m\xE9dico");
  else if (i?.takesMedication) reasons.push("toma medicamento de forma regular: primero que lo vea su m\xE9dico");
  if (i?.recentInjury) reasons.push("lesi\xF3n o cirug\xEDa en los \xFAltimos 2 a\xF1os");
  if (typeof p.ageYears === "number" && p.ageYears < 18) reasons.push("es menor de edad");
  if (p.generalFitnessLevel === "sedentary") reasons.push("viene de estar sedentario");
  if (i?.rpeLiteracy === "no") reasons.push("todav\xEDa no sabe medir su esfuerzo (RPE)");
  const maxEffortReady = reasons.length === 0;
  const knowsHowToDose = !!i?.maxEffortExperience && i.rpeLiteracy === "yes" && (p.experienceLevel === "experienced" || (p.structuredTrainingYears ?? 0) >= 1);
  const testPlan = !maxEffortReady ? "none" : knowsHowToDose ? "test20" : "ramp";
  const baseFirst = !!i && (i.smoking !== "no" || i.alcohol !== "rarely");
  let stress = i?.stress ?? "medium";
  if (i && i.alcohol !== "rarely") stress = bump(stress);
  if (i && (i.sleepHours < SHORT_SLEEP_H || i.sleepQuality === "poor")) stress = bump(stress);
  if (i && i.alcohol === "frequent") stress = "high";
  const poorSleep = !!i && (i.sleepHours < SHORT_SLEEP_H || i.sleepQuality === "poor");
  const start = poorSleep || stress === "high" ? "conservative" : "normal";
  const intensityLimitReasons = [];
  for (const c of i?.conditions ?? []) if (NO_HIGH_INTENSITY_CONDITIONS.includes(c)) intensityLimitReasons.push(`condici\xF3n: ${CHRONIC_CONDITION_LABELS[c].toLowerCase()}`);
  if (i?.injuryLimitsIntensity) intensityLimitReasons.push("una lesi\xF3n o molestia que hoy le impide esfuerzos fuertes");
  return {
    healthFirst,
    maxEffortReady,
    notReadyReasons: reasons,
    testPlan,
    baseFirst,
    start,
    stressAdjusted: stress,
    teachRpe: !!i && i.rpeLiteracy !== "yes",
    intensityLimit: intensityLimitReasons.length > 0,
    intensityLimitReasons,
    metabolicFirst: !!i && i.conditions.some((c) => METABOLIC_CONDITIONS.includes(c)),
    inSeason: i?.recentTraining === "with_intensity",
    recentHoursPerWeek: typeof i?.recentHoursPerWeek === "number" ? i.recentHoursPerWeek : null
  };
}

// src/core/rpe-ramp.ts
var RPE_RAMP = { startW: 50, stepW: 25, lightStepW: 20, lightKg: 53, stepS: 120, maxSteps: 24, stopRpe: 8, hrStopPct: 0.8 };
function rampStepW(weightKg) {
  return typeof weightKg === "number" && weightKg > 0 && weightKg < RPE_RAMP.lightKg ? RPE_RAMP.lightStepW : RPE_RAMP.stepW;
}
function rpeRampIntervals(refFtp = 200, weightKg) {
  const step = rampStepW(weightKg);
  return Array.from({ length: RPE_RAMP.maxSteps }, (_, i) => {
    const watts = RPE_RAMP.startW + i * step;
    return {
      name: `Escal\xF3n ${i + 1} \xB7 ${watts} W`,
      type: "steady",
      duration_s: RPE_RAMP.stepS,
      watts,
      power_pct: Math.max(1, Math.round(watts / refFtp * 100))
    };
  });
}

// src/core/coach-testers.ts
var UNLIMITED_COACH_USER_IDS = /* @__PURE__ */ new Set([
  "85983750-01e5-449f-adb6-0a87c7047682",
  // joemtb03@gmail.com — Joe Hernández, entrenador (UR Training)
  "b73d7ff9-adcb-494a-98fb-c94fdc509b3b",
  // joemtb03+pruebas@gmail.com — su cuenta de pruebas
  "68c9ddae-cee4-4d2f-8d0f-9553f9fe5782"
  // dperezcf@gmail.com — cuenta dummy de pruebas (las pruebas de Piñón pasan del tope de 10 al día)
]);
function hasUnlimitedCoach(userId) {
  return !!userId && UNLIMITED_COACH_USER_IDS.has(userId);
}

// src/core/pinon-chat.ts
var PINON_MAX_CHARS = 200;
var PINON_DAILY_AI_LIMIT = 10;
var CHANGE_VERBS = "(mueve|mover|muevas|cambia|cambiar|cambies|quita|quitar|quites|borra|borrar|elimina|eliminar|agrega|agregar|anade|anadir|reprograma|reprogramar|ajusta|ajustar|modifica|modificar|recorre|recorrer|cancela|cancelar)";
var CHANGE_ONLY_ENCLITIC = "(subeme|subele|bajame|bajale|ponme|ponle|pasame|pasale)";
var CHANGE_RE = new RegExp(
  `\\b(${CHANGE_VERBS}(me|le|lo|la|melo|mela|selo|sela)?|${CHANGE_ONLY_ENCLITIC})\\b.*\\b(entreno|entrenamiento|entrenamientos|plan|sesion|sesiones|dia|semana|workout|rodada|intervalos?|intensidad|ftp|zonas?)\\b`
);

// src/core/pinon-chat-request.ts
var PINON_HISTORY_TURNS = 6;
var HISTORY_TEXT_MAX = 400;
var NOTE_MAX = 240;
var NAME_MAX = 80;
var DESCRIPTION_MAX = 400;
var RECENT_MAX = 6;
var SCHEDULE_MAX = 21;
var ZONES = ["fondo", "tempo", "sweet spot", "umbral", "VO2", "test"];
var str = (v, max) => typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
var num = (v, min, max) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 10) / 10)) : null;
var dateKey = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
function session(v) {
  if (!v || typeof v !== "object") return null;
  const s = v;
  const date = dateKey(s.date);
  const name = str(s.name, NAME_MAX);
  if (!date || !name) return null;
  return { date, name, minutes: num(s.minutes, 0, 1e3) ?? 0, tss: num(s.tss, 0, 1e3), rpe: num(s.rpe, 1, 10), note: str(s.note, NOTE_MAX) };
}
function scheduledDay(v) {
  if (!v || typeof v !== "object") return null;
  const d = v;
  const date = dateKey(d.date);
  const name = str(d.name, NAME_MAX);
  if (!date || !name) return null;
  return { date, name, minutes: num(d.minutes, 0, 1e3) ?? 0, zone: ZONES.includes(d.zone) ? d.zone : null, done: d.done === true };
}
function context(v) {
  if (!v || typeof v !== "object") return null;
  const c = v;
  const todayKey = dateKey(c.todayKey);
  if (!todayKey) return null;
  const t = c.today;
  const todayName = t ? str(t.name, NAME_MAX) : null;
  const w = c.week ?? {};
  const f = c.form;
  const ctl = f ? num(f.ctl, -500, 500) : null;
  const atl = f ? num(f.atl, -500, 500) : null;
  const tsb = f ? num(f.tsb, -500, 500) : null;
  return {
    todayKey,
    gender: c.gender === "m" || c.gender === "f" ? c.gender : "n",
    humanCoach: c.humanCoach === true,
    hasPlan: c.hasPlan !== false,
    ftp: num(c.ftp, 0, 700) ?? 0,
    ...t && todayName ? {
      today: {
        name: todayName,
        minutes: num(t.minutes, 0, 1e3) ?? 0,
        zone: ZONES.includes(t.zone) ? t.zone : null,
        description: str(t.description, DESCRIPTION_MAX),
        done: t.done === true
      }
    } : {},
    week: { done: num(w.done, 0, 50) ?? 0, planned: num(w.planned, 0, 50) ?? 0 },
    ...ctl !== null && atl !== null && tsb !== null ? { form: { ctl, atl, tsb } } : {},
    recent: (Array.isArray(c.recent) ? c.recent : []).slice(0, RECENT_MAX).map(session).filter((s) => s !== null),
    schedule: (Array.isArray(c.schedule) ? c.schedule : []).slice(0, SCHEDULE_MAX).map(scheduledDay).filter((s) => s !== null),
    daysSinceLastRide: num(c.daysSinceLastRide, 0, 1e4)
  };
}
function parsePinonRequest(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "pedido vac\xEDo" };
  const b = body;
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!message) return { ok: false, error: "escribe algo para Pi\xF1\xF3n" };
  if (message.length > PINON_MAX_CHARS) return { ok: false, error: `m\xE1ximo ${PINON_MAX_CHARS} caracteres` };
  const ctx = context(b.context);
  if (!ctx) return { ok: false, error: "falta el contexto" };
  const history = (Array.isArray(b.history) ? b.history : []).slice(-PINON_HISTORY_TURNS).map((h) => {
    const turn = h;
    const text = turn ? str(turn.text, HISTORY_TEXT_MAX) : null;
    return text && (turn.role === "user" || turn.role === "pinon") ? { role: turn.role, text } : null;
  }).filter((h) => h !== null);
  return { ok: true, request: { message, history, context: ctx } };
}
function pinonLimitReached(usedToday, unlimited) {
  return !unlimited && usedToday >= PINON_DAILY_AI_LIMIT;
}
var WEEKDAYS = ["domingo", "lunes", "martes", "mi\xE9rcoles", "jueves", "viernes", "s\xE1bado"];
var MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
var utcDate = (key) => /* @__PURE__ */ new Date(`${key}T00:00:00Z`);
var dayLabel = (key) => {
  const d = utcDate(key);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
function mondayOf(key) {
  const d = utcDate(key);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
function pinonAgenda(ctx) {
  const thisMonday = mondayOf(ctx.todayKey);
  const lines = [`Hoy es ${dayLabel(ctx.todayKey)}. \xABEsta semana\xBB va del lunes ${utcDate(thisMonday).getUTCDate()} al domingo; \xABeste fin de semana\xBB es el s\xE1bado y domingo de esta semana.`];
  if (ctx.schedule.length === 0) lines.push("No hay nada agendado esta semana ni la siguiente.");
  for (const d of ctx.schedule) {
    const week = mondayOf(d.date) === thisMonday ? "esta semana" : "semana siguiente";
    const when = d.date === ctx.todayKey ? "HOY" : d.date < ctx.todayKey ? "ya pas\xF3" : "pendiente";
    const status = d.done ? "hecho" : when === "ya pas\xF3" ? "no se hizo" : when === "HOY" ? "hoy, pendiente" : "pendiente";
    lines.push(`- ${dayLabel(d.date)} (${week}): ${d.name}, ${d.minutes} min${d.zone ? `, ${d.zone}` : ""}. ${status}.`);
  }
  return lines.join("\n");
}
function pinonUserMessage(req) {
  const transcript = req.history.map((h) => `${h.role === "user" ? "Atleta" : "Pi\xF1\xF3n"}: ${h.text}`).join("\n");
  const { schedule: _schedule, ...data } = req.context;
  return [
    `<datos_del_atleta>
${JSON.stringify(data)}
</datos_del_atleta>`,
    `<agenda>
${pinonAgenda(req.context)}
</agenda>`,
    transcript ? `<conversacion_reciente>
${transcript}
</conversacion_reciente>` : "",
    `<pregunta>
${req.message}
</pregunta>`
  ].filter(Boolean).join("\n\n");
}
export {
  addDays,
  buildMonthlyReport,
  defaultReviewMonth,
  emailKpis,
  evalWeekTarget,
  hasUnlimitedCoach,
  localDateKey,
  mondayOfWeek,
  monthEnd,
  monthStart,
  parsePinonRequest,
  pinonLimitReached,
  pinonUserMessage,
  planTotalWeeks,
  planWeekOf,
  reviewAiContext,
  rpeRampIntervals,
  shiftMonth,
  startPhase,
  startingProfile
};
