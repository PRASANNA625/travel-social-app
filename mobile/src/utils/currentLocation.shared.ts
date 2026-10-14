// Why a location request failed, so screens can say what to do about it.
export type LocationProblem = "denied" | "unavailable" | "timeout" | "insecure" | "unsupported";

export class LocationError extends Error {
  constructor(public kind: LocationProblem, message: string) {
    super(message);
  }
}

export const locationProblemOf = (err: unknown): LocationProblem => (err instanceof LocationError ? err.kind : "unavailable");
