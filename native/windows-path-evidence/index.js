'use strict'

let addon
function getAddon() {
  if (!addon) {
    addon = require('./build/Release/orca_windows_path_evidence.node')
  }
  return addon
}

function queryDosDeviceTarget(drive) {
  if (typeof drive !== 'string' || !/^[a-z]:$/i.test(drive)) {
    return Promise.resolve(null)
  }
  return getAddon().queryDosDeviceTarget(drive)
}

function inspectPathEntry(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 32767 || path.includes('\0')) {
    return Promise.resolve({ status: 'unavailable' })
  }
  return getAddon().inspectPathEntry(path)
}

module.exports = { queryDosDeviceTarget, inspectPathEntry }
