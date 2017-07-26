/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const assert = require("cassert");
const Promise = require('bluebird');
const os = require('os');
const path = require('path');
const fs = require('fs.extra');

const { env } = require('../startup');

describe("PluginManager", function() {

  //env.logger.info = ->

  const frameworkDummy =
    {maindir: `${os.tmpdir()}/pimatic-test/node_modules/pimatic`};

  let pluginManager = null;
  const skip = !process.env['NPM_TESTS'];

  before(() =>
    // make the temp dir:
    fs.mkdirpSync(frameworkDummy.maindir)
  );

  after(() =>
    // make the temp dir:
    fs.rmrfSync(`${os.tmpdir()}/pimatic-test`)
  );

  describe('#construct()', () =>

    it('should construct the PluginManager', () => pluginManager = new env.plugins.PluginManager(frameworkDummy))
  );

  describe('#pathToPlugin()', () =>

    it(`should return ${os.tmpdir()}/pimatic-test/node_modules/pimatic-test`, function() {
      const pluginPath = pluginManager.pathToPlugin('pimatic-test');
      return assert(pluginPath === path.normalize(`${os.tmpdir()}/pimatic-test/node_modules/pimatic-test`));
    })
  );

  describe('#installPlugin()', function() {

    it('should install the plugin from npm',  !skip ? function(finish) {
      this.timeout(20000);
      return pluginManager.installPlugin('pimatic-cron').then( function() {
        assert(fs.existsSync(`${os.tmpdir()}/pimatic-test/node_modules/pimatic-cron`));
        assert(fs.existsSync(`${os.tmpdir()}/pimatic-test/node_modules/pimatic-cron/node_modules`));
        return finish();
      }).done();
    } : undefined
    );

    return it('should install the plugin dependencies',  !skip ? function(finish) {
      this.timeout(20000);
      fs.rmrfSync(`${os.tmpdir()}/pimatic-test/node_modules/pimatic-cron/node_modules`);
      return pluginManager.installPlugin('pimatic-cron').then( function() {
        assert(fs.existsSync(`${os.tmpdir()}/pimatic-test/node_modules/pimatic-cron/node_modules`));
        return finish();
      }).done();
    } : undefined
    );
  });

  describe('#getInstalledPlugins()', () =>

    it('should return the pimatic-cron plugin',  !skip ? finish =>
      pluginManager.getInstalledPlugins().then( function(names) {
        assert(names.length === 1);
        assert(names[0] === 'pimatic-cron');
        return finish();
      }).done()
     : undefined
    )
  );

  describe('#getInstalledPackageInfo()', () =>

    it('should return pimatic-crons package.json',  !skip ?  function() {
      const pkgInfo = pluginManager.getInstalledPackageInfo('pimatic-cron');
      return assert(pkgInfo.name === 'pimatic-cron');
    } : undefined
    )
  ); 

  return describe('#getNpmInfo()', () =>

    it('should return pimatic package info from the registry', function(done) {
      const promise = pluginManager.getNpmInfo('pimatic');
      promise.then( function(pkgInfo) {
        console.log("-----", pkgInfo.name === "pimatic");
        assert(pkgInfo.name === "pimatic");
        return done();
      }).catch(done);
    })
  );
});

const configFile = `${os.tmpdir()}/pimatic-test-config.json`;