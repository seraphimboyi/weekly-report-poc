import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { type FavoriteProject, favoriteProjects } from "@/db/schema";
import { ConflictError, NotFoundError } from "./api";
import { DEFAULT_USER_ID } from "./config";

const nowIso = () => new Date().toISOString();
const mine = eq(favoriteProjects.userId, DEFAULT_USER_ID);

export function listFavorites(): FavoriteProject[] {
  return db
    .select()
    .from(favoriteProjects)
    .where(mine)
    .orderBy(asc(favoriteProjects.sortOrder), asc(favoriteProjects.id))
    .all();
}

function getFavorite(id: number): FavoriteProject {
  const f = db
    .select()
    .from(favoriteProjects)
    .where(and(eq(favoriteProjects.id, id), mine))
    .get();
  if (!f) throw new NotFoundError("找不到此常用項目");
  return f;
}

function assertNameFree(name: string, exceptId?: number) {
  const dup = db
    .select()
    .from(favoriteProjects)
    .where(and(eq(favoriteProjects.name, name), mine))
    .get();
  if (dup && dup.id !== exceptId) throw new ConflictError("已有相同的常用項目");
}

export function createFavorite(name: string): FavoriteProject {
  assertNameFree(name);
  const last = listFavorites().at(-1);
  return db
    .insert(favoriteProjects)
    .values({
      userId: DEFAULT_USER_ID,
      name,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    })
    .returning()
    .get();
}

export function renameFavorite(id: number, name: string): FavoriteProject {
  getFavorite(id);
  assertNameFree(name, id);
  return db
    .update(favoriteProjects)
    .set({ name, updatedAt: nowIso() })
    .where(eq(favoriteProjects.id, id))
    .returning()
    .get();
}

export function deleteFavorite(id: number): void {
  getFavorite(id);
  db.delete(favoriteProjects).where(eq(favoriteProjects.id, id)).run();
}

/** Swap with the neighbour; no-op at either end. Renumbers to keep order dense. */
export function moveFavorite(
  id: number,
  direction: "up" | "down",
): FavoriteProject[] {
  getFavorite(id);
  const list = listFavorites();
  const i = list.findIndex((f) => f.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j >= 0 && j < list.length) {
    [list[i], list[j]] = [list[j], list[i]];
    db.transaction((tx) => {
      list.forEach((f, idx) => {
        tx.update(favoriteProjects)
          .set({ sortOrder: idx + 1, updatedAt: nowIso() })
          .where(eq(favoriteProjects.id, f.id))
          .run();
      });
    });
  }
  return listFavorites();
}
