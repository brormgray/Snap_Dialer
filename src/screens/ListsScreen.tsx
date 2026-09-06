import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react-native';
import { LeadsRepository } from '../db/leadsRepository';
import { CallLogsRepository } from '../db/callLogsRepository';
import { HapticsService } from '../services/hapticsService';
import { CsvService } from '../services/csvService';
import { Lead, LeadList, CallLog } from '../types';
import { Colors } from '../theme/colors';
import ZoomableImageModal from '../components/ZoomableImageModal';
import { TodayCockpitCard } from '../components/TodayCockpitCard';
import { BatchDripDispatchModal } from '../components/BatchDripDispatchModal';
import { DripDispatcherService } from '../services/dripDispatcherService';

export default function ListsScreen({ navigation }: any) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [availableLists, setAvailableLists] = useState<LeadList[]>([]);
  const [availableSchools, setAvailableSchools] = useState<{ school: string; count: number }[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('all');
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'fresh' | 'legacy'>('all');
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'appts' | 'connected' | 'callback' | 'unanswered' | 'clients'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // Original Card Image Proof Modal
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [isDeduplicating, setIsDeduplicating] = useState<boolean>(false);
  const [dripModalVisible, setDripModalVisible] = useState<boolean>(false);

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
      const [all, lists, schools, logs] = await Promise.all([
        LeadsRepository.getAllLeads(),
        LeadsRepository.getAllLists(),
        LeadsRepository.getAllSchools(),
        CallLogsRepository.getAllCallLogs(),
      ]);
      setLeads(all);
      setAvailableLists(lists);
      setAvailableSchools(schools);
      setCallLogs(logs);
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
  const hasEverBeenCalled = (l: Lead) => {
    if (l.attempts_count && l.attempts_count > 0) return true;
    if (l.last_attempt_at) return true;
    if (l.last_disposition && l.last_disposition !== 'pending') return true;
    return false;
  };

  useEffect(() => {
    applyFilters();
  }, [leads, callLogs, filterTab, searchQuery, selectedListId, selectedSchool, priorityFilter]);

  const applyFilters = () => {
    let result = [...leads];

    // Filter by Campaign List
    if (selectedListId !== 'all') {
      result = result.filter((l) => l.list_id === selectedListId);
    }

    // Filter by Campus / School
    if (selectedSchool !== 'all') {
      result = result.filter((l) => (l.school || 'VOL').toLowerCase().trim() === selectedSchool.toLowerCase().trim());
    }

    // Filter by Priority Tier
    if (priorityFilter === 'fresh') {
      result = result.filter((l) => (l.priority_tier || 1) === 1);
    } else if (priorityFilter === 'legacy') {
      result = result.filter((l) => l.priority_tier === 3);
    }

    // Filter by Tab
    if (filterTab === 'pending') {
      result = result.filter((l) => !hasEverBeenCalled(l));
    } else if (filterTab === 'appts') {
      result = result.filter((l) => l.last_disposition === 'appointment_set');
    } else if (filterTab === 'connected') {
      result = result.filter((l) => ['connected', 'spoke'].includes(l.last_disposition || ''));
    } else if (filterTab === 'callback') {
      result = result.filter((l) => {
        const isAnswered = ['appointment_set', 'connected', 'spoke', 'do_not_call', 'bad_number'].includes(l.last_disposition || '');
        if (isAnswered) return false;
        return l.last_disposition === 'callback_requested' || !!l.follow_up_at;
      });
    } else if (filterTab === 'unanswered') {
      result = result.filter((l) => ['no_answer', 'voicemail'].includes(l.last_disposition || ''));
    } else if (filterTab === 'clients') {
      result = result.filter((l) => Boolean(l.is_client));
    }

    // Filter by Search Query
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          (l.school && l.school.toLowerCase().includes(q)) ||
          (l.planning_period && l.planning_period.toLowerCase().includes(q)) ||
          (l.room_number && l.room_number.toLowerCase().includes(q))
      );
    }

    setFilteredLeads(result);
  };

  const handleStartMasterQueue = async () => {
    await HapticsService.success();
    const callableCount = scopedLeads.filter(
      (l) => !l.last_disposition || ['pending', 'no_answer', 'voicemail'].includes(l.last_disposition)
    ).length;

    if (callableCount === 0) {
      Alert.alert(
        'Queue Complete',
        'All educators in this campaign view have been contacted! Snap a new report card or recycle unanswered calls.'
      );
      return;
    }

    const currentListObj = availableLists.find((lst) => lst.id === selectedListId);
    let listTitle = currentListObj ? currentListObj.title : 'ValuTeachers Calling Queue';
    if (selectedSchool !== 'all') {
      listTitle = `${selectedSchool} (${listTitle})`;
    }

    navigation.navigate('DialerHUD', {
      listId: selectedListId,
      listTitle,
      schoolName: selectedSchool !== 'all' ? selectedSchool : undefined,
    });
  };

  const handleExportCsv = async () => {
    HapticsService.medium();
    const success = await CsvService.downloadCsv(filteredLeads, 'ValuTeachers_Pipeline');
    if (success) {
      HapticsService.success();
    }
  };

  const handleDialSingle = async (lead: Lead) => {
    await HapticsService.medium();
    navigation.navigate('LeadDetail', { leadId: lead.id });
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
      return { label: '🎯 Appt. Set', bg: Colors.badgeSuccessBg, color: Colors.badgeSuccessText };
    }
    if (disp === 'connected') {
      return { label: '💬 Spoke / Connected', bg: Colors.badgeSuccessBg, color: Colors.badgeSuccessText };
    }
    if (disp === 'callback_requested' || lead.follow_up_at) {
      return { label: 'Callback Scheduled', bg: Colors.badgeWarningBg, color: Colors.badgeWarningText };
    }
    if (disp === 'voicemail') {
      return { label: `Voicemail (${lead.attempts_count})`, bg: Colors.badgeNeutralBg, color: Colors.badgeNeutralText };
    }
    if (disp === 'no_answer') {
      return { label: `No Answer (${lead.attempts_count})`, bg: Colors.badgeNeutralBg, color: Colors.badgeNeutralText };
    }
    if (disp === 'do_not_call') {
      return { label: 'Do Not Call', bg: Colors.badgeDangerBg, color: Colors.badgeDangerText };
    }
    return { label: 'Ready to Call', bg: Colors.badgeNeutralBg, color: Colors.brandAccent };
  };

  // Scope leads based on Campaign & School & Priority filters (before Tab filter)
  const scopedLeads = leads.filter((l) => {
    if (selectedListId !== 'all' && l.list_id !== selectedListId) return false;
    if (selectedSchool !== 'all' && (l.school || 'VOL').toLowerCase().trim() !== selectedSchool.toLowerCase().trim()) return false;
    if (priorityFilter === 'fresh' && (l.priority_tier || 1) !== 1) return false;
    if (priorityFilter === 'legacy' && l.priority_tier !== 3) return false;
    return true;
  });

  // Stats calculation
  const totalCount = scopedLeads.length;

  // 'To Call': ONLY leads that have NOT been called at least once ever (0 attempts)
  const pendingCount = scopedLeads.filter((l) => !hasEverBeenCalled(l)).length;

  // 'Appts Set': Count of active scheduled educator appointments in the current pipeline
  const apptsInLeads = scopedLeads.filter((l) => l.last_disposition === 'appointment_set').length;

  // Historical voice call appointments set, deduplicated by unique educator ID (excluding standalone SMS)
  const scopedLeadIds = new Set(scopedLeads.map((l) => l.id));
  const uniqueApptLeadIdsInLogs = new Set(
    callLogs
      .filter(
        (log) =>
          log.disposition === 'appointment_set' &&
          !log.sms_sent &&
          Number(log.duration_seconds || 0) > 0 &&
          (selectedListId === 'all' && selectedSchool === 'all' && priorityFilter === 'all'
            ? true
            : scopedLeadIds.has(log.lead_id))
      )
      .map((log) => log.lead_id)
  );
  const appointmentCount = Math.max(uniqueApptLeadIdsInLogs.size, apptsInLeads);

  // 'Callbacks': Leads scheduled for a callback, removed once called back and answered (connected/spoke/appt/dnc/bad_number)
  const callbackCount = scopedLeads.filter((l) => {
    const isAnswered = ['appointment_set', 'connected', 'spoke', 'do_not_call', 'bad_number'].includes(l.last_disposition || '');
    if (isAnswered) return false;
    return l.last_disposition === 'callback_requested' || !!l.follow_up_at;
  }).length;

  const unansweredCount = scopedLeads.filter(
    (l) => ['no_answer', 'voicemail'].includes(l.last_disposition || '')
  ).length;

  // 'Spoke / Connected': Leads spoken with but not yet dispositioned as a booked appt
  const spokeCount = scopedLeads.filter(
    (l) => ['connected', 'spoke'].includes(l.last_disposition || '')
  ).length;

  // 'Clients': Converted clients in this scope
  const clientsCount = scopedLeads.filter((l) => Boolean(l.is_client)).length;

  // 'Callable' = all dialable leads (never called + unanswered/voicemail). Used to drive CTA button state.
  const callableCount = scopedLeads.filter(
    (l) => !l.last_disposition || ['pending', 'no_answer', 'voicemail'].includes(l.last_disposition)
  ).length;

  // Due SMS Drips & Annual Reviews for today
  const dueDrips = React.useMemo(() => {
    return DripDispatcherService.getDueDrips(scopedLeads, 'Alex');
  }, [scopedLeads]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.brandPrimary} />

      {/* App Header */}
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <Text style={styles.appTitle} numberOfLines={1}>SnapDialer</Text>
          <Text style={styles.appSubtitle} numberOfLines={1} ellipsizeMode="tail">ValuTeachers • FRS Pipeline</Text>
        </View>

        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.snapHeaderButton}
            onPress={() => navigation.navigate('ScanSheet')}
            accessibilityLabel="Scan report cards"
          >
            <Camera size={16} color={Colors.livingWhite} />
            <Text style={styles.snapHeaderButtonText}>Snap</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('PlanningHeatmap')}
            accessibilityLabel="Planning Heatmap"
          >
            <Calendar size={19} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleExportCsv}
            accessibilityLabel="Export CSV"
          >
            <Download size={19} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Analytics')}
            accessibilityLabel="Analytics"
          >
            <BarChart3 size={19} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel="Settings"
          >
            <Settings size={19} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Today's Advisor Action Cockpit */}
      <TodayCockpitCard
        leads={scopedLeads}
        dueDripsCount={dueDrips.length}
        onOpenDripModal={() => setDripModalVisible(true)}
        onNavigateLead={(leadId) => navigation.navigate('LeadDetail', { leadId })}
        onStartDialing={handleStartMasterQueue}
      />

      {/* KPI Stats Strip */}
      <View style={styles.statsRow}>
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
      </View>

      {/* Main Start Power Dialer CTA */}
      <View style={styles.ctaContainer}>
        <TouchableOpacity
          style={[styles.startQueueButton, callableCount === 0 && { backgroundColor: Colors.surfaceSubtle, borderColor: Colors.borderSubtle }]}
          onPress={handleStartMasterQueue}
          activeOpacity={0.8}
        >
          <View style={styles.phoneIconWrap}>
            <PhoneCall size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.startQueueTitle}>
              {callableCount > 0 ? 'Start Power Dialing Queue' : 'Calling Queue Complete'}
            </Text>
            <Text style={styles.startQueueSubtitle}>
              {callableCount > 0
                ? `${callableCount} educator${callableCount > 1 ? 's' : ''} ready for planning sit-downs`
                : 'All current leads contacted. Snap another card to add more.'}
            </Text>
          </View>
          <ChevronRight size={22} color="#FFFFFF" />
        </TouchableOpacity>

        {unansweredCount > 0 && (
          <TouchableOpacity style={styles.recycleButton} onPress={handleRecycleUnanswered}>
            <RotateCcw size={15} color={Colors.badgeWarningText} />
            <Text style={styles.recycleText}>
              Recycle {unansweredCount} Unanswered / Voicemail Lead{unansweredCount > 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Campaign List & Priority Selector Filter */}
      <View style={styles.campaignFilterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.campaignFilterScroll}>
          <TouchableOpacity
            style={[styles.campaignChip, selectedListId === 'all' && styles.campaignChipActive]}
            onPress={() => {
              HapticsService.tick();
              setSelectedListId('all');
            }}
          >
            <Layers size={13} color={selectedListId === 'all' ? '#FFFFFF' : Colors.brandAccent} />
            <Text style={[styles.campaignChipText, selectedListId === 'all' && styles.campaignChipTextActive]}>
              All Campaigns ({leads.length})
            </Text>
          </TouchableOpacity>

          {availableLists.map((lst) => {
            const count = leads.filter((l) => l.list_id === lst.id).length;
            return (
              <TouchableOpacity
                key={lst.id}
                style={[styles.campaignChip, selectedListId === lst.id && styles.campaignChipActive]}
                onPress={() => {
                  HapticsService.tick();
                  setSelectedListId(lst.id);
                }}
              >
                <Text style={[styles.campaignChipText, selectedListId === lst.id && styles.campaignChipTextActive]}>
                  {lst.title} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}

          <View style={styles.dividerVertical} />

          <TouchableOpacity
            style={[styles.tierFilterChip, priorityFilter === 'fresh' && styles.tierFilterChipActiveFresh]}
            onPress={() => {
              HapticsService.tick();
              setPriorityFilter(priorityFilter === 'fresh' ? 'all' : 'fresh');
            }}
          >
            <Flame size={12} color={priorityFilter === 'fresh' ? '#FFFFFF' : Colors.badgeWarningText} />
            <Text style={[styles.tierFilterChipText, priorityFilter === 'fresh' && styles.tierFilterChipTextActiveFresh]}>
              Fresh Only
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tierFilterChip, priorityFilter === 'legacy' && styles.tierFilterChipActiveLegacy]}
            onPress={() => {
              HapticsService.tick();
              setPriorityFilter(priorityFilter === 'legacy' ? 'all' : 'legacy');
            }}
          >
            <Archive size={12} color={priorityFilter === 'legacy' ? '#FFFFFF' : Colors.textMuted} />
            <Text style={[styles.tierFilterChipText, priorityFilter === 'legacy' && styles.tierFilterChipTextActiveLegacy]}>
              Legacy Only
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* School Campus Quick-Filter */}
      {availableSchools.length > 1 && (
        <View style={styles.schoolFilterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.schoolFilterScroll}>
            <TouchableOpacity
              style={[styles.schoolChip, selectedSchool === 'all' && styles.schoolChipActive]}
              onPress={() => {
                HapticsService.tick();
                setSelectedSchool('all');
              }}
            >
              <MapPin size={11} color={selectedSchool === 'all' ? '#FFFFFF' : Colors.brandAccent} />
              <Text style={[styles.schoolChipText, selectedSchool === 'all' && styles.schoolChipTextActive]}>
                All Campuses
              </Text>
            </TouchableOpacity>

            {availableSchools.map((item) => (
              <TouchableOpacity
                key={item.school}
                style={[styles.schoolChip, selectedSchool === item.school && styles.schoolChipActive]}
                onPress={() => {
                  HapticsService.tick();
                  setSelectedSchool(selectedSchool === item.school ? 'all' : item.school);
                }}
              >
                <Text style={[styles.schoolChipText, selectedSchool === item.school && styles.schoolChipTextActive]}>
                  🏫 {item.school} ({item.count})
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

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

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by teacher name, school (VOL), or room..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
          <TouchableOpacity
            style={[styles.tabChip, filterTab === 'all' && styles.tabChipActive]}
            onPress={() => setFilterTab('all')}
          >
            <Text style={[styles.tabChipText, filterTab === 'all' && styles.tabChipTextActive]}>
              All ({totalCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabChip, filterTab === 'pending' && styles.tabChipActive]}
            onPress={() => setFilterTab('pending')}
          >
            <Text style={[styles.tabChipText, filterTab === 'pending' && styles.tabChipTextActive]}>
              To Call ({pendingCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabChip, filterTab === 'appts' && styles.tabChipActive]}
            onPress={() => setFilterTab('appts')}
          >
            <Text style={[styles.tabChipText, filterTab === 'appts' && styles.tabChipTextActive]}>
              Appts Set ({apptsInLeads})
            </Text>
          </TouchableOpacity>
          {spokeCount > 0 && (
            <TouchableOpacity
              style={[styles.tabChip, filterTab === 'connected' && styles.tabChipActive]}
              onPress={() => setFilterTab('connected')}
            >
              <Text style={[styles.tabChipText, filterTab === 'connected' && styles.tabChipTextActive]}>
                Spoke ({spokeCount})
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.tabChip, filterTab === 'callback' && styles.tabChipActive]}
            onPress={() => setFilterTab('callback')}
          >
            <Text style={[styles.tabChipText, filterTab === 'callback' && styles.tabChipTextActive]}>
              Callbacks ({callbackCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabChip, filterTab === 'unanswered' && styles.tabChipActive]}
            onPress={() => setFilterTab('unanswered')}
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
              onPress={() => setFilterTab('clients')}
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

      {/* Lead Cards List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.heavenlyGold} />
          <Text style={styles.loadingText}>Loading educator pipeline...</Text>
        </View>
      ) : filteredLeads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <GraduationCap size={40} color={Colors.heavenlyGold} />
          </View>
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'No matching educators' : 'No educator leads in pipeline'}
          </Text>
          <Text style={styles.emptyDesc}>
            {searchQuery
              ? 'Try adjusting your search terms or filter.'
              : 'Tap "Snap Card" above to take a photo of an educator\'s ValuTeachers Report Card.'}
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => navigation.navigate('ScanSheet')}
          >
            <Camera size={20} color="#FFFFFF" />
            <Text style={styles.emptyButtonText}>Snap First Report Card</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredLeads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
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
                onPress={() => handleDialSingle(item)}
              >
                {/* Top Row: Name + Status */}
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1 }}>
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

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
                    onPress={() => handleDialSingle(item)}
                  >
                    <MessageSquare size={15} color={Colors.brandAccent} />
                    <Text style={[styles.cardActionBtnText, { color: Colors.brandAccent }]}>AI Text</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cardActionBtn, styles.callActionBtn]}
                    onPress={() => handleDialSingle(item)}
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
        title="Original ValuTeachers Report Card"
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
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceCard,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  statCard: {
    flex: 1,
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
  campaignFilterContainer: {
    marginTop: 12,
  },
  campaignFilterScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  campaignChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 6,
  },
  campaignChipActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  campaignChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  campaignChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dividerVertical: {
    width: 1,
    height: 20,
    backgroundColor: Colors.borderSubtle,
    marginHorizontal: 4,
  },
  tierFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 5,
  },
  tierFilterChipActiveFresh: {
    backgroundColor: Colors.brandAccent,
    borderColor: Colors.brandAccent,
  },
  tierFilterChipActiveLegacy: {
    backgroundColor: Colors.surfaceSubtle,
    borderColor: Colors.borderStrong,
  },
  tierFilterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tierFilterChipTextActiveFresh: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tierFilterChipTextActiveLegacy: {
    color: Colors.textSecondary,
    fontWeight: '800',
  },
  schoolFilterContainer: {
    marginTop: 6,
  },
  schoolFilterScroll: {
    paddingHorizontal: 16,
    gap: 6,
  },
  schoolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 4,
  },
  schoolChipActive: {
    backgroundColor: Colors.brandAccent,
    borderColor: Colors.brandAccent,
  },
  schoolChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  schoolChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceCard,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
  },
  tabsContainer: {
    marginTop: 10,
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
  leadCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
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
    backgroundColor: Colors.callActive,
    borderColor: Colors.callActive,
    justifyContent: 'center',
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
