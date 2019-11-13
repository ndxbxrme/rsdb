(function() {
  var fs, glob, path;

  fs = require('fs-extra');

  glob = require('glob');

  path = require('path');

  module.exports = function(config) {
    var clean, unclean;
    clean = function(key) {
      key = key.replace(/:/g, 'IDBI');
      return key.replace(/\//g, 'IIDI');
    };
    unclean = function(key) {
      var regex;
      key = key.replace(/IDBI/g, ':');
      key = key.replace(/IIDI/g, '/');
      regex = new RegExp('^' + path.join(config.localStorage) + '\\\/');
      return key.replace(regex, '');
    };
    return {
      checkDataDir: async function() {
        if (config.localStorage) {
          if (!(await fs.exists(path.join(config.localStorage)))) {
            return (await fs.mkdir(path.join(config.localStorage)));
          }
        }
      },
      keys: function(from, prefix) {
        var ls;
        ls = path.join(config.localStorage).replace(/\\/g, '/') + '/';
        return new Promise(function(resolve, reject) {
          return glob(path.join(config.localStorage, clean(prefix) + '*.json'), function(e, r) {
            var count, gotFrom, i, output;
            if (e) {
              return reject(e);
            }
            i = -1;
            count = 0;
            gotFrom = !from;
            output = {
              Contents: [],
              IsTruncated: false
            };
            while (++i < r.length && count < 1000) {
              r[i] = r[i].replace(ls, '');
              if (gotFrom) {
                output.Contents.push({
                  Key: unclean(r[i].replace('.json', ''))
                });
                count++;
              } else {
                if (unclean(r[i]) === from + '.json') {
                  gotFrom = true;
                }
              }
            }
            if (i < r.length) {
              output.IsTruncated = true;
            }
            return resolve(output);
          });
        });
      },
      del: function(key) {
        var uri;
        uri = path.join(config.localStorage, `${clean(key)}.json`);
        return fs.unlink(uri);
      },
      put: function(key, o) {
        var uri;
        uri = path.join(config.localStorage, `${clean(key)}.json`);
        return fs.writeFile(uri, JSON.stringify(o));
      },
      get: function(key) {
        var uri;
        uri = path.join(config.localStorage, `${clean(key)}.json`);
        return new Promise(async function(resolve, reject) {
          var data, e, text;
          try {
            text = (await fs.readFile(uri, 'utf8'));
          } catch (error) {
            e = error;
            return reject(e);
          }
          try {
            data = JSON.parse(r);
          } catch (error) {
            e = error;
            return reject(e);
          }
          return resolve(data);
        });
      },
      getReadStream: function(key) {
        var uri;
        uri = path.join(config.localStorage, `${clean(key)}.json`);
        return fs.createReadStream(uri);
      },
      getWriteStream: function(key) {
        var uri;
        uri = path.join(config.localStorage, `${clean(key)}.json`);
        return fs.createWriteStream(uri);
      }
    };
  };

}).call(this);

//# sourceMappingURL=local.js.map
