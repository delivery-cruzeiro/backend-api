import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  deliveryGeometryCovers,
  normalizeDeliveryName,
  splitDeliveryGeometry,
  type DeliveryGeometry,
  type DeliveryOperationalMap,
  type DeliveryPartitionInput,
} from "@delivery-cruzeiro/types";
import { prisma } from "../lib/prisma.js";
import { currentDatabaseIdentity } from "../security/database-context.js";

export class DeliveryAreaError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}
export async function assertShippingStore(storeId: string) {
  const identity = currentDatabaseIdentity();
  const store = await prisma.store.findFirst({
    where: {
      id: storeId,
      ...(identity.kind !== "system" && identity.role !== "SUPER_ADMIN"
        ? {
            OR: [
              { ownerId: identity.userId },
              { users: { some: { id: identity.userId } } },
            ],
          }
        : {}),
    },
    include: { address: true },
  });
  if (!store)
    throw new DeliveryAreaError(
      "Loja não encontrada ou acesso não permitido.",
      403,
    );
  return store;
}

export class DeliveryAreaService {
  async metrics(storeId: string, city: string, state: string) {
    const areas = await prisma.deliveryArea.findMany({
      where: { storeId },
      include: {
        revision: {
          include: { partition: { include: { neighborhood: true } } },
        },
        rule: { include: { shipping: true } },
      },
      orderBy: { index: "asc" },
    });
    const active = areas.filter(
      (a) => a.revision.revision === a.revision.partition.activeRevision,
    );
    const addresses = await prisma.address.findMany({
      where: {
        city: { equals: city, mode: "insensitive" },
        state: { equals: state, mode: "insensitive" },
      },
      select: {
        userId: true,
        neighborhood: true,
        latitude: true,
        longitude: true,
        locationConfirmed: true,
      },
    });
    const sales = await prisma.order.groupBy({
      by: ["deliveryAreaId"],
      where: {
        storeId,
        status: { not: "CANCELLED" },
        deliveryAreaId: { not: null },
      },
      _count: true,
    });
    const customers = new Map(active.map((a) => [a.id, new Set<string>()]));
    const unassigned = new Map<string, Set<string>>();
    for (const address of addresses) {
      const parent = active.filter(
        (a) =>
          normalizeDeliveryName(a.revision.partition.neighborhood.name) ===
          normalizeDeliveryName(address.neighborhood),
      );
      if (!parent.length) continue;
      const candidates =
        address.locationConfirmed &&
        address.latitude !== null &&
        address.longitude !== null
          ? parent.filter((a) =>
              deliveryGeometryCovers(a.geometry as DeliveryGeometry, [
                address.longitude!,
                address.latitude!,
              ]),
            )
          : [];
      candidates.sort(
        (a, b) =>
          Number(b.rule?.isBlocked) - Number(a.rule?.isBlocked) ||
          a.index - b.index,
      );
      if (candidates[0]) customers.get(candidates[0].id)!.add(address.userId);
      else {
        const key = normalizeDeliveryName(address.neighborhood);
        if (!unassigned.has(key)) unassigned.set(key, new Set());
        unassigned.get(key)!.add(address.userId);
      }
    }
    return {
      areas: active.map((a) => ({
        area: a,
        customers: customers.get(a.id)!.size,
        sales: sales.find((s) => s.deliveryAreaId === a.id)?._count ?? 0,
      })),
      unassigned,
    };
  }
  async map(storeId: string): Promise<DeliveryOperationalMap> {
    const store = await assertShippingStore(storeId);
    const references = await prisma.neighborhoodReference.findMany({
      where: {
        state: { equals: store.address.state, mode: "insensitive" },
        city: { equals: store.address.city, mode: "insensitive" },
      },
      include: {
        partitions: {
          where: { storeId },
          include: {
            revisions: {
              include: {
                areas: { orderBy: { index: "asc" }, include: { rule: true } },
              },
            },
          },
        },
      },
    });
    return {
      type: "FeatureCollection",
      features: references.flatMap<DeliveryOperationalMap["features"][number]>(
        (ref) => {
          const partition = ref.partitions[0];
          const revision = partition?.revisions.find(
            (r) => r.revision === partition.activeRevision,
          );
          const base = {
            neighborhoodId: ref.id,
            parentName: ref.name,
            sourceHash: ref.sourceHash,
          };
          return revision
            ? revision.areas.map((a) => ({
                type: "Feature" as const,
                geometry: a.geometry as DeliveryGeometry,
                properties: {
                  ...base,
                  id: a.id,
                  areaId: a.id,
                  name: a.name,
                  revision: revision.revision,
                  deliveryStatus: a.rule?.isBlocked ? "blocked" : "",
                },
              }))
            : [
                {
                  type: "Feature" as const,
                  geometry: ref.geometry as DeliveryGeometry,
                  properties: {
                    ...base,
                    id: ref.id,
                    areaId: null,
                    name: ref.name,
                    revision: 0,
                  },
                },
              ];
        },
      ),
    };
  }

