(function() {
  'use strict';
  var DeepDiff, ObjectID, alasql, objtrans, utils;

  alasql = require('alasql');

  ObjectID = require('bson-objectid');

  objtrans = require('objtrans');

  DeepDiff = require('deep-diff');

  utils = require('./utils');

  module.exports = function(config) {
    var attachDatabase, callback, callbacks, consolidate, consolidateCheck, database, dbObj, dbUser, del, deleteKeys, exec, getId, getIdField, inflate, insert, j, len, maintenanceMode, readDiffs, ref, resetSqlCache, restoreDatabase, restoreFromBackup, saveDatabase, select, selectOne, sqlCache, sqlCacheSize, storage, table, update, upsert;
    dbUser = null;
    maintenanceMode = false;
    config.maxSqlCacheSize = config.maxSqlCacheSize || 100;
    config.encryptionKey = config.encryptionKey || process.env[config.appName + '_ENCRYPTION_KEY'] || 'meG4Ran4om';
    storage = require('./storage')(config);
    storage.checkDataDir();
    database = null;
    sqlCache = {};
    sqlCacheSize = 0;
    resetSqlCache = function() {
      sqlCache = {};
      return sqlCacheSize = 0;
    };
    callbacks = {
      ready: [],
      insert: [],
      update: [],
      select: [],
      delete: [],
      preInsert: [],
      preUpdate: [],
      preSelect: [],
      preDelete: [],
      selectTransform: [],
      restore: []
    };
    callback = async function(name, obj) {
      var cb, j, len, ref, truth;
      if (!callbacks[name].length) {
        return true;
      }
      truth = false;
      ref = callbacks[name];
      for (j = 0, len = ref.length; j < len; j++) {
        cb = ref[j];
        truth = truth || (await cb(obj));
      }
      return truth;
    };
    readDiffs = function(from, to, out) {
      var dif, diffs, good, j, len, myout, mypath;
      diffs = DeepDiff(from, to);
      out = out || {};
      if (diffs) {
        for (j = 0, len = diffs.length; j < len; j++) {
          dif = diffs[j];
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
    };
    getId = function(row) {
      return row._id || row.id || row._id || row.i;
    };
    getIdField = function(row) {
      return '_id';
    };
    restoreDatabase = function(data) {
      var key;
      for (key in data) {
        if (database.tables[key]) {
          database.exec('DELETE FROM ' + key);
          database.exec('INSERT INTO ' + key + ' SELECT * FROM ?', [data[key].data]);
        }
      }
      return callback('restore', database);
    };
    inflate = function(from, getFn) {
      return new Promise(async function(resolve, reject) {
        var all, db, id, j, key, keys, len, o, randId, ref, table, type;
        if (!getFn) {
          getFn = storage.get;
        }
        keys = (await storage.keys(from, config.database + ':node:'));
        ref = keys.Contents;
        for (j = 0, len = ref.length; j < len; j++) {
          key = ref[j];
          [all, db, type, table, id, randId] = key.Key.match(/(.+):(.+):(.+)\/(.+)(:.+)*/);
          if (db && table && id && db.substr(db.lastIndexOf('/') + 1) === config.database) {
            o = (await getFn(key.Key));
            if (o._id) {
              database.exec('DELETE FROM ' + table + ' WHERE _id=?', [o._id]);
              if (!o['__!deleteMe!']) {
                database.exec('INSERT INTO ' + table + ' VALUES ?', [o]);
              }
            }
          }
        }
        if (keys.IsTruncated) {
          await inflate(keys.Contents[keys.Contents.length - 1].Key);
        }
        return resolve('done');
      });
    };
    deleteKeys = async function() {
      var j, key, keys, len, ref;
      keys = (await storage.keys(null, config.database + ':node:'));
      ref = keys.Contents;
      for (j = 0, len = ref.length; j < len; j++) {
        key = ref[j];
        await storage.del(key.Key);
      }
      if (keys.IsTruncated) {
        return (await deleteKeys());
      }
    };
    saveDatabase = async function() {
      var e;
      try {
        await storage.put(config.database + ':database', database.tables);
      } catch (error1) {
        e = error1;
        console.log('save db error', e);
      }
      return maintenanceMode = false;
    };
    attachDatabase = async function() {
      var e, j, len, o, ref, table;
      maintenanceMode = true;
      alasql('CREATE DATABASE ' + config.database);
      alasql('USE ' + config.database);
      ref = config.tables;
      for (j = 0, len = ref.length; j < len; j++) {
        table = ref[j];
        alasql('CREATE TABLE ' + table);
      }
      database = alasql.databases[config.database];
      alasql.MAXSQLCACHESIZE = config.maxSqlCacheSize;
      if (config.awsOk || config.localStorage) {
        try {
          o = (await storage.get(config.database + ':database'));
          await restoreDatabase(o);
          await inflate();
          await deleteKeys();
          await saveDatabase();
          return callback('ready', database);
        } catch (error1) {
          e = error1;
          if (e === 'nodata') {
            await saveDatabase();
            return callback('ready', database);
          }
        }
      } else {
        maintenanceMode = false;
        return callback('ready', database);
      }
    };
    restoreFromBackup = function() {
      return new Promise(async function(resolve) {
        var e, o;
        try {
          maintenanceMode = true;
          o = (await storage.get(''));
          await restoreDatabase(o);
          await deleteKeys();
          await saveDatabase();
          console.log("backup restored");
          callback('restore', null);
          return resolve();
        } catch (error1) {
          e = error1;
          return console.log('restore error', e);
        }
      });
    };
    exec = function(sql, props, notCritical, isServer, changes) {
      var args, ast, delObj, error, hash, hh, idProps, idWhere, isDelete, isInsert, isSelect, isUpdate, j, k, l, len, len1, len2, len3, len4, m, n, output, prop, r, ref, ref1, ref2, res, statement, table, updateId, updateIds;
      if (maintenanceMode) {
        return [];
      }
      hash = function(str) {
        var h, i;
        h = 5381;
        i = str.length;
        while (i) {
          h = (h * 33) ^ str.charCodeAt(--i);
        }
        return h;
      };
      hh = hash(sql);
      ast = sqlCache[hh];
      if (!ast) {
        ast = alasql.parse(sql);
      }
      if (!(ast.statements && ast.statements.length)) {
        return [];
      } else {
        if (sqlCacheSize > database.MAX_SQL_CACHE_SIZE) {
          resetSqlCache();
        }
        sqlCacheSize++;
        sqlCache[hh] = ast;
      }
      args = [].slice.call(arguments);
      args.splice(0, 3);
      error = '';
      ref = ast.statements;
      for (j = 0, len = ref.length; j < len; j++) {
        statement = ref[j];
        table = '';
        isUpdate = statement instanceof alasql.yy.Update;
        isInsert = statement instanceof alasql.yy.Insert;
        isDelete = statement instanceof alasql.yy.Delete;
        isSelect = statement instanceof alasql.yy.Select;
        if (statement.into) {
          table = statement.into.tableid;
          isInsert = true;
          isSelect = false;
        } else if (statement.table) {
          table = statement.table.tableid;
        } else if (statement.from && statement.from.lenth) {
          table = statement.from[0].tableid;
        }
        if (isInsert) {
          if (Object.prototype.toString.call(props[0]) === '[object Array]') {
            ref1 = props[0];
            for (k = 0, len1 = ref1.length; k < len1; k++) {
              prop = ref1[k];
              if (!prop._id) {
                prop._id = ObjectID.generate();
              }
            }
          } else {
            if (!props[0]._id) {
              props[0]._id = ObjectID.generate();
            }
          }
        }
        updateIds = [];
        if (isUpdate) {
          idWhere = '';
          idProps = [];
          if (statement.where) {
            idWhere = ' WHERE ' + statement.where.toString().replace(/\$(\d+)/g, function(all, p) {
              if (props.length > +p) {
                idProps.push(props[+p]);
              }
              return '?';
            });
          }
          updateIds = database.exec('SELECT *, \'' + table + '\' as rstable FROM ' + table + idWhere, idProps);
        } else if (isDelete) {
          idWhere = '';
          if (statement.where) {
            idWhere = ' WHERE ' + statement.where.toString().replace(/\$(\d+)/g, '?');
          }
          res = database.exec('SELECT * FROM ' + table + idWhere, props);
          if (res && res.length) {
            for (l = 0, len2 = res.length; l < len2; l++) {
              r = res[l];
              delObj = {
                '__!deleteMe!': true
              };
              delObj[getIdField(r)] = getId(r);
              storage.put(config.database + ':node:' + table + '/' + getId(r), delObj, null, notCritical);
              callback((isServer ? 'serverDelete' : 'delete'), {
                op: 'delete',
                id: getId(r),
                table: table,
                obj: delObj,
                user: dbUser,
                isServer: isServer
              });
            }
          }
        } else if (isInsert) {
          if (Object.prototype.toString.call(props[0]) === '[object Array]') {
            ref2 = props[0];
            for (m = 0, len3 = ref2.length; m < len3; m++) {
              prop = ref2[m];
              if (config.autoDate) {
                prop.u = new Date().valueOf();
              }
              storage.put(config.database + ':node:' + table + '/' + getId(prop), prop, null, notCritical);
              callback((isServer ? 'serverInsert' : 'insert'), {
                op: 'insert',
                id: getId(prop),
                table: table,
                obj: prop,
                args: args,
                user: dbUser,
                isServer: isServer
              });
            }
          } else {
            if (config.autoDate) {
              props[0].u = new Date().valueOf();
            }
            storage.put(config.database + ':node:' + table + '/' + getId(props[0]), props[0], null, notCritical);
            callback((isServer ? 'serverInsert' : 'insert'), {
              op: 'insert',
              id: getId(props[0]),
              table: table,
              obj: props[0],
              user: dbUser,
              args: args,
              isServer: isServer
            });
          }
        }
      }
      output = database.exec(sql, props);
      if (updateIds && updateIds.length) {
        for (n = 0, len4 = updateIds.length; n < len4; n++) {
          updateId = updateIds[n];
          if (config.autoDate) {
            database.exec('UPDATE ' + updateId.rstable + ' SET u=? WHERE ' + getIdField(updateId) + '=?', [new Date().valueOf(), getId(updateId)]);
          }
          res = database.exec('SELECT * FROM ' + updateId.rstable + ' WHERE ' + getIdField(updateId) + '=?', [getId(updateId)]);
          if (res && res.length) {
            r = res[0];
            storage.put(config.database + ':node:' + updateId.rstable + '/' + getId(r), r, null, notCritical);
            callback((isServer ? 'serverUpdate' : 'update'), {
              op: 'update',
              id: getId(r),
              table: updateId.rstable,
              obj: r,
              args: args,
              changes: changes,
              user: dbUser,
              isServer: isServer
            });
          }
        }
      }
      if (error) {
        output.error = error;
      }
      return output;
    };
    select = function(table, args, isServer) {
      return new Promise(function(resolve, reject) {
        return (async function(user) {
          var bit, i, key, mykey, output, result, sorting, total, where;
          result = (await callback((isServer ? 'serverPreSelect' : 'preSelect'), {
            op: 'select',
            table: table,
            args: args,
            user: user
          }));
          if (!result) {
            return resolve([]);
          }
          args = args || {};
          where = utils.makeWhere(args.where ? args.where : args);
          sorting = '';
          if (args.sort) {
            if (Object.prototype.toString.call(args.sort) === '[object Object]') {
              sorting += ' ORDER BY ';
              i = 0;
              for (key in args.sort) {
                if (i++ > 0) {
                  sorting += ', ';
                }
                bit = args.sort[key];
                mykey = key.replace(/\./g, '->');
                if (bit === 1 || bit === 'ASC') {
                  sorting += `\`${mykey}\` ASC`;
                } else {
                  sorting += `\`${mykey}\` DESC`;
                }
              }
            } else {
              args.sort = args.sort.replace(/\./g, '->');
              sorting += ` ORDER BY \`${args.sort}\``;
              if (args.sortDir) {
                sorting += ` ${args.sortDir}`;
              }
            }
          }
          if (where.sql) {
            where.sql = ` WHERE ${where.sql}`;
          }
          dbUser = user;
          output = exec(`SELECT * FROM ${table}${where.sql}${sorting}`, where.props, null, isServer);
          await callback((isServer ? 'serverSelect' : 'select'), {
            op: 'select',
            table: table,
            objs: output,
            isServer: isServer,
            user: user
          });
          total = output.length;
          if (args.page || args.pageSize) {
            args.page = args.page || 1;
            args.pageSize = args.pageSize || 10;
            output = output.splice((args.page - 1) * args.pageSize, args.pageSize);
          }
          await callback((isServer ? 'serverSelectTransform' : 'selectTransform'), {
            op: 'select',
            transformer: args.transformer,
            table: table,
            objs: output,
            isServer: isServer,
            user: user
          });
          output.total = total;
          output.page = args.page || 1;
          output.pageSize = args.pageSize || 0;
          return resolve(output);
        })(dbUser);
      });
    };
    selectOne = async function(table, args, isServer) {
      var output;
      output = (await select(table, args, null, isServer));
      if (output && output.length) {
        return output[0];
      } else {
        return null;
      }
    };
    update = function(table, obj, whereObj, isServer) {
      return new Promise(function(resolve, reject) {
        var where;
        utils.cleanObj(obj);
        where = utils.makeWhere(whereObj);
        if (where.sql) {
          where.sql = ` WHERE ${where.sql}`;
        }
        return (async function(user) {
          var diffs, id, j, key, len, oldItem, oldItems, result, updateProps, updateSql;
          oldItems = exec(`SELECT * FROM ${table}${where.sql}`, where.props, null, true);
          for (j = 0, len = oldItems.length; j < len; j++) {
            oldItem = oldItems[j];
            diffs = readDiffs(oldItem, obj);
            id = getId(oldItem);
            result = (await callback((isServer ? 'serverPreUpdate' : 'preUpdate'), {
              op: 'update',
              id: id,
              table: table,
              obj: obj,
              oldObj: oldItem,
              where: whereObj,
              changes: diffs,
              user: user
            }));
            if (!result) {
              return resolve([]);
            }
            updateSql = [];
            updateProps = [];
            for (key in obj) {
              if (where.props.indexOf(obj[key]) === -1) {
                updateSql.push(` \`${key}\`=? `);
                updateProps.push(obj[key]);
              }
            }
            updateProps.push(id);
            dbUser = user;
            exec(`UPDATE ${table} SET ${updateSql.join(',')} WHERE \`_id\`= ?`, updateProps, null, isServer, diffs);
          }
          return resolve([]);
        })(dbUser);
      });
    };
    insert = function(table, obj, isServer) {
      return new Promise(function(resolve, reject) {
        utils.cleanObj(obj);
        return (async function(user) {
          var result;
          result = (await callback((isServer ? 'serverPreInsert' : 'preInsert'), {
            op: 'insert',
            table: table,
            obj: obj,
            user: user
          }));
          if (!result) {
            return resolve([]);
          }
          dbUser = user;
          if (Object.prototype.toString.call(obj) === '[object Array]') {
            exec(`INSERT INTO ${table} SELECT * FROM ?`, [obj], null, isServer);
          } else {
            exec(`INSERT INTO ${table} VALUES ?`, [obj], null, isServer);
          }
          return resolve([]);
        })(dbUser);
      });
    };
    upsert = function(table, obj, whereObj, isServer) {
      return new Promise(function(resolve, reject) {
        var test, where;
        where = utils.makeWhere(whereObj);
        if (!whereObj && obj._id) {
          whereObj = {};
          whereObj._id = obj._id;
          where = utils.makeWhere(whereObj);
        }
        if (where.sql) {
          where.sql = ` WHERE ${where.sql}`;
        }
        test = exec(`SELECT * FROM ${table}${where.sql}`, where.props, null, isServer);
        if (test && test.length && where.sql) {
          return resolve(update(table, obj, whereObj, isServer));
        } else {
          return resolve(insert(table, obj, isServer));
        }
      });
    };
    del = function(table, whereObj, isServer) {
      return new Promise(function(resolve, reject) {
        var where;
        where = utils.makeWhere(whereObj);
        if (where.sql) {
          where.sql = ` WHERE ${where.sql}`;
        }
        return (async function(user) {
          var result;
          result = (await callback((isServer ? 'serverPreDelete' : 'preDelete'), {
            op: 'delete',
            table: table,
            where: whereObj,
            user: user
          }));
          if (!result) {
            return resolve([]);
          }
          dbUser = user;
          exec(`DELETE FROM ${table}${where.sql}`, where.props, null, isServer);
          return resolve([]);
        })(dbUser);
      });
    };
    consolidate = async function() {
      await deleteKeys();
      return saveDatabase();
    };
    consolidateCheck = async function() {
      var keys;
      keys = (await storage.keys(null, config.database + ':node:'));
      if (keys && keys.Contents && keys.Contents.length > (+config.consolidateCount || 500)) {
        return (await consolidate());
      }
    };
    if (config.tables && config.tables.length) {
      attachDatabase();
    } else {
      console.log('No tables configured');
    }
    dbObj = {
      on: function(name, callback) {
        callbacks[name].push(callback);
        return this;
      },
      off: function(name, callback) {
        callbacks[name].splice(callbacks[name].indexOf(callback), 1);
        return this;
      },
      exec: exec,
      select: select,
      selectOne: selectOne,
      update: update,
      insert: insert,
      upsert: upsert,
      delete: del,
      saveDatabase: saveDatabase,
      restoreFromBackup: restoreFromBackup,
      consolidate: consolidate,
      setUser: function(user) {
        return dbUser = user;
      },
      wrapUserFunctions: function(user) {
        var fns, j, len, op, ref;
        fns = {};
        ref = ['select', 'selectOne', 'update', 'insert', 'upsert', 'delete'];
        for (j = 0, len = ref.length; j < len; j++) {
          op = ref[j];
          (function(op) {
            return fns[op] = function() {
              dbUser = user;
              return dbObj[op].apply(this, arguments);
            };
          })(op);
        }
        return fns;
      }
    };
    if (config.tables) {
      ref = config.tables;
      for (j = 0, len = ref.length; j < len; j++) {
        table = ref[j];
        (function(table) {
          return dbObj[table] = {
            select: function(args, isServer) {
              return select(table, args, isServer);
            },
            selectOne: function(args, isServer) {
              return select(table, args, isServer);
            },
            update: function(obj, whereObj, isServer) {
              return update(table, obj, whereObj, isServer);
            },
            insert: function(obj, isServer) {
              return insert(table, obj, isServer);
            },
            upsert: function(obj, whereObj, isServer) {
              return upsert(table, obj, whereObj, isServer);
            },
            delete: function(whereObj, isServer) {
              return del(table, whereObj, isServer);
            },
            on: function(name, callback) {
              return callbacks[name].push(function(args, cb) {
                if (args.table === table) {
                  return callback(args, cb);
                } else {
                  return cb(true);
                }
              });
            }
          };
        })(table);
      }
    }
    return dbObj;
  };

}).call(this);

//# sourceMappingURL=index.js.map
