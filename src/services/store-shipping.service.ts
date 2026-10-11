import { AddressGeocodingService } from './address-geocoding.service.js';
import {
  DeliveryAreaService,
  assertShippingStore,
} from "./delivery-area.service.js";
import {
  ShippingChargeMode,
  type UpdateDefaultShippingDTO,
  type UpsertNeighborhoodShippingDTO,
} from "@delivery-cruzeiro/types";
import { prisma } from "../lib/prisma.js";

type ShippingSummaryQuery = {
  city?: string | null;
  state?: string | null;
  storeId: string;
};

type ShippingQuoteInput = {
  addressId?: string;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationConfirmed?: boolean;
  skipAreas?: boolean;
  neighborhood?: string | null;
  storeId: string;
};

type ShippingQuote = {
  needsLocation?: boolean;
  message?: string;
  areaId?: string;
  areaSnapshot?: {
    name: string;
    revision: number;
    shippingTime: number;
    value: number;
    boundary: boolean;
  };
  isAvailable: boolean;
  mode: ShippingChargeMode;
  neighborhood: string | null;
  ruleId?: string;
  shippingId?: string;
  shippingName?: string;
  shippingTime: number;
  source: "blocked" | "default" | "manual" | "template";
  value: number;
};

type NeighborhoodMetricRow = {
  neighborhood: string | null;
  total: bigint | number | string;
};

