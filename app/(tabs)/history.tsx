import {missingJsaInformation} from '../../services/jsaInformation';
import { jsaHistorySummary } from '../../services/jsaHistorySummary';
import { BrandedAlert as Alert } from '../../services/brandedAlert';
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, cardShadow } from "../../constants/colors";
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

function openRecordsFirst(records: HistoryItem[]): HistoryItem[] {
  return [...records].sort((left, right) => {
    const leftOpen = (left as any).workflow === 'standalone' && (left as any).state === 'open';
    const rightOpen = (right as any).workflow === 'standalone' && (right as any).state === 'open';
    if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;
    return new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
  });
}

export default function HistoryTabScreen() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const locale = lang === 'es' ? 'es-MX' : 'en-US';
  const { accent, logoUrl, setBackgroundPackageId, resolveBackgroundPackageForJob } = useTheme();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [query, setQuery] = useState('');
  const filteredHistory = useMemo(() => { const search = query.trim().toLowerCase(); return search ? history.filter(item => jsaHistorySummary(item, locale).search.includes(search)) : history; }, [history, query, locale]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setError(null);
      const { ownJsaRecords } = await import('../../services/jsaRecord');
      const available=openRecordsFirst(await ownJsaRecords());setHistory(available);if(available.length)setLoading(false);
      // An absent cache is precisely when the server must still be checked.
      try {
        const results=await Promise.allSettled([
          import('../../services/standaloneJsa').then(m=>m.syncStandaloneHistory()),
          import('../../services/preparedJsaHistoryLive').then(m=>m.syncPreparedJsaHistory()),
        ]);
        setHistory(openRecordsFirst(await ownJsaRecords()));
        if(results.some(r=>r.status==='rejected'))setError(t('Could not refresh JSAs. Showing records available on this phone. Try again when connected.'));
      } catch {
        setHistory(openRecordsFirst(await ownJsaRecords()));
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
    setBackgroundPackageId(resolveBackgroundPackageForJob((item as any).packageId || jsaHistorySummary(item, locale).activities[0] || ''));
    router.push({pathname:'/jsa-record',params:{id:item.id}} as any);
    return;
  };

  const handleDeleteItem = (item: HistoryItem) => {
    if ((item as any).workflow === 'prepared') return;
    if ((item as any).workflow === 'standalone') {
      if ((item as any).state !== 'open') return;
      Alert.alert(t('Close JSA?'), t('The signed report and its additions stay available.'), [
        {text:t('Cancel'),style:'cancel'},
        {text:t('Close JSA'),onPress:async()=>{try { await (await import('../../services/standaloneJsa')).closeStandaloneJsa(item); await loadHistory(); } catch { Alert.alert(t('Error'),t('JSA was not closed. Please retry.')); }}}
      ]);
      return;
    }
    // Legacy saved reports are retained too. Unknown provenance is not
    // permission to delete signed safety evidence or its only local original.
    return;
  };

  const renderItem = ({ item }: { item: HistoryItem }) => {
    const summary = jsaHistorySummary(item, locale);
    const standalone = (item as any).workflow === 'standalone';
    const openStandalone = standalone && (item as any).state === 'open';
    const closedStandalone = standalone && (item as any).state === 'closed';
    const retained = !standalone;

    return (
      <TouchableOpacity
        style={[styles.card, openStandalone && styles.activeCard]}
        onPress={() => handleViewDetails(item)}
        activeOpacity={0.7}
      >
        {openStandalone && (
          <View style={styles.activeBadge} accessibilityRole="text">
            <Text style={styles.activeBadgeText}>{t('Active JSA')}</Text>
          </View>
        )}
        {missingJsaInformation(item).length>0&&<Text style={{color:'#795500',fontWeight:'700',marginBottom:8}}>{t('Incomplete details')} · {t('Review missing information')}</Text>}
        <View style={styles.cardTop}>
          <Text style={[styles.cardWells, { fontSize: 17, fontWeight: '700' }]}>{summary.date || t('Date not recorded')}</Text>
          <View style={{ backgroundColor: openStandalone ? '#E6F5EA' : '#edf0ed', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: openStandalone ? '#176B2C' : '#4b5550' }}>{t(summary.status)}</Text>
          </View>
        </View>
        <Text style={[styles.cardJobType, { marginBottom: 10 }]}>{t(summary.shift)}{summary.signedAt ? ' · ' + t('Signed') + ' ' + summary.signedAt : ''}{summary.endedAt ? ' · ' + t('Ended') + ' ' + summary.endedAt : ''}</Text>
        <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 11 }}>{t('Locations')} ({summary.locations.length})</Text>
        <Text style={{ color: colors.textDark, fontSize: 14, lineHeight: 20, marginTop: 3, marginBottom: 10 }} numberOfLines={3}>
          {summary.locations.length ? summary.locations.join(' · ') : t('Locations not recorded')}
        </Text>
        <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 11 }}>{t('Work performed')}</Text>
        <Text style={{ color: colors.textDark, fontSize: 13, lineHeight: 19, marginTop: 3, marginBottom: 10 }} numberOfLines={2}>
          {summary.activities.length ? summary.activities.join(' · ') : t('Activity not recorded')}
        </Text>
        {!!summary.note && <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }} numberOfLines={2}>{t('Notes')}: {summary.note}</Text>}
        <View style={styles.cardBottom}>
          <Text style={styles.cardDriver}>{item.driverName} • {t("Truck")} #{item.truckNumber}</Text>
          <View style={styles.cardActions}>
            {closedStandalone || retained ? (
              <View accessibilityRole="text" accessibilityLabel={t('View report')} style={styles.statusLabel}>
                <Text style={[styles.actionText, { color: colors.textMuted }]}>{t('View report')} ›</Text>
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

      <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
        <TextInput accessibilityLabel={t('Search saved JSAs')} placeholder={t('Search locations, activities, or date')} placeholderTextColor={colors.textMuted}
          value={query} onChangeText={setQuery} clearButtonMode="while-editing"
          style={{ backgroundColor: '#fff', color: colors.textDark, borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 12 }} />
        {!!query.trim() && <Text style={{ color: colors.textMuted, paddingTop: 5 }}>{filteredHistory.length} {t('matching records')}</Text>}
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
          style={{flex:1,overflow:'hidden'}}
          data={filteredHistory}
          renderItem={renderItem}
          ListEmptyComponent={<Text style={{ padding: 20, color: colors.textMuted }}>{t('No matching JSAs')}</Text>}
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
    backgroundColor: "transparent",
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
    backgroundColor: colors.glassSurface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  activeCard: {
    borderWidth: 2,
    borderColor: colors.success,
  },
  activeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E6F5EA',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 9,
  },
  activeBadgeText: {
    color: '#176B2C',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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

