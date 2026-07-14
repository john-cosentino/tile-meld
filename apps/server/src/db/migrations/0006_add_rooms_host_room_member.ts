import type { AnyKysely } from "../migration-types.js";

// Nullable: a room is created before its host's room_members row exists
// (the host member is created in the same transaction, referencing the
// now-existing room), so the room briefly has no host between those two
// inserts. Application code always sets this immediately afterward.
export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .alterTable("rooms")
    .addColumn("host_room_member_id", "uuid", (col) => col.references("room_members.id"))
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.alterTable("rooms").dropColumn("host_room_member_id").execute();
}