  async preview(input: DeliveryPartitionInput) {
    const store = await assertShippingStore(input.storeId);
    const ref = await prisma.neighborhoodReference.findUnique({
      where: { id: input.neighborhoodId },
    });
    if (
      !ref ||
      normalizeDeliveryName(ref.city) !==
        normalizeDeliveryName(store.address.city) ||
      ref.state !== store.address.state.toUpperCase()
    )
      throw new DeliveryAreaError("Bairro não pertence à cidade da loja.");
    if (ref.sourceHash !== input.sourceHash)
      throw new DeliveryAreaError("A malha mudou. Recarregue o mapa.", 409);
    const existing = await prisma.deliveryPartition.findUnique({
      where: {
        storeId_neighborhoodId: {
          storeId: input.storeId,
          neighborhoodId: input.neighborhoodId,
        },
      },
    });
    if (existing)
      throw new DeliveryAreaError(
        "Este bairro já foi dividido. Recarregue o mapa; redesenho ainda não está disponível.",
        409,
      );
    const geometries = splitDeliveryGeometry(
      ref.geometry as DeliveryGeometry,
      input.cuts,
    );
    if (geometries.length < 2)
      throw new DeliveryAreaError("Crie pelo menos duas divisões.");
    return {
      ref,
      areas: geometries.map((geometry, index) => ({
        index: index + 1,
        name: `${ref.name}-${index + 1}`,
        geometry,
      })),
    };
  }

  async save(
    input: DeliveryPartitionInput,
    initialRule: () => Promise<{
      value: number;
      shippingTime: number;
      isBlocked: boolean;
      ruleId?: string;
    }>,
  ) {
    await assertShippingStore(input.storeId);
    const hash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const replay = async () => {
      const old = await prisma.deliveryPartitionRevision.findUnique({
        where: {
          storeId_requestId: {
            storeId: input.storeId,
            requestId: input.requestId,
          },
        },
      });
      if (old && old.requestHash !== hash)
        throw new DeliveryAreaError(
          "Chave de gravação já utilizada com outro desenho.",
          409,
        );
      return old;
    };
    if (await replay()) return this.map(input.storeId);
    try {
      await prisma.$transaction(async (tx) => {
        const preview = await this.preview(input);
        const inherited = await initialRule();
        const partition = await tx.deliveryPartition.create({
          data: {
            storeId: input.storeId,
            neighborhoodId: input.neighborhoodId,
          },
        });
        const revision = await tx.deliveryPartitionRevision.create({
          data: {
            partitionId: partition.id,
            storeId: input.storeId,
            revision: 1,
            sourceHash: input.sourceHash,
            cuts: input.cuts,
            requestId: input.requestId,
            requestHash: hash,
            authorId: currentDatabaseIdentity().userId ?? "system",
          },
        });
        for (const area of preview.areas) {
          const saved = await tx.deliveryArea.create({
            data: {
              ...area,
              geometry: area.geometry as unknown as Prisma.InputJsonValue,
              revisionId: revision.id,
              storeId: input.storeId,
              inheritedFrom: inherited,
            },
          });
          await tx.storeNeighborhoodShipping.create({
            data: {
              areaId: saved.id,
              storeId: input.storeId,
              neighborhood: saved.name,
              mode: "MANUAL",
              isBlocked: inherited.isBlocked,
              value: inherited.value,
              shippingTime: inherited.shippingTime,
            },
          });
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        if (!(await replay()))
          throw new DeliveryAreaError(
            "Outro administrador já dividiu este bairro. Recarregue o mapa.",
            409,
          );
      } else throw error;
    }
    return this.map(input.storeId);
  }

  async resolve(input: {
    storeId: string;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    locationConfirmed?: boolean;
  }) {
    const partitions = await prisma.deliveryPartition.findMany({
      where: { storeId: input.storeId },
      include: {
        neighborhood: true,
        revisions: {
          include: {
            areas: { include: { rule: { include: { shipping: true } } } },
          },
        },
      },
    });
    if (!partitions.length) return null;
    const named = partitions.find(
      (p) =>
        normalizeDeliveryName(p.neighborhood.name) ===
        normalizeDeliveryName(input.neighborhood ?? ""),
    );
    const areas = partitions.flatMap((p) =>
      p.revisions
        .filter((r) => r.revision === p.activeRevision)
        .flatMap((r) =>
          r.areas.map((area) => ({
            ...area,
            parent: p.neighborhood,
            revisionNumber: r.revision,
          })),
        ),
    );
    const validPoint =
      input.locationConfirmed &&
      typeof input.latitude === "number" &&
      typeof input.longitude === "number" &&
      Number.isFinite(input.latitude) &&
      Number.isFinite(input.longitude);
    const candidates = validPoint
      ? areas.filter((a) =>
          deliveryGeometryCovers(a.geometry as DeliveryGeometry, [
            input.longitude!,
            input.latitude!,
          ]),
        )
      : [];
    if (!named && !candidates.length) return null;
    if (
      !validPoint ||
      !candidates.length ||
      candidates.some(
        (a) =>
          normalizeDeliveryName(a.parent.name) !==
            normalizeDeliveryName(input.neighborhood ?? "") ||
          normalizeDeliveryName(a.parent.city) !==
            normalizeDeliveryName(input.city ?? "") ||
          a.parent.state !== input.state?.toUpperCase(),
      )
    ) {
      return { needsLocation: true as const };
    }
    candidates.sort(
      (a, b) =>
        Number(b.rule?.isBlocked) - Number(a.rule?.isBlocked) ||
        a.index - b.index,
    );
    const selected = candidates[0];
    return {
      needsLocation: false as const,
      area: selected,
      boundary: candidates.length > 1,
    };
  }
}