function normalizeNeighborhoodKey(neighborhood: string) {
  return neighborhood
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function serializeShipping(shipping: {
  createdAt: Date;
  id: string;
  isActive: boolean;
  name: string;
  shippingTime: number;
  storeId: string;
  value: unknown;
}) {
  return {
    createdAt: shipping.createdAt.toISOString(),
    id: shipping.id,
    isActive: shipping.isActive,
    name: shipping.name,
    shippingTime: shipping.shippingTime,
    storeId: shipping.storeId,
    value: toNumber(shipping.value),
  };
}

function serializeNeighborhoodRule(rule: {
  createdAt: Date;
  id: string;
  isBlocked: boolean;
  mode: string;
  neighborhood: string;
  shipping?: Parameters<typeof serializeShipping>[0] | null;
  shippingId: string | null;
  shippingTime: number | null;
  storeId: string;
  updatedAt: Date;
  value: unknown | null;
}) {
  return {
    areaId: (rule as { areaId?: string | null }).areaId ?? null,
    createdAt: rule.createdAt.toISOString(),
    id: rule.id,
    isBlocked: rule.isBlocked,
    mode: rule.mode as ShippingChargeMode,
    neighborhood: rule.neighborhood,
    shipping: rule.shipping ? serializeShipping(rule.shipping) : null,
    shippingId: rule.shippingId,
    shippingTime: rule.shippingTime,
    storeId: rule.storeId,
    updatedAt: rule.updatedAt.toISOString(),
    value: rule.value === null ? null : toNumber(rule.value),
  };
}

export class StoreShippingService {
  private async ensureDefaultShipping(storeId: string) {
    return prisma.storeShipping.upsert({
      create: {
        name: "default",
        shippingTime: 0,
        storeId,
        value: 0,
      },
      update: {},
      where: {
        storeId_name: {
          name: "default",
          storeId,
        },
      },
    });
  }

  private async getStoreLocation(storeId: string) {
    return prisma.store.findUnique({
      select: {
        address: {
          select: {
            city: true,
            state: true,
          },
        },
        id: true,
      },
      where: { id: storeId },
    });
  }

  private mergeMetrics(
    customerRows: NeighborhoodMetricRow[],
    salesRows: NeighborhoodMetricRow[],
    rules: Array<ReturnType<typeof serializeNeighborhoodRule>>,
  ) {
    const neighborhoods = new Map<
      string,
      {
        customers: number;
        neighborhood: string;
        rule: ReturnType<typeof serializeNeighborhoodRule> | null;
        sales: number;
      }
    >();

    const ensureMetric = (neighborhood: string) => {
      const key = normalizeNeighborhoodKey(neighborhood);
      const current = neighborhoods.get(key);

      if (current) {
        return current;
      }

      const metric = {
        customers: 0,
        neighborhood,
        rule: null,
        sales: 0,
      };

      neighborhoods.set(key, metric);

      return metric;
    };

    customerRows.forEach((row) => {
      if (!row.neighborhood?.trim()) {
        return;
      }

      ensureMetric(row.neighborhood).customers = toNumber(row.total);
    });

    salesRows.forEach((row) => {
      if (!row.neighborhood?.trim()) {
        return;
      }

      ensureMetric(row.neighborhood).sales = toNumber(row.total);
    });

    rules.forEach((rule) => {
      ensureMetric(rule.neighborhood).rule = rule;
    });

    return Array.from(neighborhoods.values()).sort((first, second) =>
      first.neighborhood.localeCompare(second.neighborhood, "pt-BR"),
    );
  }

  async getSummary(query: ShippingSummaryQuery) {
    await assertShippingStore(query.storeId);
    const store = await this.getStoreLocation(query.storeId);

    if (!store) {
      return null;
    }

    const city = query.city?.trim() || store.address.city;
    const state = query.state?.trim() || store.address.state;
    const defaultShipping = await this.ensureDefaultShipping(query.storeId);
    const [templates, neighborhoodRules, customerRows, salesRows] =
      await Promise.all([
        prisma.storeShipping.findMany({
          orderBy: [{ name: "asc" }],
          where: {
            isActive: true,
            storeId: query.storeId,
          },
        }),
        prisma.storeNeighborhoodShipping.findMany({
          include: {
            shipping: true,
          },
          where: {
            storeId: query.storeId,
          },
        }),
        prisma.address
          .findMany({
            where: {
              city: { equals: city, mode: "insensitive" },
              state: { equals: state, mode: "insensitive" },
            },
            select: { neighborhood: true, userId: true },
          })
          .then((rows) => {
            const groups = new Map<string, Set<string>>();
            for (const row of rows) {
              const key = row.neighborhood.trim();
              if (!groups.has(key)) groups.set(key, new Set());
              groups.get(key)!.add(row.userId);
            }
            return [...groups].map(([neighborhood, users]) => ({
              neighborhood,
              total: users.size,
            }));
          }),
        prisma.order
          .findMany({
            where: {
              deliveryAreaId: null,
              storeId: query.storeId,
              status: { not: "CANCELLED" },
              address: {
                city: { equals: city, mode: "insensitive" },
                state: { equals: state, mode: "insensitive" },
              },
            },
            select: { address: { select: { neighborhood: true } } },
          })
          .then((rows) => {
            const groups = new Map<string, number>();
            for (const row of rows) {
              const key = row.address?.neighborhood.trim() || "";
              groups.set(key, (groups.get(key) || 0) + 1);
            }
            return [...groups].map(([neighborhood, total]) => ({
              neighborhood,
              total,
            }));
          }),
      ]);
    const rules = neighborhoodRules
      .filter((rule) => !rule.areaId)
      .map((rule) => serializeNeighborhoodRule(rule));
    const neighborhoods = this.mergeMetrics(customerRows, salesRows, rules);
    const spatialMetrics = await new DeliveryAreaService().metrics(
      query.storeId,
      city,
      state,
    );
    const dividedNames = new Set(
      spatialMetrics.areas.map((m) =>
        normalizeNeighborhoodKey(m.area.revision.partition.neighborhood.name),
      ),
    );
    for (const metric of neighborhoods)
      if (dividedNames.has(normalizeNeighborhoodKey(metric.neighborhood)))
        metric.customers =
          spatialMetrics.unassigned.get(
            normalizeNeighborhoodKey(metric.neighborhood),
          )?.size ?? 0;
    neighborhoods.push(
      ...spatialMetrics.areas.map((m) => ({
        neighborhood: m.area.name,
        customers: m.customers,
        sales: m.sales,
        rule: m.area.rule ? serializeNeighborhoodRule(m.area.rule) : null,
      })),
    );

    return {
      defaultShipping: serializeShipping(defaultShipping),
      neighborhoods,
      templates: templates.map((template) => serializeShipping(template)),
      totalNeighborhoods: neighborhoods.length,
    };
  }

  async updateDefaultShipping(input: UpdateDefaultShippingDTO) {
    await assertShippingStore(input.storeId);
    const store = await this.getStoreLocation(input.storeId);

    if (!store) {
      return null;
    }

    const defaultShipping = await prisma.storeShipping.upsert({
      create: {
        name: "default",
        shippingTime: input.shippingTime,
        storeId: input.storeId,
        value: input.value,
      },
      update: {
        isActive: true,
        shippingTime: input.shippingTime,
        value: input.value,
      },
      where: {
        storeId_name: {
          name: "default",
          storeId: input.storeId,
        },
      },
    });

    return serializeShipping(defaultShipping);
  }

  async resolveShippingQuote(
    input: ShippingQuoteInput,
  ): Promise<ShippingQuote> {
    const defaultShipping = await this.ensureDefaultShipping(input.storeId);
    const defaultQuote: ShippingQuote = {
      isAvailable: true,
      mode: ShippingChargeMode.DEFAULT,
      neighborhood: input.neighborhood?.trim() || null,
      shippingTime: defaultShipping.shippingTime,
      source: "default",
      value: toNumber(defaultShipping.value),
    };

    if (!input.neighborhood?.trim()) {
      return defaultQuote;
    }

    const rules = await prisma.storeNeighborhoodShipping.findMany({
      include: {
        shipping: true,
      },
      where: {
        storeId: input.storeId,
      },
    });
    const spatial = input.skipAreas
      ? null
      : await new DeliveryAreaService().resolve(input.addressId ? { ...input, ...await new AddressGeocodingService().ensureLocation(input.addressId) } : input);
    if (spatial?.needsLocation)
      return {
        ...defaultQuote,
        value: 0,
        isAvailable: false,
        needsLocation: true,
        message:
          "Não foi possível localizar o número deste endereço automaticamente. Confira o CEP, a rua e o número ou tente novamente em alguns minutos.",
      };
    if (spatial && !spatial.needsLocation && spatial.area.rule) {
      const r = spatial.area.rule;
      const value =
        r.mode === "MANUAL"
          ? toNumber(r.value)
          : r.mode === "TEMPLATE" && r.shipping?.isActive
            ? toNumber(r.shipping.value)
            : defaultQuote.value;
      const shippingTime =
        r.mode === "MANUAL"
          ? (r.shippingTime ?? 0)
          : r.mode === "TEMPLATE" && r.shipping?.isActive
            ? r.shipping.shippingTime
            : defaultQuote.shippingTime;
      return {
        ...defaultQuote,
        isAvailable: !r.isBlocked,
        neighborhood: spatial.area.name,
        mode: r.mode as ShippingChargeMode,
        source: r.isBlocked
          ? "blocked"
          : r.mode === "MANUAL"
            ? "manual"
            : r.mode === "TEMPLATE"
              ? "template"
              : "default",
        value,
        shippingTime,
        ruleId: r.id,
        areaId: spatial.area.id,
        areaSnapshot: {
          name: spatial.area.name,
          revision: spatial.area.revisionNumber,
          shippingTime,
          value,
          boundary: spatial.boundary,
        },
      };
    }
    const normalizedNeighborhood = normalizeNeighborhoodKey(input.neighborhood);
    const rule = rules.find(
      (currentRule) =>
        !currentRule.areaId &&
        normalizeNeighborhoodKey(currentRule.neighborhood) ===
          normalizedNeighborhood,
    );

    if (!rule) {
      return defaultQuote;
    }

    if (rule.isBlocked) {
      return {
        isAvailable: false,
        mode: rule.mode as ShippingChargeMode,
        neighborhood: rule.neighborhood,
        ruleId: rule.id,
        shippingTime: rule.mode === ShippingChargeMode.MANUAL
          ? rule.shippingTime ?? defaultShipping.shippingTime
          : rule.shipping?.shippingTime ?? defaultShipping.shippingTime,
        source: "blocked",
        value: rule.mode === ShippingChargeMode.MANUAL
          ? toNumber(rule.value ?? defaultShipping.value)
          : toNumber(rule.shipping?.value ?? defaultShipping.value),
      };
    }

    if (rule.mode === ShippingChargeMode.MANUAL) {
      return {
        isAvailable: true,
        mode: ShippingChargeMode.MANUAL,
        neighborhood: rule.neighborhood,
        ruleId: rule.id,
        shippingTime: rule.shippingTime ?? defaultShipping.shippingTime,
        source: "manual",
        value:
          rule.value === null
            ? toNumber(defaultShipping.value)
            : toNumber(rule.value),
      };
    }

    if (rule.mode === ShippingChargeMode.TEMPLATE && rule.shipping?.isActive) {
      return {
        isAvailable: true,
        mode: ShippingChargeMode.TEMPLATE,
        neighborhood: rule.neighborhood,
        ruleId: rule.id,
        shippingId: rule.shipping.id,
        shippingName: rule.shipping.name,
        shippingTime: rule.shipping.shippingTime,
        source: "template",
        value: toNumber(rule.shipping.value),
      };
    }

    return {
      ...defaultQuote,
      neighborhood: rule.neighborhood,
      ruleId: rule.id,
    };
  }

  async upsertNeighborhoodShipping(input: UpsertNeighborhoodShippingDTO) {
    await assertShippingStore(input.storeId);
    if (input.areaId) {
      const area = await prisma.deliveryArea.findFirst({
        where: { id: input.areaId, storeId: input.storeId },
        include: { revision: { include: { partition: true } } },
      });
      if (
        !area ||
        area.revision.revision !== area.revision.partition.activeRevision
      )
        throw new Error("Área inválida para esta loja.");
      input = { ...input, neighborhood: area.name };
    }
    const store = await this.getStoreLocation(input.storeId);

    if (!store) {
      return null;
    }

    const defaultShipping = await this.ensureDefaultShipping(input.storeId);
    let shippingId: string | null = null;
    let value: number | null = null;
    let shippingTime: number | null = null;

    if (input.mode === ShippingChargeMode.DEFAULT) {
      shippingId = defaultShipping.id;
    }

    if (input.mode === ShippingChargeMode.TEMPLATE) {
      const template = await prisma.storeShipping.findFirst({
        where: {
          id: input.shippingId ?? "",
          isActive: true,
          storeId: input.storeId,
        },
      });

      if (!template) {
        throw new Error("Template de frete nao encontrado para esta loja");
      }

      shippingId = template.id;
    }

    if (input.mode === ShippingChargeMode.MANUAL) {
      value = input.value ?? 0;
      shippingTime = input.shippingTime ?? 0;

      if (input.createTemplate) {
        const templateName =
          input.templateName?.trim() || input.neighborhood.trim();
        const duplicate = await prisma.storeShipping.findUnique({
          where: {
            storeId_name: { storeId: input.storeId, name: templateName },
          },
        });
        if (duplicate)
          throw new Error(
            "Já existe um template com esse nome. Escolha outro nome ou selecione o template existente.",
          );
        const template = await prisma.storeShipping.create({
          data: {
            name: templateName,
            shippingTime,
            storeId: input.storeId,
            value,
          },
        });
        shippingId = template.id;
      }
    }

    const rule = await prisma.$transaction(async (tx) => {
      const existing = await tx.storeNeighborhoodShipping.findFirst({
        where: {
          storeId: input.storeId,
          ...(input.areaId
            ? { areaId: input.areaId }
            : { areaId: null, neighborhood: input.neighborhood.trim() }),
        },
      });
      const data = {
        isBlocked: input.isBlocked,
        mode: input.mode,
        neighborhood: input.neighborhood.trim(),
        shippingId,
        shippingTime,
        storeId: input.storeId,
        value,
        areaId: input.areaId ?? null,
      };
      return existing
        ? tx.storeNeighborhoodShipping.update({
            where: { id: existing.id },
            data,
            include: { shipping: true },
          })
        : tx.storeNeighborhoodShipping.create({
            data,
            include: { shipping: true },
          });
    });
    const templates = await prisma.storeShipping.findMany({
      orderBy: [{ name: "asc" }],
      where: {
        isActive: true,
        storeId: input.storeId,
      },
    });

    return {
      rule: serializeNeighborhoodRule(rule),
      templates: templates.map((template) => serializeShipping(template)),
    };
  }
}

