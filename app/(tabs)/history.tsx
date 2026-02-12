import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { colors } from "../../constants/colors";
import { STORAGE_KEYS } from "../../constants/storageKeys";
import { useLanguage } from "../contexts/LanguageContext";

type HistoryItem = {
  id: string;
  timestamp: string;
  driverName: string;
  truckNumber: string;
  jobActivityName: string;
  pusher: string;
  wellName: string;
  otherInfo: string;
  location: string;
  task: string;
  date: string;
  ppeSelected: string;
  locations: string[];
  locationAcks: Record<string, boolean>;
  prepared: Record<string, boolean>;
  notes: string;
  signature: string;
};

export default function HistoryTabScreen() {
  const router = useRouter();
  const { t } = useLanguage();
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

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const handleViewDetails = (item: HistoryItem) => {
    router.push({
      pathname: "/viewJsa",
      params: {
        id: item.id,
        driverName: item.driverName,
        truckNumber: item.truckNumber,
        jobActivityName: item.jobActivityName,
        pusher: item.pusher,
        wellName: item.wellName,
        otherInfo: item.otherInfo,
        location: item.location,
        task: item.task,
        date: item.date,
        ppeSelected: item.ppeSelected,
        locations: JSON.stringify(item.locations),
        locationAcks: JSON.stringify(item.locationAcks),
        prepared: JSON.stringify(item.prepared),
        notes: item.notes,
        signature: item.signature,
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
              const newHistory = history.filter((h) => h.id !== item.id);
              await AsyncStorage.setItem(STORAGE_KEYS.saves, JSON.stringify(newHistory));
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
    // Navigate to steps with all the JSA data pre-filled, but with today's date and no signature
    const today = new Date().toISOString().slice(0, 10);
    router.push({
      pathname: "/steps",
      params: {
        driverName: item.driverName,
        truckNumber: item.truckNumber,
        jobActivityName: item.jobActivityName,
        pusher: item.pusher,
        wellName: item.wellName,
        otherInfo: item.otherInfo,
        location: item.location,
        locations: JSON.stringify(item.locations || []),
        locationAcks: JSON.stringify({}), // Reset acknowledgments
        date: today,
        jsaSessionId: Date.now().toString(),
      },
    });
  };

  const renderItem = ({ item }: { item: HistoryItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>
          {item.jobActivityName || item.task || t("JSA")}
        </Text>
        <Text style={styles.cardDate}>{formatDate(item.timestamp)}</Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{t("Driver")}:</Text>
          <Text style={styles.cardValue}>{item.driverName || "-"}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{t("Truck #")}:</Text>
          <Text style={styles.cardValue}>{item.truckNumber || "-"}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{t("Well")}:</Text>
          <Text style={styles.cardValue}>{item.wellName || "-"}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{t("Location")}:</Text>
          <Text style={styles.cardValue}>{item.location || "-"}</Text>
        </View>
        {item.signature && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>{t("Signed by")}:</Text>
            <Text style={styles.cardValue}>{item.signature}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.viewButton}
          onPress={() => handleViewDetails(item)}
        >
          <Text style={styles.viewButtonText}>{t("View")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.duplicateButton}
          onPress={() => handleDuplicate(item)}
        >
          <Text style={styles.duplicateButtonText}>{t("Duplicate")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteItem(item)}
        >
          <Text style={styles.deleteButtonText}>{t("Delete")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t("Loading history...")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
            <Text style={styles.retryButtonText}>{t("Try Again")}</Text>
          </TouchableOpacity>
        </View>
      ) : history.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t("No completed JSAs yet")}</Text>
          <Text style={styles.emptySubtext}>
            {t("Complete a JSA to see it here")}
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
              colors={[colors.primary]}
              tintColor={colors.primary}
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
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textMuted,
  },
  errorText: {
    fontSize: 16,
    color: colors.error,
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primary,
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
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textDark,
    flex: 1,
  },
  cardDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: 8,
  },
  cardBody: {
    gap: 6,
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: "row",
  },
  cardLabel: {
    fontSize: 14,
    color: colors.textMuted,
    width: 80,
  },
  cardValue: {
    fontSize: 14,
    color: colors.textDark,
    flex: 1,
  },
  cardActions: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  viewButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  viewButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  duplicateButton: {
    flex: 1,
    backgroundColor: colors.card,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
  },
  duplicateButtonText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: "600",
  },
  deleteButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: "center",
  },
  deleteButtonText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: "600",
  },
});
