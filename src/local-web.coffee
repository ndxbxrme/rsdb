Readable = require('stream').Readable
Writable = require('stream').Writable

module.exports = (config) ->
  clean = (key) ->
    key = key.replace /:/g, 'IDBI'
    key.replace /\//g, 'IIDI'
  unclean = (key) ->
    key = key.replace /IDBI/g, ':'
    key = key.replace /IIDI/g, '/'
    #regex = new RegExp '^' + path.join(config.localStorage) + '\\\/'
    #key.replace regex, ''
  checkDataDir: ->
    return config.localStorage
  keys: (from, prefix) ->
    allkeys = []
    i = -1
    while i++ < config.localStorage.length - 1
      allkeys.push config.localStorage.key i
    re = new RegExp '^' + clean(prefix)
    filteredkeys = allkeys.filter (key) ->
      re.test key
    new Promise (resolve, reject) ->
      if filteredkeys
        i = -1
        count = 0
        gotFrom = not from
        output = 
          Contents: []
          IsTruncated: false
        while ++i < filteredkeys.length and count < 1000
          if gotFrom
            output.Contents.push
              Key: unclean filteredkeys[i]
            count++
          else
            if unclean(filteredkeys[i]) is from
              gotFrom = true
        if i < filteredkeys.length
          output.IsTruncated = true
        resolve output
      else
        resolve
          Contents: []
          IsTruncated: false
  del: (key) ->
    uri = clean(key)
    config.localStorage.removeItem uri
    #fs.unlink uri
  getReadStream: (key) ->
    uri = clean(key)
    text = config.localStorage.getItem uri
    throw 'nodata' if not text
    s = new Readable()
    s.push decodeURIComponent escape atob text
    s.push null
    s
    #fs.createReadStream uri
  getWriteStream: (key) ->
    uri = clean(key)
    #fs.createWriteStream uri
    text = ''
    w = new Writable
      emitClose: true
    w._write = (chunk, encoding, done) ->
      text += chunk
      done()
    w.end = (chunk, encoding, done) ->
      w.writable = false
      text += chunk if chunk
      config.localStorage.setItem uri, btoa unescape encodeURIComponent text
      w = null
    w
        
      