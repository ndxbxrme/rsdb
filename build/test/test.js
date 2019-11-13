(function() {
  'use strict';
  var db;

  db = require('../index')({
    database: 'test',
    localStorage: 'data',
    tables: ['users']
  }).on('ready', async function() {
    var users;
    await db.users.insert({
      name: 'jeff'
    });
    users = (await db.users.select());
    return console.log(users);
  });

}).call(this);

//# sourceMappingURL=test.js.map
