import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Image,
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Camera,
  PhoneCall,
  Trash2,
  ChevronRight,
  Settings,
  RotateCcw,
  Search,
  Calendar,
  Clock,
  MessageSquare,
  Eye,
  X,
  FileCheck,
  Building,
  GraduationCap,
  Sparkles,
  BarChart3,
  Flame,
  Archive,
  Layers,
  Download,
  MapPin,
  Award,
  SlidersHorizontal,
  ClipboardList,
  Landmark,
  Briefcase,
} from 'lucide-react-native';
import { LeadsRepository } from '../db/leadsRepository';
import { CallLogsRepository } from '../db/callLogsRepository';
import { SettingsRepository } from '../db/settingsRepository';
import { HapticsService } from '../services/hapticsService';
import { TelephonyService } from '../services/telephonyService';
import { CsvService } from '../services/csvService';
import { Lead, LeadList, CallLog } from '../types';
import { Colors } from '../theme/colors';
import ZoomableImageModal from '../components/ZoomableImageModal';
import { TodayCockpitCard } from '../components/TodayCockpitCard';
import { BatchDripDispatchModal } from '../components/BatchDripDispatchModal';
import { FilterBottomSheet } from '../components/FilterBottomSheet';
import { QuickDispositionModal } from '../components/QuickDispositionModal';
import { CallbacksDueModal } from '../components/CallbacksDueModal';
import { DripDispatcherService } from '../services/dripDispatcherService';
import { PipelineStateService } from '../services/pipelineStateService';

