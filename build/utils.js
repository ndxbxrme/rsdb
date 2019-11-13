(function() {
  module.exports = {
    cleanObj: function(obj) {
      var key;
      for (key in obj) {
        if (key.indexOf('$') === 0 || key === '#' || !obj.hasOwnProperty(key)) {
          delete obj[key];
        }
      }
    },
    readDiffs: function(from, to, out) {
      var dif, diffs, good, i, len, myout, mypath;
      diffs = DeepDiff(from, to);
      out = out || {};
      if (diffs) {
        for (i = 0, len = diffs.length; i < len; i++) {
          dif = diffs[i];
          switch (dif.kind) {
            case 'E':
            case 'N':
              myout = out;
              mypath = dif.path.join('.');
              good = true;
              if (dif.lhs && dif.rhs && typeof dif.lhs !== typeof dif.rhs) {
                if (dif.lhs.toString() === dif.rhs.toString()) {
                  good = false;
                }
              }
              if (good) {
                myout[mypath] = {};
                myout = myout[mypath];
                myout.from = dif.lhs;
                myout.to = dif.rhs;
              }
          }
        }
      }
      return out;
    },
    makeWhere: function(whereObj) {
      var parent, parse, props, sql;
      if (!whereObj || whereObj.sort || whereObj.sortDir || whereObj.pageSize) {
        return {
          sql: ''
        };
      }
      props = [];
      parent = '';
      parse = function(obj, op, comp) {
        var andsql, i, j, key, len, len1, objsql, orsql, ref, ref1, sql, thing, writeVal;
        sql = '';
        writeVal = function(key, comp) {
          var fullKey;
          fullKey = `${parent}\`${key}\``.replace(/\./g, '->');
          fullKey = fullKey.replace(/->`\$[a-z]+`$/, '');
          if (obj[key] === null) {
            if (key === '$ne' || key === '$neq') {
              return sql += ` ${op} ${fullKey} IS NOT NULL`;
            } else {
              return sql += ` ${op} ${fullKey} IS NULL`;
            }
          } else {
            sql += ` ${op} ${fullKey} ${comp} ?`;
            return props.push(obj[key]);
          }
        };
        for (key in obj) {
          if (obj.hasOwnProperty(key)) {
            if (key === '$or') {
              orsql = '';
              ref = obj[key];
              for (i = 0, len = ref.length; i < len; i++) {
                thing = ref[i];
                objsql = parse(thing, 'AND', comp).replace(/^ AND /, '');
                if (/ AND | OR /.test(objsql) && objsql.indexOf('(') !== 0) {
                  objsql = `(${objsql})`;
                }
                orsql += ' OR ' + objsql;
              }
              sql += ` ${op} (${orsql})`.replace(/\( OR /g, '(');
            } else if (key === '$and') {
              andsql = '';
              ref1 = obj[key];
              for (j = 0, len1 = ref1.length; j < len1; j++) {
                thing = ref1[j];
                andsql += parse(thing, 'AND', comp);
              }
              sql += ` ${op} (${andsql})`.replace(/\( AND /g, '(');
            } else if (key === '$gt') {
              writeVal(key, '>');
            } else if (key === '$lt') {
              writeVal(key, '<');
            } else if (key === '$gte') {
              writeVal(key, '>=');
            } else if (key === '$lte') {
              writeVal(key, '<=');
            } else if (key === '$eq') {
              writeVal(key, '=');
            } else if (key === '$neq') {
              writeVal(key, '!=');
            } else if (key === '$ne') {
              writeVal(key, '!=');
            } else if (key === '$in') {
              writeVal(key, 'IN');
            } else if (key === '$nin') {
              writeVal(key, 'NOT IN');
            } else if (key === '$like') {
              sql += ` ${op} ${parent.replace(/->$/, '')} LIKE '%${obj[key]}%'`;
              parent = '';
            } else if (key === '$null') {
              sql += ` ${op} ${parent.replace(/->$/, '')} IS NULL`;
              parent = '';
            } else if (key === '$nnull') {
              sql += ` ${op} ${parent.replace(/->$/, '')} IS NOT NULL`;
              parent = '';
            } else if (key === '$nn') {
              sql += ` ${op} ${parent.replace(/->$/, '')} IS NOT NULL`;
              parent = '';
            } else if (Object.prototype.toString.call(obj[key]) === '[object Object]') {
              parent += '`' + key + '`->';
              sql += parse(obj[key], op, comp);
            } else {
              writeVal(key, comp);
            }
          }
        }
        parent = '';
        return sql;
      };
      delete whereObj['#'];
      sql = parse(whereObj, 'AND', '=').replace(/(^|\() (AND|OR) /g, '$1');
      return {
        sql: sql,
        props: props
      };
    }
  };

}).call(this);

//# sourceMappingURL=utils.js.map
