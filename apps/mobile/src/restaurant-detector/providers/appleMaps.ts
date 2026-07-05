import type { RestaurantDetectorInput, RestaurantDetectorProvider, RestaurantProviderCandidate } from "../types";

export type AppleMapsLocalSearchPlace = {
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  externalId?: string;
  websiteUrl?: string;
};

export type AppleMapsLocalSearch = (input: RestaurantDetectorInput) => Promise<AppleMapsLocalSearchPlace[]>;

export function createAppleMapsRestaurantDetectorProvider(search: AppleMapsLocalSearch): RestaurantDetectorProvider {
  return {
    source: "apple_maps",

    async detect(input) {
      const places = await search(input);

      return places.map(mapAppleMapsPlace);
    }
  };
}

export const appleMapsRestaurantDetectorProvider: RestaurantDetectorProvider = {
  source: "apple_maps",

  async detect() {
    return [];
  }
};

function mapAppleMapsPlace(place: AppleMapsLocalSearchPlace): RestaurantProviderCandidate {
  return {
    name: place.name,
    source: "apple_maps",
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    externalId: place.externalId,
    websiteUrl: place.websiteUrl
  };
}
