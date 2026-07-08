import React, { useRef, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { CameraCapturedPicture } from "expo-camera";
import { useMobileContent } from "../../content/useMobileContent";

const BASE_WIDTH = 393;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const screenWidth = Dimensions.get("window").width;
const screenHeight = Dimensions.get("window").height;
const scale = clamp(screenWidth / BASE_WIDTH, 0.92, 1.08);
const cameraPreviewHeight = Math.round(clamp(screenHeight * 0.27, 190, 250));

function s(value: number) {
  return Math.round(value * scale);
}

function fs(value: number) {
  return Math.round(value * clamp(scale, 0.94, 1.03));
}

type PhotoMenuCameraProps = {
  loading?: boolean;
  onCancel: () => void;
  onPhotoCaptured: (photo: { imageBase64: string; mimeType: "image/jpeg" }) => void;
};

export function PhotoMenuCamera({
  loading,
  onCancel,
  onPhotoCaptured
}: PhotoMenuCameraProps) {
  const content = useMobileContent();
  const copy = content.photoMenu;
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  async function captureMenuPhoto() {
    if (!cameraRef.current || capturing || loading || !cameraReady) {
      return;
    }

    setCapturing(true);

    try {
      const picture = await cameraRef.current.takePictureAsync({
        base64: true,
        exif: false,
        quality: 0.48
      });
      const imageBase64 = getPictureBase64(picture);

      if (imageBase64) {
        onPhotoCaptured({
          imageBase64,
          mimeType: "image/jpeg"
        });
      }
    } finally {
      setCapturing(false);
    }
  }

  if (!permission) {
    return (
      <View style={local.card}>
        <Text style={local.title}>{copy.title}</Text>
        <Text style={local.hint}>{copy.preparing}</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={local.card}>
        <Text style={local.title}>{copy.title}</Text>
        <Text style={local.hint}>{copy.permissionText}</Text>

        <Pressable style={local.primaryButton} onPress={requestPermission}>
          <Text style={local.primaryButtonText}>{copy.allowCamera}</Text>
        </Pressable>

        <Pressable style={local.secondaryButton} onPress={onCancel}>
          <Text style={local.secondaryButtonText}>{content.common.cancel}</Text>
        </Pressable>
      </View>
    );
  }

  const busy = Boolean(loading || capturing);

  return (
    <View style={local.card}>
      <Text style={local.title}>{copy.title}</Text>
      <Text style={local.hint}>{copy.instruction}</Text>

      <View style={local.cameraBox}>
        <CameraView
          ref={cameraRef}
          active
          facing="back"
          mode="picture"
          onCameraReady={() => setCameraReady(true)}
          style={local.camera}
        />
        {busy ? (
          <View style={local.busyOverlay}>
            <ActivityIndicator color={premiumPalette.gold} />
            <Text style={local.busyText}>{loading ? copy.extracting : copy.capturing}</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={busy || !cameraReady}
        onPress={captureMenuPhoto}
        style={[local.primaryButton, (busy || !cameraReady) ? local.disabled : null]}
      >
        <Text style={local.primaryButtonText}>{copy.captureButton}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={onCancel}
        style={[local.secondaryButton, busy ? local.disabled : null]}
      >
        <Text style={local.secondaryButtonText}>{copy.close}</Text>
      </Pressable>
    </View>
  );
}

function getPictureBase64(picture: CameraCapturedPicture | undefined) {
  return picture?.base64?.trim() ?? "";
}

const premiumPalette = {
  surface: "#FFFDF8",
  surfaceSoft: "#F7F1E7",
  olive: "#1F3B24",
  oliveDeep: "#182C1B",
  gold: "#C6A04A",
  border: "#E4D4B6",
  textSoft: "#6F6A61"
};

const local = StyleSheet.create({
  card: {
    backgroundColor: premiumPalette.surface,
    borderColor: premiumPalette.border,
    borderRadius: s(22),
    borderWidth: 1,
    padding: s(14)
  },
  title: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(18),
    fontWeight: "800",
    lineHeight: fs(24),
    marginBottom: s(8)
  },
  hint: {
    color: premiumPalette.textSoft,
    fontSize: fs(14),
    fontWeight: "600",
    lineHeight: fs(20),
    marginBottom: s(12)
  },
  cameraBox: {
    backgroundColor: "#111111",
    borderRadius: s(18),
    height: cameraPreviewHeight,
    marginBottom: s(12),
    overflow: "hidden"
  },
  camera: {
    flex: 1
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(24, 44, 27, 0.72)",
    justifyContent: "center",
    padding: s(16)
  },
  busyText: {
    color: premiumPalette.surface,
    fontSize: fs(14),
    fontWeight: "800",
    lineHeight: fs(20),
    marginTop: s(10),
    textAlign: "center"
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: premiumPalette.olive,
    borderRadius: s(18),
    justifyContent: "center",
    marginTop: s(8),
    minHeight: s(50),
    paddingHorizontal: s(14),
    paddingVertical: s(12)
  },
  primaryButtonText: {
    color: premiumPalette.surface,
    fontSize: fs(16),
    fontWeight: "800",
    lineHeight: fs(21),
    textAlign: "center"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: premiumPalette.surfaceSoft,
    borderRadius: s(18),
    justifyContent: "center",
    marginTop: s(8),
    minHeight: s(48),
    paddingHorizontal: s(14),
    paddingVertical: s(11)
  },
  secondaryButtonText: {
    color: premiumPalette.oliveDeep,
    fontSize: fs(15),
    fontWeight: "800",
    lineHeight: fs(20),
    textAlign: "center"
  },
  disabled: {
    opacity: 0.55
  }
});
