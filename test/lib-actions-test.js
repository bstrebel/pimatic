/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const assert = require("cassert");
const Promise = require('bluebird');
const i18n = require('i18n');
const events = require('events');
const M = require('../lib/matcher');
const _ = require('lodash');

i18n.configure({
  locales:['en', 'de'],
  directory: __dirname + '/../locales',
  defaultLocale: 'en'
});

const { env } = require('../startup');

const createDummyParseContext = function() {
  const variables = {};
  const functions = {};
  return M.createParseContext(variables, functions);
};

describe("SwitchActionHandler", function() {

  const frameworkDummy = {
    deviceManager: {
      devices: {},
      getDevices() { return _.values(this.devices); }
    }
  };

  const switchActionProvider = new env.actions.SwitchActionProvider(frameworkDummy);

  class DummySwitch extends env.devices.SwitchActuator {
    static initClass() {
      this.prototype.id = 'dummy-switch-id';
      this.prototype.name = 'dummy switch';
    }
  }
  DummySwitch.initClass();

  const dummySwitch = new DummySwitch();
  frameworkDummy.deviceManager.devices['dummy-switch-id'] = dummySwitch;

  return describe("#parseAction()", function() {
    let turnOnCalled = false;
    let turnOffCalled = false;

    beforeEach(function() {
      turnOnCalled = false;
      dummySwitch.turnOn = function() {
        turnOnCalled = true;
        return Promise.resolve(true);
      };

      turnOffCalled = false;
      return dummySwitch.turnOff = function() {
        turnOffCalled = true;
        return Promise.resolve(true);
      };
    });

    const validRulePrefixes = [
      'turn the dummy switch',
      'turn dummy switch',
      'switch the dummy switch',
      'switch dummy switch'
    ];

    for (let rulePrefix of Array.from(validRulePrefixes)) {
      (function(rulePrefix) {

        const ruleWithOn = rulePrefix + ' on';
        it(`should parse: ${ruleWithOn}`, function(finish) {
          const context = createDummyParseContext();
          const result = switchActionProvider.parseAction(ruleWithOn, context);
          assert(result != null);
          assert(result.token === ruleWithOn);
          assert(result.nextInput === "");
          assert(result.actionHandler != null);
          return result.actionHandler.executeAction(false).then( function(message) {
            assert(turnOnCalled);
            assert(message === "turned dummy switch on");
            return finish();
          }).done();
        });

        const ruleWithOff = rulePrefix + ' off';
        return it(`should execute: ${ruleWithOff}`, function(finish) {
          const context = createDummyParseContext();
          const result = switchActionProvider.parseAction(ruleWithOff, context);
          assert(result != null);
          assert(result.token === ruleWithOff);
          assert(result.nextInput === "");
          assert(result.actionHandler != null);
          return result.actionHandler.executeAction(false).then( function(message) {
            assert(turnOffCalled);
            assert(message === "turned dummy switch off");
            return finish();
          }).done();
        });
      })(rulePrefix);
    }

    it("should execute: turn on the dummy switch", function(finish) {
      const context = createDummyParseContext();
      const result = switchActionProvider.parseAction("turn on the dummy switch", context);
      assert(result != null);
      assert(result.token === "turn on the dummy switch");
      assert(result.nextInput === "");
      assert(result.actionHandler != null);
      return result.actionHandler.executeAction(false).then( function(message) {
        assert(turnOnCalled);
        assert(message === "turned dummy switch on");
        return finish();
      }).done();
    });

    it('should not execute: invalid-id on', function() {
      const context = createDummyParseContext();
      const result = switchActionProvider.parseAction("invalid-id on", context);
      assert((result == null));
      return assert(!turnOnCalled);
    });

    return it('should not execute: another dummy switch on', function() {
      const context = createDummyParseContext();
      const result = switchActionProvider.parseAction("another dummy switch on", context);
      assert((result == null));
      return assert(!turnOnCalled);
    });
  });
});

