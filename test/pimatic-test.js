/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const assert = require("cassert");

describe("pimatic", function() {

  const config = {   
    settings: {
      locale: "en",
      authentication: {
        username: "test",
        password: "test",
        enabled: true,
        disabled: true
      },
      logLevel: "error",
      httpServer: {
        enabled: true,
        port: 8080
      },
      httpsServer: {
        enabled: false
      },
      database: {
        client: "sqlite3",
        connection: {
          filename: ':memory:'
        }
      },
      plugins: [],
      devices: [],
      rules: []
    }
  };

  const fs = require('fs');
  const os = require('os');
  const configFile = `${os.tmpdir()}/pimatic-test-config.json`;

  before(function() {
    fs.writeFileSync(configFile, JSON.stringify(config));
    return process.env.PIMATIC_CONFIG = configFile;
  });

  after(() => fs.unlinkSync(configFile));

  let framework = null;
  let deviceConfig = null;

  describe('startup', function() {

    it("should startup", function(finish) {
      const startup = require('../startup');
      startup.startup().then( function(fm){
        framework = fm;
        return finish();
      }).catch(finish);
    });

    it("httpServer should run", function(done){
      const http = require('http');
      http.get(`http://localhost:${config.settings.httpServer.port}`, res => done()).on("error", function(e) {
        throw e;
      });
    });

    return it("httpServer should ask for password", function(done){
      const http = require('http');
      http.get(`http://localhost:${config.settings.httpServer.port}`, function(res) {
        assert(res.statusCode === 401); // is Unauthorized
        return done();
      }).on("error", function(e) {
        throw e;
      });
    });
  });

  describe('#addDeviceToConfig()', function() {

    deviceConfig = { 
      id: 'test-actuator',
      class: 'TestActuatorClass'
    };

    it('should add the actuator to the config', function() {

      framework.deviceManager.addDeviceToConfig(deviceConfig);
      assert(framework.config.devices.length === 1);
      return assert(framework.config.devices[0].id === deviceConfig.id);
    });

    return it('should throw an error if the actuator exists', function() {
      try {
        framework.deviceManager.addDeviceToConfig(deviceConfig);
        return assert(false);
      } catch (e) {
        return assert(e.message === `An device with the ID ${deviceConfig.id} is already in the config`);
      }
    });
  });

  return describe('#isDeviceInConfig()', function() {

    it('should find actuator in config', () => assert(framework.deviceManager.isDeviceInConfig(deviceConfig.id)));

    return it('should not find another actuator in config', () => assert(!framework.deviceManager.isDeviceInConfig('a-not-present-id')));
  });
});
