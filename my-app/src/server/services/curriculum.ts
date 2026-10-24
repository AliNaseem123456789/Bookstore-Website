import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { classes, curriculumItems, electiveGroups, items } from "@/db/schema";
import { badRequest, notFound } from "../http";

export type CourseItem = {
  curriculumId: number;
  itemId: number;
  name: string;
  code: string;
  type: "BOOK" | "COPY" | "STATIONERY";
  publisher: string | null;
  price: number;
  defaultQty: number;
  quantityOnHand: number;
  electiveGroupId: number | null;
  sortOrder: number;
};

export type ElectiveGroupView = {
  id: number;
  groupKey: string;
  label: string;
  minSelect: number;
  maxSelect: number;
  itemIds: number[];
};

export type CourseView = {
  classId: number;
  classCode: string;
  className: string;
  mandatory: CourseItem[];
  electiveGroups: Array<ElectiveGroupView & { items: CourseItem[] }>;
  /** Course price assuming the cheapest valid elective selection. */
  baseTotal: number;
};

export async function listClasses(includeInactive = false) {
  return db
    .select()
    .from(classes)
    .where(includeInactive ? undefined : eq(classes.isActive, true))
    .orderBy(asc(classes.sortOrder));
}

/**
 * The full course for one class: mandatory items plus any choose-one-of
 * elective groups.
 *
 * Grades Nursery to 8 have no electives, so every item is mandatory.
 * Grades 9 and 10 have a science elective (Biology or Computer) — but that
 * is a row in `elective_groups`, not a branch in this code, so adding a
 * second group, or making one "pick 2 of 4", is a data change.
 */
export async function getCourse(classId: number): Promise<CourseView> {
  const [cls] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
  if (!cls) throw notFound("That class does not exist.");

  const rows = await db
    .select({
      curriculumId: curriculumItems.id,
      itemId: items.id,
      name: items.name,
      code: items.code,
      type: items.type,
      publisher: items.publisher,
      price: items.price,
      defaultQty: curriculumItems.defaultQty,
      quantityOnHand: items.quantityOnHand,
      electiveGroupId: curriculumItems.electiveGroupId,
      sortOrder: curriculumItems.sortOrder,
    })
    .from(curriculumItems)
    .innerJoin(items, eq(items.id, curriculumItems.itemId))
    .where(and(eq(curriculumItems.classId, classId), eq(items.isActive, true)))
    .orderBy(asc(curriculumItems.sortOrder), asc(items.name));

  const all: CourseItem[] = rows.map((r) => ({
    ...r,
    price: Number(r.price),
  }));

  const groups = await db
    .select()
    .from(electiveGroups)
    .where(eq(electiveGroups.classId, classId))
    .orderBy(asc(electiveGroups.label));

  const mandatory = all.filter((i) => i.electiveGroupId === null);

  const groupViews = groups.map((g) => {
    const groupItems = all.filter((i) => i.electiveGroupId === g.id);
    return {
      id: g.id,
      groupKey: g.groupKey,
      label: g.label,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      itemIds: groupItems.map((i) => i.itemId),
      items: groupItems,
    };
  });

  // Quote the course at its cheapest valid configuration, so the headline
  // price is never higher than what the buyer can actually pay.
  const electiveFloor = groupViews.reduce((sum, g) => {
    const cheapest = [...g.items]
      .sort((a, b) => a.price * a.defaultQty - b.price * b.defaultQty)
      .slice(0, g.minSelect);
    return sum + cheapest.reduce((s, i) => s + i.price * i.defaultQty, 0);
  }, 0);

  const baseTotal =
    mandatory.reduce((s, i) => s + i.price * i.defaultQty, 0) + electiveFloor;

  return {
    classId: cls.id,
    classCode: cls.code,
    className: cls.name,
    mandatory,
    electiveGroups: groupViews,
    baseTotal: Math.round(baseTotal * 100) / 100,
  };
}

/**
 * Check a proposed basket against the class's elective rules.
 * Returns the problems, so the POS can block checkout with a clear reason
 * rather than silently selling a course with no science book in it.
 */
