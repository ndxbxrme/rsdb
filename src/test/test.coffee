'use strict'

db = require('../index')
  database: 'test'
  localStorage: 'data'
  tables: ['users']
.on 'ready', ->
  console.log db
  await db.users.insert
    name: 'jeff'
  users = await db.users.select()
  console.log users