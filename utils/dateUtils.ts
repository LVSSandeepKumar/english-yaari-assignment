// Start and end of the UTC day for a given timestamp
export const getDayRange = (timestamp: number) => {
  // Accept seconds or milliseconds
  const timestampMs = timestamp < 1e12 ? timestamp * 1000 : timestamp;

  const d = new Date(timestampMs);
  const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart, dayEnd };
};
