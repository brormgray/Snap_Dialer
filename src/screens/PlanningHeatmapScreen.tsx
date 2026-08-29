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
import { Lead } from '../types';
import { Colors } from '../theme/colors';

const PERIODS = [
  { id: 'p1', label: 'Period 1', time: '8:30 AM' },
  { id: 'p2', label: 'Period 2', time: '9:25 AM' },
  { id: 'p3', label: 'Period 3', time: '10:20 AM' },
  { id: 'p4', label: 'Period 4', time: '11:15 AM' },
  { id: 'p5', label: 'Period 5', time: '12:45 PM' },
  { id: 'p6', label: 'Period 6', time: '1:40 PM' },
  { id: 'p7', label: 'Period 7', time: '2:35 PM' },
  { id: 'after', label: 'After School', time: '3:30 PM' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export default function PlanningHeatmapScreen({ navigation }: any) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

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

  // Find educators matching a given planning period string
  const getLeadsForPeriod = (periodLabel: string) => {
    const pLower = periodLabel.toLowerCase();
    return leads.filter((l) => {
      const p = (l.planning_period || '').toLowerCase();
      if (!p) return false;
      if (pLower.includes('period 1') && (/\b(period\s*1|1st(\s*period)?|p1|per\s*1)\b/i.test(p) && !/\b(1[0-9]|21st|31st)\b/i.test(p))) return true;
      if (pLower.includes('period 2') && (/\b(period\s*2|2nd(\s*period)?|p2|per\s*2)\b/i.test(p) && !/\b(2[0-9]|12th)\b/i.test(p))) return true;
      if (pLower.includes('period 3') && (/\b(period\s*3|3rd(\s*period)?|p3|per\s*3)\b/i.test(p) && !/\b(13th|23rd)\b/i.test(p))) return true;
      if (pLower.includes('period 4') && (/\b(period\s*4|4th(\s*period)?|p4|per\s*4)\b/i.test(p) && !/\b(14th|24th)\b/i.test(p))) return true;
      if (pLower.includes('period 5') && (/\b(period\s*5|5th(\s*period)?|p5|per\s*5)\b/i.test(p) && !/\b(15th|25th)\b/i.test(p))) return true;
      if (pLower.includes('period 6') && (/\b(period\s*6|6th(\s*period)?|p6|per\s*6)\b/i.test(p) && !/\b(16th|26th)\b/i.test(p))) return true;
      if (pLower.includes('period 7') && (/\b(period\s*7|7th(\s*period)?|p7|per\s*7)\b/i.test(p) && !/\b(17th|27th)\b/i.test(p))) return true;
      if (pLower.includes('after') && (p.includes('after') || p.includes('dismissal') || /\b(3:[3-5]\d|[4-5]:\d\d|[4-5]\s*pm)\b/i.test(p))) return true;
      return false;
    });
  };

  const apptLeads = leads.filter((l) => l.last_disposition === 'appointment_set');
  const totalSlotsCount = leads.filter((l) => Boolean(l.planning_period)).length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.sacredGreenDeep} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={Colors.livingWhite} />
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
          <CalendarCheck size={20} color={Colors.heavenlyGold} />
        </TouchableOpacity>
      </View>

      {/* KPI Stats Bar */}
      <View style={styles.statsStrip}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{apptLeads.length}</Text>
          <Text style={styles.statLabel}>🎯 Confirmed Sit-Downs</Text>
        </View>
        <View style={[styles.statBox, { borderLeftWidth: 1, borderLeftColor: Colors.borderSubtle }]}>
          <Text style={[styles.statNumber, { color: Colors.deepSkyBlueLight }]}>{totalSlotsCount}</Text>
          <Text style={styles.statLabel}>Mapped Planning Periods</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.heavenlyGold} />
          <Text style={styles.loadingText}>Building Planning Grid...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 60 }}>
          <Text style={styles.sectionHeader}>SCHEDULE BY BELL SCHEDULE & PERIOD</Text>

          {PERIODS.map((period) => {
            const periodLeads = getLeadsForPeriod(period.label);
            const confirmedInPeriod = periodLeads.filter((l) => l.last_disposition === 'appointment_set');

            return (
              <View key={period.id} style={styles.periodCard}>
                <View style={styles.periodHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Clock size={16} color={Colors.heavenlyGold} />
                    <Text style={styles.periodTitle}>{period.label}</Text>
                    <Text style={styles.periodTime}>({period.time})</Text>
                  </View>
                  <View style={[styles.countBadge, confirmedInPeriod.length > 0 && styles.countBadgeConfirmed]}>
                    <Text style={[styles.countBadgeText, confirmedInPeriod.length > 0 && { color: Colors.sacredGreenDeep }]}>
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
                              {isConfirmed && <CheckCircle2 size={13} color={Colors.heavenlyGold} />}
                            </View>
                            <Text style={styles.leadDetails}>
                              {lead.school || 'Campus'} • {lead.room_number ? `Room ${lead.room_number}` : 'Classroom'}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={styles.quickDialPill}
                            onPress={() => {
                              HapticsService.medium();
                              TelephonyService.makeCall(lead.phone);
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
    backgroundColor: Colors.sacredGreenDeep,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  backButton: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.livingWhite,
  },
  headerSubtitle: {
    fontSize: 11,
    color: Colors.heavenlyGold,
    fontWeight: '600',
  },
  refreshButton: {
    padding: 6,
  },
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
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
    color: Colors.heavenlyGold,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textMuted,
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
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  periodCard: {
    backgroundColor: Colors.bgCard,
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
    color: Colors.livingWhite,
  },
  periodTime: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  countBadge: {
    backgroundColor: Colors.bgDark,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  countBadgeConfirmed: {
    backgroundColor: Colors.heavenlyGold,
    borderColor: Colors.heavenlyGold,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
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
    backgroundColor: Colors.bgDark,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  leadPillConfirmed: {
    borderColor: Colors.heavenlyGold,
    backgroundColor: 'rgba(218, 165, 32, 0.1)',
  },
  leadName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.livingWhite,
  },
  leadNameConfirmed: {
    color: Colors.heavenlyGold,
  },
  leadDetails: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  quickDialPill: {
    backgroundColor: Colors.sacredGreenLight,
    padding: 8,
    borderRadius: 20,
    marginLeft: 8,
  },
});

