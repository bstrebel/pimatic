/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS201: Simplify complex destructure assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Database
===========
*/

const assert = require('cassert');
const util = require('util');
const Promise = require('bluebird');
const _ = require('lodash');
const S = require('string');
const Knex = require('knex');
const path = require('path');
const M = require('./matcher');

module.exports = function(env) {

  let exports;
  const dbMapping = {
    logLevelToInt: {
      'error': 0,
      'warn': 1,
      'info': 2,
      'debug': 3
    },
    typeMap: {
      'number': "attributeValueNumber",
      'string': "attributeValueString",
      'boolean': "attributeValueNumber",
      'date': "attributeValueNumber"
    },
    attributeValueTables: {
      "attributeValueNumber": {
        valueColumnType: "float"
      },
      "attributeValueString": {
        valueColumnType: "string"
      }
    },
    toDBBool: v => v ? 1 : 0,
    fromDBBool: v => ((v === 1) || (v === "1")),
    deviceAttributeCache: {},
    typeToAttributeTable(type) { return this.typeMap[type]; }
  };
  dbMapping.logIntToLevel = _.invert(dbMapping.logLevelToInt);


  /*
  The Database
  ----------------
  */
  class Database extends require('events').EventEmitter {

    constructor(framework, dbSettings) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.framework = framework;
      this.dbSettings = dbSettings;
    }

    init() {
      const connection = _.clone(this.dbSettings.connection);
      if (this.dbSettings.client === 'sqlite3') {
        
          if (connection.filename === ':memory:') {
            connection.filename = 'file::memory:?cache=shared';
          } else {
            connection.filename = path.resolve(this.framework.maindir, '../..', connection.filename);
          }
        
      }

      let pending = Promise.resolve();

      let dbPackageToInstall = this.dbSettings.client;
      try {
        require.resolve(dbPackageToInstall);
      } catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND') { throw e; }
        env.logger.info(
          `Installing database package ${dbPackageToInstall}, this can take some minutes`
        );
        if (dbPackageToInstall === "sqlite3") {
          dbPackageToInstall = "sqlite3@3.1.8";
        }
        pending = this.framework.pluginManager.spawnPpm(
          ['install', dbPackageToInstall, '--unsafe-perm']
        );
      }

      return pending.then( () => {
        this.knex = Knex({
          client: this.dbSettings.client,
          connection,
          pool: {
            min: 1,
            max: 1
          },
          useNullAsDefault: true
        });

        this.framework.on('destroy', context => {
          this.framework.removeListener("messageLogged", this.messageLoggedListener);
          this.framework.removeListener('deviceAttributeChanged', this.deviceAttributeChangedListener);
          clearTimeout(this.deleteExpiredTimeout);
          this._isDestroying = true;
          env.logger.info("Flushing database to disk, please wait...");
          return context.waitForIt(
            this.commitLoggingTransaction().then( () => {
              return this.knex.destroy();
            }).then( () => {
              return env.logger.info("Flushing database to disk, please wait... Done.");
            })
          );
        });
        this.knex.subquery = function(query) { return this.raw(`(${query.toString()})`); };
        if (this.dbSettings.client === "sqlite3") {
          return Promise.all([
            // Prevents a shm file to be created for wal index:
            this.knex.raw("PRAGMA locking_mode=EXCLUSIVE"),
            this.knex.raw("PRAGMA synchronous=NORMAL;"),
            this.knex.raw("PRAGMA auto_vacuum=FULL;"),
            // Don't write data to disk inside one transaction, this reduces disk writes
            this.knex.raw("PRAGMA cache_spill=false;"),
            // Increase the cache size to around 20MB (pagesize=1024B)
            this.knex.raw("PRAGMA cache_size=20000;"),
            // WAL mode to prevents disk corruption and minimize disk writes
            this.knex.raw("PRAGMA journal_mode=WAL;")
          ]);
        }

      }).then( () => {
        return this._createTables();
      }).then( () => {
        // Save log-messages
        this.framework.on("messageLogged", (this.messageLoggedListener = ({level, msg, meta}) => {
          return this.saveMessageEvent(meta.timestamp, level, meta.tags, msg).done();
        })
        );

        // Save device attribute changes
        this.framework.on('deviceAttributeChanged',
          (this.deviceAttributeChangedListener = ({device, attributeName, time, value}) => {
            return this.saveDeviceAttributeEvent(device.id, attributeName, time, value).done();
          })
        );

        this._updateDeviceAttributeExpireInfos();
        this._updateMessageseExpireInfos();

        let deleteExpiredInterval = this._parseTime(this.dbSettings.deleteExpiredInterval);
        const diskSyncInterval = this._parseTime(this.dbSettings.diskSyncInterval);

        const minExpireInterval = 1 * 60 * 1000;
        if (deleteExpiredInterval < minExpireInterval) {
          env.logger.warn("deleteExpiredInterval can't be less then 1 min, setting it to 1 min.");
          deleteExpiredInterval = minExpireInterval;
        }

        if (((diskSyncInterval/deleteExpiredInterval) % 1) !== 0) {
          env.logger.warn("diskSyncInterval should be a multiple of deleteExpiredInterval.");
        }

        const syncAllNo = Math.max(Math.ceil(diskSyncInterval/deleteExpiredInterval), 1);
        let deleteNo = 0;

        var doDeleteExpired = ( () => {
          if (this.dbSettings.debug) { env.logger.debug("Deleting expired logged values"); }
          deleteNo++;
          return Promise.resolve().then( () => {
            if (this.dbSettings.debug) { env.logger.debug("Deleting expired events"); }
            return this._deleteExpiredDeviceAttributes().then( () => {
              if (this.dbSettings.debug) { return env.logger.debug("Deleting expired events... Done."); }
            });
          })
          .then( () => {
            if (this.dbSettings.debug) { env.logger.debug("Deleting expired message"); }
            return this._deleteExpiredMessages().then( () => {
              if (this.dbSettings.debug) { return env.logger.debug("Deleting expired message... Done."); }
            });
          })
          .then( () => {
            let next;
            if ((deleteNo % syncAllNo) === 0) {
              if (this.dbSettings.debug) { env.logger.debug("Done -> flushing to disk"); }
              next = this.commitLoggingTransaction().then( () => {
                if (this.dbSettings.debug) { return env.logger.debug("-> done."); }
              });
            } else {
              next = Promise.resolve();
            }
            return next.then( () => {
              return this.deleteExpiredTimeout = setTimeout(doDeleteExpired, deleteExpiredInterval);
            });
          }).catch( error => {
            env.logger.error(error.message);
            return env.logger.debug(error.stack);
          }).done();
        }
        );

        this.deleteExpiredTimeout = setTimeout(doDeleteExpired, deleteExpiredInterval);
      });
    }

    loggingTransaction() {
      if (this._loggingTransaction == null) {
        this._loggingTransaction = new Promise( (resolve, reject) => {
          return this.knex.transaction( trx => {
            const transactionInfo = {
              trx,
              count: 0,
              resolve: null
            };
            return resolve(transactionInfo);
          }).catch(reject);
        });
      }
      return this._loggingTransaction;
    }

    doInLoggingTransaction(callback) {
      return new Promise(  (resolve, reject) => {
        return this._loggingTransaction = this.loggingTransaction().then( transactionInfo => {
          const action = callback(transactionInfo.trx);
          // must return a promise
          transactionInfo.count++;
          const actionCompleted = function() {
            transactionInfo.count--;
            if ((transactionInfo.count === 0) && (transactionInfo.resolve != null)) {
              return transactionInfo.resolve();
            }
          };
          // remove when action finished
          action.then(actionCompleted, actionCompleted);
          resolve(action);
          return transactionInfo;
        }).catch(reject);
      });
    }

    commitLoggingTransaction() {
      let promise = Promise.resolve();
      if (this._loggingTransaction != null) {
        promise = this._loggingTransaction.then( transactionInfo => {
          if (this.dbSettings.debug) { env.logger.debug("Committing"); }
          const doCommit = () => {
            return transactionInfo.trx.commit();
          };
          if (transactionInfo.count === 0) {
            return doCommit();
          } else {
            return new Promise( function(resolve) {
              return transactionInfo.resolve = function() {
                doCommit();
                return resolve();
              };
            });
          }
        });
        this._loggingTransaction = null;
      }
      return promise.catch( error => {
        env.logger.error(error.message);
        return env.logger.debug(error.stack);
      });
    }

    _createTables() {
      const pending = [];

      const createTableIfNotExists = ( (tableName, cb) => {
        return this.knex.schema.hasTable(tableName).then( exists => {
          if (!exists) {
            return this.knex.schema.createTable(tableName, cb).then(( () => {
              return env.logger.info(`${tableName} table created!`);
            }
            ), error => {
              env.logger.error(error);
              return env.logger.debug(error.stack);
            });
          } else { return; }
        });
      }
      );

      pending.push(createTableIfNotExists('message', table => {
        table.increments('id').primary();
        table.timestamp('time').index();
        table.integer('level');
        table.text('tags');
        return table.text('text');
      })
      );
      pending.push(createTableIfNotExists('deviceAttribute', table => {
        table.increments('id').primary().unique();
        table.string('deviceId');
        table.string('attributeName');
        table.string('type');
        table.boolean('discrete');
        table.timestamp('lastUpdate').nullable();
        table.string('lastValue').nullable();
        table.index(['deviceId','attributeName'], 'deviceAttributeDeviceIdAttributeName');
        table.index(['deviceId'], 'deviceAttributeDeviceId');
        return table.index(['attributeName'], 'deviceAttributeAttributeName');
      })
      );

      for (let tableName in dbMapping.attributeValueTables) {
        var tableInfo = dbMapping.attributeValueTables[tableName];
        pending.push(createTableIfNotExists(tableName, table => {
          table.increments('id').primary();
          table.timestamp('time').index();
          table.integer('deviceAttributeId')
            .unsigned()
            .references('id')
            .inTable('deviceAttribute');
          return table[tableInfo.valueColumnType]('value');
        }).then(tableName, table => {
          return table.index(['deviceAttributeId','time'], 'deviceAttributeIdTime');
        })
        );
      }

      return Promise.all(pending);
    }

    getDeviceAttributeLogging() {
      return _.clone(this.dbSettings.deviceAttributeLogging);
    }

    setDeviceAttributeLogging(deviceAttributeLogging) {
      this.dbSettings.deviceAttributeLogging = deviceAttributeLogging;
      this._updateDeviceAttributeExpireInfos();
      this.framework.saveConfig();
    }

    _updateDeviceAttributeExpireInfos() {
      for (var info of Array.from(dbMapping.deviceAttributeCache)) {
        info.expireMs = null;
        info.intervalMs = null;
      }
      const entries = this.dbSettings.deviceAttributeLogging;
      let i = entries.length - 1;
      let sqlNot = "";
      const possibleTypes = ["number", "string", "boolean", "date", "discrete", "continuous", "*"];
      return (() => {
        const result = [];
        while (i >= 0) {
          const entry = entries[i];
          //legazy support
          if (entry.time != null) {
            entry.expire = entry.time;
            delete entry.time;
          }
          if (entry.type == null) {
            entry.type = "*";
          }

          if (!Array.from(possibleTypes).includes(entry.type)) {
            throw new Error(`Type option in database config must be one of ${possibleTypes}`);
          }

          // Get expire info from entry or create it
          let { expireInfo } = entry;
          if (expireInfo == null) {
            expireInfo = {
              expireMs: 0,
              interval: 0,
              whereSQL: ""
            };
            info = {expireInfo};
            info.__proto__ = entry.__proto__;
            entry.__proto__ = info;
          }
          // Generate sql where to use on deletion
          let ownWhere = ["1=1"];
          if (entry.expire != null) {
            if (entry.deviceId !== '*') {
              ownWhere.push(`deviceId='${entry.deviceId}'`);
            }
            if (entry.attributeName !== '*') {
              ownWhere.push(`attributeName='${entry.attributeName}'`);
            }
            if (entry.type !== '*') {
              if (entry.type === "continuous") {
                ownWhere.push("discrete=0");
              } else if (entry.type === "discrete") {
                ownWhere.push("discrete=1");
              } else {
                ownWhere.push(`type='${entry.type}'`);
              }
            }
          }
          if (entry.expire != null) {
            ownWhere = ownWhere.join(" and ");
            expireInfo.whereSQL = `(${ownWhere})${sqlNot}`;
            sqlNot = ` AND NOT (${ownWhere})${sqlNot}`;
          }
          // Set expire date
          if (entry.expire != null) { expireInfo.expireMs = this._parseTime(entry.expire); }
          if (entry.interval != null) { expireInfo.interval = this._parseTime(entry.interval); }
          result.push(i--);
        }
        return result;
      })();
    }

    _parseTime(time) {
      if (time === "0") { return 0;
      } else {
        let timeMs = null;
        M(time).matchTimeDuration((m, info) => timeMs = info.timeMs);
        if (timeMs == null) {
          throw new Error(`Can not parse time in database config: ${time}`);
        }
        return timeMs;
      }
    }

    _updateMessageseExpireInfos() {
      const entries = this.dbSettings.messageLogging;
      let i = entries.length - 1;
      let sqlNot = "";
      return (() => {
        const result = [];
        while (i >= 0) {
          const entry = entries[i];
          //legazy support
          if (entry.time != null) {
            entry.expire = entry.time;
            delete entry.time;
          }
          // Get expire info from entry or create it
          let { expireInfo } = entry;
          if (expireInfo == null) {
            expireInfo = {
              expireMs: 0,
              whereSQL: ""
            };
            const info = {expireInfo};
            info.__proto__ = entry.__proto__;
            entry.__proto__ = info;
          }
          // Generate sql where to use on deletion
          let ownWhere = "1=1";
          if (entry.level !== '*') {
            const levelInt = dbMapping.logLevelToInt[entry.level];
            ownWhere += ` AND level=${levelInt}`;
          }
          for (let tag of Array.from(entry.tags)) {
            ownWhere += ` AND tags LIKE \"''${tag}''%\"`;
          }
          expireInfo.whereSQL = `(${ownWhere})${sqlNot}`;
          sqlNot = ` AND NOT (${ownWhere})${sqlNot}`;
          // Set expire date
          if (entry.expire != null) { expireInfo.expireMs = this._parseTime(entry.expire); }
          result.push(i--);
        }
        return result;
      })();
    }


    getDeviceAttributeLoggingTime(deviceId, attributeName, type, discrete) {
      let expireMs = 0;
      let expire = "0";
      let intervalMs = 0;
      let interval = "0";
      for (var entry of Array.from(this.dbSettings.deviceAttributeLogging)) {
        const matches = (
          ((entry.deviceId === '*') || (entry.deviceId === deviceId)) &&
          ((entry.attributeName === '*') || (entry.attributeName === attributeName)) &&
          ((() => { 
            switch (entry.type) {
              case '*': return true;
              case "discrete": return discrete;
              case "continuous": return !discrete;
              default:  return entry.type === type;
            
            } })())
        );
        if (matches) {
          if (entry.expire != null) {
            ({ expireMs } = entry.expireInfo);
            ({ expire } = entry);
          }
          if (entry.interval != null) {
            intervalMs = entry.expireInfo.interval;
            ({ interval } = entry);
          }
        }
      }
      return {expireMs, intervalMs, expire, interval};
    }

    getMessageLoggingTime(time, level, tags, text) {
      let expireMs = null;
      for (let entry of Array.from(this.dbSettings.messageLogging)) {
        if (
          ((entry.level === "*") || (entry.level === level)) &&
          ((entry.tags.length === 0) || ((Array.from(entry.tags).filter((t) => Array.from(tags).includes(t))).length > 0))
        ) {
          ({ expireMs } = entry.expireInfo);
        }
      }
      return expireMs;
    }

    _deleteExpiredDeviceAttributes() {
      return this.doInLoggingTransaction( trx => {
        return Promise.each(this.dbSettings.deviceAttributeLogging, entry => {
          if (entry.expire != null) {
            const subquery = this.knex('deviceAttribute').select('id');
            subquery.whereRaw(entry.expireInfo.whereSQL);
            const subqueryRaw = `deviceAttributeId in (${subquery.toString()})`;
            return Promise.each(_.keys(dbMapping.attributeValueTables), tableName => {
              if (this._isDestroying) { return; }
              const del = this.knex(tableName).transacting(trx);
              if (this.dbSettings.client === "sqlite3") {
                del.where('time', '<', (new Date()).getTime() - entry.expireInfo.expireMs);
              } else {
                del.whereRaw(
                  'time < FROM_UNIXTIME(?)',
                  [
                    this._convertTimeForDatabase(
                      parseFloat((new Date()).getTime() - entry.expireInfo.expireMs)
                    )
                  ]
                );
              }
              del.whereRaw(subqueryRaw);
              const query = del.del();
              if (this.dbSettings.debug) { env.logger.debug("query:", query.toString()); }
              return query;
            });
          }
        });
      });
    }

    _deleteExpiredMessages() {
      return this.doInLoggingTransaction( trx => {
        return Promise.each(this.dbSettings.messageLogging, entry => {
          if (this._isDestroying) { return; }
          const del = this.knex('message').transacting(trx);
          if (this.dbSettings.client === "sqlite3") {
            del.where('time', '<', (new Date()).getTime() - entry.expireInfo.expireMs);
          } else {
            del.whereRaw(
              'time < FROM_UNIXTIME(?)',
              [
                this._convertTimeForDatabase(
                  parseFloat((new Date()).getTime() - entry.expireInfo.expireMs)
                )
              ]
            );
          }
          del.whereRaw(entry.expireInfo.whereSQL);
          const query = del.del();
          if (this.dbSettings.debug) { env.logger.debug("query:", query.toString()); }
          return query;
        });
      });
    }

    saveMessageEvent(time, level, tags, text) {
      let needle;
      this.emit('log', {time, level, tags, text});
      //assert typeof time is 'number'
      assert(Array.isArray(tags));
      assert(typeof level === 'string');
      assert((needle = level, Array.from(_.keys(dbMapping.logLevelToInt)).includes(needle)));

      const expireMs = this.getMessageLoggingTime(time, level, tags, text);
      if (expireMs === 0) {
        return Promise.resolve();
      }

      return this.doInLoggingTransaction( trx => {
        return this.knex('message').transacting(trx).insert({
          time,
          level: dbMapping.logLevelToInt[level],
          tags: JSON.stringify(tags),
          text
        }).return();
      });
    }

    saveDeviceAttributeEvent(deviceId, attributeName, time, value) {
      assert((typeof deviceId === 'string') && (deviceId.length > 0));
      assert((typeof attributeName === 'string') && (attributeName.length > 0));
      this.emit('device-attribute-save', {deviceId, attributeName, time, value});

      if (value !== value) { // just true for Number.NaN
        // Don't insert NaN values into the database
        return Promise.resolve();
      }

      return this._getDeviceAttributeInfo(deviceId, attributeName).then( info => {
        return this.doInLoggingTransaction( trx => {
          // insert into value table
          let doInsert, insert1;
          const tableName = dbMapping.typeToAttributeTable(info.type);
          const timestamp = time.getTime();
          if (info.expireMs === 0) {
            // value expires immediately
            doInsert = false;
          } else {
            if ((info.intervalMs === 0) || ((timestamp - info.lastInsertTime) > info.intervalMs)) {
              doInsert = true;
            } else {
              doInsert = false;
            }
          }
          if (doInsert) {
            info.lastInsertTime = timestamp;
            insert1 = this.knex(tableName).transacting(trx).insert({
              time,
              deviceAttributeId: info.id,
              value
            });
          } else {
            insert1 = Promise.resolve();
          }
          // and update lastValue in attributeInfo
          const insert2 = this.knex('deviceAttribute').transacting(trx)
            .where({
              id: info.id
            })
            .update({
              lastUpdate: time,
              lastValue: value
            });
          return Promise.all([insert1, insert2]);
        });
      });
    }


    _buildMessageWhere(query, {level, levelOp, after, before, tags, offset, limit}) {
      if (level != null) {
        if (!levelOp) { levelOp = '='; }
        if (Array.isArray(level)) {
          level = _.map(level, l => dbMapping.logLevelToInt[l]);
          query.whereIn('level', level);
        } else {
          query.where('level', levelOp, dbMapping.logLevelToInt[level]);
        }
      }
      if (after != null) {
        if (this.dbSettings.client === "sqlite3") {
          query.where('time', '>=', after);
        } else {
          query.whereRaw('time >= FROM_UNIXTIME(?)', [this._convertTimeForDatabase(parseFloat(after))]);
        }
      }
      if (before != null) {
        if (this.dbSettings.client === "sqlite3") {
          query.where('time', '<=', before);
        } else {
          query.whereRaw('time <= FROM_UNIXTIME(?)', [this._convertTimeForDatabase(parseFloat(before))]);
        }
      }
      if (tags != null) {
        if (!Array.isArray(tags)) { tags = [tags]; }
        for (let tag of Array.from(tags)) {
          query.where('tags', 'like', `%\"${tag}\"%`);
        }
      }
      query.orderBy('time', 'desc');
      if (offset != null) {
        query.offset(offset);
      }
      if (limit != null) {
        return query.limit(limit);
      }
    }

    queryMessagesCount(criteria){
      if (criteria == null) { criteria = {}; }
      return this.doInLoggingTransaction( trx => {
        const query = this.knex('message').transacting(trx).count('*');
        this._buildMessageWhere(query, criteria);
        return Promise.resolve(query).then( result => result[0]["count(*)"] );
      });
    }

    queryMessagesTags(criteria){
      if (criteria == null) { criteria = {}; }
      return this.doInLoggingTransaction( trx => {
        const query = this.knex('message').transacting(trx).distinct('tags').select();
        this._buildMessageWhere(query, criteria);
        return Promise.resolve(query).then( tags => {
          return _(tags).map(r=> JSON.parse(r.tags)).flatten().uniq().valueOf();
        });
      });
    }
    queryMessages(criteria) {
      if (criteria == null) { criteria = {}; }
      return this.doInLoggingTransaction( trx => {
        const query = this.knex('message').transacting(trx).select('time', 'level', 'tags', 'text');
        this._buildMessageWhere(query, criteria);
        return Promise.resolve(query).then( msgs => {
          for (let m of Array.from(msgs)) {
            m.tags = JSON.parse(m.tags);
            m.level = dbMapping.logIntToLevel[m.level];
          }
          return msgs;
        });
      });
    }

    deleteMessages(criteria) {
      if (criteria == null) { criteria = {}; }
      return this.doInLoggingTransaction( trx => {
        const query = this.knex('message').transacting(trx);
        this._buildMessageWhere(query, criteria);
        return Promise.resolve((query).del());
      });
    }

    _buildQueryDeviceAttributeEvents(queryCriteria) {
      if (queryCriteria == null) { queryCriteria = {}; }
      let {
        deviceId,
        attributeName,
        after,
        before,
        order,
        orderDirection,
        offset,
        limit
      } = queryCriteria;
      if (order == null) {
        order = "time";
        orderDirection = "desc";
      }

      const buildQueryForType = (tableName, query) => {
        let timeSelect;
        if (this.dbSettings.client === "sqlite3") {
          timeSelect = 'time AS time';
        } else {
          timeSelect = this.knex.raw('(UNIX_TIMESTAMP(time)*1000) AS time');
        }
        query.select(
          'deviceAttribute.deviceId AS deviceId',
          'deviceAttribute.attributeName AS attributeName',
          'deviceAttribute.type AS type',
          timeSelect,
          'value AS value'
        ).from(tableName).join('deviceAttribute',
          `${tableName}.deviceAttributeId`, '=', 'deviceAttribute.id'
        );
        if (deviceId != null) {
          query.where('deviceId', deviceId);
        }
        if (attributeName != null) {
          return query.where('attributeName', attributeName);
        }
      };

      let query = null;
      for (var tableName of Array.from(_.keys(dbMapping.attributeValueTables))) {
        if (query == null) {
          query = this.knex(tableName);
          buildQueryForType(tableName, query);
        } else {
          query.unionAll( function() { return buildQueryForType(tableName, this);  });
        }
      }

      if (after != null) {
        if (this.dbSettings.client === "sqlite3") {
          query.where('time', '>=', after);
        } else {
          query.whereRaw('time >= FROM_UNIXTIME(?)', [this._convertTimeForDatabase(parseFloat(after))]);
        }
      }
      if (before != null) {
        if (this.dbSettings.client === "sqlite3") {
          query.where('time', '<=', before);
        } else {
          query.whereRaw('time <= FROM_UNIXTIME(?)', [this._convertTimeForDatabase(parseFloat(before))]);
        }
      }
      query.orderBy(order, orderDirection);
      if (offset != null) { query.offset(offset); }
      if (limit != null) { query.limit(limit); }
      return query;
    }

    queryDeviceAttributeEvents(queryCriteria) {
      return this.doInLoggingTransaction( trx => {
        const query = this._buildQueryDeviceAttributeEvents(queryCriteria).transacting(trx);
        if (this.dbSettings.debug) { env.logger.debug("Query:", query.toString()); }
        const time = new Date().getTime();
        return Promise.resolve(query).then( result => {
          const timeDiff = new Date().getTime()-time;
          if (this.dbSettings.debug) {
            env.logger.debug(`Quering ${result.length} events took ${timeDiff}ms.`);
          }
          for (let r of Array.from(result)) {
            if (r.type === "boolean") {
              // convert numeric or string value from db to boolean
              r.value = dbMapping.fromDBBool(r.value);
            } else if (r.type === "number") {
              // convert string values to number
              r.value = parseFloat(r.value);
            }
          }
          return result;
        });
      });
    }

    queryDeviceAttributeEventsCount() {
      return this.doInLoggingTransaction( trx => {
        const pending = [];
        for (let tableName of Array.from(_.keys(dbMapping.attributeValueTables))) {
          pending.push(this.knex(tableName).transacting(trx).count('* AS count'));
        }
        return Promise.all(pending).then( counts => {
          let count = 0;
          for (let c of Array.from(counts)) {
            count += c[0].count;
          }
          return count;
        });
      });
    }

    queryDeviceAttributeEventsDevices() {
      return this.doInLoggingTransaction( trx => {
        return this.knex('deviceAttribute').transacting(trx).select(
          'id',
          'deviceId',
          'attributeName',
          'type'
        );
      });
    }

    queryDeviceAttributeEventsInfo() {
      return this.doInLoggingTransaction( trx => {
        return this.knex('deviceAttribute').transacting(trx).select(
          'id',
          'deviceId',
          'attributeName',
          'type',
          'discrete'
        ).then( results => {
          for (let result of Array.from(results)) {
            result.discrete = dbMapping.fromDBBool(result.discrete);
            const info = this.getDeviceAttributeLoggingTime(
              result.deviceId, result.attributeName, result.type, result.discrete
            );
            result.interval = info.interval;
            result.expire = info.expire;
          }
            // device = @framework.deviceManager.getDeviceById(result.deviceId)
            // if device?
            //   attribute = device.attributes[result.attributeName]
            //   if attribute?
            //     if attribute.discrete
            //       result.interval = 'all'
          return results;
        });
      });
    }

    queryDeviceAttributeEventsCounts() {
      return this.doInLoggingTransaction( trx => {
        const queries = [];
        for (let tableName of Array.from(_.keys(dbMapping.attributeValueTables))) {
          queries.push(
            this.knex(tableName).transacting(trx)
              .select('deviceAttributeId').count('id')
              .groupBy('deviceAttributeId')
          );
        }
        return Promise
          .reduce(queries, (all, result) => all.concat(result))
          .each( entry => {
            entry.count = entry['count("id")'];
            return entry['count("id")'] = undefined;
          });
      });
    }

    runVacuum() {
      return this.commitLoggingTransaction().then( () => {
        return this.knex.raw('VACUUM;');
      });
    }


    checkDatabase() {
      return this.doInLoggingTransaction( trx => {
        return this.knex('deviceAttribute').transacting(trx).select(
          'id',
          'deviceId',
          'attributeName',
          'type',
          'discrete'
        ).then( results => {
          const problems = [];
          for (let result of Array.from(results)) {
            result.discrete = dbMapping.fromDBBool(result.discrete);
            const device = this.framework.deviceManager.getDeviceById(result.deviceId);
            if (device == null) {
              problems.push({
                id: result.id,
                deviceId: result.deviceId,
                attribute: result.attributeName,
                description: `No device with the ID \"${result.deviceId}\" found.`,
                action: "delete"
              });
            } else {
              if (!device.hasAttribute(result.attributeName)) {
                problems.push({
                  id: result.id,
                  deviceId: result.deviceId,
                  attribute: result.attributeName,
                  description: `Device \"${result.deviceId}\" has no attribute with the name ` +
                          `\"${result.attributeName}\" found.`,
                  action: "delete"
                });
              } else {
                const attribute = device.attributes[result.attributeName];
                if (attribute.type !== result.type) {
                  problems.push({
                    id: result.id,
                    deviceId: result.deviceId,
                    attribute: result.attributeName,
                    description: `Attribute \"${result.attributeName}\" of  ` +
                             `\"${result.deviceId}\" has the wrong type`,
                    action: "delete"
                  });
                } else if (attribute.discrete !== result.discrete) {
                  problems.push({
                    id: result.id,
                    deviceId: result.deviceId,
                    attribute: result.attributeName,
                    description: `Attribute \"${result.attributeName}\" of` +
                             `\"${result.deviceId}\" discrete flag is wrong.`,
                    action: "update"
                  });
                }
              }
            }
          }
          return problems;
        });
      });
    }

    deleteDeviceAttribute(id) {
      assert(typeof id === "number");
      return this.doInLoggingTransaction( trx => {
        return this.knex('deviceAttribute').transacting(trx).where('id', id).del().then( () => {
          for (let key in dbMapping.deviceAttributeCache) {
            const entry = dbMapping.deviceAttributeCache[key];
            if (entry.id === id) {
              delete dbMapping.deviceAttributeCache[key];
            }
          }
          const awaiting = [];
          for (let tableName in dbMapping.attributeValueTables) {
            const tableInfo = dbMapping.attributeValueTables[tableName];
            awaiting.push(this.knex(tableName).transacting(trx).where('deviceAttributeId', id).del());
          }
          return Promise.all(awaiting);
        });
      });
    }

    updateDeviceAttribute(id) {
      assert(typeof id === "number");
      return this.doInLoggingTransaction( trx => {
        return this.knex('deviceAttribute').transacting(trx)
          .select('deviceId', 'attributeName')
          .where({id}).then( results => {
            if (results.length === 1) {
              let update;
              const result = results[0];
              const fullQualifier = `${result.deviceId}.${result.attributeName}`;
              const device = this.framework.deviceManager.getDeviceById(result.deviceId);
              if (device == null) { throw new Error(`${result.deviceId} not found.`); }
              const attribute = device.attributes[result.attributeName];
              if (attribute == null) {
                new Error(`${result.deviceId} has no attribute ${result.attributeName}.`);
              }
              const info = dbMapping.deviceAttributeCache[fullQualifier];
              if (info != null) { info.discrete = attribute.discrete; }
              return update = this.knex('deviceAttribute').transacting(trx)
                .where({id}).update({
                  discrete: dbMapping.toDBBool(attribute.discrete)
                }).return();
            } else {
              return;
            }
        });
      });
    }

    querySingleDeviceAttributeEvents(deviceId, attributeName, queryCriteria) {
      if (queryCriteria == null) { queryCriteria = {}; }
      let {
        after,
        before,
        order,
        orderDirection,
        offset,
        limit,
        groupByTime
      } = queryCriteria;
      if (order == null) {
        order = "time";
        orderDirection = "asc";
      }
      return this._getDeviceAttributeInfo(deviceId, attributeName).then( info => {
        return this.doInLoggingTransaction( trx => {
          const query = this.knex(dbMapping.typeToAttributeTable(info.type)).transacting(trx);
          if (groupByTime == null) {
            query.select('time', 'value');
          } else {
            if (this.dbSettings.client === "sqlite3") {
              query.select(this.knex.raw('MIN(time) AS time'), this.knex.raw('AVG(value) AS value'));
            } else {
              query.select(
                this.knex.raw('MIN(UNIX_TIMESTAMP(time) * 1000) AS time'),
                this.knex.raw('AVG(value) AS value')
              );
            }
          }
          query.where('deviceAttributeId', info.id);
          if (after != null) {
            if (this.dbSettings.client === "sqlite3") {
              query.where('time', '>=', this._convertTimeForDatabase(parseFloat(after)));
            } else {
              query.whereRaw(
                'time >= FROM_UNIXTIME(?)',
                [this._convertTimeForDatabase(parseFloat(after))]
              );
            }
          }
          if (before != null) {
            if (this.dbSettings.client === "sqlite3") {
              query.where('time', '<=', this._convertTimeForDatabase(parseFloat(before)));
            } else {
              query.whereRaw(
                'time <= FROM_UNIXTIME(?)',
                [this._convertTimeForDatabase(parseFloat(before))]
              );
            }
          }
          if (order != null) {
            query.orderBy(order, orderDirection);
          }
          if (groupByTime != null) {
            groupByTime = parseFloat(groupByTime);
            if (this.dbSettings.client === "sqlite3") {
              query.groupByRaw(`time/${groupByTime}`);
            } else {
              query.groupByRaw(`UNIX_TIMESTAMP(time)/${groupByTime}`);
            }
          }
          if (offset != null) { query.offset(offset); }
          if (limit != null) { query.limit(limit); }
          if (this.dbSettings.debug) { env.logger.debug("query:", query.toString()); }
          const time = new Date().getTime();
          return Promise.resolve(query).then( result => {
            let r;
            const timeDiff = new Date().getTime()-time;
            if (this.dbSettings.debug) {
              env.logger.debug(`querying ${result.length} events took ${timeDiff}ms.`);
            }
            if (info.type === "boolean") {
              for (r of Array.from(result)) {
                // convert numeric or string value from db to boolean
                r.value = dbMapping.fromDBBool(r.value);
              }
            } else if (info.type === "number") {
              for (r of Array.from(result)) {
                // convert string values to number
                r.value = parseFloat(r.value);
              }
            }
            return result;
          });
        });
      });
    }

    _getDeviceAttributeInfo(deviceId, attributeName) {
      const fullQualifier = `${deviceId}.${attributeName}`;
      const info = dbMapping.deviceAttributeCache[fullQualifier];
      return ((() => {
        
        if (info != null) {
          if (info.expireMs == null) {
            const expireInfo = this.getDeviceAttributeLoggingTime(
              deviceId, attributeName, info.type, info.discrete
            );
            info.expireMs = expireInfo.expireMs;
            info.intervalMs = expireInfo.intervalMs;
            info.lastInsertTime = 0;
          }
          return Promise.resolve(info);
        } else { return this._insertDeviceAttribute(deviceId, attributeName);
      }
      
      })());
    }


    getLastDeviceState(deviceId) {
      if (this._lastDevicesStateCache != null) {
        return this._lastDevicesStateCache.then( devices => devices[deviceId]);
      }
      return this.doInLoggingTransaction( trx => {
        // query all devices for performance reason and cache the result
        this._lastDevicesStateCache = this.knex('deviceAttribute').transacting(trx).select(
          'deviceId', 'attributeName', 'type', 'lastUpdate', 'lastValue'
        ).then( result => {
          //group by device
          const devices = {};
          const convertValue = function(value, type) {
            if (value == null) { return null; }
            return ((() => { 
              switch (type) {
                case 'number': return parseFloat(value);
                case 'boolean': return dbMapping.fromDBBool(value);
                default: return value;
            
              } })());
          };
          for (let r of Array.from(result)) {
            let d = devices[r.deviceId];
            if (d == null) { d = (devices[r.deviceId] = {}); }
            d[r.attributeName] = {
              time: r.lastUpdate,
              value: convertValue(r.lastValue, r.type)
            };
          }
          // Clear cache after one minute
          clearTimeout(this._lastDevicesStateCacheTimeout);
          this._lastDevicesStateCacheTimeout = setTimeout( (() => {
            return this._lastDevicesStateCache = null;
          }
          ), 60*1000);
          return devices;
        });
        return this._lastDevicesStateCache.then( devices => devices[deviceId]);
      });
    }

    _convertTimeForDatabase(timestamp) {
      //For mysql we need a timestamp in seconds
      if (this.dbSettings.client === "sqlite3") {
        return timestamp;
      } else {
        return Math.floor(timestamp / 1000);
      }
    }

    _insertDeviceAttribute(deviceId, attributeName) {
      assert((typeof deviceId === 'string') && (deviceId.length > 0));
      assert((typeof attributeName === 'string') && (attributeName.length > 0));

      const device = this.framework.deviceManager.getDeviceById(deviceId);
      if (device == null) { throw new Error(`${deviceId} not found.`); }
      const attribute = device.attributes[attributeName];
      if (attribute == null) { throw new Error(`${deviceId} has no attribute ${attributeName}.`); }

      const expireInfo = this.getDeviceAttributeLoggingTime(
        deviceId, attributeName, attribute.type, attribute.discrete
      );

      const info = {
        id: null,
        type: attribute.type,
        discrete: attribute.discrete,
        expireMs: expireInfo.expireMs,
        intervalMs: expireInfo.intervalMs,
        lastInsertTime: 0
      };

      /*
        Don't create a new entry for the device if an entry with the attributeName and deviceId
        already exists.
      */
      return this.doInLoggingTransaction( trx => {
        let statement;
        if (this.dbSettings.client === "sqlite3") {
          statement = `\
INSERT INTO deviceAttribute(deviceId, attributeName, type, discrete)
SELECT
  '${deviceId}' AS deviceId,
  '${attributeName}' AS attributeName,
  '${info.type}' as type,
  ${dbMapping.toDBBool(info.discrete)} as discrete
WHERE 0 = (
  SELECT COUNT(*)
  FROM deviceAttribute
  WHERE deviceId = '${deviceId}' and attributeName = '${attributeName}'
);\
`;
        } else {
          statement = `\
INSERT INTO deviceAttribute(deviceId, attributeName, type, discrete)
SELECT * FROM
  ( SELECT '${deviceId}' AS deviceId,
  '${attributeName}' AS attributeName,
  '${info.type}' as type,
  ${dbMapping.toDBBool(info.discrete)} as discrete
  ) as tmp
WHERE NOT EXISTS (
  SELECT deviceId, attributeName
  FROM deviceAttribute
  WHERE deviceId = '${deviceId}' and attributeName = '${attributeName}'
) LIMIT 1;\
`;
        }
        return this.knex.raw(
          statement
        ).transacting(trx).then( () => {
          return this.knex('deviceAttribute').transacting(trx).select('id').where({
            deviceId,
            attributeName
          }).then( (...args) => {
            const [result] = Array.from(args[0]);
            info.id = result.id;
            assert((info.id != null) && (typeof info.id === "number"));
            let update = Promise.resolve();
            if (((info.discrete == null)) || (dbMapping.fromDBBool(info.discrete) !== attribute.discrete)) {
              update = this.knex('deviceAttribute').transacting(trx)
                .where({id: info.id}).update({
                  discrete: dbMapping.toDBBool(attribute.discrete)
                });
            }
            info.discrete = attribute.discrete;
            const fullQualifier = `${deviceId}.${attributeName}`;
            return update.then( () => (dbMapping.deviceAttributeCache[fullQualifier] = info) );
          });
        });
      });
    }
  }


  return exports = { Database };
};
