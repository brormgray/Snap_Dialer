/**
 * SnapDialer Design Tokens & Unified Color Palette
 * Light-theme corporate system
 */
export const Colors = {
  /* Surfaces */
  bgApp: '#F8FAFC',              /* Main application/canvas background */
  surfaceCard: '#FFFFFF',        /* Cards, panels, modals, dial keys */
  surfaceSubtle: '#F1F5F9',      /* Table stripes, secondary containers, input fills */

  /* Borders */
  borderSubtle: '#E2E8F0',       /* Card dividers, table borders */
  borderStrong: '#CBD5E1',       /* Dial pad borders, inactive input outlines */

  /* Typography */
  textPrimary: '#0F172A',        /* Headings, contact names, primary readouts */
  textSecondary: '#475569',      /* Labels, metadata, timestamps */
  textMuted: '#94A3B8',          /* Placeholder text, inactive icons */

  /* Brand & Interactive */
  brandPrimary: '#0B3B60',       /* Navigation bars, headers, primary brand buttons */
  brandAccent: '#0284C7',        /* Links, active indicators, interactive elements */
  focusRing: '#38BDF8',          /* Focus outlines */

  /* Telephony Actions & Dispositions */
  callActive: '#15803D',         /* Call/Dial button background (Emerald) */
  callHangup: '#DC2626',         /* End Call button background (Red) */
  badgeSuccessBg: '#DCFCE7',    /* Appt Set / Connected pill bg */
  badgeSuccessText: '#166534',  /* Appt Set / Connected pill text */
  badgeWarningBg: '#FEF3C7',    /* Callback / Voicemail pill bg */
  badgeWarningText: '#B45309',  /* Callback / Voicemail pill text */
  badgeDangerBg: '#FEE2E2',     /* DNC / Bad Lead pill bg */
  badgeDangerText: '#991B1B',   /* DNC / Bad Lead pill text */
  badgeNeutralBg: '#F1F5F9',    /* Busy / No Answer pill bg */
  badgeNeutralText: '#475569',  /* Busy / No Answer pill text */

  /* Backward-compatible aliases mapped strictly to new design tokens */
  sacredGreen: '#0B3B60',        /* brandPrimary */
  sacredGreenDark: '#082B46',    /* darker brandPrimary */
  sacredGreenDeep: '#0B3B60',    /* brandPrimary */
  sacredGreenLight: '#0284C7',   /* brandAccent */

  heavenlyGold: '#0284C7',       /* brandAccent */
  heavenlyGoldLight: '#38BDF8',  /* focusRing */
  heavenlyGoldDark: '#0B3B60',   /* brandPrimary */
  heavenlyGoldMuted: '#F1F5F9',  /* surfaceSubtle */
  heavenlyGoldBorder: '#E2E8F0', /* borderSubtle */

  livingWhite: '#FFFFFF',        /* White for elements on dark headers */
  livingOffWhite: '#F8FAFC',     /* bgApp */
  warmEarthBrown: '#475569',     /* textSecondary */
  deepSkyBlue: '#0284C7',        /* brandAccent */
  deepSkyBlueLight: '#38BDF8',   /* focusRing */
  deepSkyBlueMuted: '#F1F5F9',   /* surfaceSubtle */

  bgDark: '#F8FAFC',             /* bgApp */
  bgPrimary: '#F8FAFC',          /* bgApp */
  bgCard: '#FFFFFF',             /* surfaceCard */
  bgCardElevated: '#FFFFFF',     /* surfaceCard */
  bgInput: '#F1F5F9',            /* surfaceSubtle */
  bgModal: 'rgba(15, 23, 42, 0.65)', /* Modal overlay backdrop */
  modalSurface: '#FFFFFF',       /* surfaceCard */

  borderMedium: '#CBD5E1',       /* borderStrong */
  borderGold: '#E2E8F0',         /* borderSubtle */

  textGold: '#0284C7',           /* brandAccent */
  textDark: '#0F172A',           /* textPrimary */

  statusSitDownBg: '#DCFCE7',    /* badgeSuccessBg */
  statusSitDownText: '#166534',  /* badgeSuccessText */
  statusCallbackBg: '#FEF3C7',   /* badgeWarningBg */
  statusCallbackText: '#B45309', /* badgeWarningText */
  statusPendingBg: '#F1F5F9',    /* badgeNeutralBg */
  statusPendingText: '#0284C7',  /* brandAccent */
  statusUnansweredBg: '#F1F5F9', /* badgeNeutralBg */
  statusUnansweredText: '#475569', /* badgeNeutralText */
  statusDangerBg: '#FEE2E2',     /* badgeDangerBg */
  statusDangerText: '#991B1B',   /* badgeDangerText */
};
