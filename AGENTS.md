# SnapDialer Developer & Agent Guidelines

## Mandatory Version Control Workflow (Automated Git & GitHub Sync)

Whenever any part of the codebase is updated, fixed, enhanced, refactored, or adjusted:
1. **Compile & Test Verification**:
   - Run `npx tsc --noEmit` to verify type integrity.
   - Run `node --test tests/*.test.mjs` to ensure all tests pass.
2. **Build & Live Deployment**:
   - Run `node scripts/version-sync.js sync` (or `patch` if releasing a new patch iteration) to synchronize `package.json`, `app.json`, `src/constants/version.ts`, and `web/sw.js`.
   - Run `npx expo export -p web` to generate the production web bundle.
   - Run `node deploy-surge.js` to deploy to live hosting.
3. **MANDATORY: Automatic Commit & Push to Git / GitHub**:
   - Automatically stage the changes (`git add`).
   - Commit with a clear, conventional commit message (`git commit -m "..."`).
   - Automatically push to the remote GitHub repository (both `main` and default `master` branches):
     ```bash
     git push origin main master
     ```
   - Never leave completed work uncommitted or unpushed to GitHub.

## Local Data Preservation Rule
- Never drop, delete, or reset existing local educator leads, call logs, or campaign tables in IndexedDB or Dexie.
