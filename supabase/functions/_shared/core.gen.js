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
    const dateKey = toDateKey(d);
    const tsb = ctl - atl;
    const tss = tssByDate.get(dateKey) ?? 0;
    ctl = ctl + (tss - ctl) * ctlFactor;
    atl = atl + (tss - atl) * atlFactor;
    points.push({ dateKey, ctl, atl, tsb });
  }
  return points;
}

// src/engine/streaks.ts
function mondayOfWeek(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

// src/core/plan-week.ts
function pad(n) {
  return String(n).padStart(2, "0");
}
function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isoWeekLabel(mondayKey) {
  const d = parseKey(mondayKey);
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const week = Math.floor((thursday.getTime() - yearStart.getTime()) / (7 * 864e5)) + 1;
  return `${thursday.getFullYear()}-W${pad(week)}`;
}

// src/core/session-kind.ts
var NON_BIKE_KINDS = ["strength", "mobility", "flexibility", "other"];
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
function weekOfLabel(mondayKey) {
  return `semana del ${Number(mondayKey.slice(8, 10))} ${MONTHS_ES[Number(mondayKey.slice(5, 7)) - 1].slice(0, 3)}`;
}
function dateOf(s) {
  return s.startedAt.slice(0, 10);
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
    const plannedBike = workouts.filter((w) => w.scheduledDate === key).length;
    const plannedOther = routines.filter((r) => r.scheduledDate === key).length;
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
  const sessions = input.sessions.filter((s) => s.source !== "strava");
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
export {
  addDays,
  buildMonthlyReport,
  defaultReviewMonth,
  emailKpis,
  mondayOfWeek,
  monthEnd,
  monthStart,
  reviewAiContext,
  shiftMonth
};
