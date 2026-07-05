import type { RestaurantDetectorProvider } from "../types";

export const googlePlacesRestaurantDetectorProvider: RestaurantDetectorProvider = {
  source: "google_places",

  async detect() {
    return [];
  }
};
