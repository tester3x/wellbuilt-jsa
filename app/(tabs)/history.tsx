import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { STORAGE_KEYS } from "../../constants/storageKeys";
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
function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    if (isToday) return `Today, ${time}`;
    if (isYesterday) return `Yesterday, ${time}`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${time}`;
  } catch {
    return isoString;
  }
}

export default function HistoryTabScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { accent, logoUrl } = useTheme();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setError(null);
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.saves);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error("Error loading history:", err);
      setError(t("Failed to load history. Pull down to try again."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory();
  }, [loadHistory]);

  const handleViewDetails = (item: HistoryItem) => {
    const ppeStr = typeof item.ppeSelected === 'string'
      ? item.ppeSelected
      : JSON.stringify({ selected: item.ppeSelected });

    router.push({
      pathname: "/viewJsa",
      params: {
        id: item.id,
        driverName: item.driverName,
        truckNumber: item.truckNumber,
        jobActivityName: item.jobActivityName,
        pusher: item.pusher,
        wellName: getWellNames(item),
        wells: JSON.stringify(item.wells || []),
        otherInfo: item.otherInfo,
        location: item.location,
        task: item.task,
        date: item.date,
        ppeSelected: ppeStr,
        locations: JSON.stringify(item.locations || []),
        locationAcks: JSON.stringify(item.locationAcks || {}),
        prepared: JSON.stringify(item.prepared || {}),
        notes: item.notes,
        signature: item.signature,
        signatureImage: item.signatureImage || '',
        timestamp: item.timestamp,
      },
    });
  };

  const handleDeleteItem = (item: HistoryItem) => {
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

  const handleDuplicate = (item: HistoryItem) => {
    const today = new Date().toISOString().slice(0, 10);
    router.push({
      pathname: "/steps",
      params: {
        driverName: item.driverName,
        truckNumber: item.truckNumber,
        jobActivityName: item.jobActivityName,
        pusher: item.pusher,
        wellName: item.wellName,
        wells: JSON.stringify(item.wells || []),
        otherInfo: item.otherInfo,
        location: item.location,
        locations: JSON.stringify(item.locations || []),
        locationAcks: JSON.stringify({}),
        date: today,
        jsaSessionId: Date.now().toString(),
      },
    });
  };

  const renderItem = ({ item }: { item: HistoryItem }) => {
    const wellNames = getWellNames(item);
    const jobType = getJobType(item);

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
          <Text style={styles.cardDate}>{formatDate(item.timestamp)}</Text>
        </View>
        <View style={styles.cardBottom}>
          <Text style={styles.cardDriver}>{item.driverName} • {t("Truck")} #{item.truckNumber}</Text>
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => { e.stopPropagation(); handleDuplicate(item); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.actionText, { color: accent }]}>{t("Duplicate")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => { e.stopPropagation(); handleDeleteItem(item); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.actionText, { color: colors.error }]}>{t("Delete")}</Text>
            </TouchableOpacity>
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
            {history.length} {history.length === 1 ? t("record") : t("records")}
          </Text>
        </View>
      </View>

      {error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: accent }]} onPress={onRefresh}>
            <Text style={styles.retryButtonText}>{t("Try Again")}</Text>
          </TouchableOpacity>
        </View>
      ) : history.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t("No saved JSAs")}</Text>
          <Text style={styles.emptySubtext}>
            {t("Completed JSAs will appear here")}
          </Text>
        </View>
      ) : (
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
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
