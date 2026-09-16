import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, cardShadow } from "../../constants/colors";
import { deleteJSAEverywhere } from "../../services/sync";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";

// Supports both old (wellName: string) and new (wells: WellEntry[]) formats
type HistoryItem = {
  id: string;
  timestamp: string;
  driverName: string;
  truckNumber: string;
  jobActivityName: string;
  pusher: string;
  wellName?: string;
  wells?: any[];
  otherInfo: string;
  location: string;
  task: string;
  date: string;
  ppeSelected: string | Record<string, boolean>;
  locations: string[];
  locationAcks: Record<string, boolean>;
  prepared: Record<string, boolean>;
  notes: string;
  signature: string;
  signatureImage?: string;
};

/** Get well names from either old or new format */
function getWellNames(item: HistoryItem): string {
  if (item.wells && Array.isArray(item.wells) && item.wells.length > 0) {
    return item.wells.map((w: any) => typeof w === 'string' ? w : w?.name || '').filter(Boolean).join(', ');
  }
  return item.wellName || '-';
}

/** Get first well's job type or fallback */
function getJobType(item: HistoryItem): string {
  if (item.wells && Array.isArray(item.wells) && item.wells.length > 0) {
    const first = item.wells[0];
    if (typeof first !== 'string' && first?.jobType) return first.jobType;
  }
  return item.jobActivityName || item.task || '';
}

/** Format date concisely */
function formatDate(isoString: string, locale: string, t: (text: string) => string): string {
  try {
    const d = new Date(isoString);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const time = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });

    if (isToday) return `${t('Today')}, ${time}`;
    if (isYesterday) return `${t('Yesterday')}, ${time}`;
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' }) + `, ${time}`;
  } catch {
    return isoString;
  }
}

export default function HistoryTabScreen() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const locale = lang === 'es' ? 'es-MX' : 'en-US';
  const { accent, logoUrl } = useTheme();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setError(null);
      const { ownJsaRecords } = await import('../../services/jsaRecord');
      setHistory(await ownJsaRecords());
      // An absent cache is precisely when the server must still be checked.
      try {
        setHistory(await (await import('../../services/standaloneJsa')).syncStandaloneHistory());
      } catch {
        setHistory(await ownJsaRecords());
        setError(t('Could not refresh JSAs. Showing records available on this phone. Try again when connected.'));
      }
    } catch (err) {
      console.error("Error loading history:", err);
      setError(t("Failed to load history. Pull down to try again."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void loadHistory(); }, [loadHistory]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory();
  }, [loadHistory]);

  const handleViewDetails = (item: HistoryItem) => {
    router.push({pathname:'/jsa-record',params:{id:item.id}} as any);
    return;
  };

  const handleDeleteItem = (item: HistoryItem) => {
    if ((item as any).workflow === 'standalone') {
      if ((item as any).state !== 'open') return;
      Alert.alert(t('Close JSA?'), t('The signed report and its additions stay available.'), [
        {text:t('Cancel'),style:'cancel'},
        {text:t('Close JSA'),onPress:async()=>{try { await (await import('../../services/standaloneJsa')).closeStandaloneJsa(item); await loadHistory(); } catch { Alert.alert(t('Error'),t('JSA was not closed. Please retry.')); }}}
      ]);
      return;
    }
    Alert.alert(
      t("Delete JSA"),
      t("Are you sure you want to delete this JSA? This action cannot be undone."),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Delete"),
          style: "destructive",
          onPress: async () => {
            try {
              // Delete from BOTH cloud and local. Filtering AsyncStorage alone
              // creates a write-back loop: completed.tsx → syncToCloud →
              // fetchJSAsForDevice re-fetches the still-living cloud doc and
              // merges it back into local. Authoritative delete kills the loop.
              await deleteJSAEverywhere(item.id);
              const newHistory = history.filter((h) => h.id !== item.id);
              setHistory(newHistory);
            } catch (err) {
              console.error("Error deleting JSA:", err);
              Alert.alert(t("Error"), t("Failed to delete JSA. Please try again."));
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: HistoryItem }) => {
    const wellNames = getWellNames(item);
    const jobType = getJobType(item);
    const standalone = (item as any).workflow === 'standalone';
    const openStandalone = standalone && (item as any).state === 'open';
    const closedStandalone = standalone && (item as any).state === 'closed';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleViewDetails(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardWells} numberOfLines={2}>{wellNames}</Text>
            {jobType ? <Text style={styles.cardJobType}>{jobType}</Text> : null}
          </View>
          <Text style={styles.cardDate}>{formatDate(item.timestamp, locale, t)}</Text>
        </View>
        <View style={styles.cardBottom}>
          <Text style={styles.cardDriver}>{item.driverName} • {t("Truck")} #{item.truckNumber}</Text>
          <View style={styles.cardActions}>
            {closedStandalone ? (
              <View accessibilityRole="text" accessibilityLabel={t('Closed')} style={styles.statusLabel}>
                <Text style={[styles.actionText, { color: colors.textMuted }]}>{t('Closed')}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => { e.stopPropagation(); handleDeleteItem(item); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.actionText, { color: colors.error }]}>{t(openStandalone ? 'Close JSA' : 'Delete')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.headerLogo} /> : null}
          <Text style={styles.headerTitle}>{t("Saved JSAs")}</Text>

        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.headerLogo} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t("Saved JSAs")}</Text>
          <Text style={styles.headerSubtitle}>
            {error ? t('Refresh incomplete') : `${history.length} ${history.length === 1 ? t("record") : t("records")}`}
          </Text>
        </View>

      </View>

      {!!error && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: accent }]} onPress={onRefresh}>
            <Text style={styles.retryButtonText}>{t("Try Again")}</Text>
          </TouchableOpacity>
        </View>
      )}
      {history.length === 0 ? (!error && (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t("No saved JSAs")}</Text>
          <Text style={styles.emptySubtext}>
            {t("Completed JSAs will appear here")}
          </Text>
        </View>
      )) : (
        <FlatList
          data={history}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[accent]}
              tintColor={accent}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a6b3c',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  headerLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: colors.error,
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textDark,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardWells: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textDark,
    flex: 1,
    marginRight: 8,
  },
  cardJobType: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardDate: {
    fontSize: 11,
    color: colors.textMuted,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  cardDriver: {
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    paddingVertical: 2,
  },
  statusLabel: {
    paddingVertical: 2,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

