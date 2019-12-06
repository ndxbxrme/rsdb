fs = require 'fs-extra'
glob = require 'glob'
path = require 'path'

module.exports = (config) ->
  clean = (key) ->
    key = key.replace /:/g, 'IDBI'
    key.replace /\//g, 'IIDI'
  unclean = (key) ->
    key = key.replace /IDBI/g, ':'
    key = key.replace /IIDI/g, '/'
    regex = new RegExp '^' + path.join(config.localStorage) + '\\\/'
    key.replace regex, ''
  checkDataDir: ->
    if config.localStorage
      if not fs.existsSync path.join(config.localStorage)
        fs.mkdirSync path.join(config.localStorage) 
  keys: (from, prefix) ->
    ls = path.join(config.localStorage).replace(/\\/g, '/') + '/'
    new Promise (resolve, reject) ->
      glob path.join(config.localStorage, clean(prefix) + '*.json'), (e, r) ->
        return reject e if e
        i = -1
        count = 0
        gotFrom = not from
        output = 
          Contents: []
          IsTruncated: false
        while ++i < r.length and count < 1000
          r[i] = r[i].replace ls, ''
          if gotFrom
            output.Contents.push
              Key: unclean r[i].replace('.json', '')
            count++
          else
            if unclean(r[i]) is from + '.json'
              gotFrom = true
        if i < r.length
          output.IsTruncated = true
        resolve output
  del: (key) ->
    uri = path.join(config.localStorage, "#{clean(key)}.json")
    fs.unlink uri
  put: (key, o) ->
    uri = path.join(config.localStorage, "#{clean(key)}.json")
    fs.writeFile uri, JSON.stringify(o)
  get: (key) ->
    uri = path.join(config.localStorage, "#{clean(key)}.json")
    new Promise (resolve, reject) ->
      try
        text = await fs.readFile uri, 'utf8'
      catch e
        return reject e
      try
        data = JSON.parse r
      catch e
        return reject e
      resolve data
  getReadStream: (key) ->
    uri = path.join(config.localStorage, "#{clean(key)}.json")
    fs.createReadStream uri
  getWriteStream: (key) ->
    uri = path.join(config.localStorage, "#{clean(key)}.json")
    fs.createWriteStream uri
      
        
      