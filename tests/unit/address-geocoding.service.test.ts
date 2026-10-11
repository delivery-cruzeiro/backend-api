import { beforeEach, describe, expect, it, vi } from "vitest";
const database = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ prisma: { address: database } }));
import { AddressGeocodingService } from "../../src/services/address-geocoding.service.js";
const address = {
  id: "address",
  street: "Rua Exemplo",
  number: "12",
  city: "Campina Grande",
  state: "PB",
  neighborhood: "Liberdade",
  zipCode: "58414-000",
  updatedAt: new Date(),
  geocodingKey: null,
  geocodingAttemptedAt: null,
  latitude: null,
  longitude: null,
  locationConfirmed: false,
};
const result = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-35.88, -7.24] },
  properties: {
    housenumber: "12",
    street: "Rua Exemplo",
    city: "Campina Grande",
    state: "Paraíba",
    countrycode: "BR",
    postcode: "58414-000",
  },
};
function setup(features: unknown[] = [result]) {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ features })));
  const service = new AddressGeocodingService(fetcher, async (request) =>
    request(),
  );
  return { service, fetcher };
}
describe("automatic address geocoding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.findUnique.mockResolvedValue(address);
    database.updateMany.mockResolvedValue({ count: 1 });
  });
  it("sends postcode and house number and accepts an exact house result", async () => {
    const { service, fetcher } = setup();
    expect(await service.locate(address)).toEqual({
      longitude: -35.88,
      latitude: -7.24,
    });
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.searchParams.get("q")).toContain("58414-000");
    expect(url.searchParams.get("q")).toContain("12 Rua Exemplo");
  });
  it("rejects street centroids, another number, wrong city/postcode and ambiguous results", async () => {
    for (const properties of [
      { housenumber: undefined },
      { housenumber: "20" },
      { city: "Outra cidade" },
      { postcode: "01001000" },
      { street: "Rua Diferente" },
    ]) {
      expect(
        await setup([
          { ...result, properties: { ...result.properties, ...properties } },
        ]).service.locate(address),
      ).toBeNull();
    }
    expect(
      await setup([
        result,
        {
          ...result,
          geometry: { type: "Point", coordinates: [-35.89, -7.24] },
        },
      ]).service.locate(address),
    ).toBeNull();
  });
  it("handles provider errors and incomplete addresses without inventing coordinates", async () => {
    const { service, fetcher } = setup();
    fetcher.mockRejectedValue(new Error("timeout"));
    expect(await service.locate(address)).toBeNull();
    expect(await service.locate({ ...address, number: "S/N" })).toBeNull();
  });
  it("persists and reuses the verified point for quotation and order", async () => {
    const { service, fetcher } = setup();
    expect(await service.ensureLocation(address.id)).toMatchObject({
      locationConfirmed: true,
    });
    const saved = database.updateMany.mock.calls[0][0].data;
    database.findUnique.mockResolvedValue({ ...address, ...saved });
    expect(await service.ensureLocation(address.id)).toMatchObject({
      locationConfirmed: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    database.findUnique.mockResolvedValue({
      ...address,
      ...saved,
      number: "15",
    });
    expect(await service.ensureLocation(address.id)).toMatchObject({
      locationConfirmed: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("caches failed lookups briefly and refuses to overwrite concurrent address edits", async () => {
    const { service, fetcher } = setup([]);
    await service.ensureLocation(address.id);
    database.findUnique.mockResolvedValue({
      ...address,
      ...database.updateMany.mock.calls[0][0].data,
    });
    await service.ensureLocation(address.id);
    expect(fetcher).toHaveBeenCalledTimes(1);
    database.findUnique.mockResolvedValue(address);
    database.updateMany.mockResolvedValue({ count: 0 });
    expect(await setup().service.ensureLocation(address.id)).toEqual({
      latitude: null,
      longitude: null,
      locationConfirmed: false,
    });
  });
});
