(function() {
  'use strict';
  module.exports = function(rs) {
    var callback, callbacks;
    callbacks = {
      ready: []
    };
    callback = async function(name, obj) {
      var cb, i, len, ref, truth;
      truth = false;
      ref = callbacks[name];
      for (i = 0, len = ref.length; i < len; i++) {
        cb = ref[i];
        truth = truth || (await cb(obj));
      }
      return truth;
    };
    return callback('ready');
  };

}).call(this);

//# sourceMappingURL=index.js.map
