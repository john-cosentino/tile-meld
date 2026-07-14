import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, PushSubscriptionsTable } from "../types.js";

export type PushSubscriptionRow = Selectable<PushSubscriptionsTable>;

export async function upsertPushSubscription(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<PushSubscriptionRow> {
  return db
    .insertInto("push_subscriptions")
    .values({ player_id: playerId, endpoint, p256dh, auth })
    .onConflict((oc) => oc.column("endpoint").doUpdateSet({ p256dh, auth, failure_count: 0 }))
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listPushSubscriptionsForPlayer(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
): Promise<PushSubscriptionRow[]> {
  return db
    .selectFrom("push_subscriptions")
    .selectAll()
    .where("player_id", "=", playerId)
    .execute();
}

/** Delete on 410 Gone, per docs/opus-implementation-plan.md §8.4. */
export async function removePushSubscription(
  db: Kysely<Database> | Transaction<Database>,
  endpoint: string,
): Promise<void> {
  await db.deleteFrom("push_subscriptions").where("endpoint", "=", endpoint).execute();
}

export async function recordPushFailure(
  db: Kysely<Database> | Transaction<Database>,
  endpoint: string,
): Promise<void> {
  await db
    .updateTable("push_subscriptions")
    .set((eb) => ({ failure_count: eb("failure_count", "+", 1) }))
    .where("endpoint", "=", endpoint)
    .execute();
}

export async function recordPushSuccess(
  db: Kysely<Database> | Transaction<Database>,
  endpoint: string,
): Promise<void> {
  await db
    .updateTable("push_subscriptions")
    .set({ last_success_at: new Date(), failure_count: 0 })
    .where("endpoint", "=", endpoint)
    .execute();
}
