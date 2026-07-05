import ExpoModulesCore
import Foundation
import MapKit

public class RestaurantDetectorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RestaurantDetector")

    AsyncFunction("searchNearbyRestaurants") {
      (latitude: Double, longitude: Double, accuracyMeters: Double, hint: String?) async throws -> [[String: Any]] in
      let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
      let request = MKLocalSearch.Request()
      let trimmedHint = hint?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

      request.naturalLanguageQuery = trimmedHint.isEmpty ? "restaurant" : "restaurant \(trimmedHint)"
      request.region = MKCoordinateRegion(
        center: center,
        latitudinalMeters: Self.searchRadiusMeters(for: accuracyMeters),
        longitudinalMeters: Self.searchRadiusMeters(for: accuracyMeters)
      )
      request.resultTypes = .pointOfInterest

      if #available(iOS 13.0, *) {
        request.pointOfInterestFilter = MKPointOfInterestFilter(including: [
          .restaurant,
          .cafe,
          .bakery
        ])
      }

      let response = try await Self.startSearch(request)

      return response.mapItems
        .filter { item in
          guard let name = item.name?.trimmingCharacters(in: .whitespacesAndNewlines) else {
            return false
          }

          return !name.isEmpty
        }
        .prefix(8)
        .map { item in
          var candidate: [String: Any] = [
            "name": item.name ?? "",
            "latitude": item.placemark.coordinate.latitude,
            "longitude": item.placemark.coordinate.longitude
          ]

          let address = Self.formatAddress(item.placemark)
          if !address.isEmpty {
            candidate["address"] = address
          }

          if let url = item.url?.absoluteString, !url.isEmpty {
            candidate["websiteUrl"] = url
          }

          return candidate
        }
    }
  }

  private static func searchRadiusMeters(for accuracyMeters: Double) -> CLLocationDistance {
    min(max(accuracyMeters * 3, 120), 600)
  }

  private static func startSearch(_ request: MKLocalSearch.Request) async throws -> MKLocalSearch.Response {
    try await withCheckedThrowingContinuation { continuation in
      MKLocalSearch(request: request).start { response, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }

        guard let response else {
          continuation.resume(
            throwing: NSError(
              domain: "RestaurantDetector",
              code: 1,
              userInfo: [NSLocalizedDescriptionKey: "Apple Maps local search returned no response."]
            )
          )
          return
        }

        continuation.resume(returning: response)
      }
    }
  }

  private static func formatAddress(_ placemark: MKPlacemark) -> String {
    [
      [placemark.thoroughfare, placemark.subThoroughfare].compactMap { $0 }.joined(separator: " "),
      placemark.locality,
      placemark.administrativeArea,
      placemark.country
    ]
      .compactMap { value in
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
      }
      .joined(separator: ", ")
  }
}