describe("ShutterActionHandler", function() {

  const frameworkDummy = {
    deviceManager: {
      devices: {},
      getDevices() { return _.values(this.devices); }
    }
  };

  const shutterActionProvider = new env.actions.ShutterActionProvider(frameworkDummy);
  const stopShutterActionProvider = new env.actions.StopShutterActionProvider(frameworkDummy);

  class Shutter extends env.devices.ShutterController {
    static initClass() {
      this.prototype.id = 'shutter-id';
      this.prototype.name = 'shutter';
    }

    moveToPosition() { return Promise.resolve(); }
  }
  Shutter.initClass();

  const shutterDevice = new Shutter();
  frameworkDummy.deviceManager.devices['dummy-switch-id'] = shutterDevice;

  return describe("#parseAction()", function() {
    let moveUpCalled = false;
    let moveDownCalled = false;
    let stopCalled = false;

    beforeEach(function() {
      moveUpCalled = false;
      shutterDevice.moveUp = function() {
        moveUpCalled = true;
        return Promise.resolve(true);
      };

      moveDownCalled = false;
      shutterDevice.moveDown = function() {
        moveDownCalled = true;
        return Promise.resolve(true);
      };
      stopCalled = false;
      return shutterDevice.stop = function() {
        stopCalled = true;
        return Promise.resolve(true);
      };
    });

    it("should parse: raise shutter up", function(finish) {
      const context = createDummyParseContext();
      const result = shutterActionProvider.parseAction('raise shutter up', context);
      assert(result != null);
      assert(result.token === 'raise shutter up');
      assert(result.nextInput === "");
      assert(result.actionHandler != null);
      return result.actionHandler.executeAction(false).then( function(message) {
        assert(moveUpCalled);
        assert(message === "raised shutter");
        return finish();
      }).done();
    });

    it("should parse: raise shutter", function(finish) {
      const context = createDummyParseContext();
      const result = shutterActionProvider.parseAction('raise shutter', context);
      assert(result != null);
      assert(result.token === 'raise shutter');
      assert(result.nextInput === "");
      assert(result.actionHandler != null);
      return result.actionHandler.executeAction(false).then( function(message) {
        assert(moveUpCalled);
        assert(message === "raised shutter");
        return finish();
      }).done();
    });


    it("should parse: move shutter up", function(finish) {
      const context = createDummyParseContext();
      const result = shutterActionProvider.parseAction('move shutter up', context);
      assert(result != null);
      assert(result.token === 'move shutter up');
      assert(result.nextInput === "");
      assert(result.actionHandler != null);
      return result.actionHandler.executeAction(false).then( function(message) {
        assert(moveUpCalled);
        assert(message === "raised shutter");
        return finish();
      }).done();
    });

    it("should parse: lower shutter down", function(finish) {
      const context = createDummyParseContext();
      const result = shutterActionProvider.parseAction('lower shutter down', context);
      assert(result != null);
      assert(result.token === 'lower shutter down');
      assert(result.nextInput === "");
      assert(result.actionHandler != null);
      return result.actionHandler.executeAction(false).then( function(message) {
        assert(moveDownCalled);
        assert(message === "lowered shutter");
        return finish();
      }).done();
    });

    it("should parse: lower shutter", function(finish) {
      const context = createDummyParseContext();
      const result = shutterActionProvider.parseAction('lower shutter', context);
      assert(result != null);
      assert(result.token === 'lower shutter');
      assert(result.nextInput === "");
      assert(result.actionHandler != null);
      return result.actionHandler.executeAction(false).then( function(message) {
        assert(moveDownCalled);
        assert(message === "lowered shutter");
        return finish();
      }).done();
    });

    it("should parse: move shutter down", function(finish) {
      const context = createDummyParseContext();
      const result = shutterActionProvider.parseAction('move shutter down', context);
      assert(result != null);
      assert(result.token === 'move shutter down');
      assert(result.nextInput === "");
      assert(result.actionHandler != null);
      return result.actionHandler.executeAction(false).then( function(message) {
        assert(moveDownCalled);
        assert(message === "lowered shutter");
        return finish();
      }).done();
    });

    return it("should parse: stop shutter", function(finish) {
      const context = createDummyParseContext();
      const result = stopShutterActionProvider.parseAction('stop shutter', context);
      assert(result != null);
      assert(result.token === 'stop shutter');
      assert(result.nextInput === "");
      assert(result.actionHandler != null);
      return result.actionHandler.executeAction(false).then( function(message) {
        assert(stopCalled);
        assert(message === "stopped shutter");
        return finish();
      }).done();
    });
  });
});

