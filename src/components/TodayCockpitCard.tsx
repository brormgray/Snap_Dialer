import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { Calendar, PhoneCall, MessageSquare, Clock, MapPin, ChevronRight, Zap, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { HapticsService } from '../services/hapticsService';
import { Lead } from '../types';
import { isTeacherInPlanningNow } from '../data/bellSchedules';
import { PipelineStateService } from '../services/pipelineStateService';

interface TodayCockpitCardProps {
  leads: Lead[];
  dueDripsCount: number;
  onOpenDripModal: () => void;
  onNavigateLead: (leadId: string) => void;
  onStartDialing: () => void;
  onFilterDispoDue?: () => void;
  onFilterAppts?: () => void;
}

export function TodayCockpitCard({
  leads,
  dueDripsCount,
  onOpenDripModal,
  onNavigateLead,
  onStartDialing,
  onFilterDispoDue,
  onFilterAppts,
}: TodayCockpitCardProps) {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const now = useMemo(() => new Date(), [leads]);

  // Strictly upcoming confirmed sit-downs scheduled for TODAY
  const todaySitDowns = useMemo(() => {
    return leads.filter((l) => PipelineStateService.isUpcomingAppointmentToday(l, now));
  }, [leads, now]);

  // All upcoming confirmed sit-downs across the pipeline
  const allUpcomingSitDowns = useMemo(() => {
    return leads.filter((l) => PipelineStateService.isUpcomingAppointment(l, now));
  }, [leads, now]);

  // Sit-downs that need disposition (window ended and no outcome logged)
  const dispoNeededLeads = useMemo(() => {
    return leads.filter((l) => PipelineStateService.isDispoNeeded(l, now));
  }, [leads, now]);

  // Callbacks scheduled for today or past due
  const callbacksDue = useMemo(() => {
    return leads.filter((l) => {
      if (['connected', 'spoke', 'do_not_call', 'bad_number', 'appointment_set'].includes(l.last_disposition || '')) return false;
      if (l.last_disposition === 'callback_requested' || l.follow_up_at) {
        if (l.follow_up_at) {
          return l.follow_up_at.slice(0, 10) <= todayStr;
        }
        return l.last_disposition === 'callback_requested';
      }
      return false;
    });
  }, [leads, todayStr]);

  // Fresh Tier 1 leads waiting to be called
  const freshWaitingCount = useMemo(() => {
    return leads.filter(
      (l) => (l.priority_tier || 1) === 1 && (!l.last_disposition || l.last_disposition === 'pending')
    ).length;
  }, [leads]);

  const totalCallsDue = callbacksDue.length + freshWaitingCount;

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height && height < 550;
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);
  const isCollapsed = userCollapsed !== null ? userCollapsed : isLandscape;

  return (
    <View style={styles.card}>
      {/* Cockpit Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Zap size={16} color={Colors.heavenlyGold} />
          <Text style={styles.headerTitle}>TODAY'S ADVISOR PLAYBOOK</Text>
          {dispoNeededLeads.length > 0 && isCollapsed && (
            <TouchableOpacity
              style={styles.dispoMiniBadge}
              onPress={() => {
                HapticsService.medium();
                if (onFilterDispoDue) onFilterDispoDue();
              }}
            >
              <Text style={styles.dispoMiniBadgeText}>⚠️ {dispoNeededLeads.length} Due</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.todayDateText}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </Text>
          <TouchableOpacity
            style={styles.collapseToggleBtn}
            onPress={() => {
              HapticsService.tick();
              setUserCollapsed(!isCollapsed);
            }}
            accessibilityLabel={isCollapsed ? 'Expand playbook' : 'Collapse playbook'}
          >
            <Text style={styles.collapseToggleText}>{isCollapsed ? 'Show' : 'Hide'}</Text>
            {isCollapsed ? (
              <ChevronDown size={14} color={Colors.heavenlyGold} />
            ) : (
              <ChevronUp size={14} color={Colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {isCollapsed ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collapsedSummaryRow}>
          <TouchableOpacity
            style={styles.collapsedSummaryItem}
            onPress={() => {
              HapticsService.tick();
              onStartDialing();
            }}
          >
            <PhoneCall size={12} color="#38BDF8" />
            <Text style={[styles.collapsedSummaryText, { color: '#38BDF8' }]}>
              {totalCallsDue} Calls Due
            </Text>
          </TouchableOpacity>

          <Text style={styles.collapsedDot}>•</Text>

          <TouchableOpacity
            style={styles.collapsedSummaryItem}
            onPress={() => {
              HapticsService.medium();
              onOpenDripModal();
            }}
          >
            <MessageSquare size={12} color={dueDripsCount > 0 ? Colors.heavenlyGold : Colors.textMuted} />
            <Text style={[styles.collapsedSummaryText, { color: dueDripsCount > 0 ? Colors.heavenlyGold : Colors.textMuted }]}>
              {dueDripsCount} Drip{dueDripsCount !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>

          <Text style={styles.collapsedDot}>•</Text>

          <TouchableOpacity
            style={styles.collapsedSummaryItem}
            onPress={() => {
              HapticsService.tick();
              if (onFilterAppts) onFilterAppts();
            }}
          >
            <Calendar size={12} color="#10B981" />
            <Text style={[styles.collapsedSummaryText, { color: '#10B981' }]}>
              {todaySitDowns.length} Sit-Down{todaySitDowns.length !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>

          {dispoNeededLeads.length > 0 && (
            <>
              <Text style={styles.collapsedDot}>•</Text>
              <TouchableOpacity
                style={[styles.collapsedSummaryItem, styles.collapsedAlertItem]}
                onPress={() => {
                  HapticsService.medium();
                  if (onFilterDispoDue) onFilterDispoDue();
                }}
              >
                <Clock size={12} color="#D97706" />
                <Text style={[styles.collapsedSummaryText, { color: '#D97706', fontWeight: '800' }]}>
                  {dispoNeededLeads.length} Dispo Due!
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      ) : (
        <>
          {/* Triad Metric Summary */}
      <View style={styles.triadContainer}>
        {/* Metric 1: Calls Due */}
        <TouchableOpacity
          style={styles.triadBox}
          onPress={() => {
            HapticsService.tick();
            onStartDialing();
          }}
          activeOpacity={0.8}
        >
          <View style={styles.triadTop}>
            <PhoneCall size={14} color="#38BDF8" />
            <Text style={[styles.triadNumber, { color: '#38BDF8' }]}>{totalCallsDue}</Text>
          </View>
          <Text style={styles.triadLabel}>Calls Due</Text>
          <Text style={styles.triadSub}>
            {callbacksDue.length > 0 ? `${callbacksDue.length} callback${callbacksDue.length !== 1 ? 's' : ''}` : 'Fresh queue'}
          </Text>
        </TouchableOpacity>

        {/* Metric 2: Drips Due */}
        <TouchableOpacity
          style={[styles.triadBox, dueDripsCount > 0 && styles.triadBoxActiveGold]}
          onPress={() => {
            HapticsService.medium();
            onOpenDripModal();
          }}
          activeOpacity={0.8}
        >
          <View style={styles.triadTop}>
            <MessageSquare size={14} color={dueDripsCount > 0 ? Colors.heavenlyGold : Colors.textMuted} />
            <Text
              style={[
                styles.triadNumber,
                { color: dueDripsCount > 0 ? Colors.heavenlyGold : Colors.textMuted },
              ]}
            >
              {dueDripsCount}
            </Text>
          </View>
          <Text style={styles.triadLabel}>Drips Ready</Text>
          <Text style={styles.triadSub}>
            {dueDripsCount > 0 ? 'Tap to dispatch' : 'All caught up'}
          </Text>
        </TouchableOpacity>

        {/* Metric 3: Upcoming Sit-Downs Today */}
        <TouchableOpacity
          style={styles.triadBox}
          onPress={() => {
            HapticsService.tick();
            if (onFilterAppts) {
              onFilterAppts();
            }
          }}
          activeOpacity={0.8}
        >
          <View style={styles.triadTop}>
            <Calendar size={14} color="#10B981" />
            <Text style={[styles.triadNumber, { color: '#10B981' }]}>{todaySitDowns.length}</Text>
          </View>
          <Text style={styles.triadLabel}>Sit-Downs</Text>
          <Text style={styles.triadSub}>
            {todaySitDowns.length > 0
              ? `${todaySitDowns.length} Today`
              : allUpcomingSitDowns.length > 0
              ? `${allUpcomingSitDowns.length} this week`
              : 'None today'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Amber Alert Banner: When Sit-Downs Need Disposition */}
      {dispoNeededLeads.length > 0 && (
        <TouchableOpacity
          style={styles.dispoAlertCard}
          onPress={() => {
            HapticsService.medium();
            if (onFilterDispoDue) {
              onFilterDispoDue();
            } else {
              onNavigateLead(dispoNeededLeads[0].id);
            }
          }}
          activeOpacity={0.85}
        >
          <View style={styles.dispoAlertLeft}>
            <View style={styles.dispoAlertIconBadge}>
              <Clock size={16} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.dispoAlertTitle}>
                  {dispoNeededLeads.length} Sit-Down{dispoNeededLeads.length > 1 ? 's' : ''} Need Dispo
                </Text>
                <View style={styles.actionRequiredBadge}>
                  <Text style={styles.actionRequiredText}>Due Now</Text>
                </View>
              </View>
              <Text style={styles.dispoAlertSub} numberOfLines={1}>
                Appointment window ended • Log conversion, nurture drip, or no-show
              </Text>
            </View>
          </View>

          <View style={styles.dispoReviewBtn}>
            <Text style={styles.dispoReviewBtnText}>Review</Text>
            <ChevronRight size={14} color="#B45309" />
          </View>
        </TouchableOpacity>
      )}

      {/* 1-Tap Action Buttons Row */}
      {dueDripsCount > 0 && (
        <TouchableOpacity
          style={styles.dispatchActionBtn}
          onPress={() => {
            HapticsService.success();
            onOpenDripModal();
          }}
          activeOpacity={0.8}
        >
          <MessageSquare size={15} color="#000000" />
          <Text style={styles.dispatchActionBtnText}>
            Dispatch {dueDripsCount} Due Drip{dueDripsCount !== 1 ? 's' : ''} & Reviews (1-Tap)
          </Text>
          <ChevronRight size={16} color="#000000" />
        </TouchableOpacity>
      )}

      {/* Confirmed Upcoming Sit-Downs Preview List (STRICTLY TODAY'S SCHEDULED APPOINTMENTS) */}
      {todaySitDowns.length > 0 && (
        <View style={styles.sitDownsSection}>
          <Text style={styles.sitDownsHeader}>UPCOMING SIT-DOWNS TODAY ({todaySitDowns.length}):</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {todaySitDowns.slice(0, 5).map((s) => {
                const planningInfo = isTeacherInPlanningNow(s.planning_period, s.school);
                const window = PipelineStateService.getAppointmentWindow(s, now);
                const timeStr = window?.startDate
                  ? window.startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                  : null;

                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.sitDownChip,
                      planningInfo.inPlanning && styles.sitDownChipInPlanning,
                    ]}
                    onPress={() => onNavigateLead(s.id)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.sitDownName} numberOfLines={1}>
                        {s.name}
                      </Text>
                      {planningInfo.inPlanning && (
                        <View style={styles.livePulseDot} />
                      )}
                    </View>
                    <Text style={styles.sitDownSchool} numberOfLines={1}>
                      {s.school || 'VOL'}{s.room_number ? ` • Rm ${s.room_number}` : ''}
                    </Text>
                    <Text style={styles.sitDownPlanning} numberOfLines={1}>
                      {timeStr ? `⏰ ${timeStr}` : s.planning_period ? `Period ${s.planning_period}` : 'Planning'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 160, 23, 0.35)',
    padding: 10,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    color: Colors.heavenlyGold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  todayDateText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  triadContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  triadBox: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  triadBoxActiveGold: {
    borderColor: 'rgba(212, 160, 23, 0.4)',
    backgroundColor: 'rgba(212, 160, 23, 0.08)',
  },
  triadTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  triadNumber: {
    fontSize: 16,
    fontWeight: '900',
  },
  triadLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  triadSub: {
    color: Colors.textMuted,
    fontSize: 9,
    marginTop: 1,
  },
  dispatchActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.heavenlyGold,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  dispatchActionBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
    marginHorizontal: 8,
  },
  sitDownsSection: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  sitDownsHeader: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sitDownChip: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    minWidth: 120,
  },
  sitDownChipInPlanning: {
    borderColor: '#22C55E',
    backgroundColor: 'rgba(34, 197, 94, 0.16)',
  },
  sitDownName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sitDownSchool: {
    color: '#CBD5E1',
    fontSize: 10,
  },
  sitDownPlanning: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  dispoAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
    gap: 10,
  },
  dispoAlertLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dispoAlertIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dispoAlertTitle: {
    color: '#D97706',
    fontSize: 13,
    fontWeight: '800',
  },
  actionRequiredBadge: {
    backgroundColor: '#B45309',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  actionRequiredText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dispoAlertSub: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  dispoReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 3,
  },
  dispoReviewBtnText: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '800',
  },
  collapseToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 3,
  },
  collapseToggleText: {
    color: Colors.heavenlyGold,
    fontSize: 10,
    fontWeight: '700',
  },
  dispoMiniBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  dispoMiniBadgeText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '800',
  },
  collapsedSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  collapsedSummaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: '#1E293B',
    borderRadius: 6,
  },
  collapsedSummaryText: {
    fontSize: 11,
    fontWeight: '700',
  },
  collapsedDot: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  collapsedAlertItem: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
});
