(function() {
  var crypto, es, jsonStream, zlib;

  jsonStream = require('JSONStream');

  es = require('event-stream');

  zlib = require('zlib');

  crypto = require('crypto');

  module.exports = function(config) {
    var algorithm, devices, doencrypt, dozip, encryptionKey, iv, local;
    encryptionKey = Buffer.alloc(32);
    iv = Buffer.alloc(16, 0);
    encryptionKey = Buffer.concat([Buffer.from(config.encryptionKey)], encryptionKey.length);
    algorithm = config.encryptionAlgorithm || 'aes-256-ctr';
    doencrypt = !config.doNotEncrypt;
    dozip = !config.doNotEncrypt;
    local = require('./local')(config);
    devices = [];
    if (config.localStorage) {
      devices.push(local);
    }
    return {
      //S3
      checkDataDir: function() {
        if (config.localStorage) {
          return local.checkDataDir();
        }
      },
      keys: function(from, prefix) {
        return new Promise(async function(resolve, reject) {
          var device, i, len, resolved;
          if (!devices.length) {
            return reject('no storage');
          }
          resolved = false;
          for (i = 0, len = devices.length; i < len; i++) {
            device = devices[i];
            try {
              return resolve((await device.keys(from, prefix)));
            } catch (error) {}
          }
          return reject('nothing found');
        });
      },
      del: async function(key) {
        var device, i, len, results;
        results = [];
        for (i = 0, len = devices.length; i < len; i++) {
          device = devices[i];
          results.push((await device.del(key)));
        }
        return results;
      },
      put: function(key, o) {
        return new Promise(function(resolve, reject) {
          var device, encrypt, gzip, i, jsStringify, len, st, writeStream, ws;
          jsStringify = new jsonStream.stringify();
          encrypt = crypto.createCipheriv(algorithm, encryptionKey, iv);
          gzip = zlib.createGzip();
          st = null;
          ws = null;
          if (dozip) {
            st = jsStringify.pipe(gzip);
          }
          if (doencrypt) {
            if (st) {
              st = st.pipe(encrypt);
            } else {
              st = jsStringify.pipe(encrypt);
            }
          }
          if (!st) {
            st = jsStringify;
          }
          if (writeStream) {
            st = st.pipe(writeStream);
          } else {
            for (i = 0, len = devices.length; i < len; i++) {
              device = devices[i];
              writeStream = device.getWriteStream(key);
              st = st.pipe(writeStream);
            }
          }
          jsStringify.write(o, function() {
            return jsStringify.flush();
          });
          jsStringify.end();
          st.on('close', resolve);
          st.on('error', reject);
          writeStream.on('error', reject);
          writeStream.on('uploaded', resolve);
          gzip.on('error', reject);
          return encrypt.on('error', reject);
        });
      },
      get: function(key) {
        return new Promise(function(resolve, reject) {
          var decrypt, device, finished, gunzip, i, jsParse, len, reader, results, st;
          jsParse = new jsonStream.parse('*');
          decrypt = crypto.createDecipheriv(algorithm, encryptionKey, iv);
          gunzip = zlib.createGunzip();
          finished = false;
          results = [];
          for (i = 0, len = devices.length; i < len; i++) {
            device = devices[i];
            if (!finished) {
              reader = device.getReadStream(key);
              st = reader;
              if (doencrypt) {
                st = st.pipe(decrypt);
              }
              if (dozip) {
                st = st.pipe(gunzip);
              }
              st.pipe(jsParse).pipe(es.mapSync(function(data) {
                finished = true;
                return resolve(data);
              }));
              reader.on('error', resolve);
              st.on('error', resolve);
              results.push(jsParse.on('error', function(e) {
                console.log('Error parsing database - have you changed your encryption key or turned encryption on or off?  If so, update your database using ndx-framework.');
                return reject();
              }));
            } else {
              results.push(void 0);
            }
          }
          return results;
        });
      }
    };
  };

}).call(this);

//# sourceMappingURL=storage.js.map