export async function validateElectiveSelection(
  classId: number,
  selectedItemIds: number[],
): Promise<string[]> {
  const course = await getCourse(classId);
  const selected = new Set(selectedItemIds);
  const problems: string[] = [];

  for (const group of course.electiveGroups) {
    const chosen = group.itemIds.filter((id) => selected.has(id));
    if (chosen.length < group.minSelect) {
      const names = group.items.map((i) => i.name).join(" or ");
      problems.push(
        group.minSelect === 1
          ? `Choose a ${group.label.toLowerCase()}: ${names}.`
          : `Choose at least ${group.minSelect} from ${group.label}.`,
      );
    } else if (chosen.length > group.maxSelect) {
      problems.push(
        group.maxSelect === 1
          ? `Only one ${group.label.toLowerCase()} is included in this course.`
          : `At most ${group.maxSelect} from ${group.label} are included.`,
      );
    }
  }
  return problems;
}

export async function createClass(input: {
  code: string;
  name: string;
  sortOrder: number;
}) {
  const [row] = await db.insert(classes).values(input).returning();
  return row;
}

export async function addCourseItem(input: {
  classId: number;
  itemId: number;
  defaultQty: number;
  electiveGroupId?: number | null;
  sortOrder?: number;
}) {
  if (input.defaultQty < 1) throw badRequest("Default quantity must be at least 1.");
  const [row] = await db
    .insert(curriculumItems)
    .values({
      classId: input.classId,
      itemId: input.itemId,
      defaultQty: input.defaultQty,
      electiveGroupId: input.electiveGroupId ?? null,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return row;
}

export async function updateCourseItem(
  id: number,
  patch: { defaultQty?: number; electiveGroupId?: number | null; sortOrder?: number },
) {
  if (patch.defaultQty !== undefined && patch.defaultQty < 1) {
    throw badRequest("Default quantity must be at least 1.");
  }
  const [row] = await db
    .update(curriculumItems)
    .set(patch)
    .where(eq(curriculumItems.id, id))
    .returning();
  if (!row) throw notFound("That course item does not exist.");
  return row;
}

export async function removeCourseItem(id: number) {
  await db.delete(curriculumItems).where(eq(curriculumItems.id, id));
}

export async function createElectiveGroup(input: {
  classId: number;
  groupKey: string;
  label: string;
  minSelect: number;
  maxSelect: number;
}) {
  if (input.maxSelect < input.minSelect) {
    throw badRequest("Maximum choices cannot be fewer than the minimum.");
  }
  const [row] = await db.insert(electiveGroups).values(input).returning();
  return row;
}

export async function updateElectiveGroup(
  id: number,
  patch: { label?: string; minSelect?: number; maxSelect?: number },
) {
  const [row] = await db
    .update(electiveGroups)
    .set(patch)
    .where(eq(electiveGroups.id, id))
    .returning();
  if (!row) throw notFound("That elective group does not exist.");
  return row;
}

export async function deleteElectiveGroup(id: number) {
  // Items in the group fall back to mandatory (FK is ON DELETE SET NULL).
  await db.delete(electiveGroups).where(eq(electiveGroups.id, id));
}

/** Which classes include a given item — answers "where is this copy used?" */
export async function classesForItem(itemId: number) {
  return db
    .select({
      classId: classes.id,
      code: classes.code,
      name: classes.name,
      defaultQty: curriculumItems.defaultQty,
      curriculumId: curriculumItems.id,
    })
    .from(curriculumItems)
    .innerJoin(classes, eq(classes.id, curriculumItems.classId))
    .where(eq(curriculumItems.itemId, itemId))
    .orderBy(asc(classes.sortOrder));
}

/** Count of courses each item appears in, for the catalogue list. */
export async function courseUsageCounts() {
  const { rows } = await db.execute(sql`
    SELECT item_id, count(*)::int AS class_count
      FROM curriculum_items GROUP BY item_id
  `);
  const map = new Map<number, number>();
  for (const r of rows as unknown as Array<{ item_id: number; class_count: number }>) {
    map.set(r.item_id, r.class_count);
  }
  return map;
}
