import type { AnyKysely } from "../migration-types.js";

export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .alterTable("games")
    .addColumn("current_turn_id", "uuid", (col) => col.references("turns.id"))
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.alterTable("games").dropColumn("current_turn_id").execute();
}
