'use strict'

module.exports = (rs) ->
  callbacks =
    ready: []
  callback = (name, obj) ->
    truth = false
    for cb in callbacks[name]
      truth = truth or await cb obj
    truth
  setTimeout ->
    callback 'ready'
  
  on: (name, callback) ->
    callbacks[name].push callback
    @
  off: (name, callback) ->
    callbacks[name].splice callbacks[name].indexOf(callback), 1
    @