module.exports =
  cleanObj: (obj) ->
    for key of obj
      if key.indexOf('$') is 0 or key is '#' or not obj.hasOwnProperty(key)
        delete obj[key]
    return
  readDiffs: (from, to, out) ->
    diffs = DeepDiff from, to
    out = out or {}
    if diffs
      for dif in diffs
        switch dif.kind
          when 'E', 'N'
            myout = out
            mypath = dif.path.join('.')
            good = true
            if dif.lhs and dif.rhs and typeof(dif.lhs) isnt typeof(dif.rhs)
              if dif.lhs.toString() is dif.rhs.toString()
                good = false
            if good
              myout[mypath] ={}
              myout = myout[mypath]
              myout.from = dif.lhs
              myout.to = dif.rhs
    out
  makeWhere: (whereObj) ->
    if not whereObj or whereObj.sort or whereObj.sortDir or whereObj.pageSize
      return sql: ''
    props = []
    parent = ''

    parse = (obj, op, comp) ->
      sql = ''
      writeVal = (key, comp) ->
        fullKey = "#{parent}`#{key}`".replace /\./g, '->'
        fullKey = fullKey.replace /->`\$[a-z]+`$/, ''
        if obj[key] is null
          if key is '$ne' or key is '$neq'
            sql += " #{op} #{fullKey} IS NOT NULL"
          else
            sql += " #{op} #{fullKey} IS NULL"
        else
          sql += " #{op} #{fullKey} #{comp} ?"
          props.push obj[key]
      for key of obj
        if obj.hasOwnProperty key
          if key is '$or'
            orsql = ''
            for thing in obj[key]
              objsql = parse(thing, 'AND', comp).replace /^ AND /, ''
              if / AND | OR /.test(objsql) and objsql.indexOf('(') isnt 0
                objsql = "(#{objsql})"
              orsql += ' OR ' + objsql
            sql += " #{op} (#{orsql})".replace /\( OR /g, '('
          else if key is '$and'
            andsql = ''
            for thing in obj[key]
              andsql += parse(thing, 'AND', comp)
            sql += " #{op} (#{andsql})".replace /\( AND /g, '('
          else if key is '$gt'
            writeVal key, '>'
          else if key is '$lt'
            writeVal key, '<'
          else if key is '$gte'
            writeVal key, '>='
          else if key is '$lte'
            writeVal key, '<='
          else if key is '$eq'
            writeVal key, '='
          else if key is '$neq'
            writeVal key, '!='
          else if key is '$ne'
            writeVal key, '!='
          else if key is '$in'
             writeVal key, 'IN'
          else if key is '$nin'
             writeVal key, 'NOT IN'
          else if key is '$like'
            sql += " #{op} #{parent.replace(/->$/, '')} LIKE '%#{obj[key]}%'"
            parent = ''
          else if key is '$null'
            sql += " #{op} #{parent.replace(/->$/, '')} IS NULL"
            parent = ''
          else if key is '$nnull'
            sql += " #{op} #{parent.replace(/->$/, '')} IS NOT NULL"
            parent = ''
          else if key is '$nn'
            sql += " #{op} #{parent.replace(/->$/, '')} IS NOT NULL"
            parent = ''
          else if Object::toString.call(obj[key]) is '[object Object]'
            parent += '`' + key + '`->'
            sql += parse(obj[key], op, comp)
          else
            writeVal key, comp
      parent = ''
      sql
    delete whereObj['#']
    sql = parse(whereObj, 'AND', '=').replace(/(^|\() (AND|OR) /g, '$1')
    {
      sql: sql
      props: props
    }