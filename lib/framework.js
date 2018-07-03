/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS203: Remove `|| {}` from converted for-own loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Framework
=========
*/

const assert = require('cassert');
const fs = require("fs");
const JaySchema = require('jayschema');
const RJSON = require('relaxed-json');
const i18n = require('i18n');
const express = require("express");
const methodOverride = require('method-override');
const connectTimeout = require('connect-timeout');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');
const basicAuth = require('basic-auth');
const socketIo = require('socket.io');
// Require engine.io from socket.io
const engineIo = require.cache[require.resolve('socket.io')].require('engine.io');
const Promise = require('bluebird');
const path = require('path');
const S = require('string');
const _ = require('lodash');
const declapi = require('decl-api');
const util = require('util');
const jsonlint = require('jsonlint');
const events = require('events');

module.exports = function(env) {

  class Framework extends events.EventEmitter {
    static initClass() {
      this.prototype.configFile = null;
      this.prototype.app = null;
      this.prototype.io = null;
      this.prototype.ruleManager = null;
      this.prototype.pluginManager = null;
      this.prototype.variableManager = null;
      this.prototype.deviceManager = null;
      this.prototype.groupManager = null;
      this.prototype.pageManager = null;
      this.prototype.database = null;
      this.prototype.config = null;
      this.prototype._publicPathes = {};
    }

    constructor(configFile) {
      super();
      let group;
      this.configFile = configFile;
      assert(this.configFile != null);
      this.maindir = path.resolve(__dirname, '..');
      env.logger.winston.on("logged", (level, msg, meta) => {
        return this._emitMessageLoggedEvent(level, msg, meta);
      });
      this.pluginManager = new env.plugins.PluginManager(this);
      this.pluginManager.on('updateProcessStatus', (status, info) => {
        return this._emitUpdateProcessStatus(status, info);
      });
      this.pluginManager.on('updateProcessMessage', (message, info) => {
        return this._emitUpdateProcessMessage(message, info);
      });
      this.packageJson = this.pluginManager.getInstalledPackageInfo('pimatic');
      env.logger.info(`Starting pimatic version ${this.packageJson.version}`);
      this._loadConfig();
      this.pluginManager.pluginsConfig = this.config.plugins;
      this.userManager = new env.users.UserManager(this, this.config.users, this.config.roles);
      this.deviceManager = new env.devices.DeviceManager(this, this.config.devices);
      this.groupManager = new env.groups.GroupManager(this, this.config.groups);
      this.pageManager = new env.pages.PageManager(this, this.config.pages);
      this.variableManager = new env.variables.VariableManager(this, this.config.variables);
      this.ruleManager = new env.rules.RuleManager(this, this.config.rules);
      this.database = new env.database.Database(this, this.config.settings.database);
      this.deviceManager.on('deviceRemoved', device => {
        group = this.groupManager.getGroupOfDevice(device.id);
        if (group != null) { this.groupManager.removeDeviceFromGroup(group.id, device.id); }
        return this.pageManager.removeDeviceFromAllPages(device.id);
      });
      this.ruleManager.on('ruleRemoved', rule => {
        group = this.groupManager.getGroupOfRule(rule.id);
        if (group != null) { return this.groupManager.removeRuleFromGroup(group.id, rule.id); }
      });
      this.variableManager.on('variableRemoved', variable => {
        group = this.groupManager.getGroupOfVariable(variable.name);
        if (group != null) { return this.groupManager.removeVariableFromGroup(group.id, variable.name); }
      });
      for (let discoverEvent of ['discover', 'discoverMessage', 'deviceDiscovered']) {
        (discoverEvent => {
          return this.deviceManager.on(discoverEvent, eventData => (this.io != null ? this.io.emit(discoverEvent, eventData) : undefined) );
        })(discoverEvent);
      }

      this._setupExpressApp();
    }

    _normalizeScheme(scheme) {
      if (scheme._normalized) { return; }
      if ((scheme.type === "object") && (typeof scheme.properties === "object")) {
        const requiredProps = scheme.required || [];
        for (let prop of Object.keys(scheme.properties || {})) {
          const s = scheme.properties[prop];
          let isRequired = true;
          if (typeof s.required === "boolean") {
            if (s.required === false) {
              isRequired = false;
            }
            delete s.required;
          }
          if (s.default != null) {
            isRequired = false;
          }
          if (isRequired && !(Array.from(requiredProps).includes(prop))) {
            requiredProps.push(prop);
          }
          if (s != null) { this._normalizeScheme(s); }
          if ((s.defines != null ? s.defines.options : undefined) != null) {
            for (let optName of Object.keys(s.defines.options || {})) {
              const opt = s.defines.options[optName];
              this._normalizeScheme(opt);
            }
          }
        }
        if (requiredProps.length > 0) {
          scheme.required = requiredProps;
        }
        if (scheme.additionalProperties == null) {
          scheme.additionalProperties = false;
        }
      }
      if (scheme.type === "array") {
        if (scheme.items != null) { this._normalizeScheme(scheme.items); }
      }
      return scheme._normalized = true;
    }

    _validateConfig(config, schema, scope) {
      if (scope == null) { scope = "config"; }
      const js = new JaySchema();
      const errors = js.validate(config, schema);
      if (errors.length > 0) {
        let errorMessage = `Invalid ${scope}: `;
        for (let i = 0; i < errors.length; i++) {
          const e = errors[i];
          if (i > 0) { errorMessage += ", "; }
          if ((e.kind === "ObjectValidationError") && (e.constraintName === "required")) {
            errorMessage += e.desc.replace(/^missing: (.*)$/, 'Missing property "$1"');
          } else if ((e.kind === "ObjectValidationError") &&
              (e.constraintName === "additionalProperties") && (e.testedValue != null)) {
            errorMessage += `Property \"${e.testedValue}\" is not a valid property`;
          } else if (e.desc != null) {
            errorMessage += e.desc;
          } else {
            errorMessage += (
              `Property \"${e.instanceContext}\" Should have ${e.constraintName} ` +
              `${e.constraintValue}`
            );
            if (e.testedValue != null) { errorMessage += `, was: ${e.testedValue}`; }
          }
          if ((e.instanceContext != null) && (e.instanceContext.length > 1)) {
            errorMessage += ` in ${e.instanceContext.replace('#', '')}`;
          }
        }
        //throw new Error(errorMessage)
        return env.logger.error(errorMessage);
      }
    }

    _loadConfig() {
      const schema = require("../config-schema");
      const contents = fs.readFileSync(this.configFile).toString();
      const instance = jsonlint.parse(RJSON.transform(contents));

      // some legacy support for old single user
      const auth = instance.settings != null ? instance.settings.authentication : undefined;
      if (((auth != null ? auth.username : undefined) != null) && ((auth != null ? auth.password : undefined) != null) && ((instance.users == null))) {
        if (instance.users == null) {
          instance.users = [
            {
              username: auth.username,
              password: auth.password,
              role: "admin"
            }
          ];
          delete auth.username;
          delete auth.password;
          env.logger.warn("Move user authentication setting to new users definition!");
        }
      }

      this._normalizeScheme(schema);
      this._validateConfig(instance, schema);
      this.config = declapi.enhanceJsonSchemaWithDefaults(schema, instance);
      for (let i = 0; i < this.config.roles.length; i++) {
        const role = this.config.roles[i];
        this.config.roles[i] = declapi.enhanceJsonSchemaWithDefaults(
          schema.properties.roles.items,
          role
        );
      }
      assert(Array.isArray(this.config.plugins));
      assert(Array.isArray(this.config.devices));
      assert(Array.isArray(this.config.pages));
      assert(Array.isArray(this.config.groups));
      this._checkConfig(this.config);

      // * Set the log level
      env.logger.winston.transports.taggedConsoleLogger.level = this.config.settings.logLevel;

      if (this.config.settings.debug) {
        env.logger.logDebug = true;
        env.logger.debug("settings.debug is true, showing debug output for pimatic core.");
      }

      i18n.configure({
        locales:['en', 'de'],
        directory: __dirname + '/../locales',
        defaultLocale: this.config.settings.locale,
      });

      return events.EventEmitter.defaultMaxListeners = this.config.settings.defaultMaxListeners;
    }


    _checkConfig(config){

      let deviceId, found, id, result;
      const checkForDublicate = (type, collection, idProperty) => {
        const ids = {};
        return (() => {
          result = [];
          for (let e of Array.from(collection)) {
            id = e[idProperty];
            if (ids[id] != null) {
              throw new Error(
                `Duplicate ${type} ${id} in config.`
              );
            }
            result.push(ids[id] = true);
          }
          return result;
        })();
      };

      checkForDublicate("plugin", config.plugins, 'plugin');
      checkForDublicate("device", config.devices, 'id');
      checkForDublicate("rules", config.rules, 'id');
      checkForDublicate("variables", config.variables, 'name');
      checkForDublicate("groups", config.groups, 'id');
      checkForDublicate("pages", config.pages, 'id');

      // Check groups, rules, variables, pages integrity
      const logWarning = function(type, id, name, collection) {
        if (collection == null) { collection = "group"; }
        return env.logger.warn(
          `Could not find a ${type} with the ID "${id}" from ` +
          `${collection} "${name}" in ${type}s config section.`
        );
      };

      for (let group of Array.from(config.groups)) {
        for (deviceId of Array.from(group.devices)) {
          found = _.find(config.devices, {id: deviceId});
          if (found == null) {
            logWarning('device', deviceId, group.id);
          }
        }
        for (let ruleId of Array.from(group.rules)) {
          found = _.find(config.rules, {id: ruleId});
          if (found == null) {
            logWarning('rule', ruleId, group.id);
          }
        }
        for (let variableName of Array.from(group.variables)) {
          found = _.find(config.variables, {name: variableName});
          if (found == null) {
            logWarning('variable', variableName, group.id);
          }
        }
      }

      return Array.from(config.pages).map((page) =>
        (() => {
          result = [];
          for (let item of Array.from(page.devices)) {
            found = _.find(config.devices, {id: item.deviceId});
            if (found == null) {
              result.push(logWarning('device', item.deviceId, page.id, 'page'));
            } else {
              result.push(undefined);
            }
          }
          return result;
        })());
    }

    _setupExpressApp() {
      // Setup express
      // -------------
      let hasPermission, key, loggedIn, password, role, user, value;
      this.app = express();
      this.app.use(methodOverride('X-HTTP-Method-Override'));
      this.app.use(connectTimeout("5min", {respond: false}));
      const extraHeaders = {};
      this.corsEnabled = (this.config.settings.cors != null) && !_.isEmpty(this.config.settings.cors.allowedOrigin);
      if (this.corsEnabled) {
        extraHeaders["Access-Control-Allow-Origin"] = this.config.settings.cors.allowedOrigin;
        extraHeaders["Access-Control-Allow-Credentials"] = true;
        extraHeaders["Access-Control-Allow-Methods"] = "GET,PUT,POST,DELETE";
        extraHeaders["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
      }

      this.app.use( (req, res, next) => {
        for (key of Object.keys(extraHeaders || {})) {
          value = extraHeaders[key];
          res.header(key, value);
        }

        if (this.corsEnabled && (req.method === 'OPTIONS')) {
          return res.sendStatus(200);
        }

        req.on("timeout", () => {
          env.logger.warn(
            `http request handler timeout. Possible unhandled request: \
${req.method} ${req.url}`
          );
          if (req.body != null) { return env.logger.debug(req.body); }
        });
        return next();
      });
      //@app.use express.logger()
      this.app.use(cookieParser());
      this.app.use(bodyParser.urlencoded({limit: '10mb', extended: true}));
      this.app.use(bodyParser.json({limit: '10mb'}));
      const auth = this.config.settings.authentication;
      const validSecret = (
        (auth.secret != null) && (typeof auth.secret === "string") && (auth.secret.length >= 32)
      );
      if (!validSecret) {
        auth.secret = require('crypto').randomBytes(64).toString('base64');
      }

      assert(typeof auth.secret === "string");
      assert(auth.secret.length >= 32);

      this.app.use(cookieSession({
        secret:  auth.secret,
        key: 'pimatic.sess',
        cookie: { maxAge: null }
      })
      );

      // Setup authentication
      // ----------------------
      // Use http-basicAuth if authentication is not disabled.

      assert([true, false].includes(auth.enabled));

      if (auth.enabled === true) {
        for (user of Array.from(this.config.users)) {
          //Check authentication.
          const validUsername = (
            (user.username != null) && (typeof user.username === "string") && (user.username.length !== 0)
          );
          if (!validUsername) {
            throw new Error(
              "Authentication is enabled, but no username has been defined for the user. " +
              "Please define a username in the user section of the config.json file."
            );
          }
          const validPassword = (
            (user.password != null) && (typeof user.password === "string") && (user.password.length !== 0)
          );
          if (!validPassword) {
            throw new Error(
              "Authentication is enabled, but no password has been defined for the user " +
              `\"${user.username}\". Please define a password for \"${user.username}\" ` +
              "in the users section of the config.json file or disable authentication."
            );
          }
        }
      }

      //req.path
      this.app.use( (req, res, next) => {
        if (req.path === "/login") { return next(); }

        // auth is deactivated so we allways continue
        if (auth.enabled === false) {
          req.session.username = '';
          return next();
        }

        if (this.userManager.isPublicAccessAllowed(req)) {
          return next();
        }

        // if already logged in so just continue
        loggedIn = (
          (typeof req.session.username === "string") &&
          (typeof req.session.loginToken === "string") &&
          (req.session.username.length > 0) &&
          (req.session.loginToken.length > 0) &&
          this.userManager.checkLoginToken(auth.secret, req.session.username, req.session.loginToken)
        );
        if (loggedIn) {
          return next();
        }

        // else use basic authorization

        const unauthorized = res => {
          res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
          return res.status(401).send("Unauthorized");
        };

        const authInfo = basicAuth(req);

        if (!authInfo || !authInfo.name || !authInfo.pass) {
          return unauthorized(res);
        }

        if (this.userManager.checkLogin(authInfo.name, authInfo.pass)) {
          ({ role } = this.userManager.getUserByUsername(authInfo.name));
          assert((role != null) && (typeof role === "string") && (role.length > 0));
          req.session.username = authInfo.name;
          req.session.loginToken = this.userManager.getLoginTokenForUsername(
            auth.secret, authInfo.name
          );
          req.session.role = role;
          return next();
        } else {
          delete req.session.username;
          delete req.session.loginToken;
          delete req.session.role;
          return unauthorized(res);
        }
      });

      this.app.post('/login', (req, res) => {
        user = req.body.username;
        ({ password } = req.body);
        let { rememberMe } = req.body;
        if (rememberMe === 'true') { rememberMe = true; }
        if (rememberMe === 'false') { rememberMe = false; }
        rememberMe = !!rememberMe;
        if (this.userManager.checkLogin(user, password)) {
          ({ role } = this.userManager.getUserByUsername(user));
          assert((role != null) && (typeof role === "string") && (role.length > 0));
          req.session.username = user;
          req.session.loginToken = this.userManager.getLoginTokenForUsername(auth.secret, user);
          req.session.role = role;
          req.session.rememberMe = rememberMe;
          if (rememberMe && (auth.loginTime !== 0)) {
            req.sessionOptions.maxAge = auth.loginTime;
          } else {
            req.sessionOptions.maxAge = null;
          }
          return res.send({
            success: true,
            username: user,
            role,
            rememberMe
          });
        } else {
          delete req.session.username;
          delete req.session.loginToken;
          delete req.session.role;
          delete req.session.rememberMe;
          return res.status(401).send({
            success: false,
            message: __("Wrong username or password.")
          });
        }
      });

      this.app.get('/logout', (req, res) => {
        req.session = null;
        res.status(401).send("You are now logged out.");
      });
      const serverEnabled = (
        (this.config.settings.httpsServer != null ? this.config.settings.httpsServer.enabled : undefined) || (this.config.settings.httpServer != null ? this.config.settings.httpServer.enabled : undefined)
      );

      if (!serverEnabled) {
        env.logger.warn("You have no HTTPS and no HTTP server enabled!");
      }

      this._initRestApi();

      const socketIoPath = '/socket.io';
      const engine = new engineIo.Server({path: socketIoPath});
      this.io = new socketIo();
      this.io.use( (socket, next) => {
        if (auth.enabled === false) {
          return next();
        }
        const req = socket.request;
        if ((req.query.username != null) && (req.query.password != null)) {
          if (this.userManager.checkLogin(req.query.username, req.query.password)) {
            socket.username = req.query.username;
            return next();
          } else {
            return next(new Error('unauthorizied'));
          }
        } else if (req.session != null) {
          loggedIn = (
            (typeof req.session.username === "string") &&
            (typeof req.session.loginToken === "string") &&
            (req.session.username.length > 0) &&
            (req.session.loginToken.length > 0) &&
            this.userManager.checkLoginToken(
              auth.secret,
              req.session.username,
              req.session.loginToken
            )
          );
          if (loggedIn) {
            socket.username = req.session.username;
            return next();
          } else {
            return next(new Error('Authentication error'));
          }
        } else {
          return next(new Error('Unauthorized'));
        }
      });

      this.io.bind(engine);

      this.app.all( '/socket.io/socket.io.js', (req, res) => this.io.serve(req, res) );
      this.app.all( '/socket.io/*', (req, res) => engine.handleRequest(req, res) );

      this.app.use( (err, req, res, next) => {
        env.logger.error(`Error on incoming http request to ${req.path}: ${err.message}`);
        env.logger.debug(err);
        if (!res.headersSent) {
          return res.status(500).send(err.stack);
        }
      });

      const onUpgrade = (req, socket, head) => {
        if (socketIoPath === req.url.substr(0, socketIoPath.length)) {
          engine.handleUpgrade(req, socket, head);
        } else {
          socket.end();
        }
      };

      // Start the HTTPS-server if it is enabled.
      if (this.config.settings.httpsServer != null ? this.config.settings.httpsServer.enabled : undefined) {
        const httpsConfig = this.config.settings.httpsServer;
        assert(httpsConfig instanceof Object);
        assert((typeof httpsConfig.keyFile === 'string') && (httpsConfig.keyFile.length !== 0));
        assert((typeof httpsConfig.certFile === 'string') && (httpsConfig.certFile.length !== 0));

        const httpsOptions = {};
        for (let name in httpsConfig) { value = httpsConfig[name]; httpsOptions[name] = value; }
        httpsOptions.key = fs.readFileSync(path.resolve(this.maindir, '../..', httpsConfig.keyFile));
        httpsOptions.cert = fs.readFileSync(path.resolve(this.maindir, '../..', httpsConfig.certFile));
        const https = require("https");
        this.app.httpsServer = https.createServer(httpsOptions, this.app);
        this.app.httpsServer.on('upgrade', onUpgrade);
      }

      // Start the HTTP-server if it is enabled.
      if (this.config.settings.httpServer != null ? this.config.settings.httpServer.enabled : undefined) {
        const http = require("http");
        this.app.httpServer = http.createServer(this.app);
        this.app.httpServer.on('upgrade', onUpgrade);
      }

      const actionsWithBindings = [
        [env.api.framework.actions, this],
        [env.api.rules.actions, this.ruleManager],
        [env.api.variables.actions, this.variableManager],
        [env.api.plugins.actions, this.pluginManager],
        [env.api.database.actions, this.database],
        [env.api.groups.actions, this.groupManager],
        [env.api.pages.actions, this.pageManager],
        [env.api.devices.actions, this.deviceManager]
      ];

      const onError = error => {
        env.logger.error(error.message);
        return env.logger.debug(error);
      };

      const checkPermissions = (socket, action) => {
        if (auth.enabled === false) { return true; }
        hasPermission = false;
        if ((action.permission != null) && (action.permission.scope != null)) {
          hasPermission = this.userManager.hasPermission(
            socket.username,
            action.permission.scope,
            action.permission.access
          );
        } else if ((action.permission != null) && (action.permission.action != null)) {
          hasPermission = this.userManager.hasPermissionBoolean(
            socket.username,
            action.permission.action
          );
        } else {
          hasPermission = true;
        }
        return hasPermission;
      };

      return this.io.on('connection', socket => {
        let permissions, username;
        declapi.createSocketIoApi(socket, actionsWithBindings, onError, checkPermissions);

        if (auth.enabled === true) {
          ({ username } = socket);
          ({ role } = this.userManager.getUserByUsername(username));
          permissions = this.userManager.getPermissionsByUsername(username);
        } else {
          username = 'nobody';
          role = 'no';
          permissions = {
            pages: "write",
            rules: "write",
            variables: "write",
            messages: "write",
            events: "write",
            devices: "write",
            groups: "write",
            plugins: "write",
            updates: "write",
            controlDevices: true,
            restart: true
          };
        }
        socket.emit('hello', {
          username,
          role,
          permissions
        });
        if (
          (auth.enabled === false) ||
          this.userManager.hasPermission(username, 'devices', 'read') ||
          this.userManager.hasPermission(username, 'pages', 'read')
        ) {
          socket.emit('devices', (Array.from(this.deviceManager.getDevices()).map((d) => d.toJson())) );
        } else { socket.emit('devices', []); }

        if ((auth.enabled === false) || this.userManager.hasPermission(username, 'rules', 'read')) {
          socket.emit('rules', (Array.from(this.ruleManager.getRules()).map((r) => r.toJson())) );
        } else { socket.emit('rules', []); }

        if ((auth.enabled === false) || this.userManager.hasPermission(username, 'rules', 'read')) {
          socket.emit('variables', (Array.from(this.variableManager.getVariables()).map((v) => v.toJson())) );
        } else { socket.emit('variables', []); }

        if ((auth.enabled === false) || this.userManager.hasPermission(username, 'pages', 'read')) {
          socket.emit('pages',  this.pageManager.getPages(role) );
        } else { socket.emit('pages', []); }

        const needsRules = (
          (auth.enabled === false) ||
          this.userManager.hasPermission(username, 'devices', 'read') ||
          this.userManager.hasPermission(username, 'rules', 'read') ||
          this.userManager.hasPermission(username, 'variables', 'read') ||
          this.userManager.hasPermission(username, 'pages', 'read') ||
          this.userManager.hasPermission(username, 'groups', 'read')
        );
        if (needsRules) {
          return socket.emit('groups',  this.groupManager.getGroups() );
        } else { return socket.emit('groups', []); }
      });
    }

    listen() {
      let awaiting;
      const genErrFunc = serverConfig => {
        return err => {
          let msg = `Could not listen on port ${serverConfig.port}. Error: ${err.message}. `;
          switch (err.code) {
            case "EACCES": msg += "Are you root?."; break;
            case "EADDRINUSE": msg += "Is a server already running?"; break;
          }
          env.logger.error(msg);
          env.logger.debug(err.stack);
          err.silent = true;
          throw err;
        };
      };

      const listenPromises = [];
      if (this.app.httpsServer != null) {
        const httpsServerConfig = this.config.settings.httpsServer;
        this.app.httpsServer.on('error', genErrFunc(httpsServerConfig));
        awaiting = Promise.fromCallback( callback => {
          return this.app.httpsServer.listen(httpsServerConfig.port, httpsServerConfig.hostname, callback);
        });
        listenPromises.push(awaiting.then( () => {
          return env.logger.info(`Listening for HTTPS-request on port ${httpsServerConfig.port}...`);
        })
        );
      }

      if (this.app.httpServer != null) {
        const httpServerConfig = this.config.settings.httpServer;
        this.app.httpServer.on('error', genErrFunc(this.config.settings.httpServer));
        awaiting = Promise.fromCallback( callback => {
          return this.app.httpServer.listen(httpServerConfig.port, httpServerConfig.hostname, callback);
        });
        listenPromises.push(awaiting.then( () => {
          return env.logger.info(`Listening for HTTP-request on port ${httpServerConfig.port}...`);
        })
        );
      }

      return Promise.all(listenPromises).then( () => {
        return this.emit("server listen", "startup");
      });
    }

    restart() {
      if (process.env['PIMATIC_DAEMONIZED'] == null) {
        throw new Error(
          'Can not restart self, when not daemonized. ' +
          'Please run pimatic with: "node ' + process.argv[1] + ' start" to use this feature.'
        );
      }
      env.logger.info("Restarting...");
      // first we call destroy to be able to release resources allocated by the current process.
      // next, we launch the restart script with the daemonizer, which will send the kill signal
      // to this process
      const proxy = new events();
      this.destroy()
      .catch(function(err) {
        env.logger.error(`Error during orderly shutdown of pimatic: ${err.message}`);
        return env.logger.debug(err.stack);}).finally(function() {
        const daemon = require('daemon');
        const scriptName = process.argv[1];
        const args = process.argv.slice(2); args[0] = 'restart';
        const child = daemon.daemon(scriptName, args, {cwd: process.cwd()});
        child.on('error', error => proxy.emit('error', error));
        return child.on('close', code => proxy.emit('close', code));
      });
      // Catch errors executing the restart script
      return new Promise( (resolve, reject) => {
        proxy.on('error', reject);
        return proxy.on('close', function(code) {
          if (code === 0) { return resolve();
          } else { return reject(new Error(`Error restarting pimatic, exit code ${code}`)); }
        });
      }).catch( err => {
        env.logger.error(`Error restarting pimatic: ${err.message}`);
        return env.logger.debug(err.stack);
      });
    }


    getGuiSettings() { return {
      config: this.config.settings.gui,
      defaults: this.config.settings.gui.__proto__
    }; }

    _emitDeviceAttributeEvent(device, attributeName, attribute, time, value) {
      this.emit('deviceAttributeChanged', {device, attributeName, attribute, time, value});
      return (this.io != null ? this.io.emit(
        'deviceAttributeChanged',
        {deviceId: device.id, attributeName, time: time.getTime(), value}
      ) : undefined);
    }


    _emitDeviceEvent(eventType, device) {
      this.emit(eventType, device);
      return (this.io != null ? this.io.emit(eventType, device.toJson()) : undefined);
    }

    _emitDeviceAdded(device) { return this._emitDeviceEvent('deviceAdded', device); }
    _emitDeviceChanged(device) { return this._emitDeviceEvent('deviceChanged', device); }
    _emitDeviceRemoved(device) {
      return this._emitDeviceEvent('deviceRemoved', device);
    }

    _emitDeviceOrderChanged(deviceOrder) {
      return this._emitOrderChanged('deviceOrderChanged', deviceOrder);
    }

    _emitMessageLoggedEvent(level, msg, meta) {
      this.emit('messageLogged', {level, msg, meta});
      return (this.io != null ? this.io.emit('messageLogged', {level, msg, meta}) : undefined);
    }

    _emitOrderChanged(eventName, order) {
      this.emit(eventName, order);
      return (this.io != null ? this.io.emit(eventName, order) : undefined);
    }

    _emitPageEvent(eventType, page) {
      this.emit(eventType, page);
      return (this.io != null ? this.io.emit(eventType, page) : undefined);
    }

    _emitPageAdded(page) { return this._emitPageEvent('pageAdded', page); }
    _emitPageChanged(page) { return this._emitPageEvent('pageChanged', page); }
    _emitPageRemoved(page) { return this._emitPageEvent('pageRemoved', page); }
    _emitPageOrderChanged(pageOrder) {
      return this._emitOrderChanged('pageOrderChanged', pageOrder);
    }

    _emitGroupEvent(eventType, group) {
      this.emit(eventType, group);
      return (this.io != null ? this.io.emit(eventType, group) : undefined);
    }

    _emitGroupAdded(group) { return this._emitGroupEvent('groupAdded', group); }
    _emitGroupChanged(group) { return this._emitGroupEvent('groupChanged', group); }
    _emitGroupRemoved(group) { return this._emitGroupEvent('groupRemoved', group); }
    _emitGroupOrderChanged(proupOrder) {
      return this._emitOrderChanged('groupOrderChanged', proupOrder);
    }

    _emitRuleEvent(eventType, rule) {
      this.emit(eventType, rule);
      return (this.io != null ? this.io.emit(eventType, rule.toJson()) : undefined);
    }

    _emitRuleAdded(rule) { return this._emitRuleEvent('ruleAdded', rule); }
    _emitRuleRemoved(rule) { return this._emitRuleEvent('ruleRemoved', rule); }
    _emitRuleChanged(rule) { return this._emitRuleEvent('ruleChanged', rule); }
    _emitRuleOrderChanged(ruleOrder) {
      return this._emitOrderChanged('ruleOrderChanged', ruleOrder);
    }

    _emitVariableEvent(eventType, variable) {
      this.emit(eventType, variable);
      return (this.io != null ? this.io.emit(eventType, variable.toJson()) : undefined);
    }

    _emitVariableAdded(variable) { return this._emitVariableEvent('variableAdded', variable); }
    _emitVariableRemoved(variable) { return this._emitVariableEvent('variableRemoved', variable); }
    _emitVariableChanged(variable) { return this._emitVariableEvent('variableChanged', variable); }
    _emitVariableValueChanged(variable, value) {
      this.emit("variableValueChanged", variable, value);
      return (this.io != null ? this.io.emit("variableValueChanged", {
        variableName: variable.name,
        variableValue: value
      }) : undefined);
    }

    _emitVariableOrderChanged(variableOrder) {
      return this._emitOrderChanged('variableOrderChanged', variableOrder);
    }

    _emitUpdateProcessStatus(status, info) {
      this.emit('updateProcessStatus', status, info);
      return (this.io != null ? this.io.emit("updateProcessStatus", {
        status,
        modules: info.modules
      }) : undefined);
    }

    _emitUpdateProcessMessage(message, info) {
      this.emit('updateProcessMessages', message, info);
      return (this.io != null ? this.io.emit("updateProcessMessage", {
        message,
        modules: info.modules
      }) : undefined);
    }

    init() {

      let i, result;
      const initVariables = () => {
        let variable;
        this.variableManager.init();
        this.variableManager.on("variableChanged", changedVar => {
          for (variable of Array.from(this.config.variables)) {
            if (variable.name === changedVar.name) {
              delete variable.value;
              delete variable.expression;
              switch (changedVar.type) {
                case 'value': variable.value = changedVar.value; break;
                case 'expression': variable.expression = changedVar.exprInputStr; break;
              }
              break;
            }
          }
          this._emitVariableChanged(changedVar);
          return this.emit("config");
        });
        this.variableManager.on("variableValueChanged", (changedVar, value) => {
          if (changedVar.type === 'value') {
            for (variable of Array.from(this.config.variables)) {
              if (variable.name === changedVar.name) {
                variable.value = value;
                break;
              }
            }
            this.emit("config");
          }
          return this._emitVariableValueChanged(changedVar, value);

        });
        this.variableManager.on("variableAdded", addedVar => {
          switch (addedVar.type) {
            case 'value': this.config.variables.push({
              name: addedVar.name,
              value: addedVar.value
            }); break;
            case 'expression': this.config.variables.push({
              name: addedVar.name,
              expression: addedVar.exprInputStr
            }); break;
          }
          this._emitVariableAdded(addedVar);
          return this.emit("config");
        });
        return this.variableManager.on("variableRemoved", removedVar => {
          for (i = 0; i < this.config.variables.length; i++) {
            variable = this.config.variables[i];
            if (variable.name === removedVar.name) {
              this.config.variables.splice(i, 1);
              break;
            }
          }
          this._emitVariableRemoved(removedVar);
          return this.emit("config");
        });
      };

      const initDevices = () => {
        let device;
        this.deviceManager.on("deviceRemoved", removedDevice => {
          for (i = 0; i < this.config.devices.length; i++) {
            device = this.config.devices[i];
            if (device.id === removedDevice.id) {
              this.config.devices.splice(i, 1);
              break;
            }
          }
          this._emitDeviceRemoved(removedDevice);
          return this.emit("config");
        });
        return this.deviceManager.on("deviceChanged", changedDevice => {
          for (i = 0; i < this.config.devices.length; i++) {
            device = this.config.devices[i];
            if (device.id === changedDevice.id) {
              this.config.devices[i] = changedDevice.config;
              break;
            }
          }
          this._emitDeviceChanged(changedDevice);
          return this.emit("config");
        });
      };


      const initActionProvider = () => {
        const defaultActionProvider = [
          env.actions.SetPresenceActionProvider,
          env.actions.ContactActionProvider,
          env.actions.SwitchActionProvider,
          env.actions.DimmerActionProvider,
          env.actions.LogActionProvider,
          env.actions.SetVariableActionProvider,
          env.actions.ShutterActionProvider,
          env.actions.StopShutterActionProvider,
          env.actions.ButtonActionProvider,
          env.actions.ToggleActionProvider,
          env.actions.HeatingThermostatModeActionProvider,
          env.actions.HeatingThermostatSetpointActionProvider,
          env.actions.TimerActionProvider,
          env.actions.AVPlayerPauseActionProvider,
          env.actions.AVPlayerStopActionProvider,
          env.actions.AVPlayerPlayActionProvider,
          env.actions.AVPlayerVolumeActionProvider,
          env.actions.AVPlayerNextActionProvider,
          env.actions.AVPlayerPrevActionProvider
        ];
        return (() => {
          result = [];
          for (let actProv of Array.from(defaultActionProvider)) {
            const actProvInst = new actProv(this);
            result.push(this.ruleManager.addActionProvider(actProvInst));
          }
          return result;
        })();
      };

      const initPredicateProvider = () => {
        const defaultPredicateProvider = [
          env.predicates.PresencePredicateProvider,
          env.predicates.SwitchPredicateProvider,
          env.predicates.DeviceAttributePredicateProvider,
          env.predicates.VariablePredicateProvider,
          env.predicates.VariableUpdatedPredicateProvider,
          env.predicates.ContactPredicateProvider,
          env.predicates.ButtonPredicateProvider,
          env.predicates.DeviceAttributeWatchdogProvider,
          env.predicates.StartupPredicateProvider
        ];
        return (() => {
          result = [];
          for (let predProv of Array.from(defaultPredicateProvider)) {
            const predProvInst = new predProv(this);
            result.push(this.ruleManager.addPredicateProvider(predProvInst));
          }
          return result;
        })();
      };

      const initRules = () => {

        let rule;
        const addRulePromises = ((() => {
          result = [];
          for (rule of Array.from(this.config.rules)) {
            result.push((rule => {
              let force;
              if (rule.active == null) { rule.active = true; }

              if (!rule.id.match(/^[a-z0-9\-_]+$/i)) {
                const newId = S(rule.id).slugify().s;
                env.logger.warn(`\
The ID of the rule "${rule.id}" contains a non alphanumeric letter or symbol.
Changing the ID of the rule to "${newId}".\
`
                );
                rule.id = newId;
              }

              if (rule.rule.match(/^if .+/)) {
                env.logger.warn(`\
Converting old rule "${rule.id}" from  "if ... then ..." to "when ... then ..."!\
`
                );
                rule.rule = rule.rule.replace(/^if/, "when");
              }

              if (rule.name == null) { rule.name = S(rule.id).humanize().s; }

              return this.ruleManager.addRuleByString(rule.id, {
                name: rule.name,
                ruleString: rule.rule,
                active: rule.active,
                logging: rule.logging
              }, (force = true)).catch( err => {
                env.logger.error(`Could not parse rule \"${rule.rule}\": ` + err.message);
                return env.logger.debug(err.stack);
              });
            })(rule));
          }
        
          return result;
        })());

        return Promise.all(addRulePromises).then(() => {
          // Save rule updates to the config file:
          //
          // * If a new rule was added then...
          this.ruleManager.on("ruleAdded", rule => {
            // ...add it to the rules Array in the config.json file
            const inConfig = (_.findIndex(this.config.rules , {id: rule.id}) !== -1);
            if (!inConfig) {
              this.config.rules.push({
                id: rule.id,
                name: rule.name,
                rule: rule.string,
                active: rule.active,
                logging: rule.logging
              });
            }
            this._emitRuleAdded(rule);
            return this.emit("config");
          });
          // * If a rule was changed then...
          this.ruleManager.on("ruleChanged", rule => {
            // ...change the rule with the right id in the config.json file
            this.config.rules = Array.from(this.config.rules).map((r) =>
              r.id === rule.id ?
                {
                  id: rule.id,
                  name: rule.name,
                  rule: rule.string,
                  active: rule.active,
                  logging: rule.logging
                }
              : r);
            this._emitRuleChanged(rule);
            return this.emit("config");
          });
          // * If a rule was removed then
          return this.ruleManager.on("ruleRemoved", rule => {
            // ...Remove the rule with the right ID in the config.json file
            this.config.rules = (Array.from(this.config.rules).filter((r) => r.id !== rule.id));
            this._emitRuleRemoved(rule);
            return this.emit("config");
        });
        });
      };

      return this.database.init()
        .then( () => this.pluginManager.checkNpmVersion() )
        .then( () => this.pluginManager.loadPlugins() )
        .then( () => this.pluginManager.initPlugins() )
        .then( () => this.deviceManager.initDevices() )
        .then( () => this.deviceManager.loadDevices() )
        .then(initVariables)
        .then(initDevices)
        .then(initActionProvider)
        .then(initPredicateProvider)
        .then(initRules)
        .then( () => {
          // Save the config on "config" event
          this.on("config", () => {
            return this.saveConfig();
          });

          const context = {
            waitFor: [],
            waitForIt(promise) { return this.waitFor.push(promise); }
          };

          this.emit("after init", context);

          return Promise.all(context.waitFor).then(() => this.listen());
        });
    }

    _initRestApi() {
      const auth = this.config.settings.authentication;

      const onError = error => {
        if (error instanceof Error) {
          const { message } = error;
          env.logger.error(error.message);
          return env.logger.debug(error.stack);
        }
      };

      this.app.get("/api", (req, res, nest) => res.send(declapi.stringifyApi(env.api.all)) );
      this.app.get("/api/decl-api-client.js", declapi.serveClient);

      const createPermissionCheck = (app, actions) => {
        return (() => {
          const result = [];
          for (let actionName in actions) {
            const action = actions[actionName];
            result.push(((actionName, action) => {
              if ((action.rest != null) && (action.permission != null)) {
                const type = (action.rest.type || 'get').toLowerCase();
                const { url } = action.rest;
                return app[type](url, (req, res, next) => {
                  let hasPermission, username;
                  if (auth.enabled === true) {
                    ({ username } = req.session);
                    if (action.permission.scope != null) {
                      hasPermission = this.userManager.hasPermission(
                        username,
                        action.permission.scope,
                        action.permission.access
                      );
                    } else if (action.permission.action != null) {
                      hasPermission = this.userManager.hasPermissionBoolean(
                        username,
                        action.permission.action
                      );
                    } else {
                      throw new Error(`Unknown permissions declaration for action ${action}`);
                    }
                  } else {
                    username = "nobody";
                    hasPermission = true;
                  }
                  if (hasPermission === true) {
                    this.userManager.requestUsername = username;
                    next();
                    return this.userManager.requestUsername = null;
                  } else {
                    return res.status(403).send();
                  }
                });
              }
            })(actionName, action));
          }
          return result;
        })();
      };

      createPermissionCheck(this.app, env.api.framework.actions);
      createPermissionCheck(this.app, env.api.rules.actions);
      createPermissionCheck(this.app, env.api.variables.actions);
      createPermissionCheck(this.app, env.api.plugins.actions);
      createPermissionCheck(this.app, env.api.database.actions);
      createPermissionCheck(this.app, env.api.groups.actions);
      createPermissionCheck(this.app, env.api.pages.actions);
      createPermissionCheck(this.app, env.api.devices.actions);
      declapi.createExpressRestApi(this.app, env.api.framework.actions, this, onError);
      declapi.createExpressRestApi(this.app, env.api.rules.actions, this.ruleManager, onError);
      declapi.createExpressRestApi(this.app, env.api.variables.actions, this.variableManager, onError);
      declapi.createExpressRestApi(this.app, env.api.plugins.actions, this.pluginManager, onError);
      declapi.createExpressRestApi(this.app, env.api.database.actions, this.database, onError);
      declapi.createExpressRestApi(this.app, env.api.groups.actions, this.groupManager, onError);
      declapi.createExpressRestApi(this.app, env.api.pages.actions, this.pageManager, onError);
      return declapi.createExpressRestApi(this.app, env.api.devices.actions, this.deviceManager, onError);
    }

    getConfig(password) {
      //blank passwords
      var blankSecrets = function(schema, obj) {
        switch (schema.type) {
          case "object":
            if (schema.properties != null) {
              return (() => {
                const result = [];
                for (let n in schema.properties) {
                  const p = schema.properties[n];
                  if (p.secret && (obj[n] != null)) {
                    obj[n] = 'xxxxxxxxxx';
                  }
                  if (obj[n] != null) { result.push(blankSecrets(p, obj[n])); } else {
                    result.push(undefined);
                  }
                }
                return result;
              })();
            }
            break;
          case "array":
            if ((schema.items != null) && (obj != null)) {
              return Array.from(obj).map((e) =>
                blankSecrets(schema.items, e));
            }
            break;
        }
      };
      const schema = require("../config-schema");
      const configCopy = _.cloneDeep(this.config);
      delete configCopy['//'];
      assert(this.userManager.requestUsername);
      if (password != null) {
        if (typeof password !== "string") {
          throw new Error("Password is not a string");
        }
        if (!this.userManager.checkLogin(this.userManager.requestUsername, password)) {
          throw new Error("Invalid password");
        }
      } else {
        blankSecrets(schema, configCopy);
      }
      return configCopy;
    }

    updateConfig(config) {
      const schema = require("../config-schema");
      this._normalizeScheme(schema);
      this._validateConfig(config, schema);
      assert(Array.isArray(config.plugins));
      assert(Array.isArray(config.devices));
      assert(Array.isArray(config.pages));
      assert(Array.isArray(config.groups));
      this._checkConfig(config);

      for (let pConf of Array.from(config.plugins)) {
        const fullPluginName = `pimatic-${pConf.plugin}`;
        let packageInfo = null;
        try {
          packageInfo = this.pluginManager.getInstalledPackageInfo(fullPluginName);
        } catch (err) {
          env.logger.warn(
            `Could not open package.json for \"${fullPluginName}\": ${err.message} ` +
            "Could not validate config."
          );
          continue;
        }
        if ((packageInfo != null ? packageInfo.configSchema : undefined) != null) {
          const pathToSchema = path.resolve(
            this.pluginManager.pathToPlugin(fullPluginName),
            packageInfo.configSchema
          );
          const pluginConfigSchema = require(pathToSchema);
          this._normalizeScheme(pluginConfigSchema);
          this._validateConfig(pConf, pluginConfigSchema, `config of ${fullPluginName}`);
        } else {
          env.logger.warn(
            `package.json of \"${fullPluginName}\" has no \"configSchema\" property. ` +
            "Could not validate config."
          );
        }
      }

      for (let deviceConfig of Array.from(config.devices)) {
        const classInfo = this.deviceManager.deviceClasses[deviceConfig.class];
        if (classInfo == null) {
          env.logger.debug(`Unknown device class \"${deviceConfig.class}\"`);
          continue;
        }
        const warnings = [];
        if (classInfo.prepareConfig != null) { classInfo.prepareConfig(deviceConfig); }
        this._normalizeScheme(classInfo.configDef);
        this._validateConfig(
          deviceConfig,
          classInfo.configDef,
            `config of device ${deviceConfig.id}`
        );
      }

      this.config = config;
      this.saveConfig();
      this.restart();
    }

    destroy() {
      if (this._destroying != null) { return this._destroying; }
      return this._destroying = Promise.resolve().then( () => {
        const context = {
          waitFor: [],
          waitForIt(promise) { return this.waitFor.push(promise); }
        };

        this.emit("destroy", context);
        this.saveConfig();
        return Promise.all(context.waitFor);
      });
    }


    saveConfig() {
      assert(this.config != null);
      try {
        return fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
      } catch (err) {
        env.logger.error("Could not write config file: ", err.message);
        env.logger.debug(err);
        return env.logger.info("config.json updated");
      }
    }
  }
  Framework.initClass();

  return { Framework };
};
