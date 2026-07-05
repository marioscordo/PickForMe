export type RestaurantDetectorConfidence = "low" | "medium" | "high";

export type RestaurantDetectorSource =
  | "apple_maps"
  | "google_places"
  | "openstreetmap"
  | "manual"
  | "unknown";

export type LocationFix = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestamp?: string;
};

export type RestaurantDetectorInput = LocationFix & {
  hint?: string;
};

export type RestaurantCandidate = {
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
  confidence: RestaurantDetectorConfidence;
  source: RestaurantDetectorSource;
  externalId?: string;
  websiteUrl?: string;
};

export type RestaurantDetectionResult = {
  bestCandidate?: RestaurantCandidate;
  candidates: RestaurantCandidate[];
  confidence: RestaurantDetectorConfidence;
  requiresUserConfirmation: boolean;
};

export type RestaurantProviderCandidate = Omit<RestaurantCandidate, "confidence" | "distanceMeters"> & {
  distanceMeters?: number;
};

export type RestaurantDetectorProvider = {
  source: RestaurantDetectorSource;
  detect(input: RestaurantDetectorInput): Promise<RestaurantProviderCandidate[]>;
};

export type RestaurantDetectorRuntime = {
  getCurrentLocation(): Promise<LocationFix>;
  provider: RestaurantDetectorProvider;
};
