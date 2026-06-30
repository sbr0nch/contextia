import type { Detector } from '../types.js'
import { privateKey } from './private-key.js'

/** The active detector registry. Add new detectors here. */
export const detectors: Detector[] = [privateKey]

/** Lookup by id. */
export const detectorsById: ReadonlyMap<string, Detector> = new Map(
  detectors.map((d) => [d.id, d]),
)
