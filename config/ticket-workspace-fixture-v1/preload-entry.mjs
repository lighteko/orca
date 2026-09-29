import {
  decodeFixtureBytes,
  makeMainRequest,
  makeFixtureResponse,
  unavailable,
  validateFixtureResponse,
  validateFixtureUnavailableEnvelope
} from './boundary-runtime.mjs'

globalThis.orcaTicketFixturePreload = {
  decodeFixtureBytes,
  makeMainRequest,
  makeFixtureResponse,
  unavailable,
  validateFixtureResponse,
  validateFixtureUnavailableEnvelope
}
