import type { DeliveryGeometry } from '@delivery-cruzeiro/types';

/** Local metric projection around the point; all outer/inner boundaries matter. */
export function clearsDeliveryBoundary(
	geometry: DeliveryGeometry,
	longitude: number,
	latitude: number,
	radius: number
) {
	if (!Number.isFinite(radius) || radius < 0) return false;
	if (radius === 0) return true;
	const scale = (6371000 * Math.PI) / 180,
		cos = Math.cos((latitude * Math.PI) / 180);
	const project = (p: number[]) => [(p[0] - longitude) * scale * cos, (p[1] - latitude) * scale];
	const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
	for (const rings of polygons)
		for (const ring of rings)
			for (let i = 1; i < ring.length; i++) {
				const a = project(ring[i - 1]),
					b = project(ring[i]),
					dx = b[0] - a[0],
					dy = b[1] - a[1],
					length = dx * dx + dy * dy;
				const t = length ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / length)) : 0;
				if (Math.hypot(a[0] + t * dx, a[1] + t * dy) <= radius) return false;
			}
	return true;
}
