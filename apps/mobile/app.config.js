const APP_VARIANT = process.env.APP_VARIANT || "development";
const IS_PROD = APP_VARIANT === "production";

module.exports = {
  expo: {
    name: IS_PROD ? "PickForMe" : "PickForMe Dev",
    slug: "pickforme",
    version: "1.0.0",
    orientation: "portrait",
    scheme: IS_PROD ? "pickforme" : "pickforme-dev",
    userInterfaceStyle: "automatic",

    icon: "./assets/icon.png",

    ios: {
      supportsTablet: false,
      bundleIdentifier: IS_PROD
        ? "com.marioscordo.pickforme"
        : "com.marioscordo.pickforme.dev",

      infoPlist: IS_PROD
        ? {}
        : {
            NSAppTransportSecurity: {
              NSAllowsArbitraryLoads: true,
              NSAllowsLocalNetworking: true
            }
          }
    },

    android: {
      package: IS_PROD
        ? "com.marioscordo.pickforme"
        : "com.marioscordo.pickforme.dev",

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
      [
        "expo-camera",
        {
          cameraPermission: "PickForMe benötigt die Kamera, um QR-Codes von Speisekarten zu scannen."
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
