import { createServerCapability } from './server-capability'

/** Bind every update argument, independent of object key ordering or omitted optional fields. */
export function reservationMutationResource(payload: object): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key, entry]) => key !== 'server_token' && entry !== undefined)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, entry]) => [key, canonical(entry)])
      )
    }
    return value
  }
  return JSON.stringify(['reservation-mutation-v1', canonical(payload)])
}

export function withReservationMutationCapability<T extends object>(operation: string, payload: T) {
  return {
    ...payload,
    server_token: createServerCapability(
      `reservation:${operation}`,
      reservationMutationResource(payload)
    ),
  }
}
