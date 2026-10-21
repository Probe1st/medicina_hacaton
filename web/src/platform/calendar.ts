import type { TaskId, TemplateId } from "../domain/types";

export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) {
    return line;
  }

  const codePoints = Array.from(line);
  const resultLines: string[] = [];
  let currentLine = "";
  let currentBytes = 0;
  const maxBytesFirst = 75;
  const maxBytesContinuation = 74;

  let isFirst = true;

  for (const cp of codePoints) {
    const cpBytes = encoder.encode(cp).length;
    const maxBytes = isFirst ? maxBytesFirst : maxBytesContinuation;

    if (currentBytes + cpBytes > maxBytes && currentLine.length > 0) {
      resultLines.push(currentLine);
      currentLine = cp;
      currentBytes = cpBytes;
      isFirst = false;
    } else {
      currentLine += cp;
      currentBytes += cpBytes;
    }
  }

  if (currentLine.length > 0) {
    resultLines.push(currentLine);
  }

  return resultLines.join("\r\n ");
}

function formatIcsDate(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

export function makeCalendarEvent(input: {
  planId: TemplateId;
  taskId: TaskId;
  at: string;
  createdAt: string;
}): string {
  const atDate = new Date(input.at);
  const atPlus5Min = new Date(atDate.getTime() + 5 * 60 * 1000).toISOString();
  const uid = `marshrut-${input.planId}-${input.taskId}-${atDate.getTime()}@demo.invalid`;
  const dtstamp = formatIcsDate(input.createdAt);
  const dtstart = formatIcsDate(input.at);
  const dtend = formatIcsDate(atPlus5Min);

  const rawLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MARSHRUT//Educational Demo//RU",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeIcsText("Учебное напоминание")}`,
    `DESCRIPTION:${escapeIcsText("Откройте учебный план МАРШРУТ. Это не медицинское назначение.")}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:PT0M",
    `DESCRIPTION:${escapeIcsText("Откройте учебный план")}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return rawLines.map(foldIcsLine).join("\r\n") + "\r\n";
}
