export function brasiliaDateRange(from?: string, to?: string) {
	if (!from && !to) return undefined;

	return {
		gte: from ? new Date(`${from}T00:00:00-03:00`) : undefined,
		lt: to ? new Date(new Date(`${to}T00:00:00-03:00`).getTime() + 86_400_000) : undefined,
	};
}
