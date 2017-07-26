/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const cassert = require("cassert");
const assert = require("assert");
const Promise = require('bluebird');
const os = require('os');
const fs = require('fs.extra');
const path = require('path');

const { env } = require('../startup');

describe("Database", function() {

  const frameworkDummy = {
    maindir: path.resolve(__dirname, '../..'),
    on() {}
  };
  let database = null;

  describe("#constructor()", () =>

    it("should connect", function() {
      frameworkDummy.pluginManager = new env.plugins.PluginManager(frameworkDummy);
      const dbSettings = {
        client: "sqlite3",
        connection: {
          filename: 'file::memory:?cache=private'
        },
        deviceAttributeLogging: [ 
          { deviceId: '*', attributeName: '*', expire: '7d' },
          { deviceId: '*', attributeName: 'temperature', expire: '1y' },
          { deviceId: '*', attributeName: 'humidity', expire: '1y' } 
        ],
        messageLogging: [
          { level: '*', tags: [], expire: '7d' } 
        ],
        deleteExpiredInterval: '1h',
        diskSyncInterval: '2h'
      };
      database = new env.database.Database(frameworkDummy, dbSettings);
      return database.init();
    })
  );
  return describe('#saveMessageEvent()', () => it("should save the messages"));
});//, (finish) ->
      // msgs = []
      // pending = []
      // count = 20
      // for i in [0..20]
      //   msg = {
      //     time: new Date().getTime() - (20 - i)
      //     level: 'info'
      //     tags: ["pimatic", "test"]
      //     text: "text #{i}"
      //   }
      //   msgs.push msg
      //   pending.push database.saveMessageEvent(msg.time, msg.level, msg.tags, msg.text)

      // Promise.all(pending).then( ->
      //   database.queryMessages().then( (msgsResult) ->
      //     console.log msgsResult
      //     console.log msgs
      //     assert.deepEqual msgsResult, msgs
      //     finish()
      //   )
      // ).catch(finish)



