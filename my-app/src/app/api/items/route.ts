import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, requirePermission, route } from "@/server/http";
import { createItem, findSimilarItems, listItems } from "@/server/services/catalogue";
import { courseUsageCounts } from "@/server/services/curriculum";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  await requirePermission(req, "stock.view");
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");

  const [rows, usage] = await Promise.all([
    listItems({
      search: sp.get("search") ?? undefined,
      type: type === "BOOK" || type === "COPY" || type === "STATIONERY" ? type : undefined,
      includeInactive: sp.get("includeInactive") === "true",
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    }),
    courseUsageCounts(),
  ]);

  return ok({
    items: rows.map((i) => ({ ...i, classCount: usage.get(i.id) ?? 0 })),
  });
});

const CreateBody = z.object({
  name: z.string().min(1, "An item needs a name."),
  publisher: z.string().nullable().optional(),
  type: z.enum(["BOOK", "COPY", "STATIONERY"]),
  price: z.number().min(0),
  reorderLevel: z.number().int().min(0).optional(),
  openingQty: z.number().int().min(0).optional(),
  /** Set true to create anyway after seeing the near-duplicate warning. */
  confirmDuplicate: z.boolean().optional(),
});

export const POST = route(async (req: NextRequest) => {
  const session = await requirePermission(req, "item.create");
  const body = await parseBody(req, CreateBody);

  // Stop the same book being entered twice under a slightly different name.
  if (!body.confirmDuplicate) {
    const similar = await findSimilarItems(body.name);
    if (similar.length) {
      return ok(
        {
          error:
            "An item with a very similar name already exists. Add to its stock instead, or confirm to create a separate item.",
          similar,
          needsConfirmation: true,
        },
        409,
      );
    }
  }

  const item = await createItem({ ...body, actorId: session.userId });
  return ok({ item }, 201);
});
