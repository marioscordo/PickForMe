import { useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { premiumColors, radius } from "../../theme/tokens";

type GustaroHelpCommon = {
  title: string;
  close: string;
  openAccessibilityLabel: string;
  closeAccessibilityLabel: string;
};

type GustaroHelpTopic = {
  title: string;
  points: string[];
  tip?: string;
};

type GustaroHelpProps = {
  common: GustaroHelpCommon;
  topic: GustaroHelpTopic;
  style?: StyleProp<ViewStyle>;
};

const BASE_WIDTH = 393;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const screen = Dimensions.get("window");
const scale = clamp(screen.width / BASE_WIDTH, 0.92, 1.08);

function s(value: number) {
  return Math.round(value * scale);
}

function fs(value: number) {
  return Math.round(value * clamp(scale, 0.94, 1.03));
}

const sheetMaxHeight = Math.round(screen.height * 0.78);
const contentMaxHeight = Math.max(s(220), sheetMaxHeight - s(186));

export function GustaroHelp({ common, topic, style }: GustaroHelpProps) {
  const [visible, setVisible] = useState(false);

  function close() {
    setVisible(false);
  }

  return (
    <>
      <Pressable
        accessibilityLabel={common.openAccessibilityLabel}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [local.helpButton, pressed ? local.helpButtonPressed : null, style]}
      >
        <Feather color={palette.gold} name="help-circle" size={s(20)} />
      </Pressable>

      <Modal animationType="fade" transparent visible={visible} onRequestClose={close}>
        <View style={local.backdrop}>
          <Pressable style={local.backdropDismiss} onPress={close} />

          <View style={local.sheet}>
            <View style={local.sheetHeader}>
              <View style={local.sheetIcon}>
                <Feather color={palette.gold} name="help-circle" size={s(20)} />
              </View>
              <View style={local.headerText}>
                <Text style={local.eyebrow}>{common.title}</Text>
                <Text style={local.title}>{topic.title}</Text>
              </View>
            </View>

            <ScrollView
              bounces={false}
              contentContainerStyle={local.content}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              style={local.contentScroll}
            >
              {topic.points.map((point) => (
                <View key={point} style={local.pointRow}>
                  <View style={local.pointDot} />
                  <Text style={local.pointText}>{point}</Text>
                </View>
              ))}

              {topic.tip ? (
                <View style={local.tipBox}>
                  <Feather color={palette.gold} name="info" size={s(18)} />
                  <Text style={local.tipText}>{topic.tip}</Text>
                </View>
              ) : null}
            </ScrollView>

            <Pressable
              accessibilityLabel={common.closeAccessibilityLabel}
              accessibilityRole="button"
              onPress={close}
              style={({ pressed }) => [local.closeButton, pressed ? local.closeButtonPressed : null]}
            >
              <Text style={local.closeText}>{common.close}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const palette = {
  background: "rgba(24, 44, 27, 0.28)",
  surface: "#FFFDF8",
  surfaceSoft: "#F7F1E7",
  olive: premiumColors.olive,
  oliveDeep: "#182C1B",
  gold: premiumColors.gold,
  border: "#E4D4B6",
  textSoft: "#6F6A61"
};

const local = StyleSheet.create({
  helpButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 253, 248, 0.86)",
    borderColor: "rgba(228, 212, 182, 0.82)",
    borderRadius: radius.pill,
    borderWidth: 1,
    height: s(40),
    justifyContent: "center",
    shadowColor: "#6F5522",
    shadowOffset: { width: 0, height: s(8) },
    shadowOpacity: 0.08,
    shadowRadius: s(14),
    width: s(40)
  },
  helpButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }]
  },
  backdrop: {
    alignItems: "center",
    backgroundColor: palette.background,
    flex: 1,
    justifyContent: "center",
    padding: s(22)
  },
  backdropDismiss: {
    ...StyleSheet.absoluteFillObject
  },
  sheet: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: s(30),
    borderWidth: 1,
    maxHeight: sheetMaxHeight,
    maxWidth: 430,
    padding: s(22),
    shadowColor: "#1F271C",
    shadowOffset: { width: 0, height: s(18) },
    shadowOpacity: 0.16,
    shadowRadius: s(30),
    width: "100%"
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: s(13),
    marginBottom: s(17)
  },
  sheetIcon: {
    alignItems: "center",
    backgroundColor: palette.surfaceSoft,
    borderColor: "rgba(228, 212, 182, 0.82)",
    borderRadius: s(18),
    borderWidth: 1,
    height: s(42),
    justifyContent: "center",
    width: s(42)
  },
  headerText: {
    flex: 1
  },
  eyebrow: {
    color: palette.gold,
    fontSize: fs(13),
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: fs(17),
    marginBottom: s(3)
  },
  title: {
    color: palette.oliveDeep,
    fontSize: fs(22),
    fontWeight: "800",
    lineHeight: fs(28)
  },
  contentScroll: {
    alignSelf: "stretch",
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: contentMaxHeight
  },
  content: {
    paddingBottom: s(18)
  },
  pointRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: s(11),
    marginBottom: s(13)
  },
  pointDot: {
    backgroundColor: palette.gold,
    borderRadius: radius.pill,
    height: s(7),
    marginTop: s(8),
    width: s(7)
  },
  pointText: {
    color: palette.textSoft,
    flex: 1,
    fontSize: fs(16),
    fontWeight: "500",
    lineHeight: fs(24)
  },
  tipBox: {
    alignItems: "flex-start",
    backgroundColor: palette.surfaceSoft,
    borderColor: "rgba(228, 212, 182, 0.82)",
    borderRadius: s(20),
    borderWidth: 1,
    flexDirection: "row",
    gap: s(10),
    marginTop: s(3),
    padding: s(15)
  },
  tipText: {
    color: palette.oliveDeep,
    flex: 1,
    fontSize: fs(15),
    fontWeight: "700",
    lineHeight: fs(22)
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: palette.olive,
    borderColor: palette.olive,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: s(18),
    minHeight: s(54),
    paddingHorizontal: s(18)
  },
  closeButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }]
  },
  closeText: {
    color: palette.surface,
    fontSize: fs(16),
    fontWeight: "800",
    lineHeight: fs(21)
  }
});
