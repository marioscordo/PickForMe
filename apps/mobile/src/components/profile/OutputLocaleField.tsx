import React, { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { OUTPUT_LOCALES, resolveOutputLocale } from "../../config/outputLocales";
import { useMobileContent } from "../../content/useMobileContent";
import { colors } from "../../theme/styles";

type OutputLocaleFieldProps = {
  value: string | undefined;
  onChange: (value: string) => void;
};

export function OutputLocaleField({ value, onChange }: OutputLocaleFieldProps) {
  const content = useMobileContent();
  const [open, setOpen] = useState(false);
  const selectedLocale = resolveOutputLocale(value);
  const options = useMemo(
    () =>
      OUTPUT_LOCALES.map((locale) => ({
        locale,
        label: formatLocaleLabel(locale, selectedLocale)
      })),
    [selectedLocale]
  );
  const selectedLabel = options.find((option) => option.locale === selectedLocale)?.label ?? selectedLocale;

  function selectLocale(locale: string) {
    onChange(locale);
    setOpen(false);
  }

  return (
    <View style={local.field}>
      <Text style={local.label}>{content.outputLocale.label}</Text>
      <Pressable
        accessibilityRole="button"
        style={local.select}
        onPress={() => setOpen(true)}
      >
        <Text style={local.selectText}>{selectedLabel}</Text>
        <Text style={local.chevron}>{content.outputLocale.chevron}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={local.backdrop} onPress={() => setOpen(false)}>
          <View style={local.menu}>
            <Text style={local.menuTitle}>{content.outputLocale.menuTitle}</Text>
            {options.map((option) => {
              const active = option.locale === selectedLocale;

              return (
                <Pressable
                  key={option.locale}
                  accessibilityRole="button"
                  style={[local.option, active && local.optionActive]}
                  onPress={() => selectLocale(option.locale)}
                >
                  <Text style={[local.optionText, active && local.optionTextActive]}>
                    {option.label}
                  </Text>
                  <Text style={[local.optionCode, active && local.optionTextActive]}>
                    {option.locale}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function formatLocaleLabel(locale: string, displayLocale: string) {
  const [languageCode, regionCode] = locale.split("-");
  const languageName = getDisplayName("language", languageCode, displayLocale);
  const regionName = getDisplayName("region", regionCode, displayLocale);

  return regionName ? `${languageName} (${regionName})` : languageName;
}

function getDisplayName(type: "language" | "region", code: string | undefined, displayLocale: string) {
  if (!code) {
    return "";
  }

  try {
    if (typeof Intl.DisplayNames === "function") {
      return new Intl.DisplayNames([displayLocale], { type }).of(code) ?? code;
    }
  } catch {
  }

  return code;
}

const local = StyleSheet.create({
  field: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14
  },

  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8
  },

  select: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 14
  },

  selectText: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "900"
  },

  chevron: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    marginLeft: 10
  },

  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(17, 24, 39, 0.36)",
    flex: 1,
    justifyContent: "center",
    padding: 18
  },

  menu: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 420,
    padding: 14,
    width: "100%"
  },

  menuTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 10
  },

  option: {
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12
  },

  optionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },

  optionText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },

  optionCode: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3
  },

  optionTextActive: {
    color: "#FFFFFF"
  }
});
