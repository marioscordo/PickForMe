const fs = require("fs");

function write(file, content) {
  fs.writeFileSync(file, content.trimStart(), { encoding: "utf8" });
  console.log("written:", file);
}

write("app.config.js", `
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
    ios: {
      supportsTablet: false,
      bundleIdentifier: IS_PROD ? "com.marioscordo.pickforme" : "com.marioscordo.pickforme.dev",
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
      package: IS_PROD ? "com.marioscordo.pickforme" : "com.marioscordo.pickforme.dev"
    },
    plugins: ["expo-dev-client"]
  }
};
`);

write("eas.json", `
{
  "cli": {
    "version": ">= 20.3.0",
    "appVersionSource": "local"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "APP_VARIANT": "development",
        "EXPO_PUBLIC_PICKFORME_API_URL": "http://192.168.178.158:3000"
      }
    },
    "preview": {
      "distribution": "internal",
      "env": {
        "APP_VARIANT": "development",
        "EXPO_PUBLIC_PICKFORME_API_URL": "http://192.168.178.158:3000"
      }
    },
    "production": {
      "autoIncrement": true,
      "env": {
        "APP_VARIANT": "production",
        "EXPO_PUBLIC_PICKFORME_API_URL": "https://api.pickforme.app"
      }
    }
  }
}
`);
