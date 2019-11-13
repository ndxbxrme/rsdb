jsonStream = require 'JSONStream'
es = require 'event-stream'
zlib = require 'zlib'
crypto = require 'crypto'

module.exports = (config) ->
  encryptionKey = Buffer.alloc 32
  iv = Buffer.alloc(16, 0)
  encryptionKey = Buffer.concat [Buffer.from(config.encryptionKey)], encryptionKey.length
  algorithm = config.encryptionAlgorithm or 'aes-256-ctr'
  doencrypt = !config.doNotEncrypt
  dozip = !config.doNotEncrypt
  local = require('./local') config
  devices = []
  if config.localStorage
    devices.push local
  #S3
  checkDataDir: ->
    if config.localStorage
      local.checkDataDir()
  keys: (from, prefix) ->
    new Promise (resolve, reject) ->
      return reject 'no storage' if not devices.length
      resolved = false
      for device in devices
        try
          return resolve await device.keys from, prefix
      reject 'nothing found'
  del: (key) ->
    for device in devices
      await device.del key
  put: (key, o) ->
    new Promise (resolve, reject) ->
      jsStringify = new jsonStream.stringify()
      encrypt = crypto.createCipheriv algorithm, encryptionKey, iv
      gzip = zlib.createGzip()
      st = null
      ws = null
      if dozip
        st = jsStringify.pipe gzip
      if doencrypt
        if st
          st = st.pipe encrypt
        else
          st = jsStringify.pipe encrypt
      if not st
        st = jsStringify
      if writeStream
        st = st.pipe writeStream
      else
        for device in devices
          writeStream = device.getWriteStream(key)
          st = st.pipe writeStream
      jsStringify.write o, ->
        jsStringify.flush()
      jsStringify.end()
      st.on 'close', resolve
      st.on 'error', reject
      writeStream.on 'error', reject
      writeStream.on 'uploaded', resolve
      gzip.on 'error', reject
      encrypt.on 'error', reject
  get: (key) ->
    new Promise (resolve, reject) ->
      jsParse = new jsonStream.parse '*'
      decrypt = crypto.createDecipheriv algorithm, encryptionKey, iv
      gunzip = zlib.createGunzip()
      finished = false
      for device in devices
        if not finished
          reader = device.getReadStream key
          st = reader
          if doencrypt
            st = st.pipe decrypt
          if dozip
            st = st.pipe gunzip
          st.pipe jsParse
          .pipe es.mapSync (data) ->
            finished = true
            resolve data
          reader.on 'error', resolve
          st.on 'error', resolve
          jsParse.on 'error', (e) ->
            console.log 'Error parsing database - have you changed your encryption key or turned encryption on or off?  If so, update your database using ndx-framework.'
            reject()