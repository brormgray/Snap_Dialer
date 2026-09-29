import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Modal,
  Platform,
  ActivityIndicator,
} from 'react-native';
import {
  ArrowLeft,
  Key,
  User,
  Timer,
  Cloud,
  Download,
  Trash2,
  Upload,
  Copy,
  Check,
  Database,
  X,
  ShieldCheck,
  FileSpreadsheet,
  RefreshCw,
  Server,
  CheckCircle2,
  AlertCircle,
  Lock,
  Sparkles,
  Briefcase,
} from 'lucide-react-native';
import { SettingsRepository } from '../db/settingsRepository';
import { LeadsRepository } from '../db/leadsRepository';
import { BackupService, RestoreResult } from '../services/backupService';
import { CsvService } from '../services/csvService';
import { HapticsService } from '../services/hapticsService';
import { SupabaseSyncService, SUPABASE_SQL_SETUP } from '../services/supabaseSyncService';
import { SecurityService } from '../services/securityService';
import { APP_VERSION, APP_EDITION, APP_BUILD_DATE } from '../constants/version';
import { PwaUpdateService, PwaUpdateInfo } from '../services/pwaUpdateService';
import { Colors } from '../theme/colors';

export default function SettingsScreen({ navigation }: any) {
  const [apiKey, setApiKey] = useState<string>('');
  const [userName, setUserName] = useState<string>('Alex');
  const [agencyName, setAgencyName] = useState<string>('ValuTeachers');
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState<boolean>(true);
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState<string>('3');
  const [leadCount, setLeadCount] = useState<number>(0);
  const [logCount, setLogCount] = useState<number>(0);

  // Dynamic PWA Version & Update State
  const [updateInfo, setUpdateInfo] = useState<PwaUpdateInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null);

  // Supabase Cloud Sync State
  const [supabaseUrl, setSupabaseUrl] = useState<string>('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string>('');
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; message: string } | null>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [isPullingCloud, setIsPullingCloud] = useState<boolean>(false);
  const [isDeltaSyncing, setIsDeltaSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [sqlCopied, setSqlCopied] = useState<boolean>(false);

  // Field Privacy & PIN Lock State
  const [pinEnabled, setPinEnabled] = useState<boolean>(() => SecurityService.isPinEnabled());
  const [showPinSetupModal, setShowPinSetupModal] = useState<boolean>(false);
  const [tempPin, setTempPin] = useState<string>('');

  // Status Banners
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  // Paste JSON Modal
  const [pasteModalVisible, setPasteModalVisible] = useState<boolean>(false);
  const [pastedJson, setPastedJson] = useState<string>('');
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  // CSV Import Modal
  const [csvModalVisible, setCsvModalVisible] = useState<boolean>(false);
  const [pastedCsv, setPastedCsv] = useState<string>('');

  // Storage Quota State
  const [storageQuota, setStorageQuota] = useState<{ usedMb: string; totalGb: string; isPersisted: boolean } | null>(null);
  const [isDeduplicating, setIsDeduplicating] = useState<boolean>(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const s = await SettingsRepository.getSettings();
    setApiKey(s.gemini_api_key || '');
    setUserName(s.user_name || 'Alex');
    setAgencyName(s.agency_name !== undefined ? s.agency_name : 'ValuTeachers');
    setAutoAdvanceEnabled(s.auto_advance_enabled);
    setAutoAdvanceSeconds(String(s.auto_advance_seconds || 3));

    // Load Supabase credentials from local storage
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedUrl = localStorage.getItem('snap_supabase_url') || '';
      const savedKey = localStorage.getItem('snap_supabase_anon_key') || '';
      setSupabaseUrl(savedUrl);
      setSupabaseAnonKey(savedKey);
      setLastSyncTime(SupabaseSyncService.getLastSyncTime());
      if (savedUrl && savedKey) {
        setConnectionStatus({ connected: true, message: '✓ Supabase Cloud credentials active.' });
      }
    }

    try {
      const db = await import('../db/database').then((m) => m.getDatabase());
      const [allLeads, allLogs] = await Promise.all([
        db.getAllAsync('SELECT * FROM leads'),
        db.getAllAsync('SELECT * FROM call_logs'),
      ]);
      setLeadCount(allLeads.length);
      setLogCount(allLogs.length);
    } catch (e) {
      console.warn('Failed to load count stats:', e);
    }

    if (typeof navigator !== 'undefined' && navigator.storage) {
      try {
        const isPersisted = navigator.storage.persisted ? await navigator.storage.persisted() : true;
        if (navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          const usedMb = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
          const totalGb = ((estimate.quota || 0) / (1024 * 1024 * 1024)).toFixed(1);
          setStorageQuota({ usedMb, totalGb, isPersisted });
        }
      } catch (err) {
        console.warn('Storage estimate failed:', err);
      }
    }

    try {
      const info = await PwaUpdateService.checkUpdateStatus();
      setUpdateInfo(info);
    } catch {}
  };

  const handleRequestStoragePersistence = async () => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      await HapticsService.medium();
      const granted = await navigator.storage.persist();
      await loadSettings();
      if (granted) {
        await HapticsService.success();
        showBanner('✓ Storage persistence locked successfully.');
        Alert.alert('Storage Locked', 'Browser storage is now protected from automatic eviction.');
      } else {
        Alert.alert('Notice', 'Storage is managed by browser quota policy or installed PWA mode.');
      }
    }
  };

  const showBanner = (msg: string) => {
    setSavedBanner(msg);
    setTimeout(() => setSavedBanner(null), 3500);
  };

  const handleSaveAll = async () => {
    await HapticsService.success();
    await SettingsRepository.saveSetting('gemini_api_key', apiKey.trim());
    await SettingsRepository.saveSetting('user_name', userName.trim() || 'Alex');
    await SettingsRepository.saveSetting('agency_name', agencyName.trim());
    await SettingsRepository.saveSetting('auto_advance_enabled', autoAdvanceEnabled ? '1' : '0');
    await SettingsRepository.saveSetting(
      'auto_advance_seconds',
      parseInt(autoAdvanceSeconds, 10) || 3
    );
    showBanner('✓ Settings & Caller Profile Saved!');
    Alert.alert('Settings Saved', `Caller name updated to "${userName.trim() || 'Alex'}" and preferences saved.`);
  };

  // 1. Export Backup to iCloud / Google Drive / Files / Share
  const handleExportBackup = async () => {
    await HapticsService.medium();
    const success = await BackupService.exportFullBackup();
    if (success) {
      await HapticsService.success();
      showBanner('✓ Database Backup Exported Successfully!');
    }
  };

  // 2. Copy Backup JSON to Clipboard
  const handleCopyBackupToClipboard = async () => {
    try {
      await HapticsService.tick();
      const payload = await BackupService.generateBackupPayload();
      const jsonStr = JSON.stringify(payload, null, 2);

      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(jsonStr);
        await HapticsService.success();
        showBanner(`✓ Copied full backup JSON (${payload.leadCount} leads) to clipboard!`);
        Alert.alert('Copied to Clipboard', 'You can now paste this backup text into an email, OneDrive doc, or Google Keep.');
      } else {
        Alert.alert('Backup JSON', jsonStr.slice(0, 500) + '...');
      }
    } catch (e: any) {
      Alert.alert('Copy Error', e?.message || 'Could not copy to clipboard.');
    }
  };

  // 3. Import Backup from File (iCloud / Google Drive / Files / Local)
  const handleImportFromFile = async () => {
    await HapticsService.tick();

    const doImport = async (overwrite: boolean) => {
      setIsRestoring(true);
      try {
        const res: RestoreResult = await BackupService.importBackupFromFile(overwrite);
        setIsRestoring(false);
        if (res.success) {
          await HapticsService.success();
          showBanner(`✓ ${res.message}`);
          Alert.alert('Restore Complete', res.message);
        } else if (res.message !== 'No file selected.') {
          Alert.alert('Import Failed', res.message);
        }
      } catch (err: any) {
        setIsRestoring(false);
        Alert.alert('Import Error', err?.message || 'Failed to import backup file.');
      }
    };

    if (Platform.OS === 'web') {
      const choice = typeof window !== 'undefined' && window.confirm(
        'Click OK to MERGE imported leads with existing database, or Cancel to replace your entire database.'
      );
      await doImport(!choice);
      return;
    }

    Alert.alert(
      'Import Backup File',
      'Choose how you want to restore this backup:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Merge with Existing', onPress: () => doImport(false) },
        { text: 'Clean Replace (Overwrite)', style: 'destructive', onPress: () => doImport(true) },
      ]
    );
  };

  // 4. Import Backup from Pasted Text
  const handleRestorePastedJson = async (overwrite: boolean) => {
    if (!pastedJson.trim()) {
      Alert.alert('Empty Input', 'Please paste valid backup JSON text.');
      return;
    }

    setIsRestoring(true);
    try {
      const res = await BackupService.restoreBackupFromJson(pastedJson.trim(), overwrite);
      setIsRestoring(false);
      if (res.success) {
        setPastedJson('');
        setPasteModalVisible(false);
        await loadSettings();
        await HapticsService.success();
        showBanner(`✓ ${res.message}`);
        Alert.alert('Restore Complete', res.message);
      } else {
        Alert.alert('Invalid Backup Data', res.message);
      }
    } catch (err: any) {
      setIsRestoring(false);
      Alert.alert('Parse Error', err?.message || 'Could not parse pasted backup text.');
    }
  };

  // 5. CSV Pipeline Export & Roster Import
  const handleExportPipelineCsv = async () => {
    await HapticsService.medium();
    const leads = await LeadsRepository.getAllLeads();
    const success = await CsvService.downloadCsv(leads, 'SnapDialer_Full_Pipeline');
    if (success) {
      await HapticsService.success();
      showBanner('✓ Pipeline CSV exported successfully.');
    }
  };

  // 6. Smart Pipeline Deduplication
  const handleDeduplicatePipeline = async () => {
    await HapticsService.medium();

    const doDeduplicate = async () => {
      setIsDeduplicating(true);
      try {
        const result = await LeadsRepository.deduplicateLeads();
        await loadSettings();
        await HapticsService.success();

        if (result.duplicatesRemoved === 0) {
          Alert.alert(
            'Pipeline Clean',
            `Your pipeline is completely clean with ${result.uniqueEducators} unique educators and 0 duplicates detected.`
          );
        } else {
          Alert.alert(
            'Pipeline Deduplicated',
            `✓ Successfully merged ${result.totalBefore} records into ${result.uniqueEducators} unique educators.\n\n${result.duplicatesRemoved} duplicate cards removed.\n\nAll call logs, appointment outcomes, notes, and profile details have been safely preserved.`
          );
        }
      } catch (err: any) {
        console.error('Deduplication failed:', err);
        Alert.alert('Deduplication Error', err?.message || 'Failed to deduplicate pipeline.');
      } finally {
        setIsDeduplicating(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined' &&
        window.confirm(
          'Run Smart Pipeline Deduplication?\n\nThis will safely consolidate all duplicate cards sharing the same educator phone number or name, while preserving 100% of your notes, appointments, and call logs.'
        );
      if (confirmed) await doDeduplicate();
      return;
    }

    Alert.alert(
      'Smart Pipeline Deduplication',
      'Consolidate duplicate educator cards? All call logs, appointments, notes, and profile details from duplicate records will be merged into the primary educator profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Deduplicate Now', onPress: doDeduplicate },
      ]
    );
  };

  const handleImportRosterCsv = async () => {
    if (!pastedCsv || pastedCsv.trim().length === 0) {
      Alert.alert('Empty CSV', 'Please paste CSV text containing your school roster.');
      return;
    }
    try {
      const parsed = CsvService.parseCsvToLeads(pastedCsv);
      if (parsed.length === 0) {
        Alert.alert('Import Notice', 'No valid educator rows found. Ensure columns include Name and Phone.');
        return;
      }
      const count = await LeadsRepository.importLeadsBatch(parsed, 'master_queue');
      setCsvModalVisible(false);
      setPastedCsv('');
      await HapticsService.success();
      showBanner(`✓ Successfully imported ${count} educators into master queue.`);
      loadSettings();
      Alert.alert('Import Success', `Added ${count} educator records from CSV to your dialing queue.`);
    } catch (e: any) {
      Alert.alert('Import Failed', e?.message || 'Could not parse CSV.');
    }
  };

  // Supabase Cloud Actions
  const handleTestSupabaseConnection = async () => {
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
      Alert.alert('Missing Credentials', 'Please enter both your Supabase Project URL and Anon API Key.');
      return;
    }
    setIsTestingConnection(true);
    await HapticsService.medium();
    const res = await SupabaseSyncService.testConnection(supabaseUrl, supabaseAnonKey);
    setIsTestingConnection(false);
    setConnectionStatus({ connected: res.success, message: res.message });
    if (res.success) {
      await HapticsService.success();
      showBanner('✓ Connected to Supabase Cloud.');
      Alert.alert('Connection Successful', 'SnapDialer is now connected to your private Supabase cloud backend.');
    } else {
      Alert.alert('Connection Notice', res.message);
    }
  };

  const handlePushToSupabase = async () => {
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
      Alert.alert('Configure Supabase', 'Please connect your Supabase credentials first.');
      return;
    }
    setIsSyncingCloud(true);
    await HapticsService.medium();
    const res = await SupabaseSyncService.pushLocalToCloud();
    setIsSyncingCloud(false);
    if (res.success) {
      await HapticsService.success();
      setLastSyncTime(new Date().toISOString());
      showBanner(`✓ Synced ${res.syncedLeads} educators to Supabase Cloud.`);
      Alert.alert('Cloud Sync Complete', `Successfully uploaded ${res.syncedLeads} educators, ${res.syncedLists} campaign lists, and ${res.syncedLogs} call records to your secure Supabase database.`);
    } else {
      Alert.alert('Sync Failed', res.error || 'Could not sync data to Supabase.');
    }
  };

  const handlePullFromSupabase = async () => {
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
      Alert.alert('Configure Supabase', 'Please connect your Supabase credentials first.');
      return;
    }
    setIsPullingCloud(true);
    await HapticsService.medium();
    const res = await SupabaseSyncService.pullCloudToLocal();
    setIsPullingCloud(false);
    if (res.success) {
      await HapticsService.success();
      setLastSyncTime(new Date().toISOString());
      await loadSettings();
      showBanner(`✓ Restored ${res.restoredLeads} educators from Supabase Cloud.`);
      Alert.alert('Disaster Recovery Complete', `Successfully restored ${res.restoredLeads} educators, ${res.restoredLists} campaign lists, and ${res.restoredLogs} call records from your Supabase cloud database onto this device.`);
    } else {
      Alert.alert('Download Failed', res.error || 'Could not download data from Supabase.');
    }
  };

  const handleCopySqlScript = async () => {
    await HapticsService.tick();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(SUPABASE_SQL_SETUP);
        setSqlCopied(true);
        setTimeout(() => setSqlCopied(false), 4000);
        showBanner('✓ SQL setup script copied to clipboard.');
        Alert.alert('Copied to Clipboard', 'The SQL setup script has been copied. Go to Supabase SQL Editor, paste, and click RUN.');
      } catch {
        Alert.alert('Notice', 'Please copy the script manually.');
      }
    }
  };

  const handleTwoWayDeltaSync = async () => {
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
      Alert.alert('Configure Supabase', 'Please connect your Supabase credentials first.');
      return;
    }
    setIsDeltaSyncing(true);
    await HapticsService.medium();
    const res = await SupabaseSyncService.syncTwoWayDelta();
    setIsDeltaSyncing(false);
    if (res.success) {
      await HapticsService.success();
      setLastSyncTime(new Date().toISOString());
      await loadSettings();
      const msg = `Local Device: +${res.localCreated} new, ✎${res.localUpdated} updated.\nSupabase Cloud: +${res.cloudCreated} new, ✎${res.cloudUpdated} updated.`;
      showBanner('✓ Two-way delta sync complete!');
      Alert.alert('Two-Way Smart Sync Complete', `All changes reconciled with Last-Write-Wins:\n\n${msg}`);
    } else {
      Alert.alert('Delta Sync Failed', res.error || 'Could not perform delta sync.');
    }
  };

  const handleTogglePin = (value: boolean) => {
    if (value) {
      setTempPin('');
      setShowPinSetupModal(true);
    } else {
      SecurityService.disablePin();
      setPinEnabled(false);
      showBanner('✓ Field PIN protection disabled.');
    }
  };

  const handleSavePin = () => {
    if (tempPin.length !== 4 || !/^\d{4}$/.test(tempPin)) {
      Alert.alert('Invalid PIN', 'Please enter a 4-digit numeric PIN.');
      return;
    }
    SecurityService.setPin(tempPin);
    setPinEnabled(true);
    setShowPinSetupModal(false);
    showBanner('✓ 4-Digit PIN protection enabled!');
    Alert.alert('Field Privacy Active', 'Your client pipeline is now locked. The app will prompt for PIN on launch or after 5 minutes of inactivity.');
  };

  // 6. Wipe All Leads
  const handleClearAllData = async () => {
    const doClear = async () => {
      await HapticsService.heavy();
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('snap_dialer_valuteachers_data');
      }
      const db = await import('../db/database').then((m) => m.getDatabase());
      await db.runAsync('DELETE FROM leads');
      await db.runAsync('DELETE FROM lists');
      await db.runAsync('DELETE FROM call_logs');
      showBanner('✓ All contacts and history wiped.');
      Alert.alert('Data Cleared', 'All test contacts, lists, and logs have been wiped.');
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && window.confirm('Are you sure you want to permanently clear all leads and history?');
      if (confirmed) {
        await doClear();
      }
      return;
    }

    Alert.alert(
      'Clear All Pipeline Data',
      'This will permanently delete all leads, notes, and call records from your device.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear Everything', style: 'destructive', onPress: doClear },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.brandPrimary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Lists'))}
        >
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Global Settings</Text>
        <TouchableOpacity onPress={handleSaveAll}>
          <Text style={styles.saveLink}>Save</Text>
        </TouchableOpacity>
      </View>

      {savedBanner && (
        <View style={styles.notificationBanner}>
          <Text style={styles.notificationBannerText}>{savedBanner}</Text>
        </View>
      )}

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 50 }}>
        {/* Gemini Vision API Key */}
        <Text style={styles.sectionHeader}>VISION AI PARSER CONFIGURATION</Text>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Key size={18} color="#3B82F6" />
            <Text style={styles.cardTitle}>Google Gemini API Key</Text>
          </View>
          <Text style={styles.cardDesc}>
            Used to extract contacts from photos of paper lead sheets with 99%+ accuracy (free tier from Google AI Studio).
          </Text>
          <TextInput
            style={styles.input}
            placeholder="AIzaSy..."
            placeholderTextColor="#64748B"
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry
          />
        </View>

        {/* User Profile for SMS Tokens */}
        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>CALLER PROFILE (SMS TEMPLATES)</Text>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <User size={18} color="#10B981" />
            <Text style={styles.cardTitle}>Your Name / Signature</Text>
          </View>
          <Text style={styles.cardDesc}>
            Automatically replaces <Text style={styles.tokenTag}>{'{{my_name}}'}</Text> in follow-up SMS templates.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Alex"
            placeholderTextColor="#64748B"
            value={userName}
            onChangeText={setUserName}
          />

          <View style={[styles.cardHeaderRow, { marginTop: 14 }]}>
            <Briefcase size={18} color="#3B82F6" />
            <Text style={styles.cardTitle}>Agency / Company / RIA Name</Text>
          </View>
          <Text style={styles.cardDesc}>
            Specifies your organization (e.g. ValuTeachers) and replaces <Text style={styles.tokenTag}>{'{{company}}'}</Text> in drip messages. Leave blank if independent or unaffiliated.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. ValuTeachers"
            placeholderTextColor="#64748B"
            value={agencyName}
            onChangeText={setAgencyName}
          />

          <TouchableOpacity
            style={[styles.actionButtonSecondary, { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}
            onPress={() => {
              HapticsService.tick();
              navigation.navigate('CadenceSettings');
            }}
          >
            <Sparkles size={16} color={Colors.brandAccent} />
            <Text style={[styles.actionButtonText, { color: Colors.brandAccent, fontWeight: '700' }]}>
              Configure Cadence Steps & SMS Templates
            </Text>
          </TouchableOpacity>
        </View>

        {/* Power Dialer Pacing Controls */}
        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>POWER DIALER PACING CONTROLS</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Auto-Advance Countdown</Text>
              <Text style={styles.cardDesc}>
                Automatically queue next lead after call outcome is logged
              </Text>
            </View>
            <Switch
              value={autoAdvanceEnabled}
              onValueChange={(val) => {
                HapticsService.tick();
                setAutoAdvanceEnabled(val);
              }}
              trackColor={{ false: '#334155', true: '#2563EB' }}
            />
          </View>

          {autoAdvanceEnabled && (
            <View style={[styles.inputRow, { marginTop: 12 }]}>
              <Timer size={18} color="#94A3B8" />
              <Text style={styles.inlineLabel}>Countdown Buffer (seconds):</Text>
              <TextInput
                style={[styles.input, { width: 60, textAlign: 'center' }]}
                value={autoAdvanceSeconds}
                onChangeText={setAutoAdvanceSeconds}
                keyboardType="numeric"
              />
            </View>
          )}
        </View>

        {/* Storage Engine & Diagnostics */}
        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>STORAGE ENGINE & DATA INTEGRITY</Text>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <ShieldCheck size={18} color="#34D399" />
            <Text style={styles.cardTitle}>Dexie.js Multi-Table Storage Health</Text>
          </View>
          <Text style={styles.cardDesc}>
            {Platform.OS === 'web'
              ? 'Multi-Gigabyte Dexie.js IndexedDB engine with compound B-Tree indexes, isolated photo binary storage, and browser eviction protection.'
              : 'Native on-device SQLite database with WAL journal mode.'}
          </Text>

          {storageQuota && (
            <View style={{ marginTop: 10, padding: 10, backgroundColor: Colors.bgDark, borderRadius: 8, borderWidth: 1, borderColor: Colors.borderSubtle }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: Colors.textPrimary, fontSize: 12, fontWeight: '700' }}>
                  💾 Disk Usage: {storageQuota.usedMb} MB / {storageQuota.totalGb} GB
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <ShieldCheck size={13} color={storageQuota.isPersisted ? '#34D399' : '#F59E0B'} />
                  <Text style={{ color: storageQuota.isPersisted ? '#34D399' : '#F59E0B', fontSize: 11, fontWeight: '700' }}>
                    {storageQuota.isPersisted ? 'Persistence Locked' : 'Managed Quota'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1, backgroundColor: Colors.bgDark, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.borderSubtle }}>
              <Text style={{ color: Colors.heavenlyGold, fontSize: 20, fontWeight: '800' }}>{leadCount}</Text>
              <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 2 }}>Saved Educators</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: Colors.bgDark, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.borderSubtle }}>
              <Text style={{ color: Colors.deepSkyBlueLight, fontSize: 20, fontWeight: '800' }}>{logCount}</Text>
              <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 2 }}>Call Records Logged</Text>
            </View>
          </View>

          {/* Deduplication Action */}
          <TouchableOpacity
            style={[styles.actionButtonSecondary, { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}
            onPress={handleDeduplicatePipeline}
            disabled={isDeduplicating}
          >
            {isDeduplicating ? (
              <ActivityIndicator size="small" color={Colors.brandAccent} />
            ) : (
              <RefreshCw size={16} color={Colors.brandAccent} />
            )}
            <Text style={[styles.actionButtonText, { color: Colors.brandAccent, fontWeight: '700' }]}>
              {isDeduplicating ? 'Deduplicating Pipeline...' : 'Smart Deduplicate Pipeline (Consolidate Records)'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Supabase Cloud Sync & Auto-Backup */}
        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>SUPABASE CLOUD SYNC & DISASTER RECOVERY</Text>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Server size={18} color={Colors.heavenlyGold} />
            <Text style={styles.cardTitle}>Private Cloud Database (Supabase)</Text>
          </View>
          <Text style={styles.cardDesc}>
            Connect your private Supabase PostgreSQL database. Your device remains the lightning-fast primary database (0ms offline speed), while updates automatically sync to the cloud for indestructible disaster recovery.
          </Text>

          {/* Safe Isolation Notice */}
          <View style={styles.isolationNoticeBox}>
            <ShieldCheck size={16} color="#34D399" />
            <Text style={styles.isolationNoticeText}>
              <Text style={{ fontWeight: '800', color: '#34D399' }}>100% Safe Isolation: </Text>
              SnapDialer strictly uses dedicated tables prefixed with <Text style={{ color: Colors.heavenlyGold, fontWeight: '700' }}>snap_</Text> (e.g. <Text style={{ fontStyle: 'italic' }}>snap_leads, snap_lists</Text>). It will never touch, modify, or read any other app data in your Supabase project.
            </Text>
          </View>

          {/* Credentials Inputs */}
          <Text style={[styles.inputLabel, { marginTop: 14 }]}>Supabase Project URL</Text>
          <TextInput
            style={styles.input}
            placeholder="https://yourprojectid.supabase.co"
            placeholderTextColor="#64748B"
            value={supabaseUrl}
            onChangeText={setSupabaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.inputLabel, { marginTop: 10 }]}>Supabase Anon / Public API Key</Text>
          <TextInput
            style={styles.input}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            placeholderTextColor="#64748B"
            value={supabaseAnonKey}
            onChangeText={setSupabaseAnonKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          {/* Connection Status Badge */}
          {connectionStatus && (
            <View style={[styles.cloudStatusBanner, connectionStatus.connected ? styles.cloudStatusSuccess : styles.cloudStatusError]}>
              {connectionStatus.connected ? <CheckCircle2 size={16} color="#34D399" /> : <AlertCircle size={16} color="#EF4444" />}
              <Text style={[styles.cloudStatusText, { color: connectionStatus.connected ? '#D1FAE5' : '#FEE2E2' }]}>
                {connectionStatus.message}
              </Text>
            </View>
          )}

          {lastSyncTime && (
            <Text style={styles.lastSyncText}>
              ☁️ Last Cloud Sync: {new Date(lastSyncTime).toLocaleTimeString()} ({new Date(lastSyncTime).toLocaleDateString()})
            </Text>
          )}

          {/* Action Buttons */}
          <View style={[styles.buttonGroup, { marginTop: 14 }]}>
            <TouchableOpacity
              style={[styles.actionButtonGold, isTestingConnection && { opacity: 0.7 }]}
              onPress={handleTestSupabaseConnection}
              disabled={isTestingConnection}
            >
              {isTestingConnection ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Check size={17} color="#FFFFFF" />}
              <Text style={[styles.actionButtonText, { color: '#FFFFFF', fontWeight: '800' }]}>
                {isTestingConnection ? 'Testing Connection...' : 'Test & Save Connection'}
              </Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.actionButtonPrimary, { flex: 1 }, isSyncingCloud && { opacity: 0.7 }]}
                onPress={handlePushToSupabase}
                disabled={isSyncingCloud}
              >
                {isSyncingCloud ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Cloud size={16} color="#FFFFFF" />}
                <Text style={styles.actionButtonText}>
                  {isSyncingCloud ? 'Syncing...' : 'Sync to Cloud'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButtonSecondary, { flex: 1 }, isPullingCloud && { opacity: 0.7 }]}
                onPress={handlePullFromSupabase}
                disabled={isPullingCloud}
              >
                {isPullingCloud ? <ActivityIndicator size="small" color="#38BDF8" /> : <Download size={16} color="#38BDF8" />}
                <Text style={[styles.actionButtonText, { color: '#38BDF8' }]}>
                  {isPullingCloud ? 'Downloading...' : 'Restore from Cloud'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Two-Way Smart Delta Sync Button */}
            <TouchableOpacity
              style={[
                styles.actionButtonPrimary,
                { backgroundColor: '#0369A1', borderColor: '#38BDF8', borderWidth: 1, marginTop: 8 },
                isDeltaSyncing && { opacity: 0.7 },
              ]}
              onPress={handleTwoWayDeltaSync}
              disabled={isDeltaSyncing}
            >
              {isDeltaSyncing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <RefreshCw size={16} color="#FFFFFF" />
              )}
              <Text style={styles.actionButtonText}>
                {isDeltaSyncing ? 'Synchronizing Two-Way...' : '🔄 Two-Way Smart Delta Sync (LWW)'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButtonDark, { marginTop: 8 }]}
              onPress={handleCopySqlScript}
            >
              {sqlCopied ? <Check size={16} color="#34D399" /> : <Copy size={16} color={Colors.heavenlyGold} />}
              <Text style={[styles.actionButtonText, { color: sqlCopied ? '#34D399' : Colors.heavenlyGold }]}>
                {sqlCopied ? '✓ SQL Setup Copied!' : '📋 Copy Supabase SQL Setup Script'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Field Privacy & Security Lock */}
        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>FIELD PRIVACY & PIN SECURITY</Text>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <ShieldCheck size={18} color={Colors.heavenlyGold} />
            <Text style={styles.cardTitle}>Campus Field Security Shield</Text>
          </View>
          <Text style={styles.cardDesc}>
            Lock the app with a 4-digit PIN when leaving your device unattended on school desks. Protects educator salary, pension years, and phone numbers from unauthorized eyes.
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.livingWhite }}>
                {pinEnabled ? 'PIN Lock Active' : 'PIN Lock Disabled'}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                {pinEnabled ? 'Requires PIN on launch & after 5m idle' : 'Anyone can open app directly'}
              </Text>
            </View>
            <Switch
              value={pinEnabled}
              onValueChange={handleTogglePin}
              trackColor={{ false: Colors.borderStrong, true: Colors.callActive }}
              thumbColor={pinEnabled ? '#FFFFFF' : Colors.textMuted}
            />
          </View>

          {pinEnabled && (
            <TouchableOpacity
              style={[styles.actionButtonSecondary, { marginTop: 12 }]}
              onPress={() => {
                setTempPin('');
                setShowPinSetupModal(true);
              }}
            >
              <Lock size={15} color={Colors.heavenlyGold} />
              <Text style={[styles.actionButtonText, { color: Colors.heavenlyGold }]}>
                Change 4-Digit PIN
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Cloud & Drive Backup & Recovery */}
        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>DATABASE BACKUP & RECOVERY (FILES)</Text>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Cloud size={18} color="#38BDF8" />
            <Text style={styles.cardTitle}>Export & Share Backup</Text>
          </View>
          <Text style={styles.cardDesc}>
            Save your entire database, notes, and call records to **iCloud Drive, Google Drive, OneDrive, Files**, or email it directly.
          </Text>

          <View style={styles.buttonGroup}>
            <TouchableOpacity style={styles.actionButtonPrimary} onPress={handleExportBackup}>
              <Download size={17} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Export Backup File (.json)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButtonSecondary} onPress={handleCopyBackupToClipboard}>
              <Copy size={17} color="#38BDF8" />
              <Text style={[styles.actionButtonText, { color: '#38BDF8' }]}>Copy Backup JSON to Clipboard</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Import / Recovery Section */}
          <View style={styles.cardHeaderRow}>
            <Database size={18} color="#34D399" />
            <Text style={styles.cardTitle}>Import / Recover Database</Text>
          </View>
          <Text style={styles.cardDesc}>
            Restore your contacts and call logs from a previously saved backup file on iCloud, Google Drive, or your device.
          </Text>

          <View style={styles.buttonGroup}>
            <TouchableOpacity style={styles.actionButtonGreen} onPress={handleImportFromFile}>
              <Upload size={17} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Import from File / Drive (.json)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButtonSecondary}
              onPress={() => setPasteModalVisible(true)}
            >
              <Key size={17} color="#A78BFA" />
              <Text style={[styles.actionButtonText, { color: '#A78BFA' }]}>Paste Backup JSON Text</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* CSV Pipeline & Excel Sync */}
        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>CSV PIPELINE & EXCEL ROSTER SYNC</Text>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <FileSpreadsheet size={18} color={Colors.heavenlyGold} />
            <Text style={styles.cardTitle}>Excel & CRM Pipeline Sync</Text>
          </View>
          <Text style={styles.cardDesc}>
            Export your entire lead database with dispositions and notes formatted for Microsoft Excel / Google Sheets, or bulk-import school staff directories.
          </Text>

          <View style={styles.buttonGroup}>
            <TouchableOpacity style={styles.actionButtonPrimary} onPress={handleExportPipelineCsv}>
              <Download size={17} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Export Pipeline (Excel / CSV)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButtonGreen}
              onPress={() => setCsvModalVisible(true)}
            >
              <Upload size={17} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Import School Roster (CSV)</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* PWA Version & Dynamic Cache Controller */}
        <View style={styles.versionFooter}>
          <View style={styles.versionHeaderRow}>
            <Text style={styles.versionText}>SnapDialer v{APP_VERSION} • {APP_EDITION} ({APP_BUILD_DATE})</Text>
            {updateInfo?.hasUpdate && (
              <View style={styles.updateBadge}>
                <Text style={styles.updateBadgeText}>⚡ v{updateInfo.serverVersion} Available</Text>
              </View>
            )}
          </View>

          {updateInfo?.activeCacheName && (
            <Text style={styles.cacheSubtitleText}>
              PWA Cache: {updateInfo.activeCacheName}
            </Text>
          )}

          {updateStatusMsg && (
            <Text style={[styles.cacheStatusText, { color: updateInfo?.hasUpdate ? Colors.heavenlyGold : '#10B981' }]}>
              {updateStatusMsg}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.forceReloadBtn, isCheckingUpdate && { opacity: 0.7 }]}
            disabled={isCheckingUpdate}
            onPress={async () => {
              await HapticsService.medium();
              setIsCheckingUpdate(true);
              setUpdateStatusMsg('Checking server for updates & clearing cache...');
              try {
                await PwaUpdateService.forceUpdateAndReload();
              } catch (e: any) {
                setUpdateStatusMsg('Update check completed. Reloading...');
                setTimeout(() => {
                  if (typeof window !== 'undefined') window.location.reload();
                }, 400);
              }
            }}
          >
            <Text style={styles.forceReloadText}>
              {isCheckingUpdate ? '⏳ Checking & Updating PWA...' : '🔄 Force Check & Reload Latest PWA Update'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Data Management & Persistence */}
        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>DATA MANAGEMENT & STORAGE PROTECTION</Text>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Database size={18} color={Colors.heavenlyGold} />
            <Text style={styles.cardTitle}>Local Storage Health</Text>
          </View>
          <Text style={styles.cardDesc}>
            {storageQuota
              ? `Used: ${storageQuota.usedMb} MB / Total Quota: ${storageQuota.totalGb} GB • Status: ${
                  storageQuota.isPersisted ? '✓ Protected (Persistent)' : 'Standard (Browser Managed)'
                }`
              : 'Multi-Gigabyte IndexedDB database safeguarding educator records, appointments, and call logs.'}
          </Text>

          <TouchableOpacity
            style={[
              styles.actionButtonSecondary,
              { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
            ]}
            onPress={handleRequestStoragePersistence}
          >
            <ShieldCheck size={16} color={storageQuota?.isPersisted ? '#34D399' : Colors.brandAccent} />
            <Text style={[styles.actionButtonText, { color: storageQuota?.isPersisted ? '#34D399' : Colors.brandAccent, fontWeight: '700' }]}>
              {storageQuota?.isPersisted ? 'Storage Persistence Active' : 'Request Permanent Storage Lock'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.wipeButton, { marginTop: 14 }]} onPress={handleClearAllData}>
          <Trash2 size={18} color="#EF4444" />
          <Text style={styles.wipeButtonText}>Wipe All Leads & Start Fresh</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Import CSV Modal */}
      <Modal
        visible={csvModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCsvModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setCsvModalVisible(false)}
          />
          <SafeAreaView style={styles.modalContainer} pointerEvents="auto">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Import School Roster CSV</Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                onPress={() => setCsvModalVisible(false)}
              >
                <X size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Paste CSV text from Excel or your district roster. SnapDialer automatically maps Name, Phone, School, Room, and Planning Period:
            </Text>

            <TextInput
              style={styles.pasteJsonInput}
              placeholder="Name, Phone, School, Room, Planning&#10;Jane Smith, 3865551234, VOL, 204, Period 3..."
              placeholderTextColor="#64748B"
              multiline
              value={pastedCsv}
              onChangeText={setPastedCsv}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.overwriteBtn}
                onPress={() => setCsvModalVisible(false)}
              >
                <Text style={[styles.btnTextWhite, { color: Colors.statusDangerText }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.mergeBtn}
                onPress={handleImportRosterCsv}
              >
                <Text style={styles.btnTextWhite}>Import to Queue</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Paste JSON Modal */}
      <Modal
        visible={pasteModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPasteModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setPasteModalVisible(false)}
          />
          <SafeAreaView style={styles.modalContainer} pointerEvents="auto">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Paste Backup JSON</Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                onPress={() => setPasteModalVisible(false)}
              >
                <X size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Paste the full JSON text copied from an email, Google Doc, or saved file to restore your leads:
            </Text>

            <TextInput
              style={styles.pasteJsonInput}
              placeholder='{"version": "2.0.0", "data": { ... }}'
              placeholderTextColor="#64748B"
              value={pastedJson}
              onChangeText={setPastedJson}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.mergeBtn}
                onPress={() => handleRestorePastedJson(false)}
              >
                <Text style={styles.btnTextWhite}>Merge with Existing</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.overwriteBtn}
                onPress={() => handleRestorePastedJson(true)}
              >
                <Text style={styles.btnTextWhite}>Clean Overwrite</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Set PIN Modal */}
      <Modal
        visible={showPinSetupModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPinSetupModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowPinSetupModal(false)}
          />
          <SafeAreaView style={styles.modalContainer} pointerEvents="auto">
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Lock size={20} color={Colors.heavenlyGold} />
                <Text style={styles.modalTitle}>Set 4-Digit Field PIN</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                onPress={() => setShowPinSetupModal(false)}
              >
                <X size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDesc}>
              Enter a 4-digit numeric passcode to lock educator records when away from your phone on campus.
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  fontSize: 24,
                  textAlign: 'center',
                  letterSpacing: 8,
                  marginVertical: 12,
                  backgroundColor: Colors.surfaceSubtle,
                  borderColor: Colors.borderStrong,
                },
              ]}
              value={tempPin}
              onChangeText={(t) => setTempPin(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              secureTextEntry
              maxLength={4}
              autoFocus
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.actionButtonSecondary, { flex: 1 }]}
                onPress={() => setShowPinSetupModal(false)}
              >
                <Text style={[styles.actionButtonText, { color: Colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButtonPrimary, { flex: 1, backgroundColor: Colors.brandPrimary }]}
                onPress={handleSavePin}
              >
                <Text style={[styles.actionButtonText, { color: '#FFFFFF' }]}>Save & Enable</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgApp,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.brandPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.brandPrimary,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  saveLink: {
    color: Colors.focusRing,
    fontWeight: '800',
    fontSize: 15,
  },
  notificationBanner: {
    backgroundColor: Colors.badgeSuccessBg,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  notificationBannerText: {
    color: Colors.badgeSuccessText,
    fontWeight: '700',
    fontSize: 13,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionHeader: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  cardDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 10,
  },
  tokenTag: {
    color: Colors.brandAccent,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.surfaceSubtle,
    color: Colors.textPrimary,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    fontSize: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inlineLabel: {
    color: Colors.textSecondary,
    fontSize: 14,
    flex: 1,
  },
  buttonGroup: {
    gap: 8,
    marginTop: 4,
  },
  actionButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandPrimary,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  actionButtonGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.callActive,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  actionButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSubtle,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 8,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginVertical: 16,
  },
  wipeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.badgeDangerBg,
    borderWidth: 1,
    borderColor: Colors.badgeDangerText,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  wipeButtonText: {
    color: Colors.badgeDangerText,
    fontSize: 15,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.bgModal,
    justifyContent: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  modalDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  pasteJsonInput: {
    backgroundColor: Colors.surfaceSubtle,
    color: Colors.textPrimary,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    height: 160,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlignVertical: 'top',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  mergeBtn: {
    flex: 1,
    backgroundColor: Colors.brandPrimary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  overwriteBtn: {
    flex: 1,
    backgroundColor: Colors.badgeDangerBg,
    borderWidth: 1,
    borderColor: Colors.badgeDangerText,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnTextWhite: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  versionFooter: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
  },
  versionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  versionText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brandPrimary,
  },
  cacheSubtitleText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  cacheStatusText: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  updateBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  updateBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#000000',
  },
  forceReloadBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  forceReloadText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brandPrimary,
  },
  isolationNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  isolationNoticeText: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  cloudStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
  },
  cloudStatusSuccess: {
    backgroundColor: Colors.badgeSuccessBg,
    borderColor: Colors.badgeSuccessText,
  },
  cloudStatusError: {
    backgroundColor: Colors.badgeDangerBg,
    borderColor: Colors.badgeDangerText,
  },
  cloudStatusText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  lastSyncText: {
    fontSize: 11,
    color: Colors.brandAccent,
    marginTop: 8,
    fontStyle: 'italic',
  },
  actionButtonGold: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandPrimary,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  actionButtonDark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
});
