# Migration: Activity actor fields + Application notes

## Migration name

`20260319052404_activity_actor_and_notes`

## Schema changes

1. **ApplicationActivity**
   - Added optional `actorType` (String) – e.g. `"SYSTEM"` | `"RECRUITER"`.
   - Added optional `actorId` (String) – e.g. recruiter id when `actorType` is `RECRUITER`.
   - Existing rows keep `actorType` and `actorId` as `NULL` (treated as system in UI).

2. **ApplicationNote** (new table)
   - `id` (cuid), `applicationId`, `recruiterId`, `content`, `createdAt`.
   - Index on `applicationId`.
   - FK to `Application` with `ON DELETE CASCADE`.

## Safe to run

- Additive only: new nullable columns and new table.
- No data backfill required; existing activity rows remain valid.
- Run: `npx prisma migrate deploy` (production) or `npx prisma migrate dev` (development).