describe("DimmerActionHandler", function() {

  const envDummy =
    {logger: {}};

  const frameworkDummy = new events.EventEmitter();
  frameworkDummy.deviceManager = {
    devices: {},
    getDevices() { return _.values(this.devices); }
  };
  frameworkDummy.variableManager = new env.variables.VariableManager(frameworkDummy, []);

  const dimmerActionProvider = new env.actions.DimmerActionProvider(frameworkDummy);

  class DimmerDevice extends env.devices.DimmerActuator {
    static initClass() {
      this.prototype.id = 'dummy-dimmer-id';
      this.prototype.name = 'dummy dimmer';
    }
  }
  DimmerDevice.initClass();

  const dummyDimmer = new DimmerDevice();
  frameworkDummy.deviceManager.devices['dummy-dimmer-id'] = dummyDimmer;

  return describe("#executeAction()", function() {
    let dimlevel = null;

    beforeEach(function() {
      dimlevel = null;
      return dummyDimmer.changeDimlevelTo = function(dl) {
        dimlevel = dl;
        return Promise.resolve();
      };
    });

    const validRulePrefixes = [
      'dim the dummy dimmer to',
      'dim dummy dimmer to'
    ];

    return Array.from(validRulePrefixes).map((rulePrefix) =>
      (function(rulePrefix) {
        const action = `${rulePrefix} 10%`;
        return it(`should execute: ${action}`, function(finish) {
          const context = createDummyParseContext();
          const result = dimmerActionProvider.parseAction(action, context);
          assert(result.actionHandler != null);
          return result.actionHandler.executeAction(false).then( function(message) {
            assert(dimlevel === 10);
            assert(message === "dimmed dummy dimmer to 10%");
            return finish();
          }).done();
        });
      })(rulePrefix));
  });
});

describe("LogActionProvider", function() {

  const envDummy =
    {logger: {}};
  const frameworkDummy = new events.EventEmitter();
  frameworkDummy.deviceManager = {
    devices: {},
    getDevices() { return _.values(this.devices); }
  };
  frameworkDummy.variableManager = new env.variables.VariableManager(frameworkDummy, []);

  const logActionProvider = new env.actions.LogActionProvider(frameworkDummy);
  let actionHandler = null;

  describe("#parseAction()", () => {
    return it('should parse: log "a test message"', function() {
      const context = createDummyParseContext();
      const result = logActionProvider.parseAction('log "a test message"', context);
      assert(result != null);
      assert(result.token === 'log "a test message"');
      assert(result.nextInput === '');
      assert(result.actionHandler != null);
      return actionHandler = result.actionHandler;
    });
  });

  return describe("LogActionHandler", () =>
    describe("#executeAction()", () => {
      return it('should execute the action', finish =>
        actionHandler.executeAction(false).then( function(message) {
          assert(message === "a test message");
          return finish();
        }).done()
      );
    })
  );
});


describe("SetVariableActionProvider", function() {

  const envDummy =
    {logger: {}};
  const frameworkDummy = new events.EventEmitter();
  frameworkDummy.deviceManager = {
    devices: {},
    getDevices() { return _.values(this.devices); }
  };
  frameworkDummy.variableManager = new env.variables.VariableManager(frameworkDummy, [{
    name: "a",
    type: "value",
    value: "2"
  }]);
  frameworkDummy.variableManager.variables = {};
  frameworkDummy.variableManager.init();
  const setVarActionProvider = new env.actions.SetVariableActionProvider(frameworkDummy);
  let actionHandler1 = null;
  let actionHandler2 = null;

  describe("#parseAction()", () => {
    it('should parse: set $a to 1', function() {

      const context = createDummyParseContext();
      const result = setVarActionProvider.parseAction('set $a to 1', context);
      assert(result != null);
      assert(result.token === 'set $a to 1');
      assert(result.nextInput === '');
      assert(result.actionHandler != null);
      return actionHandler1 = result.actionHandler;
    });

    return it('should parse: set $a to "abc"', function() {
      const context = createDummyParseContext();
      const result = setVarActionProvider.parseAction('set $a to "abc"', context);
      assert(result != null);
      assert(result.token === 'set $a to "abc"');
      assert(result.nextInput === '');
      assert(result.actionHandler != null);
      return actionHandler2 = result.actionHandler;
    });
  });

  return describe("LogActionHandler", () =>

    describe("#executeAction()", () => {
      it('should execute the action 1', finish =>
        actionHandler1.executeAction(false).then( function(message) {
          assert(message === "set $a to 1");
          return finish();
        }).done()
      );

      return it('should execute the action 2', finish =>
        actionHandler2.executeAction(false).then( function(message) {
          assert(message === "set $a to abc");
          return finish();
        }).done()
      );
    })
  );
});