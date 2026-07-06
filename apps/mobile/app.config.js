const APP_VARIANT = process.env.APP_VARIANT || "development";
const IS_PROD = APP_VARIANT === "production";
const mobileContent = require("./src/content/mobileContent.de-DE.json");

const cameraUsageDescription = mobileContent.permissions.camera;
const locationWhenInUseUsageDescription = mobileContent.permissions.location;

module.exports = {
  expo: {
    name: IS_PROD ? "GustaroAI" : "GustaroAI Dev",
    slug: "pickforme",
    version: "1.0.0",
    orientation: "portrait",
    scheme: IS_PROD ? "gustaroai" : "gustaroai-dev",
    userInterfaceStyle: "automatic",

    icon: "./assets/icon.png",
    splash: {
      image: "./assets/icon.png",
      resizeMode: "contain",
      backgroundColor: "#071B4A"
    },

    ios: {
      supportsTablet: false,
      buildNumber: "1.0.11",
      bundleIdentifier: IS_PROD
        ? "com.marioscordo.gustaroai"
        : "com.marioscordo.gustaroai.dev",

      infoPlist: {
        CFBundleDevelopmentRegion: "de",
        CFBundleLocalizations: ["de", "en"],
        NSCameraUsageDescription: cameraUsageDescription,
        NSLocationWhenInUseUsageDescription: locationWhenInUseUsageDescription,
        ITSAppUsesNonExemptEncryption: false,
        ...(!IS_PROD
          ? {
              NSAppTransportSecurity: {
                NSAllowsArbitraryLoads: true,
                NSAllowsLocalNetworking: true
              }
            }
          : {})
      }
    },

    android: {
      package: IS_PROD
        ? "com.marioscordo.gustaroai"
        : "com.marioscordo.gustaroai.dev",
      versionCode: 1,
      permissions: ["CAMERA"],

      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#071B4A"
      }
    },

    web: {
      favicon: "./assets/icon.png"
    },

    plugins: [
      ...(!IS_PROD ? ["expo-dev-client"] : []),
      "expo-localization",
      [
        "expo-camera",
        {
          cameraPermission: cameraUsageDescription,
          recordAudioAndroid: false
        }
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission: locationWhenInUseUsageDescription
        }
      ]
    ],

    extra: {
      eas: {
        projectId: "7f45f9ad-456e-4ba2-b7c7-16c4edf44358"
      }
    }
  }
};
