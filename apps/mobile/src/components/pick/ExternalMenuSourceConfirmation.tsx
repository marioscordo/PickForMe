import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMobileContent } from "../../content/useMobileContent";
import { radius } from "../../theme/tokens";
import type { ExternalMenuCandidate } from "../../gustaroai/restaurantDiscoveryRoutine";

type ExternalMenuSourceConfirmationProps = {
  candidate?: ExternalMenuCandidate | null;
  restaurantName: string;
  visible: boolean;
  onConfirm: (candidate: ExternalMenuCandidate) => void;
  onReject: () => void;
};

export function ExternalMenuSourceConfirmation({
  candidate,
  restaurantName,
  visible,
  onConfirm,
  onReject
}: ExternalMenuSourceConfirmationProps) {
  const content = useMobileContent();
  const copy = content.restaurantDiscovery.externalMenuConfirmation;

  return (
    <Modal animationType="fade" transparent visible={visible && Boolean(candidate)} onRequestClose={onReject}>
      <View style={local.overlay}>
        <View style={local.dialog}>
          <View style={local.iconCircle}>
            <Feather color={premiumPalette.gold} name="external-link" size={22} />
          </View>
          <Text style={local.title}>{copy.title}</Text>
          <Text style={local.message}>{copy.message}</Text>
          {restaurantName ? <Text style={local.restaurantName}>{restaurantName}</Text> : null}
          {candidate ? (
            <View style={local.sourceBox}>
              <Text style={local.sourceLabel}>{copy.sourceLabel}</Text>
              <Text style={local.sourceDomain}>{candidate.providerDomain}</Text>
            </View>
          ) : null}

          <View style={local.actions}>
            <Pressable accessibilityRole="button" onPress={onReject} style={[local.button, local.secondaryButton]}>
              <Text style={[local.buttonText, local.secondaryButtonText]}>{copy.rejectButton}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (candidate) onConfirm(candidate);
              }}
              style={[local.button, local.primaryButton]}
            >
              <Text style={[local.buttonText, local.primaryButtonText]}>{copy.confirmButton}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const premiumPalette = {
  backgroundOverlay: "rgba(24, 44, 27, 0.38)",
  surface: "#FFFDF8",
  surfaceSoft: "#F7F1E7",
  olive: "#1F3B24",
  oliveDeep: "#182C1B",
  gold: "#C6A04A",
  border: "#E4D4B6",
  borderSoft: "#EFE4D1",
  textSoft: "#6F6A61"
};

const local = StyleSheet.create({
  overlay: {
    alignItems: "center",
    backgroundColor: premiumPalette.backgroundOverlay,
    flex: 1,
    justifyContent: "center",
    padding: 24
  },
  dialog: {
    backgroundColor: premiumPalette.surface,
    borderColor: premiumPalette.border,
    borderRadius: 26,
    borderWidth: 1,
    maxWidth: 360,
    padding: 22,
    shadowColor: premiumPalette.oliveDeep,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    width: "100%"
  },
  iconCircle: {
    alignItems: "center",
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.borderSoft,
    borderRadius: 21,
    borderWidth: 1,
    height: 46,
    justifyContent: "center",
    marginBottom: 14,
    width: 46
  },
  title: {
    color: premiumPalette.oliveDeep,
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 27,
    marginBottom: 8
  },
  message: {
    color: premiumPalette.textSoft,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    marginBottom: 14
  },
  restaurantName: {
    color: premiumPalette.oliveDeep,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
    marginBottom: 10
  },
  sourceBox: {
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.borderSoft,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  sourceLabel: {
    color: premiumPalette.textSoft,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginBottom: 2
  },
  sourceDomain: {
    color: premiumPalette.oliveDeep,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20
  },
  actions: {
    gap: 10
  },
  button: {
    alignItems: "center",
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 16
  },
  primaryButton: {
    backgroundColor: premiumPalette.olive
  },
  secondaryButton: {
    backgroundColor: premiumPalette.surfaceSoft,
    borderColor: premiumPalette.border,
    borderWidth: 1
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
    textAlign: "center"
  },
  primaryButtonText: {
    color: premiumPalette.surface
  },
  secondaryButtonText: {
    color: premiumPalette.oliveDeep
  }
});
