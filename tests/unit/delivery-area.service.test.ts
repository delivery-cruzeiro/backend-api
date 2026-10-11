import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { deliveryPartition: { findMany: mocks.findMany } },
}));
import { DeliveryAreaService } from "../../src/services/delivery-area.service.js";
const geometry = (a: number, b: number) => ({
  type: "Polygon",
  coordinates: [
    [
      [a, 0],
      [b, 0],
      [b, 0.01],
      [a, 0.01],
      [a, 0],
    ],
  ],
});
const input = {
  storeId: "store",
  neighborhood: "Jardins",
  city: "Campina Grande",
  state: "PB",
  latitude: 0.005,
  longitude: 0.005,
  locationConfirmed: true,
};
describe("delivery area resolution", () => {
  beforeEach(() =>
    mocks.findMany.mockResolvedValue([
      {
        activeRevision: 1,
        neighborhood: { name: "Jardins", city: "Campina Grande", state: "PB" },
        revisions: [
          {
            revision: 1,
            areas: [
              {
                id: "one",
                index: 1,
                geometry: geometry(0, 0.005),
                rule: { isBlocked: false },
              },
              {
                id: "two",
                index: 2,
                geometry: geometry(0.005, 0.01),
                rule: { isBlocked: true },
              },
            ],
          },
        ],
      },
    ]),
  );
  it("prioritizes blocked area on shared border", async () => {
    const result = await new DeliveryAreaService().resolve(input);
    expect(result).toMatchObject({
      needsLocation: false,
      boundary: true,
      area: { id: "two" },
    });
  });
  it("requires confirmed location and refuses name/city mismatch", async () => {
    const service = new DeliveryAreaService();
    expect(
      await service.resolve({ ...input, locationConfirmed: false }),
    ).toEqual({ needsLocation: true });
    expect(await service.resolve({ ...input, city: "Outra cidade" })).toEqual({
      needsLocation: true,
    });
    expect(
      await service.resolve({ ...input, neighborhood: "Outro bairro" }),
    ).toEqual({ needsLocation: true });
    expect(await service.resolve({ ...input, latitude: 20 })).toEqual({
      needsLocation: true,
    });
  });
  it("keeps legacy behavior for undivided neighborhoods", async () => {
    expect(
      await new DeliveryAreaService().resolve({
        storeId: "store",
        neighborhood: "Centro",
      }),
    ).toBeNull();
  });
});
