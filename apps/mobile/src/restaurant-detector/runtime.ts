import * as Location from "expo-location";
import { createAppleMapsRestaurantDetectorProvider } from "./providers/appleMaps";
import { getNativeRestaurantDetectorModule } from "./nativeRestaurantDetectorModule";
import type { RestaurantDetectorRuntime } from "./types";

export const appleMapsRestaurantDetectorRuntime: RestaurantDetectorRuntime = {
  async getCurrentLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      throw new Error("LOCATION_PERMISSION_DENIED");
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy ?? 999,
      timestamp: new Date(position.timestamp).toISOString()
    };
  },

  provider: createAppleMapsRestaurantDetectorProvider(async (input) => {
    const nativeModule = getNativeRestaurantDetectorModule();
    if (!nativeModule) {
      throw new Error("RESTAURANT_DETECTOR_NATIVE_MODULE_UNAVAILABLE");
    }

    return nativeModule.searchNearbyRestaurants(
      input.latitude,
      input.longitude,
      input.accuracyMeters,
      input.hint
    );
  })
};
