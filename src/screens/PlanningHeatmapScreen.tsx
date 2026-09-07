import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  ArrowLeft,
  Calendar,
  Clock,
  School,
  User,
  PhoneCall,
  Download,
  Flame,
  CheckCircle2,
  CalendarCheck,
} from 'lucide-react-native';
import { LeadsRepository } from '../db/leadsRepository';
import { CalendarService } from '../services/calendarService';
import { HapticsService } from '../services/hapticsService';
import { TelephonyService } from '../services/telephonyService';
import { getScheduleForSchool, matchPeriodId } from '../data/bellSchedules';
import { Lead } from '../types';
import { Colors } from '../theme/colors';

export default function PlanningHeatmapScreen({ navigation }: any) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSchool, setSelectedSchool] = useState<string>('All');

  useEffect(() => {
    loadPlanningData();
  }, []);

  const loadPlanningData = async () => {
    try {
      const allLeads = await LeadsRepository.getAllLeads();
      setLeads(allLeads);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const schoolOptions = ['All', ...Array.from(new Set(leads.map((l) => l.school || 'VOL').filter(Boolean)))];
  const periods = getScheduleForSchool(selectedSchool === 'All' ? null : selectedSchool);

  // Find educators matching a given planning period
  const getLeadsForPeriod = (periodId: string) => {
    return leads.filter((l) => {
      if (selectedSchool !== 'All' && (l.school || 'VOL') !== selectedSchool) {
        return false;
      }
      return matchPeriodId(l.planning_period) === periodId;
    });
  };

  const apptLeads = leads.filter((l) => l.last_disposition === 'appointment_set');
  const totalSlotsCount = leads.filter((l) => Boolean(l.planning_period)).length;

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
        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>Planning Period Heatmap</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1} ellipsizeMode="tail">Weekly Classroom Sit-Down Availability</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => {
            HapticsService.tick();
            loadPlanningData();
          }}
        >
          <CalendarCheck size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* KPI Stats Bar */}
      <View style={styles.statsStrip}>
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: Colors.badgeSuccessText }]}>{apptLeads.length}</Text>
          <Text style={styles.statLabel}>🎯 Confirmed Sit-Downs</Text>
        </View>
        <View style={[styles.statBox, { borderLeftWidth: 1, borderLeftColor: Colors.borderSubtle }]}>
          <Text style={[styles.statNumber, { color: Colors.brandAccent }]}>{totalSlotsCount}</Text>
          <Text style={styles.statLabel}>Availability Slots</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.heavenlyGold} />
          <Text style={styles.loadingText}>Building Planning Grid...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 60 }}>
          {/* School Preset Filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {schoolOptions.map((sch) => (
                <TouchableOpacity
                  key={sch}
                  style={[
                    styles.schoolFilterPill,
                    selectedSchool === sch && styles.schoolFilterPillActive,
                  ]}
                  onPress={() => {
                    HapticsService.tick();
                    setSelectedSchool(sch);
                  }}
                >
                  <Text
                    style={[
                      styles.schoolFilterPillText,
                      selectedSchool === sch && styles.schoolFilterPillTextActive,
                    ]}
                  >
                    {sch === 'All' ? '🏫 All Campuses' : sch}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.sectionHeader}>SCHEDULE BY BELL SCHEDULE & PERIOD</Text>

          {periods.map((period) => {
            const periodLeads = getLeadsForPeriod(period.id);
            const confirmedInPeriod = periodLeads.filter((l) => l.last_disposition === 'appointment_set');

            return (
              <View key={period.id} style={styles.periodCard}>
                <View style={styles.periodHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Clock size={16} color={Colors.brandAccent} />
                    <Text style={styles.periodTitle}>{period.name}</Text>
                    <Text style={styles.periodTime}>({period.displayTime})</Text>
                  </View>
                  <View style={[styles.countBadge, confirmedInPeriod.length > 0 && styles.countBadgeConfirmed]}>
                    <Text style={[styles.countBadgeText, confirmedInPeriod.length > 0 && { color: Colors.badgeSuccessText }]}>
                      {periodLeads.length} Educators
                    </Text>
                  </View>
                </View>

                {periodLeads.length === 0 ? (
                  <Text style={styles.emptyPeriodText}>No educator cards mapped to this period yet.</Text>
                ) : (
                  <View style={styles.leadsGrid}>
                    {periodLeads.map((lead) => {
                      const isConfirmed = lead.last_disposition === 'appointment_set';

                      return (
                        <TouchableOpacity
                          key={lead.id}
                          style={[styles.leadPill, isConfirmed && styles.leadPillConfirmed]}
                          onPress={() => navigation.navigate('LeadDetail', { leadId: lead.id })}
                          activeOpacity={0.8}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.leadName, isConfirmed && styles.leadNameConfirmed]}>
                                {lead.name}
                              </Text>
                              {isConfirmed && <CheckCircle2 size={13} color={Colors.badgeSuccessText} />}
                            </View>
                            <Text style={styles.leadDetails}>
                              {lead.school || 'Campus'} • {lead.room_number ? `Room ${lead.room_number}` : 'Classroom'}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={styles.quickDialPill}
                            onPress={async () => {
                              await HapticsService.medium();
                              await TelephonyService.makeCall(lead.phone);
                              navigation.navigate('LeadDetail', { leadId: lead.id });
                            }}
                          >
                            <PhoneCall size={14} color="#FFFFFF" />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
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
    padding: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 11,
    color: Colors.focusRing,
    fontWeight: '600',
  },
  refreshButton: {
    padding: 6,
  },
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  statBox: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.badgeSuccessText,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.textMuted,
    marginTop: 10,
    fontSize: 13,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  schoolFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  schoolFilterPillActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  schoolFilterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  schoolFilterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  periodCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 12,
  },
  periodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  periodTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  periodTime: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  countBadge: {
    backgroundColor: Colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  countBadgeConfirmed: {
    backgroundColor: Colors.badgeSuccessBg,
    borderColor: Colors.badgeSuccessText,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  emptyPeriodText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  leadsGrid: {
    gap: 8,
  },
  leadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  leadPillConfirmed: {
    borderColor: Colors.badgeSuccessText,
    backgroundColor: Colors.badgeSuccessBg,
  },
  leadName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  leadNameConfirmed: {
    color: Colors.badgeSuccessText,
  },
  leadDetails: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  quickDialPill: {
    backgroundColor: Colors.callActive,
    padding: 8,
    borderRadius: 20,
    marginLeft: 8,
  },
});

