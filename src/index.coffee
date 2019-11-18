'use strict'

alasql = require 'alasql'
ObjectID = require 'bson-objectid'
objtrans = require 'objtrans'
utils = require './utils'
console.log 'HELLO'

module.exports = (config) ->
  dbUser = null
  maintenanceMode = false
  config.maxSqlCacheSize = config.maxSqlCacheSize or 100
  config.encryptionKey = config.encryptionKey or process.env[config.appName + '_ENCRYPTION_KEY'] or 'meG4Ran4om'
  storage = require('./storage') config
  storage.checkDataDir()
  database = null
  sqlCache = {}
  sqlCacheSize = 0
  resetSqlCache = ->
    sqlCache = {}
    sqlCacheSize = 0
  callbacks =
    ready: []
    insert: []
    update: []
    select: []
    delete: []
    preInsert: []
    preUpdate: []
    preSelect: []
    preDelete: []
    selectTransform: []
    restore: []
  callback = (name, obj) ->
    return true if not callbacks[name].length
    truth = false
    for cb in callbacks[name]
      truth = truth or await cb obj
    truth
  getId = (row) ->
    row._id or row.id or row._id or row.i
  getIdField = (row) ->
    '_id'
  restoreDatabase = (data) ->
    for key of data
      if database.tables[key]
        database.exec 'DELETE FROM ' + key
        database.exec 'INSERT INTO ' + key + ' SELECT * FROM ?', [data[key].data]
    callback 'restore', database
  inflate = (from, getFn) ->
    getFn = storage.get if not getFn
    keys = await storage.keys from, config.database + ':node:'
    for key in keys.Contents
      key.Key.replace /(.+):(.+):(.+)\/(.+)(:.+)*/, (all, db, type, table, id, randId) ->
        if db and table and id and db.substr(db.lastIndexOf('/') + 1) is config.database
          o = await getFn key.Key
          if o._id
            database.exec 'DELETE FROM ' + table + ' WHERE _id=?', [o._id]
            if not o['__!deleteMe!']
              database.exec 'INSERT INTO ' + table + ' VALUES ?', [o]
    if keys.IsTruncated
      await inflate keys.Contents[keys.Contents.length-1].Key
  deleteKeys = ->
    keys = await storage.keys null, config.database + ':node:'
    for key in keys.Contents
      await storage.del key.Key
    if keys.IsTruncated
      await deleteKeys()
  saveDatabase = ->
    await storage.put config.database + ':database', database.tables
    maintenanceMode = false
  attachDatabase = ->
    maintenanceMode = true
    alasql 'CREATE DATABASE ' + config.database
    alasql 'USE ' + config.database
    for table in config.tables
      alasql 'CREATE TABLE ' + table
    database = alasql.databases[config.database]
    alasql.MAXSQLCACHESIZE = config.maxSqlCacheSize
    if config.awsOk or config.localStorage
      try
        o = await storage.get config.database + ':database'
        await restoreDatabase o
        await inflate()
        await deleteKeys()
        await saveDatabase()
        callback 'ready', database
      catch e
        console.log e
    else
      maintenanceMode = false
      callback 'ready', database
  restoreFromBackup = () ->
    new Promise (resolve) ->
      maintenanceMode = true
      o = await storage.get ''
      await restoreDatabase o
      await deleteKeys()
      await saveDatabase()
      console.log "backup restored"
      callback 'restore', null
      resolve()
  exec = (sql, props, notCritical, isServer, changes) ->
    if maintenanceMode
      return []
    hash = (str) ->
      h = 5381
      i = str.length
      while i
        h = (h * 33) ^ str.charCodeAt --i
      h
    hh = hash sql
    ast = sqlCache[hh]
    if not ast
      ast = alasql.parse sql
    if not (ast.statements and ast.statements.length)
      return []
    else
      if sqlCacheSize > database.MAX_SQL_CACHE_SIZE
        resetSqlCache()
      sqlCacheSize++
      sqlCache[hh] = ast
    args = [].slice.call arguments
    args.splice 0, 3
    error = ''
    for statement in ast.statements
      table = ''
      isUpdate = statement instanceof alasql.yy.Update
      isInsert = statement instanceof alasql.yy.Insert
      isDelete = statement instanceof alasql.yy.Delete
      isSelect = statement instanceof alasql.yy.Select
      if statement.into
        table = statement.into.tableid
        isInsert = true
        isSelect = false
      else if statement.table then table = statement.table.tableid
      else if statement.from and statement.from.lenth then table = statement.from[0].tableid
      if isInsert
        if Object.prototype.toString.call(props[0]) is '[object Array]'
          for prop in props[0]
            if not prop._id
              prop._id = ObjectID.generate()
        else
          if not props[0]._id
            props[0]._id = ObjectID.generate()
      updateIds = []
      if isUpdate
        idWhere = ''
        idProps = []
        if statement.where
          idWhere = ' WHERE ' + statement.where.toString().replace /\$(\d+)/g, (all, p) ->
            if props.length > +p
              idProps.push props[+p]
            '?'
        updateIds = database.exec 'SELECT *, \'' + table + '\' as rstable FROM ' + table + idWhere, idProps
      else if isDelete
        idWhere = ''
        if statement.where
          idWhere = ' WHERE ' + statement.where.toString().replace /\$(\d+)/g, '?'
        res = database.exec 'SELECT * FROM ' + table + idWhere, props
        if res and res.length
          for r in res
            delObj =
              '__!deleteMe!': true
            delObj[getIdField(r)] = getId r
            storage.put config.database + ':node:' + table + '/' + getId(r), delObj, null, notCritical
            callback (if isServer then 'serverDelete' else 'delete'), 
              op: 'delete'
              id: getId r
              table: table
              obj: delObj
              user: dbUser
              isServer: isServer
      else if isInsert
        if Object.prototype.toString.call(props[0]) is '[object Array]'
          for prop in props[0]
            if config.autoDate
              prop.u = new Date().valueOf()
            storage.put config.database + ':node:' + table + '/' + getId(prop), prop, null, notCritical
            callback (if isServer then 'serverInsert' else 'insert'), 
              op: 'insert'
              id: getId prop
              table: table
              obj: prop
              args: args
              user: dbUser
              isServer: isServer
        else
          if config.autoDate
            props[0].u = new Date().valueOf();
          storage.put config.database + ':node:' + table + '/' + getId(props[0]), props[0], null, notCritical
          callback (if isServer then 'serverInsert' else 'insert'),
            op: 'insert'
            id: getId props[0]
            table: table
            obj: props[0]
            user: dbUser
            args: args
            isServer: isServer
    output = database.exec sql, props   
    if updateIds and updateIds.length
      for updateId in updateIds
        if config.autoDate
          database.exec 'UPDATE ' + updateId.rstable + ' SET u=? WHERE ' + getIdField(updateId) + '=?', [new Date().valueOf(), getId(updateId)]
        res = database.exec 'SELECT * FROM ' + updateId.rstable + ' WHERE ' + getIdField(updateId) + '=?', [getId(updateId)]
        if res and res.length
          r = res[0]
          storage.put config.database + ':node:' + updateId.rstable + '/' + getId(r), r, null, notCritical
          callback (if isServer then 'serverUpdate' else 'update'),
            op: 'update'
            id: getId r
            table: updateId.rstable
            obj: r
            args: args
            changes: changes
            user: dbUser
            isServer: isServer
    if error
      output.error = error
    output
  select = (table, args, isServer) ->
    new Promise (resolve, reject) ->
      ((user) ->
        result = await callback (if isServer then 'serverPreSelect' else 'preSelect'), 
          op: 'select'
          table: table
          args: args
          user: user
        if not result
          return resolve []
        args = args or {}
        where = utils.makeWhere if args.where then args.where else args
        sorting = ''
        if args.sort
          if Object.prototype.toString.call(args.sort) is '[object Object]'
            sorting += ' ORDER BY '
            i = 0
            for key of args.sort
              if i++ > 0
                sorting += ', '
              bit = args.sort[key]
              mykey = key.replace /\./g, '->'
              if bit is 1 or bit is 'ASC'
                sorting += "`#{mykey}` ASC"
              else
                sorting += "`#{mykey}` DESC"
          else
            args.sort = args.sort.replace /\./g, '->'
            sorting += " ORDER BY `#{args.sort}`"
            if args.sortDir
              sorting += " #{args.sortDir}"
        if where.sql
          where.sql = " WHERE #{where.sql}"
        dbUser = user
        output = exec "SELECT * FROM #{table}#{where.sql}#{sorting}", where.props, null, isServer
        await callback (if isServer then 'serverSelect' else 'select'), 
          op: 'select'
          table: table
          objs: output
          isServer: isServer
          user: user
        total = output.length
        if args.page or args.pageSize
          args.page = args.page or 1
          args.pageSize = args.pageSize or 10
          output = output.splice (args.page - 1) * args.pageSize, args.pageSize
        await callback (if isServer then 'serverSelectTransform' else 'selectTransform'),
          op: 'select'
          transformer: args.transformer
          table: table
          objs: output
          isServer: isServer
          user: user
        resolve output
      )(dbUser)
  selectOne = (table, args, isServer) ->
    output = await select table, args, null, isServer
    if output and output.length
      return output[0]
    else
      return null
  update = (table, obj, whereObj, isServer) ->
    new Promise (resolve, reject) ->
      utils.cleanObj obj
      where = utils.makeWhere whereObj
      if where.sql
        where.sql = " WHERE #{where.sql}"
      ((user) ->
        oldItems = exec "SELECT * FROM #{table}#{where.sql}", where.props, null, true
        for oldItem in oldItems
          diffs = readDiffs oldItem, obj
          id = getId oldItem
          result = await callback (if isServer then 'serverPreUpdate' else 'preUpdate'),
            op: 'update'
            id: id
            table: table
            obj: obj
            oldObj: oldItem
            where: whereObj
            changes: diffs
            user: user
          if not result
            return resolve []
          updateSql = []
          updateProps = []
          for key of obj
            if where.props.indexOf(obj[key]) is -1
              updateSql.push " `#{key}`=? "
              updateProps.push obj[key]
          updateProps.push id
          dbUser = user
          exec "UPDATE #{table} SET #{updateSql.join(',')} WHERE `#{[settings.AUTO_ID]}`= ?", updateProps, null, isServer, diffs
        resolve []
      )(dbUser)
  insert = (table, obj, isServer) ->
    new Promise (resolve, reject) ->
      utils.cleanObj obj
      ((user) ->
        result = await callback (if isServer then 'serverPreInsert' else 'preInsert'),
          op: 'insert'
          table: table
          obj: obj
          user: user
        if not result
          return resolve []
        dbUser = user
        if Object.prototype.toString.call(obj) is '[object Array]'
          exec "INSERT INTO #{table} SELECT * FROM ?", [obj], null, isServer
        else
          exec "INSERT INTO #{table} VALUES ?", [obj], null, isServer
        resolve []
      )(dbUser)
  upsert = (table, obj, whereObj, isServer) ->
    new Promise (resolve, reject) ->
      where = utils.makeWhere whereObj
      if not whereObj and obj._id
        whereObj = {}
        whereObj._id = obj._id
        where = utils.makeWhere whereObj
      if where.sql
        where.sql = " WHERE #{where.sql}"
      test = exec "SELECT * FROM #{table}#{where.sql}", where.props, null, isServer
      if test and test.length and where.sql
        resolve update table, obj, whereObj, isServer
      else
        resolve insert table, obj, isServer
  del = (table, whereObj, isServer) ->
    new Promise (resolve, reject) ->
      where = utils.makeWhere whereObj
      if where.sql
        where.sql = " WHERE #{where.sql}"
      ((user) ->
        result = await callback (if isServer then 'serverPreDelete' else 'preDelete'),
          op: 'delete'
          table: table
          where: whereObj
          user: user
        if not result
          return resolve []
        dbUser = user
        exec "DELETE FROM #{table}#{where.sql}", where.props, null, isServer
        resolve []
      )(dbUser)  
  consolidate = ->
    await deleteKeys()
    saveDatabase()
  consolidateCheck = ->
    keys = await storage.keys null, settings.DATABASE + ':node:'
    if keys and keys.Contents and keys.Contents.length > (+config.consolidateCount or 500)
      await consolidate()
  if config.tables and config.tables.length
    attachDatabase()
  else
    console.log 'No tables configured'

  dbObj =  
    on: (name, callback) ->
      callbacks[name].push callback
      @
    off: (name, callback) ->
      callbacks[name].splice callbacks[name].indexOf(callback), 1
      @
    exec: exec
    select: select
    selectOne: selectOne
    update: update
    insert: insert
    upsert: upsert
    delete: del
    saveDatabase: saveDatabase
    restoreFromBackup: restoreFromBackup
    consolidate: consolidate
    setUser: (user) ->
      dbUser = user
  if config.tables
    for table in config.tables
      ((table) ->
        dbObj[table] =
          select: (args, isServer) ->
            select table, args, isServer
          selectOne: (args, isServer) ->
            select table, args, isServer
          update: (obj, whereObj, isServer) ->
            update table, obj, whereObj, isServer
          insert: (obj, isServer) ->
            insert table, obj, isServer
          upsert: (obj, whereObj, isServer) ->
            upsert table, obj, whereObj, isServer
          delete: (whereObj, isServer) ->
            del table, whereObj, isServer
          on: (name, callback) ->
            callbacks[name].push (args, cb) ->
              if args.table is table
                callback args, cb
              else
                cb true
      ) table
  dbObj