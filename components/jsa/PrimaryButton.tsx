import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from "react-native";

import { cardShadow, colors } from "../../constants/colors";

type PrimaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  variant?: "primary" | "secondary" | "danger";
};

export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  style,
  variant = "primary",
}: PrimaryButtonProps) {
  const buttonStyle = [
    styles.button,
    variant === "secondary" && styles.secondary,
    variant === "danger" && styles.danger,
    disabled && styles.disabled,
    style,
  ];

  const textStyle = [
    styles.text,
    variant === "secondary" && styles.secondaryText,
    variant === "danger" && styles.dangerText,
  ];

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "secondary" ? colors.primary : colors.textLight}
        />
      ) : (
        <Text style={textStyle}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    ...cardShadow,
  },
  secondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.error,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryText: {
    color: colors.textDark,
  },
  dangerText: {
    color: colors.error,
  },
});
