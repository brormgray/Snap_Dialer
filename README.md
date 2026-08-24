# SnapDialer ⚡ (Physical Lead Sheet to Power Dialer)

**SnapDialer** turns physical paper lead sheets, open house sign-in rosters, or handwritten contact forms into an instant, frictionless **Power Dialer** with automated SMS cadences and **$0 backend hosting cost** (powered by on-device SQLite).

---

## Key Features

1. **Snap & Ingest (AI Multimodal Vision):**
   - Take a photo of any paper lead list.
   - Extracts structured contacts (`Name`, `Phone`, `Company`, `Notes`) with automated phone number sanitation.
   - Includes an **Interactive Data Review Table** allowing you to edit names/numbers or delete rows before saving.
2. **Local SQLite Architecture ($0 Backend Cost):**
   - 100% offline-first storage via `expo-sqlite`.
   - Contact lists, call logs, cadences, and session metrics stay securely in your phone's sandbox.
3. **Power Dialer HUD:**
   - Giant 1-Tap disposition buttons:
     - ⚡ **Bad Number** (disqualifies lead, removes from queue)
     - 🚫 **No Answer / VM** (drops call, advances, checks SMS cadence)
     - 💬 **Quick Text** (pre-fills dynamic SMS template with `{{name}}`)
     - 🤝 **Connected / Qualified** (opens call notes scratchpad)
   - Auto-advance countdown timer with 1-tap Pause / Next.
4. **Cadence & Smart Follow-Up SMS:**
   - Configurable multi-touch rules (e.g., *Attempt #2 $\rightarrow$ Auto-prompt follow-up SMS if unanswered*).
   - Zero-cost native SIM bridge via `tel://` and `sms://`.
5. **Analytics & Export:**
   - Connect rate %, dials breakdown, and 1-tap JSON/CSV export.

---

## How to Run on Your iPhone (via Expo Go)

### Prerequisites
1. Install **Node.js** (v18+) on your computer.
2. Download the free **Expo Go** app on your iPhone from the Apple App Store.

### 1. Install Dependencies
```bash
cd C:\Users\brorm\.gemini\antigravity\scratch\snap-dialer
npm install
```

### 2. Start the Development Server
```bash
npx expo start
```

### 3. Open on Your iPhone
- Open the **Camera app** on your iPhone.
- Scan the **QR code** displayed in your terminal or browser.
- Tap the **Open in Expo Go** prompt.
- The app will build and load instantly on your iPhone!

---

## Project Structure

```
snap-dialer/
├── App.tsx                      # Root app entry & SQLite seed bootstrap
├── app.json                     # Expo configuration & iOS/Android permissions
├── package.json                 # Dependencies & scripts
└── src/
    ├── types/                   # TypeScript data definitions
    ├── db/                      # Local SQLite Layer
    │   ├── database.ts          # Schema creation & WAL indexing
    │   ├── leadsRepository.ts   # Lead lists CRUD & queue manager
    │   ├── callLogsRepository.ts# Call history & analytics aggregation
    │   └── cadenceRepository.ts # Rules engine & SMS templates
    ├── services/
    │   ├── telephonyService.ts  # Native SIM tel: & sms: bridge
    │   ├── visionService.ts     # Multimodal Vision AI lead parser
    │   └── cadenceEngine.ts     # Multi-touch cadence evaluator
    ├── screens/
    │   ├── ListsScreen.tsx      # Lead lists & progress tracking
    │   ├── ScanSheetScreen.tsx  # Document capture & editable table
    │   ├── DialerHudScreen.tsx  # Flagship Power Dialer active HUD
    │   ├── CadenceSettingsScreen.tsx # Multi-touch & SMS template editor
    │   └── AnalyticsScreen.tsx  # Calling analytics & JSON export
    └── navigation/
        └── AppNavigator.tsx     # Stack navigation
```
