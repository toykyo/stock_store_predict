export async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

export async function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function minusDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  date.setDate(date.getDate() - days);
  return toDateKey(date);
}

export function toCompactDate(dateText) {
  return dateText.replaceAll("-", "");
}

export function asDecimalPercent(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed / 100;
}

export function computeReturn(currentValue, previousValue) {
  const current = Number(currentValue);
  const previous = Number(previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }

  return current / previous - 1;
}
