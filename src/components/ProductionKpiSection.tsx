import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Award, TrendingUp, DollarSign, Users, Briefcase } from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { HapticsService } from '../services/hapticsService';
import { Lead } from '../types';

export type TimeHorizon = 'today' | 'this_week' | 'this_month' | 'ytd' | 'all_time';

interface ProductionKpiSectionProps {
  leads: Lead[];
}

export function ProductionKpiSection({ leads }: ProductionKpiSectionProps) {
  const [horizon, setHorizon] = useState<TimeHorizon>('all_time');

  const filteredClients = useMemo(() => {
    const clients = leads.filter((l) => l.is_client);
    if (horizon === 'all_time') return clients;

    const now = new Date();
    let cutoff: Date;

    switch (horizon) {
      case 'today': {
        try {
          const nyDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
          cutoff = new Date(`${nyDateStr}T00:00:00`);
        } catch {
          cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        }
        break;
      }
      case 'this_week': {
        const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0);
        break;
      }
      case 'this_month':
        cutoff = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        break;
      case 'ytd':
        cutoff = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
        break;
      default:
        return clients;
    }

    const cutoffMs = cutoff.getTime();

    return clients.filter((c) => {
      // Prioritize client_since, then policy_effective_date, then created_at
      const dateStr = c.client_since || c.policy_effective_date || c.created_at;
      if (!dateStr) return false;
      const normalizedStr = dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr;
      const parsedMs = new Date(normalizedStr).getTime();
      return !isNaN(parsedMs) && parsedMs >= cutoffMs;
    });
  }, [leads, horizon]);

  const stats = useMemo(() => {
    let totalAP = 0;
    let totalTransfer = 0;
    const clientCount = filteredClients.length;

    for (const client of filteredClients) {
      if (client.annualized_premium && !isNaN(client.annualized_premium)) {
        totalAP += Number(client.annualized_premium);
      }
      if (client.transfer_assets_volume && !isNaN(client.transfer_assets_volume)) {
        totalTransfer += Number(client.transfer_assets_volume);
      }
    }

    const avgAP = clientCount > 0 ? Math.round(totalAP / clientCount) : 0;

    return {
      totalAP,
      totalTransfer,
      clientCount,
      avgAP,
    };
  }, [filteredClients]);

  const formatCurrency = (val: number): string => {
    if (val >= 1000000) {
      return `$${(val / 1000000).toFixed(2)}M`;
    }
    return `$${val.toLocaleString('en-US')}`;
  };

  const HORIZON_OPTIONS: { id: TimeHorizon; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'this_week', label: 'This Week' },
    { id: 'this_month', label: 'Month' },
    { id: 'ytd', label: 'YTD' },
    { id: 'all_time', label: 'All Time' },
  ];

  return (
    <View style={styles.container}>
      {/* Header & Horizon Pills */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <TrendingUp size={16} color={Colors.heavenlyGold} />
          <Text style={styles.sectionTitle} numberOfLines={1} ellipsizeMode="tail">ADVISOR PRODUCTION LEDGER</Text>
        </View>
        <View style={styles.clientCounterBadge}>
          <Award size={13} color="#10B981" />
          <Text style={styles.clientCounterText}>{stats.clientCount} Active Clients</Text>
        </View>
      </View>

      {/* Time Horizon Selector */}
      <View style={styles.horizonBar}>
        {HORIZON_OPTIONS.map((opt) => {
          const isActive = horizon === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.horizonBtn, isActive && styles.horizonBtnActive]}
              onPress={() => {
                HapticsService.tick();
                setHorizon(opt.id);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.horizonText, isActive && styles.horizonTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 4 Metric Cards in 2x2 Grid */}
      <View style={styles.grid}>
        {/* Total Annualized Premium */}
        <View style={[styles.metricCard, styles.cardGoldGlow]}>
          <View style={styles.metricHeader}>
            <DollarSign size={15} color={Colors.heavenlyGold} />
            <Text style={styles.metricLabel}>TOTAL AP (FLOW)</Text>
          </View>
          <Text style={[styles.metricValue, { color: Colors.heavenlyGold }]}>
            {formatCurrency(stats.totalAP)}
          </Text>
          <Text style={styles.metricSub}>Annual ongoing premium</Text>
        </View>

        {/* Total Transfer / Rollover Volume */}
        <View style={[styles.metricCard, styles.cardCyanGlow]}>
          <View style={styles.metricHeader}>
            <Briefcase size={15} color="#38BDF8" />
            <Text style={styles.metricLabel}>TRANSFER VOLUME</Text>
          </View>
          <Text style={[styles.metricValue, { color: '#38BDF8' }]}>
            {formatCurrency(stats.totalTransfer)}
          </Text>
          <Text style={styles.metricSub}>Lump sum & rollover assets</Text>
        </View>

        {/* Clients Converted */}
        <View style={[styles.metricCard, styles.cardEmeraldGlow]}>
          <View style={styles.metricHeader}>
            <Users size={15} color="#10B981" />
            <Text style={styles.metricLabel}>CONVERTED CLIENTS</Text>
          </View>
          <Text style={[styles.metricValue, { color: '#10B981' }]}>
            {stats.clientCount}
          </Text>
          <Text style={styles.metricSub}>
            {horizon === 'all_time' ? 'Total portfolio' : 'In selected horizon'}
          </Text>
        </View>

        {/* Avg AP / Client */}
        <View style={[styles.metricCard, styles.cardPurpleGlow]}>
          <View style={styles.metricHeader}>
            <TrendingUp size={15} color="#A78BFA" />
            <Text style={styles.metricLabel}>AVG AP / CLIENT</Text>
          </View>
          <Text style={[styles.metricValue, { color: '#A78BFA' }]}>
            {formatCurrency(stats.avgAP)}
          </Text>
          <Text style={styles.metricSub}>Per converted educator</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.25)',
    padding: 16,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 8,
  },
  sectionTitle: {
    color: Colors.heavenlyGold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  clientCounterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexShrink: 0,
  },
  clientCounterText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  horizonBar: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
    gap: 2,
  },
  horizonBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  horizonBtnActive: {
    backgroundColor: Colors.heavenlyGold,
  },
  horizonText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  horizonTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  cardGoldGlow: {
    borderColor: 'rgba(212, 160, 23, 0.3)',
    backgroundColor: 'rgba(212, 160, 23, 0.05)',
  },
  cardCyanGlow: {
    borderColor: 'rgba(56, 189, 248, 0.3)',
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
  },
  cardEmeraldGlow: {
    borderColor: 'rgba(16, 185, 129, 0.3)',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  cardPurpleGlow: {
    borderColor: 'rgba(167, 139, 250, 0.3)',
    backgroundColor: 'rgba(167, 139, 250, 0.05)',
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metricLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 2,
  },
  metricSub: {
    color: Colors.textMuted,
    fontSize: 10,
  },
});
