# Implementation Plan: Best-in-Class Dexie.js Storage Engine & Zero-Loss Migration

## 1. Overview
Upgrade SnapDialer's persistence layer to an enterprise-grade, best-in-class IndexedDB architecture powered by **Dexie.js**. This replaces the monolithic state snapshot model with normalized multi-table stores, compound B-tree indexing, decoupled high-resolution card photo storage, and relaxed durability batching—while ensuring **100% automated zero-loss migration** of all existing educator leads, FRS notes, call logs, and DNC statuses.

---

## 2. User Review Required

> [!IMPORTANT]
> **Zero Data Loss Guarantee**: All 13+ existing educator leads, call logs, handwritten card notes, and appointments will be automatically migrated to the new normalized tables on first launch. The original legacy snapshot in `app_state` will remain untouched as an immutable backup.

---

## 3. Architecture & Proposed Changes

### Database Layer

#### [NEW] [`src/db/dexieDb.ts`](file:///C:/Users/brorm/.gemini/antigravity/scratch/snap-dialer/src/db/dexieDb.ts)
- Define `SnapDialerDexieDB` with normalized stores:
  - `leads`: `'id, list_id, school, priority_tier, last_disposition, follow_up_at, created_at, [school+last_disposition], [list_id+priority_tier+last_disposition]'`
  - `lists`: `'id, created_at'`
  - `call_logs`: `'id, lead_id, list_id, timestamp, disposition'`
  - `lead_photos`: `'lead_id'` (isolated photo storage)
  - `settings`: `'key'`
  - `sms_templates`: `'id'`
  - `cadence_rules`: `'id, step_number'`
- Implement `autoMigrateLegacyData()` to detect, extract, and populate existing `root_state` data seamlessly on initialization.
- Implement helper methods for bulk ingestion with `{ durability: 'relaxed' }`.

#### [MODIFY] [`src/db/database.ts`](file:///C:/Users/brorm/.gemini/antigravity/scratch/snap-dialer/src/db/database.ts)
- Connect `getDatabase()` to `SnapDialerDexieDB` maintaining full interface compatibility with `getAllAsync`, `getFirstAsync`, `runAsync`, and `withTransactionAsync`.
- Enable direct index acceleration for common queries (`getDialingQueueForSchool`, `getMasterDialingQueue`, `getUpcomingFollowUps`).

#### [MODIFY] [`src/db/leadsRepository.ts`](file:///C:/Users/brorm/.gemini/antigravity/scratch/snap-dialer/src/db/leadsRepository.ts)
- Connect photo fetching to the decoupled `lead_photos` table on demand while keeping lead list memory footprints ultra-lightweight.

---

### UI & Observability Layer

#### [MODIFY] [`src/screens/SettingsScreen.tsx`](file:///C:/Users/brorm/.gemini/antigravity/scratch/snap-dialer/src/screens/SettingsScreen.tsx)
- Add **Real-Time Storage Diagnostics & Quota Meter**:
  - Live Disk Usage: `navigator.storage.estimate()` displaying current MB used vs total GB available.
  - Persistence Protection: `navigator.storage.persisted()` displaying `🛡️ Storage Locked & Protected from Eviction`.
  - Manual "Lock Storage Persistence" trigger button for devices where browser prompt was missed.

---

## 4. Verification Plan

### Automated Build & TypeScript Checks
- Run `npm install dexie` and verify clean package integration.
- Run `node node_modules/expo/bin/cli export -p web` to guarantee zero compile or TypeScript errors.

### Manual Verification
1. Open the app in browser/phone and verify existing leads, call notes, and dispositions load instantly.
2. Add a new lead / scan card to confirm write operations to Dexie.js stores.
3. Test DNC flagging and 1-tap Reinstate to ensure real-time UI updates.
4. Check Settings screen to confirm live disk quota and persistence status.
5. Deploy live to `https://valuteachers-dialer.surge.sh`.
