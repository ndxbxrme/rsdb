(function() {
  var Readable, Writable;

  Readable = require('stream').Readable;

  Writable = require('stream').Writable;

  module.exports = function(config) {
    var clean, unclean;
    clean = function(key) {
      key = key.replace(/:/g, 'IDBI');
      return key.replace(/\//g, 'IIDI');
    };
    unclean = function(key) {
      key = key.replace(/IDBI/g, ':');
      return key = key.replace(/IIDI/g, '/');
    };
    return {
      //regex = new RegExp '^' + path.join(config.localStorage) + '\\\/'
      //key.replace regex, ''
      checkDataDir: function() {
        return config.localStorage;
      },
      keys: function(from, prefix) {
        var allkeys, filteredkeys, i, re;
        allkeys = [];
        i = -1;
        while (i++ < config.localStorage.length - 1) {
          allkeys.push(config.localStorage.key(i));
        }
        re = new RegExp('^' + clean(prefix));
        filteredkeys = allkeys.filter(function(key) {
          return re.test(key);
        });
        return new Promise(function(resolve, reject) {
          var count, gotFrom, output;
          if (filteredkeys) {
            i = -1;
            count = 0;
            gotFrom = !from;
            output = {
              Contents: [],
              IsTruncated: false
            };
            while (++i < filteredkeys.length && count < 1000) {
              if (gotFrom) {
                output.Contents.push({
                  Key: unclean(filteredkeys[i])
                });
                count++;
              } else {
                if (unclean(filteredkeys[i]) === from) {
                  gotFrom = true;
                }
              }
            }
            if (i < filteredkeys.length) {
              output.IsTruncated = true;
            }
            return resolve(output);
          } else {
            return resolve({
              Contents: [],
              IsTruncated: false
            });
          }
        });
      },
      del: function(key) {
        var uri;
        uri = clean(key);
        return config.localStorage.removeItem(uri);
      },
      //fs.unlink uri
      getReadStream: function(key) {
        var s, text, uri;
        uri = clean(key);
        text = config.localStorage.getItem(uri);
        if (!text) {
          throw 'nodata';
        }
        s = new Readable();
        s.push(decodeURIComponent(escape(atob(text))));
        s.push(null);
        return s;
      },
      //fs.createReadStream uri
      getWriteStream: function(key) {
        var text, uri, w;
        uri = clean(key);
        //fs.createWriteStream uri
        text = '';
        w = new Writable({
          emitClose: true
        });
        w._write = function(chunk, encoding, done) {
          text += chunk;
          return done();
        };
        w.end = function(chunk, encoding, done) {
          w.writable = false;
          if (chunk) {
            text += chunk;
          }
          config.localStorage.setItem(uri, btoa(unescape(encodeURIComponent(text))));
          return w = null;
        };
        return w;
      }
    };
  };

}).call(this);

//# sourceMappingURL=local-web.js.map
