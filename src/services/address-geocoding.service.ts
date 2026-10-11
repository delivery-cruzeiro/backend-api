import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { normalizeZipCode } from "./via-cep.service.js";

type AddressInput = {
  street: string;
  number: string;
  zipCode: string;
  city: string;
  state: string;
  neighborhood: string;
};
type Point = { latitude: number; longitude: number };
type Location = {
  latitude: number | null;
  longitude: number | null;
  locationConfirmed: boolean;
};
const inFlight = new Map<string, Promise<Location>>();
const states: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};
const comparable = (value: unknown) =>
  typeof value === "string"
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/gi, " ")
        .trim()
        .toLowerCase()
    : "";
const streetName = (value: unknown) =>
  comparable(value).replace(/^(rua|r|avenida|av|travessa|tv|alameda|al) /, "");
const houseNumber = (value: unknown) =>
  comparable(value).replace(/^0+(?=\d)/, "");
let nextRequestAt = 0;
async function scheduleRequest<T>(
  request: () => Promise<T>,
): Promise<T | null> {
  const now = Date.now(),
    wait = Math.max(0, nextRequestAt - now);
  if (wait > 4000) return null;
  nextRequestAt = Math.max(now, nextRequestAt) + 1100;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  return request();
}

export class AddressGeocodingService {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly schedule = scheduleRequest,
  ) {}

  async locate(address: AddressInput): Promise<Point | null> {
    const zipCode = normalizeZipCode(address.zipCode);
    if (
      zipCode.length !== 8 ||
      !address.street.trim() ||
      !/\d/.test(address.number)
    )
      return null;
    try {
      const url = new URL(
        "api",
        (
          process.env.PHOTON_GEOCODING_URL || "https://photon.komoot.io/"
        ).replace(/\/?$/, "/"),
      );
      if (url.protocol !== "https:") return null;
      url.search = new URLSearchParams({
        q: `${address.number} ${address.street}, ${zipCode.slice(0, 5)}-${zipCode.slice(5)}, ${address.city}, ${states[address.state.toUpperCase()] ?? address.state}, Brasil`,
        limit: "10",
      }).toString();
      const data = await this.schedule(async () => {
        const response = await this.fetcher(url, {
          headers: {
            accept: "application/json",
            "user-agent": "DeliveryCruzeiro/1.2 address-geocoding",
          },
          signal: AbortSignal.timeout(8000),
        });
        return response.ok ? await response.json() : null;
      });
      if (!data || !Array.isArray(data.features)) return null;
      const points: Point[] = [];
      for (const feature of data.features) {
        const p = feature?.properties,
          c = feature?.geometry?.coordinates;
        if (
          !p ||
          feature.geometry?.type !== "Point" ||
          !Array.isArray(c) ||
          c.length !== 2 ||
          !c.every((v: unknown) => typeof v === "number" && Number.isFinite(v))
        )
          continue;
        if (
          comparable(p.countrycode) !== "br" ||
          comparable(p.city) !== comparable(address.city) ||
          houseNumber(p.housenumber) !== houseNumber(address.number) ||
          streetName(p.street) !== streetName(address.street)
        )
          continue;
        if (p.postcode && normalizeZipCode(String(p.postcode)) !== zipCode)
          continue;
        if (
          p.state &&
          ![
            comparable(address.state),
            comparable(states[address.state.toUpperCase()]),
          ].includes(comparable(p.state))
        )
          continue;
        if (c[0] < -74 || c[0] > -34 || c[1] < -34 || c[1] > 6) continue;
        points.push({ longitude: c[0], latitude: c[1] });
      }
      if (!points.length) return null;
      // Ambiguous house matches must not silently select a different delivery area.
      if (
        points.some(
          (p) =>
            Math.hypot(
              p.longitude - points[0].longitude,
              p.latitude - points[0].latitude,
            ) > 0.0002,
        )
      )
        return null;
      return points[0];
    } catch {
      return null;
    }
  }

  async ensureLocation(id: string) {
    const address = await prisma.address.findUnique({ where: { id } });
    if (!address)
      return { latitude: null, longitude: null, locationConfirmed: false };
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          process.env.PHOTON_GEOCODING_URL || "https://photon.komoot.io/",
          normalizeZipCode(address.zipCode),
          comparable(address.street),
          houseNumber(address.number),
          comparable(address.city),
          comparable(address.state),
          comparable(address.neighborhood),
        ]),
      )
      .digest("hex");
    if (
      address.geocodingKey === key &&
      address.geocodingAttemptedAt &&
      (address.locationConfirmed ||
        Date.now() - address.geocodingAttemptedAt.getTime() < 300000)
    ) {
      return {
        latitude: address.latitude,
        longitude: address.longitude,
        locationConfirmed: address.locationConfirmed,
      };
    }
    const requestKey = `${id}:${key}`;
    const pending = inFlight.get(requestKey);
    if (pending) return pending;
    const task = (async (): Promise<Location> => {
      const point = await this.locate(address);
      const location = {
        latitude: point?.latitude ?? null,
        longitude: point?.longitude ?? null,
        locationConfirmed: !!point,
      };
      // Optimistic check prevents a slow geocoder from overwriting an edited address.
      const saved = await prisma.address.updateMany({
        where: { id, updatedAt: address.updatedAt },
        data: {
          ...location,
          geocodingKey: key,
          geocodingAttemptedAt: new Date(),
        },
      });
      return saved.count
        ? location
        : { latitude: null, longitude: null, locationConfirmed: false };
    })();
    inFlight.set(requestKey, task);
    try {
      return await task;
    } finally {
      inFlight.delete(requestKey);
    }
  }
}
