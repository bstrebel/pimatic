/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

/*
Plugin Manager
=======
*/

const Promise = require('bluebird');
const fs = require('fs.extra'); Promise.promisifyAll(fs);
const path = require('path');
const util = require('util');
const assert = require('cassert');
const byline = require('byline');
const _ = require('lodash');
const spawn = require("cross-spawn");
const https = require("https");
const semver = require("semver");
const events = require('events');
const S = require('string');
const declapi = require('decl-api');
const rp = require('request-promise');
const download = require('gethub');

module.exports = function(env) {

  let exports;
  const isCompatible = function(refVersion, packageInfo) {
    try {
      const peerVersion = packageInfo.peerDependencies != null ? packageInfo.peerDependencies.pimatic : undefined;
      if (peerVersion != null) {
        if (semver.satisfies(refVersion, peerVersion)) {
          return true;
        }
      }
    } catch (err) {
      env.logger.error(err);
    }
    return false;
  };

  const satisfyingVersion = function(p, refVersion) {
    const versions = [];
    _.forEach(p.versions, (value, key) => {
      if (isCompatible(refVersion, value)) {
        return versions.push(key);
      }
    });
    return versions;
  };

  const getLatestCompatible = function(packageInfo, refVersion) {
    let result = packageInfo.versions[packageInfo['dist-tags'].latest];
    if (isCompatible(refVersion, result)) {
      return result;
    } else {
      const satisfyingV = satisfyingVersion(packageInfo, refVersion);
      if (satisfyingV.length > 0) {
        const latestSatisfying = satisfyingV[satisfyingV.length-1];
        result = packageInfo.versions[latestSatisfying];
        return result;
      } else {
        // no compatible version found, return latest
        return result;
      }
    }
    return result;
  };

  class PluginManager extends events.EventEmitter {
    static initClass() {
      this.prototype.plugins = [];
      this.prototype.updateProcessStatus = 'idle';
      this.prototype.updateProcessMessages = [];
      this.prototype.restartRequired = false;
    }

    constructor(framework) {
      super();
      this.framework = framework;
      this.modulesParentDir = path.resolve(this.framework.maindir, '../../');
    }

    checkNpmVersion() {
      return this.spawnPpm(['--version']).catch( err => {
        return env.logger.error("Could not run ppm, plugin and module installation will not work.");
      });
    }

    // Loads the given plugin by name
    loadPlugin(name, config) {
      const packageInfo = this.getInstalledPackageInfo(name);
      const packageInfoStr = ((packageInfo != null) ? `(${packageInfo.version})` : "");
      env.logger.info(`Loading plugin: "${name}" ${packageInfoStr}`);
      // require the plugin and return it
      // create a sublogger:
      const pluginEnv = Object.create(env);
      pluginEnv.logger = env.logger.base.createSublogger(name, config.debug);
      if (config.debug) {
        env.logger.debug(`debug is true in plugin config, showing debug output for ${name}.`);
      }
      const plugin = (require(name))(pluginEnv, module);
      return Promise.resolve([plugin, packageInfo]);
    }

    // Checks if the plugin folder exists under node_modules
    isInstalled(name) {
      assert(name != null);
      assert(name.match(/^pimatic.*$/) != null);
      return fs.existsSync(this.pathToPlugin(name));
    }

    isGitRepo(name) {
      assert(name != null);
      assert(name.match(/^pimatic.*$/) != null);
      return fs.existsSync(`${this.pathToPlugin(name)}/.git`);
    }

    _getFullPlatfrom() {
      const abiVersion = process.versions.modules;
      const { platform } = process;
      const arch = process.arch === "arm" ? "armhf" : process.arch;
      return `node-${abiVersion}-${arch}-${platform}`;
    }

    _findDist(plugin) {
      if (((plugin.dists == null)) || (plugin.dists.length === 0)) { return null; }
      const fullPlatform = this._getFullPlatfrom();
      for (let dist of Array.from(plugin.dists)) {
        if (dist.name.indexOf(fullPlatform) === 0) {
          return dist;
        }
      }
      return null;
    }

    // Install a plugin from the npm repository
    installPlugin(name, update) {
      if (update == null) { update = false; }
      assert(name != null);
      assert(name.match(/^pimatic.*$/) != null);
      if (update) {
        if (this.isGitRepo(name)) { throw new Error("Can't update a git repository!"); }
      }
      return this.getPluginInfo(name).then( packageInfo => {
        if (packageInfo == null) {
          env.logger.warn(
            `Could not determine compatible version for \"${name}\"` +
            ", trying to installing latest version"
          );
          env.logger.info(`Installing: \"${name}\" from npm-registry.`);
          if (update) {
            return this.spawnPpm(['update', name, '--unsafe-perm']);
          } else {
            return this.spawnPpm(['install', name, '--unsafe-perm']);
          }
        }
        const dist = this._findDist(packageInfo);
        if (dist) {
          if (update) { return this.updateGitPlugin(name); } else { return this.installGitPlugin(name); }
        }
        env.logger.info(`Installing: \"${name}@${packageInfo.version}\" from npm-registry.`);
        return this.spawnPpm(['install', `${name}@${packageInfo.version}`, '--unsafe-perm']);
      });
    }

    updatePlugin(name) {
      return this.installPlugin(name, true);
    }

    uninstallPlugin(name) {
      const pluginDir = this.pathToPlugin(name);
      this.requrieRestart();
      return fs.rmrfAsync(pluginDir);
    }

    _emitUpdateProcessStatus(status, info) {
      this.updateProcessStatus = status;
      return this.emit('updateProcessStatus', status, info);
    }

    _emitUpdateProcessMessage(message, info) {
      this.updateProcessMessages.push(message);
      return this.emit('updateProcessMessage', message, info);
    }

    getUpdateProcessStatus() {
      return {
        status: this.updateProcessStatus,
        messages: this.updateProcessMessages
      };
    }

    install(modules) {
      const info = {modules};
      this._emitUpdateProcessStatus('running', info);
      const npmMessageListener = ( line => this._emitUpdateProcessMessage(line, info) );
      this.on('npmMessage', npmMessageListener);
      const hasErrors = false;
      return Promise.each(modules, plugin => {
        return (this.isInstalled(plugin) ? this.updatePlugin(plugin) : this.installPlugin(plugin))
        .catch( error => {
          env.logger.error(`Error installing plugin ${plugin}: ${error.message}`);
          return env.logger.debug(error.stack);
        });
      }).then( () => {
        this._emitUpdateProcessStatus('done', info);
        this.requrieRestart();
        this.removeListener('npmMessage', npmMessageListener);
        return modules;
      }).catch( error => {
        this._emitUpdateProcessStatus('error', info);
        this.removeListener('npmMessage', npmMessageListener);
        throw error;
      });
    }

    pathToPlugin(name) {
      assert(name != null);
      assert((name.match(/^pimatic.*$/) != null) || (name === "pimatic"));
      return path.resolve(this.framework.maindir, "..", name);
    }

    getPluginList() {
      if (this._pluginList) { return this._pluginList;
      } else { return this.searchForPlugin(); }
    }

    getCoreInfo() {
      if (this._coreInfo) { return this._coreInfo;
      } else { return this.searchForCoreUpdate(); }
    }

    _tranformRequestErrors(err) {
      if (err.name === 'RequestError') {
        throw new Error(
          `\
Could not connect to the pimatic update server: ${err.message}
Either the update server is currently not available or your internet connection is down.\
`);
      }
      throw err;
    }


    searchForPlugin() {
      const { version } = this.framework.packageJson;
      return this._pluginList = rp(`http://api.pimatic.org/plugins?version=${version}`)
        .catch(this._tranformRequestErrors)
        .then( res => {
          const json = JSON.parse(res);
          // sort
          json.sort( (a, b) => a.name.localeCompare(b.name) );
          // cache for 1min
          setTimeout( (() => this._pluginList = null), 60*1000);
          return json;
        }).catch( err => {
          // cache errors only for 1 sec
          setTimeout( (() => this._pluginList = null), 1*1000);
          throw err;
        });
    }

    searchForCoreUpdate() {
      const { version } = this.framework.packageJson;
      return this._coreInfo = rp(`http://api.pimatic.org/core?version=${version}`)
        .catch(this._tranformRequestErrors)
        .then( res => {
          const json = JSON.parse(res);
          // cache for 1min
          setTimeout( (() => this._coreInfo = null), 60*1000);
          return json;
        }).catch( err => {
          // cache errors only for 1 sec
          setTimeout( (() => this._coreInfo = null), 1*1000);
          throw err;
        });
    }

    getPluginInfo(name) {
      if (name === "pimatic") { return this.getCoreInfo(); }
      let pluginInfo = null;
      return this.getPluginList().then( plugins => {
        return pluginInfo = _.find(plugins, p => p.name === name);
      }).finally( () => {
        if (pluginInfo == null) {
          env.logger.info("Could not get plugin info from update server, request info from npm");
          return pluginInfo = this.getPluginInfoFromNpm(name);
        }
      }).then( () => {
        return pluginInfo;
      });
    }

    getPluginInfoFromNpm(name) {
      return rp(`https://registry.npmjs.org/${name}`).then( res => {
        const packageInfos = JSON.parse(res);
        if (packageInfos.error != null) {
          throw new Error(`Error getting info about ${name} from npm failed: ${info.reason}`);
        }
        return getLatestCompatible(packageInfos, this.framework.packageJson.version);
      });
    }

    isCompatible(packageInfo) {
      const { version } = this.framework.packageJson;
      const pimaticRange = packageInfo.peerDependencies != null ? packageInfo.peerDependencies.pimatic : undefined;
      if (!pimaticRange) {
        return null;
      }
      return semver.satisfies(version, pimaticRange);
    }

    searchForPluginsWithInfo() {
      return this.searchForPlugin().then( plugins => {
        let pluginList;
        return pluginList = ((() => {
          const result = [];
          
          for (let p of Array.from(plugins)) {
            var listEntry;
            const name = p.name.replace('pimatic-', '');
            const loadedPlugin = this.framework.pluginManager.getPlugin(name);
            const installed = this.isInstalled(p.name);
            const packageJson = (
              installed ? this.getInstalledPackageInfo(p.name)
              : null
            );
            result.push(listEntry = {
              name,
              description: p.description,
              version: p.version,
              installed,
              loaded: (loadedPlugin != null),
              activated: this.isActivated(name),
              isNewer: (installed ? semver.gt(p.version, packageJson.version) : false),
              isCompatible: this.isCompatible(p)
            });
          }
        
          return result;
        })());
      });
    }

    isPimaticOutdated() {
      const installed = this.getInstalledPackageInfo("pimatic");
      return this.getPluginInfo("pimatic").then( latest => {
        if (semver.gt(latest.version, installed.version)) {
          return {
            current: installed.version,
            latest: latest.version
          };
        } else { return false; }
      });
    }

    getOutdatedPlugins() {
      return this.getInstalledPluginUpdateVersions().then( result => {
        const outdated = [];
        for (let p of Array.from(result)) {
          if (semver.gt(p.latest, p.current)) {
            outdated.push(p);
          }
        }
        return outdated;
      });
    }

    getInstalledPluginUpdateVersions() {
      return this.getInstalledPlugins().then( plugins => {
        const waiting = [];
        const infos = [];
        for (let p of Array.from(plugins)) {
          (p => {
            const installed = this.getInstalledPackageInfo(p);
            return waiting.push(this.getPluginInfo(p).then( latest => {
              return infos.push({
                plugin: p,
                current: installed.version,
                latest: latest.version
              });
            })
            );
          })(p);
        }
        return Promise.settle(waiting).then( results => {
          for (let r of Array.from(results)) { if (r.isRejected()) { env.logger.error(r.reason()); } }

          const ret = [];
          for (let info of Array.from(infos)) {
            if (info.current == null) {
              env.logger.warn(`Could not get the installed package version of ${info.plugin}`);
              continue;
            }
            if (info.latest == null) {
              env.logger.warn(`Could not get the latest version of ${info.plugin}`);
              continue;
            }
            ret.push(info);
          }
          return ret;
        });
      });
    }

    spawnPpm(args) {
      return new Promise( (resolve, reject) => {
        if (this.npmRunning) {
          reject("npm is currently in use");
          return;
        }
        this.npmRunning = true;
        let output = '';
        const npmLogger = env.logger.createSublogger("ppm");
        let errCode = null;
        let errorMessage = null;
        const onLine = ( line => {
          let match;
          line = line.toString();
          if ((match = line.match(/ERR! code (E[A-Z]+)/)) != null) {
            errCode = match[1];
          }
          if ((match = line.match(/error .* requires a C\+\+11 compiler/)) != null) {
            errorMessage = match[0];
          }
          output += `${line}\n`;
          if (line.indexOf('npm http 304') === 0) { return; }
          if (line.match(/ERR! peerinvalid .*/)) { return; }
          this.emit("npmMessage", line);
          line = S(line).chompLeft('npm ').s;
          return npmLogger.info(line);
        }
        );
        const npmEnv = _.clone(process.env);
        npmEnv['HOME'] = require('path').resolve(this.framework.maindir, '../..');
        npmEnv['NPM_CONFIG_UNSAFE_PERM'] = true;
        const ppmBin = './node_modules/pimatic/ppm.js';
        const npm = spawn(ppmBin, args, {cwd: this.modulesParentDir, env: npmEnv});
        const stdout = byline(npm.stdout);
        stdout.on("data", onLine);
        const stderr = byline(npm.stderr);
        stderr.on("data", onLine);

        return npm.on("close", code => {
          this.npmRunning = false;
          const command = ppmBin + " " + _.reduce(args, (akk, a) => `${akk} ${a}`);
          if (code !== 0) {
            return reject(new Error(
              `Error running \"${command}\"` + ((errorMessage != null) ? `: ${errorMessage}` : "")
            )
            );
          } else { return resolve(output); }
      });

      });
    }

    installGitPlugin(name) {
      return this.getPluginInfo(name).then( plugin => {
        const dist = this._findDist(plugin);
        if (dist == null) { throw new Error("dist package not found"); }
        env.logger.info(`Installing: \"${name}\" from precompiled source (${dist.name})`);
        const tmpDir = path.resolve(this.framework.maindir, "..", `.${name}.tmp`);
        const destdir = this.pathToPlugin(name);

        return fs.rmrfAsync(tmpDir)
          .catch()
          .then( () => {
            return download('pimatic-ci', name, dist.name, tmpDir);
          })
          .then( () => {
            return fs.rmrfAsync(destdir)
              .catch()
              .then( () => {
                return fs.moveAsync(tmpDir, destdir);
              });
          })
          .finally( () => {
            return fs.rmrfAsync(tmpDir);
          });
      });
    }

    updateGitPlugin(name) { return this.installGitPlugin(name); }

    getInstalledPlugins() {
      return fs.readdirAsync(`${this.framework.maindir}/..`).then( files => {
        let plugins;
        return plugins = (Array.from(files).filter((f) => (f.match(/^pimatic-.*/) != null)));
      });
    }

    getInstalledPluginsWithInfo() {
      return this.getInstalledPlugins().then( plugins => {
        let pluginList;
        return pluginList = ((() => {
          const result = [];
          
          for (let name of Array.from(plugins)) {
            var listEntry;
            const packageJson = this.getInstalledPackageInfo(name);
            name = name.replace('pimatic-', '');
            const loadedPlugin = this.framework.pluginManager.getPlugin(name);
            result.push(listEntry = {
              name,
              loaded: (loadedPlugin != null),
              activated: this.isActivated(name),
              description: packageJson.description,
              version: packageJson.version,
              homepage: packageJson.homepage,
              isCompatible: this.isCompatible(packageJson)
            });
          }
        
          return result;
        })());
      });
    }

    installUpdatesAsync(modules) {
      return new Promise( (resolve, reject) => {
        // resolve when complete
        this.install(modules).then(resolve).catch(reject);
        // or after 10 seconds to prevent a timeout
        return Promise.delay('still running', 10000).then(resolve);
      });
    }

    getInstalledPackageInfo(name) {
      assert(name != null);
      assert((name.match(/^pimatic.*$/) != null) || (name === "pimatic"));
      return JSON.parse(fs.readFileSync(
        `${this.pathToPlugin(name)}/package.json`, 'utf-8'
      )
      );
    }

    getNpmInfo(name) {
      return new Promise( (resolve, reject) => {
        return https.get(`https://registry.npmjs.org/${name}/latest`, res => {
          let str = "";
          res.on("data", chunk => str += chunk);
          return res.on("end", function() {
            try {
              const info = JSON.parse(str);
              if (info.error != null) {
                throw new Error(`Getting info about ${name} failed: ${info.reason}`);
              }
              return resolve(info);
            } catch (e) {
              return reject(e.message);
            }
        });
        }).on("error", reject);
      });
    }

    loadPlugins() {
      // Promise chain, begin with an empty promise
      let chain = Promise.resolve();

      for (let i = 0; i < this.pluginsConfig.length; i++) {
        const pConf = this.pluginsConfig[i];
        ((pConf, i) => {
          return chain = chain.then( () => {
            assert(pConf != null);
            assert(pConf instanceof Object);
            assert((pConf.plugin != null) && (typeof pConf.plugin === "string"));

            if (pConf.active === false) {
              return Promise.resolve();
            }

            const fullPluginName = `pimatic-${pConf.plugin}`;
            return Promise.try( () => {
              // If the plugin folder already exist
              return (
                this.isInstalled(fullPluginName) ? Promise.resolve()
                :
                  this.installPlugin(fullPluginName)
              ).then( () => {
                return this.loadPlugin(fullPluginName, pConf).then( (...args) => {
                  // Check config
                  const [plugin, packageInfo] = Array.from(args[0]);
                  const configSchema = this._getConfigSchemaFromPackageInfo(packageInfo);
                  if (typeof plugin.prepareConfig === "function") {
                    plugin.prepareConfig(pConf);
                  }
                  if (configSchema != null) {
                    this.framework._validateConfig(pConf, configSchema, `config of ${fullPluginName}`);
                    pConf = declapi.enhanceJsonSchemaWithDefaults(configSchema, pConf);
                  } else {
                    env.logger.warn(
                      `package.json of \"${fullPluginName}\" has no \"configSchema\" property. ` +
                      "Could not validate config."
                    );
                  }
                  return this.registerPlugin(plugin, pConf, configSchema);
                });
              });
            });
          }).catch( function(error) {
            // If an error occurs log an ignore it.
            env.logger.error(error.message);
            return env.logger.debug(error.stack);
          });
        })(pConf, i);
      }

      return chain;
    }

    _getConfigSchemaFromPackageInfo(packageInfo) {
      if (packageInfo.configSchema == null) {
        return null;
      }
      const pathToSchema = path.resolve(
        this.pathToPlugin(packageInfo.name),
        packageInfo.configSchema
      );
      const configSchema = require(pathToSchema);
      if (!configSchema._normalized) {
        configSchema.properties.plugin = {
          type: "string"
        };
        configSchema.properties.active = {
          type: "boolean",
          required: false
        };
        this.framework._normalizeScheme(configSchema);
      }
      return configSchema;
    }

    initPlugins() {
      return Array.from(this.plugins).map((plugin) =>
        (() => { try {
          return plugin.plugin.init(this.framework.app, this.framework, plugin.config);
        } catch (err) {
          env.logger.error(
            `Could not initialize the plugin \"${plugin.config.plugin}\": ` +
            err.message
          );
          return env.logger.debug(err.stack);
        } })());
    }

    registerPlugin(plugin, config, packageInfo) {
      assert((plugin != null) && plugin instanceof env.plugins.Plugin);
      assert((config != null) && config instanceof Object);

      this.plugins.push({plugin, config, packageInfo});
      return this.emit("plugin", plugin);
    }

    getPlugin(name) {
      assert(name != null);
      assert(typeof name === "string");

      for (let p of Array.from(this.plugins)) {
        if (p.config.plugin === name) { return p.plugin; }
      }
      return null;
    }

    getPluginConfig(name) {
      for (let plugin of Array.from(this.framework.config.plugins)) {
        if (plugin.plugin === name) { return plugin; }
      }
      return null;
    }

    isActivated(name) {
      for (let plugin of Array.from(this.framework.config.plugins)) {
        if (plugin.plugin === name) {
          if (plugin.active != null) { return plugin.active; } else { return true; }
        }
      }
      return false;
    }

    getPluginConfigSchema(name) {
      assert(name != null);
      assert(typeof name === "string");
      const packageInfo = this.getInstalledPackageInfo(name);
      return this._getConfigSchemaFromPackageInfo(packageInfo);
    }

    updatePluginConfig(pluginName, config) {
      assert(pluginName != null);
      assert(typeof pluginName === "string");
      config.plugin = pluginName;
      const fullPluginName = `pimatic-${pluginName}`;
      const configSchema = this.getPluginConfigSchema(fullPluginName);
      if (configSchema != null) {
        this.framework._validateConfig(config, configSchema, `config of ${fullPluginName}`);
      }
      for (let i = 0; i < this.framework.config.plugins.length; i++) {
        const plugin = this.framework.config.plugins[i];
        if (plugin.plugin === pluginName) {
          this.framework.config.plugins[i] = config;
          this.framework.emit('config');
          return;
        }
      }
      this.framework.config.plugins.push(config);
      return this.framework.emit('config');
    }

    removePluginFromConfig(pluginName) {
      const removed = _.remove(this.framework.config.plugins, p => p.plugin === pluginName);
      if (removed.length > 0) {
        this.framework.emit('config');
      }
      return removed.length > 0;
    }

    setPluginActivated(pluginName, active) {
      for (let i = 0; i < this.framework.config.plugins.length; i++) {
        const plugin = this.framework.config.plugins[i];
        if (plugin.plugin === pluginName) {
          if (!!plugin.active !== !!active) {
            this.requrieRestart();
          }
          plugin.active = active;
          this.framework.emit('config');
          return true;
        }
      }
      return false;
    }

    getCallingPlugin() {
      const stack = new Error().stack.toString();
      const matches = stack.match(/^.+?\/node_modules\/(pimatic-.+?)\//m);
      if (matches != null) {
        return matches[1];
      } else {
        return 'pimatic';
      }
    }

    requrieRestart() {
      return this.restartRequired = true;
    }

    doesRequireRestart() {
      return this.restartRequired;
    }
  }
  PluginManager.initClass();


  class Plugin extends require('events').EventEmitter {
    static initClass() {
      this.prototype.name = null;
    }
    init() {
      throw new Error("Your plugin must implement init");
    }
  }
  Plugin.initClass();

    //createDevice: (config) ->

  return exports = {
    PluginManager,
    Plugin
  };
};
