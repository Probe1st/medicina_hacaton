export function localDateOf(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addCalendarDays(day: string, offset: number): string {
  const [yStr, mStr, dStr] = day.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const dt = new Date(y, m - 1, d + offset, 12, 0, 0, 0);
  return localDateOf(dt);
}

export function parseLocalReminder(
  input: string,
  now: Date
): { ok: true; at: string; display: string } | { ok: false; message: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input);
  if (!match) {
    return { ok: false, message: "Выберите корректные дату и время" };
  }

  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const h = Number(match[4]);
  const min = Number(match[5]);

  if (m < 1 || m > 12 || d < 1 || d > 31 || h < 0 || h > 23 || min < 0 || min > 59) {
    return { ok: false, message: "Выберите корректные дату и время" };
  }

  const dt = new Date(y, m - 1, d, h, min, 0, 0);

  if (
    isNaN(dt.getTime()) ||
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d ||
    dt.getHours() !== h ||
    dt.getMinutes() !== min
  ) {
    return { ok: false, message: "Выберите корректные дату и время" };
  }

  if (dt.getTime() <= now.getTime()) {
    return { ok: false, message: "Выберите время в будущем" };
  }

  const offsetMin = -dt.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMin);
  const offH = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const offM = String(absOffset % 60).padStart(2, "0");
  const offsetStr = `UTC${sign}${offH}:${offM}`;
  const display = `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y} ${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")} (${offsetStr})`;
  return {
    ok: true,
    at: dt.toISOString(),
    display,
  };
}
