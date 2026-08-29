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
} from 'react-native';
import { ArrowLeft, BarChart3, Download, PhoneCall, CheckCircle2, PhoneOff, MessageSquare, XCircle } from 'lucide-react-native';
import { CallLogsRepository } from '../db/callLogsRepository';
import { LeadsRepository } from '../db/leadsRepository';
import { Colors } from '../theme/colors';

export default function AnalyticsScreen({ navigation }: any) {
  const [stats, setStats] = useState({
    totalDials: 0,
    appointmentCount: 0,
    connectedCount: 0,
    noAnswerCount: 0,
    voicemailCount: 0,
    badNumberCount: 0,
    smsSentCount: 0,
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const summary = await CallLogsRepository.getAnalyticsSummary();
    setStats(summary);
  };

  const apptSetRate =
    stats.totalDials > 0
      ? Math.round((stats.appointmentCount / stats.totalDials) * 100)
      : 0;

  const connectedRate =
    stats.totalDials > 0
      ? Math.round((stats.connectedCount / stats.totalDials) * 100)
      : 0;

  const unansweredRate =
    stats.totalDials > 0
      ? Math.round(((stats.noAnswerCount + stats.voicemailCount) / stats.totalDials) * 100)
      : 0;

  const badNumberRate =
    stats.totalDials > 0
      ? Math.round((stats.badNumberCount / stats.totalDials) * 100)
      : 0;

  const handleExportData = async () => {
    try {
      const lists = await LeadsRepository.getAllLists();
      const exportJson = JSON.stringify({ lists, stats, exportedAt: new Date().toISOString() }, null, 2);
      await Share.share({
        title: 'SnapDialer_Export.json',
        message: exportJson,
      });
    } catch (e) {
      Alert.alert('Export Error', 'Could not export lead records.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.sacredGreenDeep} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={Colors.livingWhite} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Calling & Appointment KPIs</Text>
        <TouchableOpacity style={styles.exportButton} onPress={handleExportData}>
          <Download size={20} color={Colors.heavenlyGold} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Main Appointment Set Rate Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>APPOINTMENT CONVERSION ACCURACY</Text>
          <Text style={styles.heroValue}>{apptSetRate}%</Text>
          <Text style={styles.heroSubtext}>
            {stats.appointmentCount} confirmed appointment{stats.appointmentCount !== 1 ? 's' : ''} booked from {stats.totalDials} total voice outreach dials
          </Text>
        </View>

        {/* Visual Outcome Distribution Chart */}
        <Text style={styles.sectionHeader}>OUTCOME DISTRIBUTION & PIPELINE CURVE</Text>
        <View style={styles.chartCard}>
          {/* Multi-segment distribution bar */}
          <View style={styles.multiBar}>
            {apptSetRate > 0 && <View style={[styles.barSegment, { flex: apptSetRate, backgroundColor: Colors.heavenlyGold }]} />}
            {connectedRate > 0 && <View style={[styles.barSegment, { flex: connectedRate, backgroundColor: Colors.statusSitDownText }]} />}
            {unansweredRate > 0 && <View style={[styles.barSegment, { flex: unansweredRate, backgroundColor: Colors.textMuted }]} />}
            {badNumberRate > 0 && <View style={[styles.barSegment, { flex: badNumberRate, backgroundColor: Colors.statusDangerText }]} />}
            {stats.totalDials === 0 && <View style={[styles.barSegment, { flex: 1, backgroundColor: Colors.borderSubtle }]} />}
          </View>

          {/* Breakdown progress rows */}
          <View style={styles.chartRows}>
            <View style={styles.chartRow}>
              <View style={styles.chartRowHeader}>
                <View style={[styles.dotIndicator, { backgroundColor: Colors.heavenlyGold }]} />
                <Text style={styles.chartRowLabel}>Appointments Set</Text>
                <Text style={styles.chartRowValue}>{stats.appointmentCount} ({apptSetRate}%)</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${apptSetRate}%`, backgroundColor: Colors.heavenlyGold }]} />
              </View>
            </View>

            <View style={styles.chartRow}>
              <View style={styles.chartRowHeader}>
                <View style={[styles.dotIndicator, { backgroundColor: Colors.statusSitDownText }]} />
                <Text style={styles.chartRowLabel}>Spoke / Connected</Text>
                <Text style={styles.chartRowValue}>{stats.connectedCount} ({connectedRate}%)</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${connectedRate}%`, backgroundColor: Colors.statusSitDownText }]} />
              </View>
            </View>

            <View style={styles.chartRow}>
              <View style={styles.chartRowHeader}>
                <View style={[styles.dotIndicator, { backgroundColor: Colors.textMuted }]} />
                <Text style={styles.chartRowLabel}>No Answer / Voicemail</Text>
                <Text style={styles.chartRowValue}>{stats.noAnswerCount + stats.voicemailCount} ({unansweredRate}%)</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${unansweredRate}%`, backgroundColor: Colors.textMuted }]} />
              </View>
            </View>

            {stats.badNumberCount > 0 && (
              <View style={styles.chartRow}>
                <View style={styles.chartRowHeader}>
                  <View style={[styles.dotIndicator, { backgroundColor: Colors.statusDangerText }]} />
                  <Text style={styles.chartRowLabel}>Bad / Disconnected Numbers</Text>
                  <Text style={styles.chartRowValue}>{stats.badNumberCount} ({badNumberRate}%)</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressBar, { width: `${badNumberRate}%`, backgroundColor: Colors.statusDangerText }]} />
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Breakdown Metric Grid */}
        <Text style={styles.sectionHeader}>CALL OUTCOME BREAKDOWN</Text>
        <View style={styles.grid}>
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: Colors.heavenlyGoldMuted }]}>
              <PhoneCall size={20} color={Colors.heavenlyGold} />
            </View>
            <Text style={styles.statNumber}>{stats.totalDials}</Text>
            <Text style={styles.statTitle}>Total Dials</Text>
          </View>

          <View style={[styles.statCard, { borderColor: Colors.borderGold, borderWidth: 1.5 }]}>
            <View style={[styles.statIconBox, { backgroundColor: Colors.heavenlyGoldMuted }]}>
              <CheckCircle2 size={20} color={Colors.heavenlyGold} />
            </View>
            <Text style={[styles.statNumber, { color: Colors.heavenlyGold }]}>
              {stats.appointmentCount}
            </Text>
            <Text style={[styles.statTitle, { color: Colors.heavenlyGold, fontWeight: '800' }]}>Appts. Set</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: Colors.statusSitDownBg }]}>
              <CheckCircle2 size={20} color={Colors.statusSitDownText} />
            </View>
            <Text style={[styles.statNumber, { color: Colors.statusSitDownText }]}>
              {stats.connectedCount}
            </Text>
            <Text style={styles.statTitle}>Spoke / Connected</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: Colors.bgDark }]}>
              <PhoneOff size={20} color={Colors.textMuted} />
            </View>
            <Text style={styles.statNumber}>{stats.noAnswerCount + stats.voicemailCount}</Text>
            <Text style={styles.statTitle}>No Answer / VM</Text>
          </View>
        </View>

        {/* SMS Performance Card */}
        <View style={styles.smsBanner}>
          <View style={[styles.statIconBox, { backgroundColor: Colors.deepSkyBlueMuted, marginRight: 16, marginBottom: 0 }]}>
            <MessageSquare size={22} color={Colors.deepSkyBlueLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.smsBannerTitle}>{stats.smsSentCount} Follow-Up Texts Sent</Text>
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
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.heavenlyGold,
  },
  exportButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  heroCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 24,
  },
  heroLabel: {
    color: Colors.heavenlyGold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  heroValue: {
    fontSize: 48,
    fontWeight: '900',
    color: Colors.statusSitDownText,
    marginTop: 6,
  },
  heroSubtext: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  sectionHeader: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors.bgCard,
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
    color: Colors.livingWhite,
  },
  statTitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  smsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 18,
    marginTop: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  smsBannerTitle: {
    color: Colors.livingWhite,
    fontSize: 16,
    fontWeight: '700',
  },
  smsBannerSub: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  chartCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 24,
  },
  multiBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: Colors.bgDark,
  },
  barSegment: {
    height: '100%',
  },
  chartRows: {
    gap: 12,
  },
  chartRow: {
    gap: 4,
  },
  chartRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  chartRowLabel: {
    fontSize: 12,
    color: Colors.livingWhite,
    flex: 1,
  },
  chartRowValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.bgDark,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
});
