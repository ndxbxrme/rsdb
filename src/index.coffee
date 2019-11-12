'use strict'

module.exports = (rs) ->
  callbacks =
    ready: []
  callback = (name, obj) ->
    truth = false
    for cb in callbacks[name]
      truth = truth or await cb obj
    truth
  callback 'ready'