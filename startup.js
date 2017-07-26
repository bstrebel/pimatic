/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// #Framework start up

const assert = require('cassert');
const fs = require('fs');
const path = require('path');
const Promise = require('bluebird');
// Enable this for better stack traces: 
// https://github.com/petkaantonov/bluebird/blob/master/API.md#promiselongstacktraces---void
//Promise.longStackTraces()

// Setup the environment
const env = { logger: require('./lib/logger') };
env.api = require('./lib/api');
env.users = require('./lib/users')(env);
env.devices = require('./lib/devices')(env);
env.matcher = require('./lib/matcher');
env.variables = require('./lib/variables')(env);
env.actions = require('./lib/actions')(env);
env.predicates = require('./lib/predicates')(env);
env.rules = require('./lib/rules')(env);
env.plugins = require('./lib/plugins')(env);
env.database = require('./lib/database')(env);
env.groups = require('./lib/groups')(env);
env.pages = require('./lib/pages')(env);
env.require = (...args) => module.require(...Array.from(args || []));

const startup = () => {
  // set the config file to
  let exit, hijackSocketConnectToTraceUncaughtException;
  const configFile = (
    // PIMATIC_CONFIG environment variable if it has been set up
    (process.env.PIMATIC_CONFIG != null) ? process.env.PIMATIC_CONFIG 
    // or get the configuration parent folder of node_modules
    : path.resolve(__dirname, '../../config.json')
  );

  env.exit = (exit = function(code) {
    env.logger.info("exiting...");
    if (process.logStream != null) {
      // close logstream first
      process.stdout.write = process.stdout.writeOut;
      process.stderr.write = process.stderr.writeOut;
      process.logStream.writer.on('finish', () => process.exit(code));
      return process.logStream.end();
    } else {
      return process.exit(code);
    }
  });

  // This is to trace back uncaughtException from net socket
  (hijackSocketConnectToTraceUncaughtException = () => {
    const net = require('net');
    const orgConnect = net.Socket.prototype.connect;

    return net.Socket.prototype.__defineGetter__('connect', function() {
      // capture stack
      this.__connectStack = new Error("From connect").stack;
      // is already setup?
      if (this.__emitModified != null) {
        return orgConnect;
      }
      const orgEmit = this.emit;
      this.emit = function(...args) {
        if ((args.length >= 2) && (args[0] === 'error')) {
          args[1].__trace = this.__connectStack;
        }
        return orgEmit.apply(this, args);
      };
      this.__emitModified = true;
      return orgConnect;
    });
  }
  )();

  let initComplete = false;
  const uncaughtException = function(err) {
    if (!err.silent) {
      const trace = ((err.__trace != null) ? err.__trace.toString().replace('Error: ', '\n') : '');
      env.logger.error(
        `An uncaught exception occurred: ${err.stack}${trace}\n \
This is most probably a bug in pimatic or in a module, please report it!`
      );
    }
    if (initComplete) {
      if (process.env['PIMATIC_DAEMONIZED']) {
        return env.logger.warn(
          `Keeping pimatic alive, but could be in an undefined state, \
please restart pimatic as soon as possible!`
        );
      } else {
        env.logger.warn("shutting pimatic down...");
        return framework.destroy().then( () => exit(1));
      }
    } else {
      return exit(1);
    }
  };

  process.on('uncaughtException', uncaughtException);

  // Setup the framework
  env.framework = (require('./lib/framework'))(env); 
  return Promise.try( () => {
    const framework = new env.framework.Framework(configFile);
    const promise = framework.init().then( function() {
      initComplete = true;

      const onKill = () => framework.destroy().then( () => exit(0));

      process.on('SIGINT', onKill);
      return process.on('SIGTERM', onKill);

    });

    return promise.then( () => framework );
  }).catch( err => {
    if (!err.silent) {
      env.logger.error(`Startup error: ${err.stack}`);
    }
    return exit(1);
  });
};

module.exports.startup = startup;
module.exports.env = env;
