import { requireOptionalNativeModule } from "expo-modules-core";
import type { AppleMapsLocalSearchPlace } from "./providers/appleMaps";

type NativeRestaurantDetectorModule = {
  searchNearbyRestaurants(
    latitude: number,
    longitude: number,
    accuracyMeters: number,
    hint?: string
  ): Promise<AppleMapsLocalSearchPlace[]>;
};

export function getNativeRestaurantDetectorModule() {
  return requireOptionalNativeModule<NativeRestaurantDetectorModule>("RestaurantDetector");
}
