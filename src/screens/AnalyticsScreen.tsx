import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  ArrowLeft,
  BarChart3,
  Download,
  PhoneCall,
  CheckCircle2,
  PhoneOff,
  MessageSquare,
  XCircle,
  TrendingUp,
  Target,
  Clock,
  Flame,
  Users,
  Calendar,
  Sparkles,
  HelpCircle,
  GraduationCap,
} from 'lucide-react-native';
import { CallLogsRepository } from '../db/callLogsRepository';
import { LeadsRepository } from '../db/leadsRepository';
import { Colors } from '../theme/colors';
import { Lead } from '../types';
import { ProductionKpiSection } from '../components/ProductionKpiSection';

export default function AnalyticsScreen({ navigation }: any) {
  const [data, setData] = useState<any>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [res, allLeads] = await Promise.all([
        CallLogsRepository.getComprehensiveAnalytics(),
        LeadsRepository.getAllLeads(),
      ]);
      setData(res);
      setLeads(allLeads);
    } catch (e) {
      console.error('Error loading comprehensive analytics:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportData = async () => {
    try {
      const lists = await LeadsRepository.getAllLists();
      const exportJson = JSON.stringify({ lists, analytics: data, exportedAt: new Date().toISOString() }, null, 2);
      const filename = `SnapDialer_Agency_Analytics_${new Date().toISOString().slice(0, 10)}.json`;

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const blob = new Blob([exportJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      await Share.share({
        title: filename,
        message: exportJson,
      });
    } catch (e) {
      Alert.alert('Export Error', 'Could not export analytics records.');
    }
  };

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.brandPrimary} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.brandAccent} />
          <Text style={styles.loadingText}>Computing Agency Velocity Analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { summary, ratios, weekly, hourlyStats } = data;

  // Find peak hour
  const hoursWithCalls = hourlyStats.filter((h: any) => h.dials > 0);
  const peakHour = hoursWithCalls.length > 0
    ? [...hoursWithCalls].sort((a: any, b: any) => {
        if (b.contactRate !== a.contactRate) return b.contactRate - a.contactRate;
        return b.dials - a.dials;
      })[0]
    : null;

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
        <Text style={styles.headerTitle}>Agency Operations & Ratios</Text>
        <TouchableOpacity style={styles.exportButton} onPress={handleExportData}>
          <Download size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 50 }}>
        {/* Advisor Production Ledger (AP & Assets) */}
        <ProductionKpiSection leads={leads} />

        {/* Main Sit-Down Conversion Ratio Card */}
        <View style={styles.heroCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Target size={18} color={Colors.brandAccent} />
            <Text style={styles.heroLabel}>SIT-DOWN CONVERSION ACCURACY</Text>
          </View>
          <Text style={styles.heroValue}>{ratios.dialToApptRate}%</Text>
          <Text style={styles.heroSubtext}>
            {summary.appointmentCount} confirmed appointment{summary.appointmentCount !== 1 ? 's' : ''} booked across {summary.totalDials} total outreach dials
          </Text>

          {/* Velocity Triad */}
          <View style={styles.velocityTriad}>
            <View style={styles.triadItem}>
              <Text style={styles.triadValue}>{ratios.dialsPerSitDown || '—'}</Text>
              <Text style={styles.triadLabel}>Dials / Sit-Down</Text>
            </View>
            <View style={[styles.triadItem, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.borderSubtle }]}>
              <Text style={styles.triadValue}>{ratios.contactRate}%</Text>
              <Text style={styles.triadLabel}>Connection Rate</Text>
            </View>
            <View style={styles.triadItem}>
              <Text style={styles.triadValue}>{ratios.convToApptRate}%</Text>
              <Text style={styles.triadLabel}>Close-to-Appt Rate</Text>
            </View>
          </View>
        </View>

        {/* Weekly Cohort Velocity Comparison */}
        <Text style={styles.sectionHeader}>WEEKLY MOMENTUM & VELOCITY (COHORT COMPARISON)</Text>
        <View style={styles.weeklyCard}>
          <View style={styles.weeklyRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.weeklyLabel}>OUTREACH DIALS</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <Text style={styles.weeklyValueCurrent}>{weekly.dialsThisWeek}</Text>
                <Text style={styles.weeklyValuePrior}>vs {weekly.dialsLastWeek} prior wk</Text>
              </View>
            </View>
            <View style={[styles.trendBadge, weekly.dialsThisWeek >= weekly.dialsLastWeek ? styles.trendUp : styles.trendNeutral]}>
              <TrendingUp size={14} color={weekly.dialsThisWeek >= weekly.dialsLastWeek ? Colors.badgeSuccessText : Colors.textMuted} />
              <Text style={[styles.trendText, weekly.dialsThisWeek >= weekly.dialsLastWeek && { color: Colors.badgeSuccessText }]}>
                {weekly.dialsThisWeek >= weekly.dialsLastWeek ? 'Pacing Up' : 'Active'}
              </Text>
            </View>
          </View>

          <View style={styles.weeklyDivider} />

          <View style={styles.weeklyRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.weeklyLabel}>SIT-DOWNS BOOKED</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <Text style={[styles.weeklyValueCurrent, { color: Colors.badgeSuccessText }]}>{weekly.apptsThisWeek}</Text>
                <Text style={styles.weeklyValuePrior}>vs {weekly.apptsLastWeek} prior wk</Text>
              </View>
            </View>
            <View style={[styles.trendBadge, weekly.apptsThisWeek >= weekly.apptsLastWeek ? styles.trendUp : styles.trendNeutral]}>
              <CheckCircle2 size={14} color={weekly.apptsThisWeek >= weekly.apptsLastWeek ? Colors.badgeSuccessText : Colors.textMuted} />
              <Text style={[styles.trendText, weekly.apptsThisWeek >= weekly.apptsLastWeek && { color: Colors.badgeSuccessText }]}>
                {weekly.apptsThisWeek} Booked
              </Text>
            </View>
          </View>
        </View>

        {/* Agency Funnel Velocity */}
        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>AGENCY CONVERSION FUNNEL VELOCITY</Text>
        <View style={styles.funnelCard}>
          <View style={styles.funnelStep}>
            <View style={styles.funnelIconCol}>
              <View style={[styles.funnelIconBox, { backgroundColor: Colors.surfaceSubtle }]}>
                <PhoneCall size={18} color={Colors.brandAccent} />
              </View>
              <View style={styles.funnelLine} />
            </View>
            <View style={styles.funnelContent}>
              <View style={styles.funnelRow}>
                <Text style={styles.funnelTitle}>Outreach Dials</Text>
                <Text style={styles.funnelCount}>{summary.totalDials}</Text>
              </View>
              <Text style={styles.funnelSub}>Total teacher attempts across campaign lists</Text>
            </View>
          </View>

          <View style={styles.funnelStep}>
            <View style={styles.funnelIconCol}>
              <View style={[styles.funnelIconBox, { backgroundColor: Colors.badgeSuccessBg }]}>
                <Users size={18} color={Colors.badgeSuccessText} />
              </View>
              <View style={styles.funnelLine} />
            </View>
            <View style={styles.funnelContent}>
              <View style={styles.funnelRow}>
                <Text style={styles.funnelTitle}>Spoke / Connected</Text>
                <Text style={[styles.funnelCount, { color: Colors.badgeSuccessText }]}>
                  {summary.connectedCount + summary.appointmentCount} ({ratios.contactRate}%)
                </Text>
              </View>
              <Text style={styles.funnelSub}>Live two-way conversations with teachers</Text>
            </View>
          </View>

          <View style={styles.funnelStep}>
            <View style={styles.funnelIconCol}>
              <View style={[styles.funnelIconBox, { backgroundColor: Colors.badgeSuccessBg }]}>
                <Target size={18} color={Colors.badgeSuccessText} />
              </View>
              <View style={styles.funnelLine} />
            </View>
            <View style={styles.funnelContent}>
              <View style={styles.funnelRow}>
                <Text style={styles.funnelTitle}>Sit-Downs Confirmed</Text>
                <Text style={[styles.funnelCount, { color: Colors.badgeSuccessText }]}>
                  {summary.appointmentCount} ({ratios.dialToApptRate}%)
                </Text>
              </View>
              <Text style={styles.funnelSub}>Scheduled in classroom or during planning</Text>
            </View>
          </View>

          <View style={[styles.funnelStep, { marginBottom: 0 }]}>
            <View style={styles.funnelIconCol}>
              <View style={[styles.funnelIconBox, { backgroundColor: Colors.badgeWarningBg }]}>
                <GraduationCap size={18} color={Colors.badgeWarningText} />
              </View>
            </View>
            <View style={styles.funnelContent}>
              <View style={styles.funnelRow}>
                <Text style={styles.funnelTitle}>FRS & DROP Review Inquiries</Text>
                <Text style={[styles.funnelCount, { color: Colors.badgeWarningText }]}>
                  {summary.dropInquiriesCount}
                </Text>
              </View>
              <Text style={styles.funnelSub}>Teachers with 20+ yrs FRS or DROP questions on file</Text>
            </View>
          </View>
        </View>

        {/* Best Time to Call Heatmap */}
        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>BEST TIME TO CALL (HOURLY CONTACT HEATMAP)</Text>
        <View style={styles.card}>
          {peakHour && peakHour.contactRate > 0 ? (
            <View style={styles.peakBanner}>
              <Clock size={16} color={Colors.badgeSuccessText} />
              <Text style={styles.peakText}>
                ⚡ Peak Response Window: <Text style={{ fontWeight: '800' }}>{peakHour.label}</Text> ({peakHour.contactRate}% contact rate)
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: 13, color: Colors.textMuted, marginBottom: 12 }}>
              Calling activity will automatically identify the highest-response windows across Volusia schools.
            </Text>
          )}

          <View style={styles.hourlyContainer}>
            {hourlyStats.map((item: any) => {
              const hasData = item.dials > 0;
              return (
                <View key={item.hour} style={styles.hourlyRow}>
                  <Text style={styles.hourlyHourLabel}>{item.label}</Text>
                  <View style={styles.hourlyTrack}>
                    <View
                      style={[
                        styles.hourlyBar,
                        {
                          width: `${Math.max(item.contactRate, hasData ? 6 : 0)}%`,
                          backgroundColor:
                            peakHour && peakHour.hour === item.hour && peakHour.contactRate > 0
                              ? Colors.callActive
                              : hasData
                              ? Colors.brandAccent
                              : Colors.borderSubtle,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.hourlyRateText}>
                    {hasData ? `${item.contactRate}% (${item.dials}d)` : '—'}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Breakdown Metric Grid */}
        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>CALL OUTCOME BREAKDOWN</Text>
        <View style={styles.grid}>
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: Colors.surfaceSubtle }]}>
              <PhoneCall size={20} color={Colors.brandPrimary} />
            </View>
            <Text style={styles.statNumber}>{summary.totalDials}</Text>
            <Text style={styles.statTitle}>Total Dials</Text>
          </View>

          <View style={[styles.statCard, { borderColor: Colors.badgeSuccessText, borderWidth: 1.5 }]}>
            <View style={[styles.statIconBox, { backgroundColor: Colors.badgeSuccessBg }]}>
              <CheckCircle2 size={20} color={Colors.badgeSuccessText} />
            </View>
            <Text style={[styles.statNumber, { color: Colors.badgeSuccessText }]}>
              {summary.appointmentCount}
            </Text>
            <Text style={[styles.statTitle, { color: Colors.badgeSuccessText, fontWeight: '800' }]}>Appts. Set</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: Colors.badgeSuccessBg }]}>
              <CheckCircle2 size={20} color={Colors.badgeSuccessText} />
            </View>
            <Text style={[styles.statNumber, { color: Colors.badgeSuccessText }]}>
              {summary.connectedCount}
            </Text>
            <Text style={styles.statTitle}>Spoke / Connected</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: Colors.badgeNeutralBg }]}>
              <PhoneOff size={20} color={Colors.badgeNeutralText} />
            </View>
            <Text style={styles.statNumber}>{summary.noAnswerCount + summary.voicemailCount}</Text>
            <Text style={styles.statTitle}>No Answer / VM</Text>
          </View>
        </View>

        {/* SMS Performance Card */}
        <View style={styles.smsBanner}>
          <View style={[styles.statIconBox, { backgroundColor: Colors.surfaceSubtle, marginRight: 16, marginBottom: 0 }]}>
            <MessageSquare size={22} color={Colors.brandAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.smsBannerTitle}>{summary.smsSentCount} Follow-Up Texts Sent</Text>
            <Text style={styles.smsBannerSub}>AI personalized & cadence messages delivered</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgApp,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: 12,
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
  exportButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  heroCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 20,
  },
  heroLabel: {
    color: Colors.brandAccent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroValue: {
    fontSize: 48,
    fontWeight: '900',
    color: Colors.badgeSuccessText,
    marginTop: 4,
  },
  heroSubtext: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  velocityTriad: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  triadItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  triadValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  triadLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  weeklyCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  weeklyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weeklyLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.8,
  },
  weeklyValueCurrent: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  weeklyValuePrior: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  weeklyDivider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginVertical: 12,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  trendUp: {
    backgroundColor: Colors.badgeSuccessBg,
  },
  trendNeutral: {
    backgroundColor: Colors.surfaceSubtle,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.badgeSuccessText,
  },
  sectionHeader: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },
  funnelCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  funnelStep: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  funnelIconCol: {
    alignItems: 'center',
    marginRight: 12,
  },
  funnelIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  funnelLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.borderSubtle,
    marginVertical: 4,
  },
  funnelContent: {
    flex: 1,
    paddingBottom: 14,
  },
  funnelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  funnelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  funnelCount: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  funnelSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  peakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.badgeSuccessBg,
    borderWidth: 1,
    borderColor: Colors.badgeSuccessText,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  peakText: {
    fontSize: 12,
    color: Colors.badgeSuccessText,
    fontWeight: '600',
  },
  hourlyContainer: {
    gap: 8,
  },
  hourlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hourlyHourLabel: {
    width: 52,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  hourlyTrack: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 4,
    overflow: 'hidden',
  },
  hourlyBar: {
    height: '100%',
    borderRadius: 4,
  },
  hourlyRateText: {
    width: 68,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'right',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '47%',
    minWidth: 130,
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  statIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statTitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  smsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    padding: 18,
    marginTop: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  smsBannerTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  smsBannerSub: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
});
