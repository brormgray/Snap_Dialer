import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Switch } from 'react-native';
import { Award, Check, Calendar, Clock, ShieldCheck } from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { HapticsService } from '../services/hapticsService';
import { Lead, ClientProduct, DripTrack } from '../types';

interface ClientPortfolioCardProps {
  lead: Lead;
  onSave: (updatedPortfolio: Partial<Lead>) => Promise<void>;
}

const AVAILABLE_PRODUCTS: { id: ClientProduct; label: string }[] = [
  { id: 'flow_annuity', label: '403(b) Flow Annuity' },
  { id: 'annuity_transfer', label: 'Annuity Transfer-In' },
  { id: 'life_insurance', label: 'Life Insurance' },
  { id: 'investments', label: 'Investments' },
];

export function ClientPortfolioCard({ lead, onSave }: ClientPortfolioCardProps) {
  const [isClient, setIsClient] = useState<boolean>(lead.is_client || false);
  const [selectedProducts, setSelectedProducts] = useState<ClientProduct[]>(lead.products || []);
  const [annualPremium, setAnnualPremium] = useState<string>(
    lead.annualized_premium !== undefined && lead.annualized_premium !== null
      ? String(lead.annualized_premium)
      : ''
  );
  const [transferVolume, setTransferVolume] = useState<string>(
    lead.transfer_assets_volume !== undefined && lead.transfer_assets_volume !== null
      ? String(lead.transfer_assets_volume)
      : ''
  );
  const [effectiveDate, setEffectiveDate] = useState<string>(lead.policy_effective_date || '');
  const [nextReviewDate, setNextReviewDate] = useState<string>(lead.annual_review_due_date || '');
  const [dripTrack, setDripTrack] = useState<DripTrack>(
    lead.drip_track || (lead.is_client ? 'client_annual_review' : 'none')
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);

  React.useEffect(() => {
    setIsClient(lead.is_client || false);
    setSelectedProducts(lead.products || []);
    setAnnualPremium(
      lead.annualized_premium !== undefined && lead.annualized_premium !== null
        ? String(lead.annualized_premium)
        : ''
    );
    setTransferVolume(
      lead.transfer_assets_volume !== undefined && lead.transfer_assets_volume !== null
        ? String(lead.transfer_assets_volume)
        : ''
    );
    setEffectiveDate(lead.policy_effective_date || '');
    setNextReviewDate(lead.annual_review_due_date || '');
    setDripTrack(lead.drip_track || (lead.is_client ? 'client_annual_review' : 'none'));
  }, [
    lead.id,
    lead.is_client,
    lead.products,
    lead.annualized_premium,
    lead.transfer_assets_volume,
    lead.policy_effective_date,
    lead.annual_review_due_date,
    lead.drip_track,
  ]);

  const toggleProduct = (productId: ClientProduct) => {
    HapticsService.tick();
    setSelectedProducts((prev) =>
      prev.includes(productId) ? prev.filter((p) => p !== productId) : [...prev, productId]
    );
  };

  const handleToggleClient = (value: boolean) => {
    HapticsService.medium();
    setIsClient(value);
    if (value) {
      setDripTrack('client_annual_review');
      if (!effectiveDate) {
        const today = new Date().toISOString().slice(0, 10);
        setEffectiveDate(today);
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        setNextReviewDate(nextYear.toISOString().slice(0, 10));
      }
    } else {
      setDripTrack('prospect_nurture');
    }
  };

  const handleSave = async () => {
    await HapticsService.success();
    setIsSaving(true);
    try {
      const parsedAP = annualPremium.trim() ? parseFloat(annualPremium.replace(/[^0-9.]/g, '')) : null;
      const parsedTransfer = transferVolume.trim() ? parseFloat(transferVolume.replace(/[^0-9.]/g, '')) : null;
      const nowISO = new Date().toISOString();

      let appointmentOutcome = lead.appointment_outcome;
      let appointmentCompletedAt = lead.appointment_completed_at;
      let lastDisposition = lead.last_disposition;

      if (isClient) {
        appointmentOutcome = 'converted';
        appointmentCompletedAt = appointmentCompletedAt || nowISO;
        if (lastDisposition === 'appointment_set') {
          lastDisposition = 'connected';
        }
      } else if (dripTrack === 'prospect_nurture') {
        if (lead.last_disposition === 'appointment_set' || lead.appointment_scheduled_at) {
          appointmentOutcome = 'nurture_drip';
          appointmentCompletedAt = appointmentCompletedAt || nowISO;
          if (lastDisposition === 'appointment_set') {
            lastDisposition = 'connected';
          }
        }
      }

      await onSave({
        is_client: isClient,
        client_since: isClient ? (lead.client_since || nowISO) : null,
        products: selectedProducts,
        annualized_premium: isNaN(Number(parsedAP)) ? null : parsedAP,
        transfer_assets_volume: isNaN(Number(parsedTransfer)) ? null : parsedTransfer,
        policy_effective_date: effectiveDate.trim() || null,
        annual_review_due_date: nextReviewDate.trim() || null,
        drip_track: dripTrack,
        appointment_outcome: appointmentOutcome,
        appointment_completed_at: appointmentCompletedAt,
        last_disposition: lastDisposition,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.card, isClient && styles.cardClientActive]}>
      {/* Header with Switch */}
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <View style={[styles.headerIconCircle, isClient && styles.headerIconCircleActive]}>
            <Award size={18} color={isClient ? '#10B981' : Colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>CLIENT PORTFOLIO & POLICY</Text>
            <Text style={styles.cardSubtitle}>
              {isClient ? 'Active Client' : 'Prospect • Not yet converted'}
            </Text>
          </View>
        </View>

        <View style={styles.switchWrapper}>
          <Text style={[styles.switchLabel, isClient && styles.switchLabelActive]}>
            {isClient ? 'Converted' : 'Prospect'}
          </Text>
          <Switch
            value={isClient}
            onValueChange={handleToggleClient}
            trackColor={{ false: Colors.borderStrong, true: '#10B981' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* Product Pills */}
      <Text style={styles.fieldSectionLabel}>PRODUCTS PLACED / ACTIVE:</Text>
      <View style={styles.productPillsRow}>
        {AVAILABLE_PRODUCTS.map((prod) => {
          const active = selectedProducts.includes(prod.id);
          return (
            <TouchableOpacity
              key={prod.id}
              style={[styles.productPill, active && styles.productPillActive]}
              onPress={() => toggleProduct(prod.id)}
              activeOpacity={0.7}
            >
              {active && <Check size={12} color="#FFFFFF" style={{ marginRight: 4 }} />}
              <Text style={[styles.productPillText, active && styles.productPillTextActive]}>
                {prod.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Financial Fields ($ AP and $ Assets) */}
      <View style={styles.inputRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.inputLabel}>ANNUALIZED PREMIUM ($ AP)</Text>
          <View style={styles.currencyInputContainer}>
            <Text style={styles.currencyPrefix}>$</Text>
            <TextInput
              style={styles.currencyInput}
              value={annualPremium}
              onChangeText={setAnnualPremium}
              placeholder="e.g. 6000"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.inputLabel}>TRANSFER / ASSETS ($)</Text>
          <View style={styles.currencyInputContainer}>
            <Text style={styles.currencyPrefix}>$</Text>
            <TextInput
              style={styles.currencyInput}
              value={transferVolume}
              onChangeText={setTransferVolume}
              placeholder="e.g. 75000"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      </View>

      {/* Policy Effective Date & Next Review Due Date */}
      <View style={styles.inputRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.inputLabel}>EFFECTIVE DATE</Text>
          <View style={styles.dateInputContainer}>
            <Calendar size={14} color={Colors.brandAccent} />
            <TextInput
              style={styles.dateInput}
              value={effectiveDate}
              onChangeText={setEffectiveDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.inputLabel}>NEXT ANNUAL REVIEW</Text>
          <View style={styles.dateInputContainer}>
            <Clock size={14} color={Colors.badgeWarningText} />
            <TextInput
              style={styles.dateInput}
              value={nextReviewDate}
              onChangeText={setNextReviewDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>
      </View>

      {/* Quick Drip Selector Segment */}
      <Text style={[styles.fieldSectionLabel, { marginTop: 10 }]}>AUTOMATED DRIP CADENCE:</Text>
      <View style={styles.segmentContainer}>
        {(['none', 'prospect_nurture', 'client_annual_review'] as const).map((mode) => {
          const isActive = dripTrack === mode;
          const label =
            mode === 'none'
              ? 'Off'
              : mode === 'prospect_nurture'
              ? 'Prospect Nurture'
              : 'Annual Review';
          return (
            <TouchableOpacity
              key={mode}
              style={[styles.segmentBtn, isActive && styles.segmentBtnActive]}
              onPress={() => {
                HapticsService.tick();
                setDripTrack(mode);
              }}
            >
              <Text style={[styles.segmentBtnText, isActive && styles.segmentBtnTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={styles.savePortfolioBtn}
        onPress={handleSave}
        disabled={isSaving}
        activeOpacity={0.8}
      >
        <ShieldCheck size={16} color="#FFFFFF" />
        <Text style={styles.savePortfolioBtnText}>
          {isSaving ? 'Saving Portfolio...' : 'Save Portfolio & Policy Details'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Colors.borderSubtle,
    marginBottom: 20,
  },
  cardClientActive: {
    borderColor: '#10B981',
    backgroundColor: '#FAFDFB',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconCircleActive: {
    backgroundColor: '#ECFDF5',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.brandPrimary,
    letterSpacing: 0.6,
  },
  cardSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  switchWrapper: {
    alignItems: 'flex-end',
    gap: 2,
  },
  switchLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  switchLabelActive: {
    color: '#065F46',
  },
  fieldSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  productPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  productPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  productPillActive: {
    backgroundColor: Colors.brandPrimary,
    borderColor: Colors.brandPrimary,
  },
  productPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  productPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  currencyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  currencyPrefix: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginRight: 4,
  },
  currencyInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 10,
    paddingHorizontal: 10,
    gap: 6,
  },
  dateInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentBtnActive: {
    backgroundColor: Colors.brandPrimary,
  },
  segmentBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  savePortfolioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandPrimary,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  savePortfolioBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