export default function ListsScreen({ navigation }: any) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [availableLists, setAvailableLists] = useState<LeadList[]>([]);
  const [availableSchools, setAvailableSchools] = useState<{ school: string; count: number }[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('all');
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'fresh' | 'legacy'>('all');
  const [frsFilter, setFrsFilter] = useState<'all' | 'frs' | 'non_frs'>('all');
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'appts' | 'dispo_needed' | 'connected' | 'callback' | 'unanswered' | 'clients'>('all');
  const [apptsScope, setApptsScope] = useState<'this_week' | 'all'>('this_week');
  const [callbackScope, setCallbackScope] = useState<'this_week' | 'all'>('this_week');
  const [unansweredScope, setUnansweredScope] = useState<'this_week' | 'all'>('this_week');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [advisorName, setAdvisorName] = useState<string>('Alex');
  const [loading, setLoading] = useState<boolean>(true);

  // Original Card Image Proof Modal
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [isDeduplicating, setIsDeduplicating] = useState<boolean>(false);
  const [dripModalVisible, setDripModalVisible] = useState<boolean>(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState<boolean>(false);
  const [callsDueModalVisible, setCallsDueModalVisible] = useState<boolean>(false);

  // Universal Live Call & Quick Disposition Modal
  const [quickDispoLead, setQuickDispoLead] = useState<Lead | null>(null);
  const [isCallActive, setIsCallActive] = useState<boolean>(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [isQuickDispoVisible, setIsQuickDispoVisible] = useState<boolean>(false);
  const flatListRef = useRef<FlatList<Lead>>(null);

  // Calculate duplicates count across the current pipeline
  const duplicateCount = React.useMemo(() => {
    if (leads.length <= 1) return 0;
    const phoneKeys = new Set<string>();
    let dupes = 0;
    for (const l of leads) {
      const pKey = (l.phone || '').replace(/\D/g, '').replace(/^1/, '');
      const key = pKey.length >= 7 ? `p_${pKey}` : `n_${l.name.toLowerCase().trim()}_${(l.school || 'VOL').toLowerCase().trim()}`;
      if (phoneKeys.has(key)) {
        dupes++;
      } else {
        phoneKeys.add(key);
      }
    }
    return dupes;
  }, [leads]);

  const handleDeduplicateDirectly = async () => {
    await HapticsService.medium();

    const doDeduplicate = async () => {
      setIsDeduplicating(true);
      try {
        const result = await LeadsRepository.deduplicateLeads();
        await loadLeads();
        await HapticsService.success();
        Alert.alert(
          'Pipeline Cleaned',
          `✓ Merged ${result.totalBefore} records into ${result.uniqueEducators} unique educators.\n\n${result.duplicatesRemoved} duplicate cards removed.\n\nAll notes, appointments, and call logs were preserved.`
        );
      } catch (e: any) {
        Alert.alert('Deduplication Error', e?.message || 'Could not clean duplicate records.');
      } finally {
        setIsDeduplicating(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined' &&
        window.confirm(
          `Merge ${duplicateCount} duplicate cards into master educator records?\n\nAll notes, call logs, and appointment outcomes will be preserved.`
        );
      if (confirmed) await doDeduplicate();
      return;
    }

    Alert.alert(
      'Clean Duplicate Leads',
      `Merge ${duplicateCount} duplicate cards into primary educator records? All call logs, notes, and appointments will be consolidated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clean Pipeline', onPress: doDeduplicate },
      ]
    );
  };

  const loadLeads = async () => {
    try {
      // Auto-recycle previous weeks' unanswered leads back to pending on weekly rollover (Sunday reset)
      try {
        await LeadsRepository.autoRecyclePreviousWeeksUnanswered();
      } catch (err) {
        console.warn('Weekly auto-recycle check skipped:', err);
      }

      const [all, lists, schools, logs, appSettings] = await Promise.all([
        LeadsRepository.getAllLeads(),
        LeadsRepository.getAllLists(),
        LeadsRepository.getAllSchools(),
        CallLogsRepository.getAllCallLogs(),
        SettingsRepository.getSettings(),
      ]);
      setLeads(all);
      setAvailableLists(lists);
      setAvailableSchools(schools);
      setCallLogs(logs);
      if (appSettings?.user_name) {
        setAdvisorName(appSettings.user_name);
      }

      // Automatically assess & backfill any existing prospects/clients needing cadence schedules
      DripDispatcherService.assessAndBackfillLeads(all).then((res) => {
        if (res.updatedCount > 0) {
          LeadsRepository.getAllLeads().then((refreshed) => setLeads(refreshed));
        }
      }).catch((err) => console.warn('Drip backfill note:', err));
    } catch (e) {
      console.error('Failed to load leads:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadLeads();
    }, [])
  );

  // Helper to check if a lead has ever been called at least once
  const hasEverBeenCalled = useCallback(
    (l: Lead) => {
      if (!l) return false;
      if (l.attempts_count && l.attempts_count > 0) return true;
      if (l.last_attempt_at) return true;
      if (l.last_disposition && l.last_disposition !== 'pending') return true;
      if (l.id && callLogs && callLogs.length > 0) {
        const leadIdStr = String(l.id).trim();
        if (leadIdStr && leadIdStr !== 'undefined' && leadIdStr !== 'null') {
          return callLogs.some((log) => {
            if (!log || !log.lead_id) return false;
            const logLeadId = String(log.lead_id).trim();
            return logLeadId && logLeadId !== 'undefined' && logLeadId !== 'null' && logLeadId === leadIdStr;
          });
        }
      }
      return false;
    },
    [callLogs]
  );

  // Scope leads based on Campaign & School & Priority & FRS filters (before Tab filter)
  const scopedLeads = useMemo(() => {
    return leads.filter((l) => {
      if (!l) return false;
      if (selectedListId !== 'all' && l.list_id !== selectedListId) return false;
      if (
        selectedSchool !== 'all' &&
        String(l.school || 'VOL').toLowerCase().trim() !== selectedSchool.toLowerCase().trim()
      ) {
        return false;
      }
      if (priorityFilter === 'fresh' && (l.priority_tier || 1) !== 1) return false;
      if (priorityFilter === 'legacy' && l.priority_tier !== 3) return false;
      if (frsFilter === 'frs' && l.is_frs === false) return false;
      if (frsFilter === 'non_frs' && l.is_frs !== false) return false;
      return true;
    });
  }, [leads, selectedListId, selectedSchool, priorityFilter, frsFilter]);

  const callbacksDueToday = useMemo(() => {
    return PipelineStateService.getScheduledCallbacksDueToday(scopedLeads);
  }, [scopedLeads]);

  // Synchronously compute filteredLeads from scopedLeads, active tab, and search query
  const filteredLeads = useMemo(() => {
    let result = scopedLeads;

    // 1. Filter by Tab
    const now = new Date();
    if (filterTab === 'pending') {
      result = result.filter((l) => !l.last_disposition || l.last_disposition === 'pending');
    } else if (filterTab === 'appts') {
      result = result.filter((l) => {
        if (!PipelineStateService.isActiveAppointment(l)) return false;
        if (apptsScope === 'this_week') {
          return PipelineStateService.isAppointmentThisWeek(l, now);
        }
        return true;
      });
    } else if (filterTab === 'dispo_needed') {
      result = result.filter((l) => PipelineStateService.isDispoNeeded(l, now));
    } else if (filterTab === 'connected') {
      result = result.filter((l) => PipelineStateService.isSpokeThisWeek(l, now));
    } else if (filterTab === 'callback') {
      result = result.filter((l) => {
        if (callbackScope === 'this_week') {
          return PipelineStateService.isCallbackDueThisWeek(l, now);
        }
        return PipelineStateService.isScheduledCallback(l);
      });
    } else if (filterTab === 'unanswered') {
      result = result.filter((l) => {
        if (unansweredScope === 'this_week') {
          return PipelineStateService.isUnansweredThisWeek(l, now);
        }
        return ['no_answer', 'voicemail'].includes(l.last_disposition || '');
      });
    } else if (filterTab === 'clients') {
      result = result.filter((l) => Boolean(l.is_client));
    }

    // 2. Filter by Search Query
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((l) => {
        if (!l) return false;
        const nameStr = String(l.name || '').toLowerCase();
        const phoneDigits = String(l.phone || '').replace(/\D/g, '');
        const phoneRaw = String(l.phone || '').toLowerCase();
        const schoolStr = String(l.school || '').toLowerCase();
        const periodStr = String(l.planning_period || '').toLowerCase();
        const roomStr = String(l.room_number || '').toLowerCase();
        const notesStr = String(l.notes || '').toLowerCase();

        return (
          nameStr.includes(q) ||
          phoneDigits.includes(q) ||
          phoneRaw.includes(q) ||
          schoolStr.includes(q) ||
          periodStr.includes(q) ||
          roomStr.includes(q) ||
          notesStr.includes(q)
        );
      });
    }

    return result;
  }, [scopedLeads, filterTab, apptsScope, callbackScope, unansweredScope, searchQuery, hasEverBeenCalled]);

  const handleStartMasterQueue = async () => {
    await HapticsService.success();
    const callableCount = scopedLeads.filter(
      (l) => !l.last_disposition || ['pending', 'no_answer', 'voicemail'].includes(l.last_disposition)
    ).length;

    if (callableCount === 0) {
      Alert.alert(
        'Queue Complete',
        'All leads in this campaign view have been contacted! Snap a new card or recycle unanswered calls.'
      );
      return;
    }

    const currentListObj = availableLists.find((lst) => lst.id === selectedListId);
    let listTitle = currentListObj ? currentListObj.title : 'Retirement Calling Queue';
    if (selectedSchool !== 'all') {
      listTitle = `${selectedSchool} (${listTitle})`;
    }

    navigation.navigate('DialerHUD', {
      listId: selectedListId,
      listTitle,
      schoolName: selectedSchool !== 'all' ? selectedSchool : undefined,
    });
  };

  const handleStartCallbacksQueue = (callbacks: Lead[]) => {
    setCallsDueModalVisible(false);
    if (!callbacks || callbacks.length === 0) {
      Alert.alert(
        'No Callbacks Due',
        'There are no scheduled callbacks due today.'
      );
      return;
    }

    HapticsService.success();
    let listTitle = `Scheduled Callbacks (${callbacks.length})`;
    if (selectedSchool !== 'all') {
      listTitle = `${selectedSchool} • ${listTitle}`;
    }

    navigation.navigate('DialerHUD', {
      listId: 'callbacks_due_queue',
      listTitle,
      leads: callbacks,
      schoolName: selectedSchool !== 'all' ? selectedSchool : undefined,
    });
  };

  const handleExportCsv = async () => {
    HapticsService.medium();
    const success = await CsvService.downloadCsv(filteredLeads, 'SnapDialer_Pipeline');
    if (success) {
      HapticsService.success();
    }
  };

  const handleDialSingle = async (lead: Lead) => {
    await HapticsService.medium();
    navigation.navigate('LeadDetail', { leadId: lead.id });
  };

  const handleDirectCall = async (lead: Lead) => {
    await HapticsService.medium();
    const startTime = Date.now();
    setCallStartTime(startTime);
    setQuickDispoLead(lead);
    setIsCallActive(true);
    setIsQuickDispoVisible(true);
    await TelephonyService.makeCall(lead.phone);
  };

  const handleOpenQuickDispo = async (lead: Lead) => {
    await HapticsService.tick();
    setCallStartTime(null);
    setQuickDispoLead(lead);
    setIsCallActive(false);
    setIsQuickDispoVisible(true);
  };

  const handleDeleteLead = async (leadId: string, name: string) => {
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && window.confirm(`Permanently delete "${name}"?`);
      if (confirmed) {
        await HapticsService.heavy();
        await LeadsRepository.deleteLead(leadId);
        loadLeads();
      }
      return;
    }

    Alert.alert('Delete Contact', `Are you sure you want to delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await HapticsService.heavy();
          await LeadsRepository.deleteLead(leadId);
          loadLeads();
        },
      },
    ]);
  };

  const handleRecycleUnanswered = async () => {
    await HapticsService.medium();

    const doRecycle = async () => {
      await HapticsService.success();
      await LeadsRepository.recycleUnansweredLeads();
      loadLeads();
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && window.confirm('Recycle all unanswered/voicemail leads back to the active dialing queue?');
      if (confirmed) {
        await doRecycle();
      }
      return;
    }

    Alert.alert(
      'Recycle Unanswered Calls',
      'Reset all leads with Voicemail or No Answer so you can run another call pass?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Recycle Leads', onPress: doRecycle },
      ]
    );
  };

  const getStatusBadge = (lead: Lead) => {
    const disp = lead.last_disposition;
    if (disp === 'appointment_set') {
      if (PipelineStateService.isDispoNeeded(lead)) {
        return { label: '⚠️ Dispo Due', bg: Colors.badgeWarningBg, color: Colors.badgeWarningText };
      }
      return { label: '🎯 Appt. Set', bg: Colors.badgeSuccessBg, color: Colors.badgeSuccessText };
    }
    if (lead.appointment_outcome === 'converted') {
      return { label: '★ Client Converted', bg: 'rgba(16, 185, 129, 0.18)', color: '#10B981' };
    }
    if (lead.appointment_outcome === 'nurture_drip') {
      return { label: '💬 Prospect Drip', bg: 'rgba(2, 132, 199, 0.18)', color: '#0284C7' };
    }
    if (disp === 'connected' || disp === 'spoke') {
      return { label: '💬 Spoke / Connected', bg: Colors.badgeSuccessBg, color: Colors.badgeSuccessText };
    }
    const hasValidFollowUp = lead.follow_up_at && !isNaN(new Date(lead.follow_up_at).getTime());
    if (disp === 'callback_requested' || hasValidFollowUp) {
      return { label: 'Callback Scheduled', bg: Colors.badgeWarningBg, color: Colors.badgeWarningText };
    }
    if (disp === 'other') {
      return { label: '📋 Other / Noted', bg: 'rgba(139, 92, 246, 0.15)', color: '#8B5CF6' };
    }
    if (disp === 'voicemail') {
      return { label: `Voicemail (${lead.attempts_count})`, bg: Colors.badgeNeutralBg, color: Colors.badgeNeutralText };
    }
    if (disp === 'no_answer') {
      return { label: `No Answer (${lead.attempts_count})`, bg: Colors.badgeNeutralBg, color: Colors.badgeNeutralText };
    }
    if (disp === 'bad_number') {
      return { label: '⚠️ Bad Number', bg: Colors.badgeDangerBg, color: Colors.badgeDangerText };
    }
    if (disp === 'do_not_call') {
      return { label: 'Do Not Call', bg: Colors.badgeDangerBg, color: Colors.badgeDangerText };
    }
    return { label: 'Ready to Call', bg: Colors.badgeNeutralBg, color: Colors.brandAccent };
  };


  // Stats calculation
  const totalCount = scopedLeads.length;

  // 'To Call': Leads pending outreach in current cycle (0 attempts OR recycled)
  const pendingCount = scopedLeads.filter((l) => !l.last_disposition || l.last_disposition === 'pending').length;

  const now = new Date();
  const upcomingCount = scopedLeads.filter((l) => PipelineStateService.isActiveAppointment(l)).length;
  const apptsThisWeekCount = scopedLeads.filter((l) => PipelineStateService.isAppointmentThisWeek(l, now)).length;
  const dispoNeededCount = scopedLeads.filter((l) => PipelineStateService.isDispoNeeded(l, now)).length;

  // 'Appts Set': Displays weekly confirmed sit-downs by default (or all upcoming)
  const appointmentCount = apptsScope === 'this_week' ? apptsThisWeekCount : upcomingCount;

  // 'Callbacks': Leads scheduled for a callback due this week (or overdue)
  const callbackThisWeekCount = scopedLeads.filter((l) => PipelineStateService.isCallbackDueThisWeek(l, now)).length;
  const callbackTotalCount = scopedLeads.filter((l) => PipelineStateService.isScheduledCallback(l)).length;
  const callbackCount = callbackScope === 'this_week' ? callbackThisWeekCount : callbackTotalCount;

  // 'Unanswered': Outreach calls unanswered this week
  const unansweredThisWeekCount = scopedLeads.filter((l) => PipelineStateService.isUnansweredThisWeek(l, now)).length;
  const unansweredTotalCount = scopedLeads.filter((l) => ['no_answer', 'voicemail'].includes(l.last_disposition || '')).length;
  const unansweredCount = unansweredScope === 'this_week' ? unansweredThisWeekCount : unansweredTotalCount;

  // 'Spoke / Connected': Leads spoken with this week
  const spokeCount = scopedLeads.filter((l) => PipelineStateService.isSpokeThisWeek(l, now)).length;

  // 'Clients': Converted clients in this scope over ALL TIME
  const clientsCount = scopedLeads.filter((l) => Boolean(l.is_client)).length;

  // 'Callable' = all dialable leads (never called + pending + unanswered/voicemail). Used to drive CTA button state.
  const callableCount = scopedLeads.filter(
    (l) => !l.last_disposition || ['pending', 'no_answer', 'voicemail'].includes(l.last_disposition)
  ).length;

  // Due SMS Drips & Annual Reviews for today
  const dueDrips = React.useMemo(() => {
    return DripDispatcherService.getDueDrips(scopedLeads, advisorName);
  }, [scopedLeads, advisorName]);

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height && height < 550;

  const handleSelectFilterTab = (tab: typeof filterTab) => {
    HapticsService.tick();
    setFilterTab(tab);
    if (tab === 'all') {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    } else {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: isLandscape ? 180 : 330, animated: true });
      }, 50);
    }
  };

  const renderHeader = () => (
    <View style={{ paddingTop: 4 }}>
      {/* Today's Advisor Action Cockpit */}
      <TodayCockpitCard
        leads={scopedLeads}
        dueDripsCount={dueDrips.length}
        onOpenDripModal={() => setDripModalVisible(true)}
        onNavigateLead={(leadId) => navigation.navigate('LeadDetail', { leadId })}
        onStartDialing={handleStartMasterQueue}
        onOpenCallsDueModal={() => setCallsDueModalVisible(true)}
        onDirectCall={handleDirectCall}
        onFilterDispoDue={() => {
          const dispoLeads = scopedLeads.filter((l) => PipelineStateService.isDispoNeeded(l, new Date()));
          if (dispoLeads.length === 1) {
            navigation.navigate('LeadDetail', { leadId: dispoLeads[0].id });
          } else {
            handleSelectFilterTab('dispo_needed');
          }
        }}
        onFilterAppts={() => handleSelectFilterTab('appts')}
      />

      {/* KPI Stats Strip */}
      <View style={styles.statsRowOuter}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsRow}
        >
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{totalCount}</Text>
            <Text style={styles.statLabel}>Educators</Text>
          </View>
          <View style={[styles.statCard, { borderLeftWidth: 1, borderLeftColor: Colors.borderSubtle }]}>
            <Text style={[styles.statNumber, { color: Colors.brandAccent }]}>{pendingCount}</Text>
            <Text style={styles.statLabel}>To Call</Text>
          </View>
          <View style={[styles.statCard, { borderLeftWidth: 1, borderLeftColor: Colors.borderSubtle }]}>
            <Text style={[styles.statNumber, { color: Colors.badgeSuccessText }]}>{appointmentCount}</Text>
            <Text style={[styles.statLabel, { color: Colors.badgeSuccessText, fontWeight: '800' }]}>Appts Set</Text>
          </View>
          <View style={[styles.statCard, { borderLeftWidth: 1, borderLeftColor: Colors.borderSubtle }]}>
            <Text style={[styles.statNumber, { color: Colors.badgeWarningText }]}>{callbackCount}</Text>
            <Text style={styles.statLabel}>Callbacks</Text>
          </View>
          <View style={[styles.statCard, { borderLeftWidth: 1, borderLeftColor: Colors.borderSubtle }]}>
            <Text style={[styles.statNumber, { color: Colors.textSecondary }]}>{unansweredCount}</Text>
            <Text style={styles.statLabel}>Unanswered</Text>
          </View>
          <View style={[styles.statCard, { borderLeftWidth: 1, borderLeftColor: Colors.borderSubtle }]}>
            <Text style={[styles.statNumber, { color: Colors.callActive }]}>{callableCount}</Text>
            <Text style={styles.statLabel}>Callable</Text>
          </View>
        </ScrollView>
      </View>

      {/* Duplicate Leads Notification Banner */}
      {duplicateCount > 0 && (
        <View style={styles.dedupBannerContainer}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} color={Colors.badgeWarningText} />
            <Text style={styles.dedupBannerText}>
              {duplicateCount} duplicate card{duplicateCount > 1 ? 's' : ''} detected
            </Text>
          </View>
          <TouchableOpacity
            style={styles.dedupBannerBtn}
            onPress={handleDeduplicateDirectly}
            disabled={isDeduplicating}
          >
            {isDeduplicating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.dedupBannerBtnText}>Clean Pipeline</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Recycle Unanswered Leads Pill if available */}
      {unansweredCount > 0 && (
        <View style={styles.recycleWrap}>
          <TouchableOpacity style={styles.recycleButton} onPress={handleRecycleUnanswered}>
            <RotateCcw size={14} color={Colors.badgeWarningText} />
            <Text style={styles.recycleText}>
              Recycle {unansweredCount} Unanswered / Voicemail Lead{unansweredCount > 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.brandPrimary} />

      {/* App Header */}
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <Text style={styles.appTitle} numberOfLines={1}>SnapDialer</Text>
          <Text style={styles.appSubtitle} numberOfLines={1} ellipsizeMode="tail">SnapDialer • Retirement Pipeline</Text>
        </View>

        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.snapHeaderButton}
            onPress={() => navigation.navigate('ScanSheet')}
            accessibilityLabel="Scan report cards"
          >
            <Camera size={16} color={Colors.livingWhite} />
            <Text style={styles.snapHeaderButtonText}>Snap Card</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel="Open settings"
          >
            <Settings size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Floating Fast Action Bar (Search + Sliders Filter Trigger) */}
      <View style={styles.searchFilterRow}>
        <View style={styles.searchContainer}>
          <Search size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${scopedLeads.length} leads by name, school, room...`}
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.filterTriggerButton,
            (selectedSchool !== 'all' || selectedListId !== 'all' || priorityFilter !== 'all' || frsFilter !== 'all') &&
              styles.filterTriggerButtonActive,
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => {
            HapticsService.tick();
            setFilterSheetVisible(true);
          }}
          activeOpacity={0.8}
        >
          <SlidersHorizontal
            size={16}
            color={
              selectedSchool !== 'all' || selectedListId !== 'all' || priorityFilter !== 'all' || frsFilter !== 'all'
                ? '#FFFFFF'
                : Colors.textSecondary
            }
          />
          {(selectedSchool !== 'all' || selectedListId !== 'all' || priorityFilter !== 'all' || frsFilter !== 'all') && (
            <View style={styles.filterDotBadge}>
              <Text style={styles.filterDotBadgeText}>
                {(selectedSchool !== 'all' ? 1 : 0) +
                  (selectedListId !== 'all' ? 1 : 0) +
                  (priorityFilter !== 'all' ? 1 : 0) +
                  (frsFilter !== 'all' ? 1 : 0)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Active Filter Strip if any filter is active */}
      {(selectedSchool !== 'all' || selectedListId !== 'all' || priorityFilter !== 'all' || frsFilter !== 'all') && (
        <View style={styles.activeFiltersRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeFiltersScroll}
          >
            {frsFilter !== 'all' && (
              <TouchableOpacity
                style={[
                  styles.activeFilterChip,
                  frsFilter === 'frs' ? styles.activeFilterChipFrs : styles.activeFilterChipNonFrs,
                ]}
                onPress={() => {
                  HapticsService.tick();
                  setFrsFilter('all');
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                activeOpacity={0.7}
              >
                {frsFilter === 'frs' ? (
                  <Landmark size={12} color="#C084FC" />
                ) : (
                  <Briefcase size={12} color="#60A5FA" />
                )}
                <Text
                  style={[
                    styles.activeFilterChipText,
                    frsFilter === 'frs' ? { color: '#C084FC' } : { color: '#60A5FA' },
                  ]}
                >
                  {frsFilter === 'frs' ? 'FRS Members' : 'Non-FRS'} ✕
                </Text>
              </TouchableOpacity>
            )}
            {selectedSchool !== 'all' && (
              <TouchableOpacity
                style={styles.activeFilterChip}
                onPress={() => {
                  HapticsService.tick();
                  setSelectedSchool('all');
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                activeOpacity={0.7}
              >
                <Building size={12} color={Colors.textPrimary} />
                <Text style={styles.activeFilterChipText}>{selectedSchool} ✕</Text>
              </TouchableOpacity>
            )}
            {selectedListId !== 'all' && (
              <TouchableOpacity
                style={styles.activeFilterChip}
                onPress={() => {
                  HapticsService.tick();
                  setSelectedListId('all');
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                activeOpacity={0.7}
              >
                <Layers size={12} color={Colors.textPrimary} />
                <Text style={styles.activeFilterChipText}>
                  {availableLists.find((l) => l.id === selectedListId)?.title || 'Campaign'} ✕
                </Text>
              </TouchableOpacity>
            )}
            {priorityFilter !== 'all' && (
              <TouchableOpacity
                style={styles.activeFilterChip}
                onPress={() => {
                  HapticsService.tick();
                  setPriorityFilter('all');
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                activeOpacity={0.7}
              >
                <Sparkles size={12} color={Colors.badgeSuccessText} />
                <Text style={styles.activeFilterChipText}>
                  {priorityFilter === 'fresh' ? 'Tier 1 Fresh' : 'Tier 3 Legacy'} ✕
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.activeFilterChip, styles.clearAllChip]}
              onPress={() => {
                HapticsService.tick();
                setSelectedSchool('all');
                setSelectedListId('all');
                setPriorityFilter('all');
                setFrsFilter('all');
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              activeOpacity={0.7}
            >
              <Text style={styles.clearAllText}>Clear All</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Filter Tabs (Pinned outside FlatList for instant horizontal paging) */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
          <TouchableOpacity
            style={[styles.tabChip, filterTab === 'all' && styles.tabChipActive]}
            onPress={() => handleSelectFilterTab('all')}
          >
            <Text style={[styles.tabChipText, filterTab === 'all' && styles.tabChipTextActive]}>
              All ({totalCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabChip, filterTab === 'pending' && styles.tabChipActive]}
            onPress={() => handleSelectFilterTab('pending')}
          >
            <Text style={[styles.tabChipText, filterTab === 'pending' && styles.tabChipTextActive]}>
              To Call ({pendingCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabChip, filterTab === 'appts' && styles.tabChipActive]}
            onPress={() => handleSelectFilterTab('appts')}
          >
            <Text style={[styles.tabChipText, filterTab === 'appts' && styles.tabChipTextActive]}>
              Appts Set ({appointmentCount})
            </Text>
          </TouchableOpacity>
          {dispoNeededCount > 0 && (
            <TouchableOpacity
              style={[
                styles.tabChip,
                styles.tabChipDispoDue,
                filterTab === 'dispo_needed' && styles.tabChipDispoDueActive,
              ]}
              onPress={() => handleSelectFilterTab('dispo_needed')}
            >
              <Clock
                size={12}
                color={filterTab === 'dispo_needed' ? '#000000' : '#D97706'}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.tabChipText,
                  styles.tabChipDispoDueText,
                  filterTab === 'dispo_needed' && styles.tabChipDispoDueTextActive,
                ]}
              >
                ⚠️ Dispo Due ({dispoNeededCount})
              </Text>
            </TouchableOpacity>
          )}
          {spokeCount > 0 && (
            <TouchableOpacity
              style={[styles.tabChip, filterTab === 'connected' && styles.tabChipActive]}
              onPress={() => handleSelectFilterTab('connected')}
            >
              <Text style={[styles.tabChipText, filterTab === 'connected' && styles.tabChipTextActive]}>
                Spoke ({spokeCount})
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.tabChip, filterTab === 'callback' && styles.tabChipActive]}
            onPress={() => handleSelectFilterTab('callback')}
          >
            <Text style={[styles.tabChipText, filterTab === 'callback' && styles.tabChipTextActive]}>
              Callbacks ({callbackCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabChip, filterTab === 'unanswered' && styles.tabChipActive]}
            onPress={() => handleSelectFilterTab('unanswered')}
          >
            <Text style={[styles.tabChipText, filterTab === 'unanswered' && styles.tabChipTextActive]}>
              Unanswered ({unansweredCount})
            </Text>
          </TouchableOpacity>
          {clientsCount > 0 && (
            <TouchableOpacity
              style={[
                styles.tabChip,
                filterTab === 'clients' && styles.tabChipActive,
                { borderColor: '#10B981' },
              ]}
              onPress={() => handleSelectFilterTab('clients')}
            >
              <Award
                size={12}
                color={filterTab === 'clients' ? '#000000' : '#10B981'}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.tabChipText,
                  filterTab === 'clients' && styles.tabChipTextActive,
                  { color: filterTab === 'clients' ? '#000000' : '#10B981' },
                ]}
              >
                Clients ({clientsCount})
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Sub-Scope Bar for Appts Set (This Week vs All Upcoming) */}
      {filterTab === 'appts' && (
        <View style={styles.subFilterBar}>
          <TouchableOpacity
            style={[styles.subFilterChip, apptsScope === 'this_week' && styles.subFilterChipActive]}
            onPress={() => {
              HapticsService.tick();
              setApptsScope('this_week');
            }}
          >
            <Text style={[styles.subFilterText, apptsScope === 'this_week' && styles.subFilterTextActive]}>
              📅 This Week ({apptsThisWeekCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subFilterChip, apptsScope === 'all' && styles.subFilterChipActive]}
            onPress={() => {
              HapticsService.tick();
              setApptsScope('all');
            }}
          >
            <Text style={[styles.subFilterText, apptsScope === 'all' && styles.subFilterTextActive]}>
              🎯 All Upcoming ({upcomingCount})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sub-Scope Bar for Callbacks (Due This Week vs All Callbacks) */}
      {filterTab === 'callback' && (
        <View style={styles.subFilterBar}>
          <TouchableOpacity
            style={[styles.subFilterChip, callbackScope === 'this_week' && styles.subFilterChipActive]}
            onPress={() => {
              HapticsService.tick();
              setCallbackScope('this_week');
            }}
          >
            <Text style={[styles.subFilterText, callbackScope === 'this_week' && styles.subFilterTextActive]}>
              ⏰ Due This Week ({callbackThisWeekCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subFilterChip, callbackScope === 'all' && styles.subFilterChipActive]}
            onPress={() => {
              HapticsService.tick();
              setCallbackScope('all');
            }}
          >
            <Text style={[styles.subFilterText, callbackScope === 'all' && styles.subFilterTextActive]}>
              📋 All Callbacks ({callbackTotalCount})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sub-Scope Bar for Unanswered (This Week vs All Historical) */}
      {filterTab === 'unanswered' && unansweredTotalCount > unansweredThisWeekCount && (
        <View style={styles.subFilterBar}>
          <TouchableOpacity
            style={[styles.subFilterChip, unansweredScope === 'this_week' && styles.subFilterChipActive]}
            onPress={() => {
              HapticsService.tick();
              setUnansweredScope('this_week');
            }}
          >
            <Text style={[styles.subFilterText, unansweredScope === 'this_week' && styles.subFilterTextActive]}>
              ⚡ This Week ({unansweredThisWeekCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subFilterChip, unansweredScope === 'all' && styles.subFilterChipActive]}
            onPress={() => {
              HapticsService.tick();
              setUnansweredScope('all');
            }}
          >
            <Text style={[styles.subFilterText, unansweredScope === 'all' && styles.subFilterTextActive]}>
              All Unanswered ({unansweredTotalCount})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Lead Cards List with Embedded Header */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.heavenlyGold} />
          <Text style={styles.loadingText}>Loading educator pipeline...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={filteredLeads}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <GraduationCap size={40} color={Colors.heavenlyGold} />
              </View>
              <Text style={styles.emptyTitle}>
                {searchQuery ? 'No matching leads' : 'No leads in pipeline'}
              </Text>
              <Text style={styles.emptyDesc}>
                {searchQuery
                  ? 'Try adjusting your search terms or filter.'
                  : 'Tap "Snap Card" above to take a photo of a client\'s Report Card.'}
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => navigation.navigate('ScanSheet')}
              >
                <Camera size={20} color="#FFFFFF" />
                <Text style={styles.emptyButtonText}>Snap First Report Card</Text>
              </TouchableOpacity>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 110 }}
          renderItem={({ item }) => {
            const badge = getStatusBadge(item);
            const dateAdded = item.created_at
              ? new Date(item.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })
              : '';

            return (
              <TouchableOpacity
                style={styles.leadCard}
                activeOpacity={0.75}
                onPress={() => navigation.navigate('LeadDetail', { leadId: item.id })}
              >
                {/* Top Row: Name + Status */}
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Text style={styles.leadName}>{item.name}</Text>
                    <View style={styles.metaRow}>
                      <Building size={13} color={Colors.textMuted} />
                      <Text style={styles.leadSchool}>
                        {item.school || 'VOL'}
                        {item.room_number ? ` • Room ${item.room_number}` : ''}
                      </Text>
                      {dateAdded ? (
                        <Text style={styles.dateAddedText}>• Added {dateAdded}</Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 1 }}>
                    {item.is_frs === false ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: 'rgba(59, 130, 246, 0.15)',
                          borderColor: '#3B82F6',
                          borderWidth: 1,
                          paddingHorizontal: 7,
                          paddingVertical: 3,
                          borderRadius: 8,
                          gap: 4,
                        }}
                      >
                        <Briefcase size={10} color="#60A5FA" />
                        <Text style={{ color: '#60A5FA', fontSize: 10, fontWeight: '800' }}>Non-FRS</Text>
                      </View>
                    ) : (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: 'rgba(139, 92, 246, 0.15)',
                          borderColor: '#8B5CF6',
                          borderWidth: 1,
                          paddingHorizontal: 7,
                          paddingVertical: 3,
                          borderRadius: 8,
                          gap: 4,
                        }}
                      >
                        <Landmark size={10} color="#C084FC" />
                        <Text style={{ color: '#C084FC', fontSize: 10, fontWeight: '800' }}>FRS</Text>
                      </View>
                    )}
                    {item.is_client && (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: 'rgba(16, 185, 129, 0.18)',
                          borderColor: '#10B981',
                          borderWidth: 1,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 8,
                          gap: 3,
                        }}
                      >
                        <Award size={10} color="#10B981" />
                        <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '800' }}>Client</Text>
                      </View>
                    )}
                    {item.priority_tier === 3 ? (
                      <View style={styles.legacyBadge}>
                        <Archive size={10} color="#94A3B8" />
                        <Text style={styles.legacyBadgeText}>Legacy</Text>
                      </View>
                    ) : (
                      <View style={styles.freshBadge}>
                        <Flame size={10} color={Colors.heavenlyGold} />
                        <Text style={styles.freshBadgeText}>Fresh</Text>
                      </View>
                    )}
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: badge.color }]}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Details Section */}
                <View style={styles.detailsBox}>
                  {item.planning_period ? (
                    <View style={styles.detailRow}>
                      <Clock size={13} color={Colors.heavenlyGold} />
                      <Text style={styles.detailText}>
                        Planning: <Text style={{ color: Colors.textPrimary, fontWeight: '600' }}>{item.planning_period}</Text>
                      </Text>
                    </View>
                  ) : null}

                  {item.years_in_frs ? (
                    <View style={styles.detailRow}>
                      <FileCheck size={13} color={Colors.statusSitDownText} />
                      <Text style={styles.detailText}>
                        FRS Service: <Text style={{ color: Colors.textPrimary, fontWeight: '600' }}>{item.years_in_frs} Years</Text>
                        {item.frs_knowledge ? ` (${item.frs_knowledge})` : ''}
                      </Text>
                    </View>
                  ) : null}

                  {item.meeting_preferences && item.meeting_preferences.length > 0 ? (
                    <View style={styles.detailRow}>
                      <Calendar size={13} color={Colors.deepSkyBlueLight} />
                      <Text style={styles.detailText} numberOfLines={1}>
                        Preferred: <Text style={{ color: Colors.textPrimary }}>{item.meeting_preferences.join(', ')}</Text>
                      </Text>
                    </View>
                  ) : null}

                  {item.is_client && (item.annualized_premium || item.transfer_assets_volume) ? (
                    <View style={styles.detailRow}>
                      <Award size={13} color="#10B981" />
                      <Text style={styles.detailText}>
                        Portfolio: <Text style={{ color: '#10B981', fontWeight: '700' }}>
                          {item.annualized_premium ? `$${Number(item.annualized_premium).toLocaleString()} AP` : ''}
                          {item.annualized_premium && item.transfer_assets_volume ? ' • ' : ''}
                          {item.transfer_assets_volume ? `$${Number(item.transfer_assets_volume).toLocaleString()} Assets` : ''}
                        </Text>
                      </Text>
                    </View>
                  ) : null}

                  {item.notes ? (
                    <Text style={styles.notesText} numberOfLines={1}>
                      Note: {item.notes}
                    </Text>
                  ) : null}
                </View>

                {/* Action Buttons Row */}
                <View style={styles.cardActionsRow}>
                  {item.source_image_uri ? (
                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => setPreviewImageUri(item.source_image_uri || null)}
                    >
                      <Eye size={15} color={Colors.brandAccent} />
                      <Text style={[styles.cardActionBtnText, { color: Colors.brandAccent }]}>Card</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={styles.cardActionBtn}
                    onPress={() => navigation.navigate('LeadDetail', { leadId: item.id, autoOpenSms: true })}
                  >
                    <MessageSquare size={15} color={Colors.brandAccent} />
                    <Text style={[styles.cardActionBtnText, { color: Colors.brandAccent }]}>AI Text</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cardActionBtn, styles.bookActionBtn]}
                    onPress={() => navigation.navigate('LeadDetail', {
                      leadId: item.id,
                      autoOpenScheduler: true,
                      initialPurpose: item.is_client ? 'annual_review' : 'frs_review',
                    })}
                  >
                    <Calendar size={15} color="#D97706" />
                    <Text style={[styles.cardActionBtnText, { color: '#D97706', fontWeight: '700' }]}>
                      Book
                    </Text>
                  </TouchableOpacity>

                  {PipelineStateService.isDispoNeeded(item) ? (
                    <TouchableOpacity
                      style={[styles.cardActionBtn, styles.dispoActionBtn]}
                      onPress={() => handleOpenQuickDispo(item)}
                    >
                      <Clock size={15} color="#D97706" />
                      <Text style={[styles.cardActionBtnText, { color: '#D97706', fontWeight: '800' }]}>
                        Record Dispo
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.cardActionBtn, styles.quickDispoActionBtn]}
                      onPress={() => handleOpenQuickDispo(item)}
                    >
                      <ClipboardList size={15} color="#8B5CF6" />
                      <Text style={[styles.cardActionBtnText, { color: '#8B5CF6', fontWeight: '700' }]}>
                        Dispo
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.cardActionBtn, styles.callActionBtn]}
                    onPress={() => handleDirectCall(item)}
                  >
                    <PhoneCall size={15} color="#FFFFFF" />
                    <Text style={[styles.cardActionBtnText, { color: '#FFFFFF', fontWeight: '800' }]}>
                      Call ({item.phone})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.deleteLeadBtn}
                    onPress={() => handleDeleteLead(item.id, item.name)}
                  >
                    <Trash2 size={16} color={Colors.statusDangerText} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Interactive Zoomable Report Card Photo Modal */}
      <ZoomableImageModal
        visible={!!previewImageUri}
        imageUri={previewImageUri}
        title="Original Client Review Card"
        subtitle="Pinch or use zoom controls to inspect handwriting"
        onClose={() => setPreviewImageUri(null)}
      />

      {/* 1-Tap Daily Drip Dispatcher Modal */}
      <BatchDripDispatchModal
        visible={dripModalVisible}
        onClose={() => setDripModalVisible(false)}
        dueDrips={dueDrips}
        onDripSent={() => loadLeads()}
      />

      {/* Floating Action Button (FAB) for Start Power Dialing */}
      {callableCount > 0 && (
        <TouchableOpacity
          style={styles.floatingDialFab}
          onPress={handleStartMasterQueue}
          activeOpacity={0.85}
        >
          <PhoneCall size={18} color="#FFFFFF" />
          <Text style={styles.floatingDialFabText}>Start Dialing ({callableCount})</Text>
          <ChevronRight size={18} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Slide-Up Filter Bottom Sheet */}
      <FilterBottomSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        availableSchools={availableSchools}
        selectedSchool={selectedSchool}
        onSelectSchool={setSelectedSchool}
        availableLists={availableLists}
        selectedListId={selectedListId}
        onSelectCampaign={setSelectedListId}
        priorityFilter={priorityFilter}
        onSelectPriority={setPriorityFilter}
        frsFilter={frsFilter}
        onSelectFrs={setFrsFilter}
        totalLeadsCount={leads.length}
        filteredCount={filteredLeads.length}
        onResetFilters={() => {
          setSelectedSchool('all');
          setSelectedListId('all');
          setPriorityFilter('all');
          setFrsFilter('all');
        }}
      />

      {/* Universal Live Call & Quick Disposition Modal */}
      <QuickDispositionModal
        visible={isQuickDispoVisible}
        lead={quickDispoLead}
        isCallActive={isCallActive}
        initialStartTime={callStartTime}
        onClose={() => {
          setIsQuickDispoVisible(false);
          setQuickDispoLead(null);
          setCallStartTime(null);
          setIsCallActive(false);
        }}
        onDispositionComplete={() => {
          loadLeads();
        }}
      />

      {/* Scheduled Callbacks Due Today Modal */}
      <CallbacksDueModal
        visible={callsDueModalVisible}
        onClose={() => setCallsDueModalVisible(false)}
        callbacks={callbacksDueToday}
        onCallNow={(lead) => {
          setCallsDueModalVisible(false);
          handleDirectCall(lead);
        }}
        onViewDetails={(lead) => {
          setCallsDueModalVisible(false);
          handleDialSingle(lead);
        }}
        onStartQueue={handleStartCallbacksQueue}
      />
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.brandPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.brandPrimary,
  },
  titleArea: {
    flexShrink: 0,
    marginRight: 8,
  },
  appTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  appSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.focusRing,
    marginTop: 1,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    flexShrink: 1,
  },
  snapHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brandAccent,
    borderWidth: 1,
    borderColor: Colors.focusRing,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    gap: 4,
  },
  snapHeaderButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  iconButton: {
    padding: 4,
  },
  statsRowOuter: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceCard,
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  statCard: {
    minWidth: 85,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  ctaContainer: {
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  startQueueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.callActive,
    borderWidth: 1.5,
    borderColor: Colors.callActive,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    gap: 12,
  },
  phoneIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startQueueTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  startQueueSubtitle: {
    color: '#DCFCE7',
    fontSize: 12,
    marginTop: 2,
  },
  recycleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.badgeWarningBg,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 10,
    paddingVertical: 8,
    gap: 6,
  },
  recycleText: {
    color: Colors.badgeWarningText,
    fontSize: 12,
    fontWeight: '700',
  },
  dedupBannerContainer: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    backgroundColor: Colors.badgeWarningBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.badgeWarningText,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dedupBannerText: {
    color: Colors.badgeWarningText,
    fontSize: 12,
    fontWeight: '700',
  },
  dedupBannerBtn: {
    backgroundColor: Colors.brandPrimary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  dedupBannerBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  recycleWrap: {
    marginHorizontal: 16,
    marginBottom: 6,
  },
  searchFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    gap: 8,
  },
  searchContainer: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceCard,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 16,
  },
  filterTriggerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    position: 'relative',
    zIndex: 10,
  },
  filterTriggerButtonActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  filterDotBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.heavenlyGold,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surfaceCard,
  },
  filterDotBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  floatingDialFab: {
    position: 'absolute',
    bottom: 24,
    right: 18,
    backgroundColor: Colors.callActive,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    gap: 8,
    shadowColor: Colors.callActive,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 99,
  },
  floatingDialFabText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  activeFiltersRow: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
  },
  activeFiltersScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 5,
    minHeight: 28,
    gap: 5,
  },
  activeFilterChipFrs: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: '#8B5CF6',
  },
  activeFilterChipNonFrs: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: '#3B82F6',
  },
  activeFilterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  clearAllChip: {
    backgroundColor: Colors.badgeNeutralBg,
    borderColor: Colors.borderStrong,
  },
  clearAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  tabsContainer: {
    marginTop: 10,
    marginBottom: 8,
  },
  tabsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  tabChipActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  tabChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tabChipDispoDue: {
    borderColor: '#D97706',
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabChipDispoDueActive: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  tabChipDispoDueText: {
    color: '#D97706',
    fontWeight: '700',
  },
  tabChipDispoDueTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  subFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 8,
    gap: 8,
  },
  subFilterChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  subFilterChipActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.16)',
    borderColor: Colors.heavenlyGold,
  },
  subFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  subFilterTextActive: {
    color: Colors.heavenlyGold,
    fontWeight: '800',
  },
  leadCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  leadName: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  leadSchool: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  dateAddedText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  legacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.badgeNeutralBg,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 8,
    gap: 4,
  },
  legacyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.badgeNeutralText,
  },
  freshBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.badgeWarningBg,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 8,
    gap: 4,
  },
  freshBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.badgeWarningText,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  detailsBox: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  notesText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 5,
  },
  cardActionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  callActionBtn: {
    flex: 1,
    minWidth: 130,
    backgroundColor: Colors.callActive,
    borderColor: Colors.callActive,
    justifyContent: 'center',
  },
  dispoActionBtn: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    borderColor: '#D97706',
  },
  quickDispoActionBtn: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  bookActionBtn: {
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    borderColor: 'rgba(217, 119, 6, 0.35)',
  },
  deleteLeadBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.badgeDangerBg,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    color: Colors.textMuted,
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    marginTop: 40,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptyDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brandPrimary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 20,
    gap: 8,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.bgModal,
  },
  modalSafeContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.brandPrimary,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
});
