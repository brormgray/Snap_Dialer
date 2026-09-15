import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import {
  X,
  MapPin,
  Layers,
  Flame,
  Archive,
  RotateCcw,
  Check,
  Filter,
} from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { HapticsService } from '../services/hapticsService';

export interface FilterBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  availableSchools: { school: string; count: number }[];
  selectedSchool: string;
  onSelectSchool: (school: string) => void;
  availableLists: { id: string; title: string }[];
  selectedListId: string;
  onSelectCampaign: (listId: string) => void;
  priorityFilter: 'all' | 'fresh' | 'legacy';
  onSelectPriority: (tier: 'all' | 'fresh' | 'legacy') => void;
  totalLeadsCount: number;
  filteredCount: number;
  onResetFilters: () => void;
}

export function FilterBottomSheet({
  visible,
  onClose,
  availableSchools,
  selectedSchool,
  onSelectSchool,
  availableLists,
  selectedListId,
  onSelectCampaign,
  priorityFilter,
  onSelectPriority,
  totalLeadsCount,
  filteredCount,
  onResetFilters,
}: FilterBottomSheetProps) {
  if (!visible) return null;

  const activeFiltersCount =
    (selectedSchool !== 'all' ? 1 : 0) +
    (selectedListId !== 'all' ? 1 : 0) +
    (priorityFilter !== 'all' ? 1 : 0);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheetContainer} pointerEvents="auto">
          {/* Grab Bar Handle */}
          <View style={styles.handleBar} />

          {/* Sheet Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Filter size={18} color={Colors.heavenlyGold} />
              <Text style={styles.headerTitle}>Filter Pipeline</Text>
              {activeFiltersCount > 0 && (
                <View style={styles.filterCountBadge}>
                  <Text style={styles.filterCountText}>{activeFiltersCount} active</Text>
                </View>
              )}
            </View>

            <View style={styles.headerActions}>
              {activeFiltersCount > 0 && (
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={() => {
                    HapticsService.medium();
                    onResetFilters();
                  }}
                >
                  <RotateCcw size={13} color={Colors.badgeWarningText} />
                  <Text style={styles.resetButtonText}>Reset</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.closeButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                onPress={() => {
                  HapticsService.tick();
                  onClose();
                }}
              >
                <X size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Scrollable Filter Sections */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Priority Tiers */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>PRIORITY LEVEL</Text>
              <View style={styles.pillGrid}>
                <TouchableOpacity
                  style={[
                    styles.pill,
                    priorityFilter === 'all' && styles.pillActive,
                  ]}
                  onPress={() => {
                    HapticsService.tick();
                    onSelectPriority('all');
                  }}
                >
                  <Text
                    style={[
                      styles.pillText,
                      priorityFilter === 'all' && styles.pillTextActive,
                    ]}
                  >
                    All Priorities
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.pill,
                    priorityFilter === 'fresh' && styles.pillActiveFresh,
                  ]}
                  onPress={() => {
                    HapticsService.tick();
                    onSelectPriority(priorityFilter === 'fresh' ? 'all' : 'fresh');
                  }}
                >
                  <Flame
                    size={13}
                    color={priorityFilter === 'fresh' ? '#FFFFFF' : Colors.badgeWarningText}
                  />
                  <Text
                    style={[
                      styles.pillText,
                      priorityFilter === 'fresh' && styles.pillTextActive,
                    ]}
                  >
                    Fresh Priority (Tier 1)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.pill,
                    priorityFilter === 'legacy' && styles.pillActiveLegacy,
                  ]}
                  onPress={() => {
                    HapticsService.tick();
                    onSelectPriority(priorityFilter === 'legacy' ? 'all' : 'legacy');
                  }}
                >
                  <Archive
                    size={13}
                    color={priorityFilter === 'legacy' ? '#FFFFFF' : Colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.pillText,
                      priorityFilter === 'legacy' && styles.pillTextActive,
                    ]}
                  >
                    Legacy (Tier 3)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* School Campuses */}
            {availableSchools.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  SCHOOL CAMPUS ({availableSchools.length})
                </Text>
                <View style={styles.pillGrid}>
                  <TouchableOpacity
                    style={[
                      styles.pill,
                      selectedSchool === 'all' && styles.pillActive,
                    ]}
                    onPress={() => {
                      HapticsService.tick();
                      onSelectSchool('all');
                    }}
                  >
                    <MapPin
                      size={12}
                      color={selectedSchool === 'all' ? '#FFFFFF' : Colors.brandAccent}
                    />
                    <Text
                      style={[
                        styles.pillText,
                        selectedSchool === 'all' && styles.pillTextActive,
                      ]}
                    >
                      All Campuses
                    </Text>
                  </TouchableOpacity>

                  {availableSchools.map((item) => {
                    const isSelected = selectedSchool === item.school;
                    return (
                      <TouchableOpacity
                        key={item.school}
                        style={[styles.pill, isSelected && styles.pillActive]}
                        onPress={() => {
                          HapticsService.tick();
                          onSelectSchool(isSelected ? 'all' : item.school);
                        }}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            isSelected && styles.pillTextActive,
                          ]}
                        >
                          🏫 {item.school} ({item.count})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Campaign Lists */}
            {availableLists.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  CAMPAIGN LISTS ({availableLists.length})
                </Text>
                <View style={styles.pillGrid}>
                  <TouchableOpacity
                    style={[
                      styles.pill,
                      selectedListId === 'all' && styles.pillActive,
                    ]}
                    onPress={() => {
                      HapticsService.tick();
                      onSelectCampaign('all');
                    }}
                  >
                    <Layers
                      size={12}
                      color={selectedListId === 'all' ? '#FFFFFF' : Colors.brandAccent}
                    />
                    <Text
                      style={[
                        styles.pillText,
                        selectedListId === 'all' && styles.pillTextActive,
                      ]}
                    >
                      All Campaigns ({totalLeadsCount})
                    </Text>
                  </TouchableOpacity>

                  {availableLists.map((lst) => {
                    const isSelected = selectedListId === lst.id;
                    return (
                      <TouchableOpacity
                        key={lst.id}
                        style={[styles.pill, isSelected && styles.pillActive]}
                        onPress={() => {
                          HapticsService.tick();
                          onSelectCampaign(isSelected ? 'all' : lst.id);
                        }}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            isSelected && styles.pillTextActive,
                          ]}
                        >
                          📋 {lst.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.applyButton}
              onPress={() => {
                HapticsService.success();
                onClose();
              }}
              activeOpacity={0.85}
            >
              <Check size={16} color="#FFFFFF" />
              <Text style={styles.applyButtonText}>
                Apply Filters • Showing {filteredCount} of {totalLeadsCount} Leads
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  backdropTouchable: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: Colors.surfaceCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    maxHeight: '82%',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 16,
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.borderStrong,
    alignSelf: 'center',
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  filterCountBadge: {
    backgroundColor: Colors.badgeSuccessBg,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  filterCountText: {
    color: Colors.badgeSuccessText,
    fontSize: 10,
    fontWeight: '800',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: Colors.badgeWarningBg,
  },
  resetButtonText: {
    color: Colors.badgeWarningText,
    fontSize: 11,
    fontWeight: '700',
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSubtle,
  },
  scrollArea: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 18,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: Colors.textSecondary,
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  pillActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  pillActiveFresh: {
    backgroundColor: '#B45309',
    borderColor: '#B45309',
  },
  pillActiveLegacy: {
    backgroundColor: '#475569',
    borderColor: '#475569',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceCard,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.callActive,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: Colors.callActive,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
