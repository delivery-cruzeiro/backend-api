import type { FastifyInstance, RouteHandlerMethod } from "fastify";
import {
  getStoreShippingSummary,
  updateStoreDefaultShipping,
  upsertStoreNeighborhoodShipping,
} from "../controllers/store-shipping.controller.js";
import { requireManager } from "../middleware/auth.middleware.js";
import { deliveryPartitionSchema } from "@delivery-cruzeiro/types";
import {
  DeliveryAreaService,
  DeliveryAreaError,
} from "../services/delivery-area.service.js";
import { StoreShippingService } from "../services/store-shipping.service.js";

const getStoreShippingSummaryHandler =
  getStoreShippingSummary as unknown as RouteHandlerMethod;
const upsertStoreNeighborhoodShippingHandler =
  upsertStoreNeighborhoodShipping as unknown as RouteHandlerMethod;
const updateStoreDefaultShippingHandler =
  updateStoreDefaultShipping as unknown as RouteHandlerMethod;

export async function storeShippingRoutes(fastify: FastifyInstance) {
  const areas = new DeliveryAreaService();
  const shipping = new StoreShippingService();
  fastify.get<{ Querystring: { storeId: string } }>(
    "/admin/store-shipping/map",
    { preHandler: requireManager },
    async (request, reply) => {
      try {
        return await areas.map(request.query.storeId);
      } catch (error) {
        if (error instanceof DeliveryAreaError)
          return reply.status(error.statusCode).send({ error: error.message });
        throw error;
      }
    },
  );
  for (const action of ["preview", "partition"] as const) {
    fastify.post(
      `/admin/store-shipping/${action}`,
      { preHandler: requireManager, bodyLimit: 65536 },
      async (request, reply) => {
        const parsed = deliveryPartitionSchema.safeParse(request.body);
        if (!parsed.success)
          return reply
            .status(400)
            .send({ error: "Cortes ou referência do bairro inválidos." });
        try {
          if (action === "preview")
            return { areas: (await areas.preview(parsed.data)).areas };
          return await areas.save(parsed.data, async () => {
            const preview = await areas.preview(parsed.data);
            const quote = await shipping.resolveShippingQuote({
              storeId: parsed.data.storeId,
              neighborhood: preview.ref.name,
              skipAreas: true,
            });
            return {
              value: quote.value,
              shippingTime: quote.shippingTime,
              isBlocked: !quote.isAvailable,
              ...(quote.ruleId ? { ruleId: quote.ruleId } : {}),
            };
          });
        } catch (error) {
          if (error instanceof DeliveryAreaError)
            return reply
              .status(error.statusCode)
              .send({ error: error.message });
          if (error instanceof Error && !("code" in error))
            return reply.status(400).send({ error: error.message });
          throw error;
        }
      },
    );
  }
  fastify.get(
    "/admin/store-shipping/summary",
    {
      preHandler: requireManager,
    },
    getStoreShippingSummaryHandler,
  );

  fastify.put(
    "/admin/store-shipping/default",
    {
      preHandler: requireManager,
    },
    updateStoreDefaultShippingHandler,
  );

  fastify.put(
    "/admin/store-shipping/neighborhood",
    {
      preHandler: requireManager,
    },
    upsertStoreNeighborhoodShippingHandler,
  );
}
