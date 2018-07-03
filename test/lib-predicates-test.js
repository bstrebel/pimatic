/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const cassert = require("cassert");
const assert = require("assert");
const events = require("events");
const Promise = require('bluebird');
const _ = require('lodash');
const t = require('decl-api').types;
const M = require('../lib/matcher');

// Setup the environment
const { env } = require('../startup');

const createDummyParseContext = function() {
  const variables = {};
  const functions = {};
  return M.createParseContext(variables, functions);
};

describe("PresencePredicateProvider", function() {

  const frameworkDummy = { 
    deviceManager: {
      devices: {},
      getDevices() { return _.values(this.devices); }
    }
  };

  let provider = null;
  let sensorDummy = null;

  before(function() {
    provider = new env.predicates.PresencePredicateProvider(frameworkDummy);

    class PresenceDummySensor extends env.devices.PresenceSensor {
      constructor() {
        super();
        this.id = 'test';
        this.name = 'test device';
        super();
      }
    }

    sensorDummy = new PresenceDummySensor;

    return frameworkDummy.deviceManager.devices =
      {test: sensorDummy};
  });

  describe('#parsePredicate()', function() {

    let result;
    const testCases = [
      {
        inputs: [
          "test is present",
          "test device is present",
          "test signals present",
          "test reports present"
        ],
        checkOutput(input, result) {
          assert(result != null);
          assert.equal(result.token, input);
          assert.equal(result.nextInput, "");
          assert(result.predicateHandler != null);
          assert.equal(result.predicateHandler.negated, false);
          return assert.deepEqual(result.predicateHandler.device, sensorDummy);
        }
      },
      {
        inputs: [
          "test is absent",
          "test is not present",
          "test device is not present",
          "test signals absent",
          "test reports absent"
        ],
        checkOutput(input, result) {
          assert(result != null);
          assert.equal(result.token, input);
          assert.equal(result.nextInput, "");
          assert(result.predicateHandler != null);
          assert.equal(result.predicateHandler.negated, true);
          return assert.deepEqual(result.predicateHandler.device, sensorDummy);
        }
      }
    ];

    for (let testCase of Array.from(testCases)) {
      (testCase => {
        return Array.from(testCase.inputs).map((input) =>
          (input => {
            return it(`should parse \"${input}\"`, () => {
              const context = createDummyParseContext();
              result = provider.parsePredicate(input, context);
              return testCase.checkOutput(input, result);
            });
          })(input));
      })(testCase);
    }

    return it('should return null if id is wrong', function() {
      result = provider.parsePredicate("foo is present");
      return assert((typeof info === 'undefined' || info === null));
    });
  });

  return describe("PresencePredicateHandler", () =>
    describe('#on "change"', function() {  
      let predicateHandler = null;
      before(function() {
        const context = createDummyParseContext();
        const result = provider.parsePredicate("test is present", context);
        assert(result != null);
        ({ predicateHandler } = result);
        return predicateHandler.setup();
      });

      after(() => predicateHandler.destroy());

      it("should notify when device is present", function(finish) {
        let changeListener;
        sensorDummy._presence = false;
        predicateHandler.once('change', (changeListener = function(state){
          assert.equal(state, true);
          return finish();
        })
        );
        return sensorDummy._setPresence(true);
      });

      return it("should notify when device is absent", function(finish) {
        let changeListener;
        sensorDummy._presence = true;
        predicateHandler.once('change', (changeListener = function(state){
          assert.equal(state, false);
          return finish();
        })
        );
        return sensorDummy._setPresence(false);
      });
    })
  );
});

describe("ContactPredicateProvider", function() {

  const frameworkDummy = { 
    deviceManager: {
      devices: {},
      getDevices() { return _.values(this.devices); }
    }
  };

  let provider = null;
  let sensorDummy = null;

  before(function() {
    provider = new env.predicates.ContactPredicateProvider(frameworkDummy);

    class ContactDummySensor extends env.devices.ContactSensor {
      constructor() {
        super();
        this.id = 'test';
        this.name = 'test device';
        super();
      }
    }

    sensorDummy = new ContactDummySensor;

    return frameworkDummy.deviceManager.devices =
      {test: sensorDummy};
  });

  describe('#parsePredicate()', function() {

    let result;
    const testCases = [
      {
        inputs: [
          "test is closed",
          "test device is closed",
          "test is close",
          "test device is close"
        ],
        checkOutput(input, result) {
          assert(result != null);
          assert.equal(result.token, input);
          assert.equal(result.nextInput, "");
          assert(result.predicateHandler != null);
          assert.equal(result.predicateHandler.negated, false);
          return assert.deepEqual(result.predicateHandler.device, sensorDummy);
        }
      },
      {
        inputs: [
          "test is opened",
          "test device is opened",
          "test is open",
          "test device is open"
        ],
        checkOutput(input, result) {
          assert(result != null);
          assert.equal(result.token, input);
          assert.equal(result.nextInput, "");
          assert(result.predicateHandler != null);
          assert.equal(result.predicateHandler.negated, true);
          return assert.deepEqual(result.predicateHandler.device, sensorDummy);
        }
      }
    ];

    for (let testCase of Array.from(testCases)) {
      (testCase => {
        return Array.from(testCase.inputs).map((input) =>
          (input => {
            return it(`should parse \"${input}\"`, () => {
              const context = createDummyParseContext();
              result = provider.parsePredicate(input, context);
              return testCase.checkOutput(input, result);
            });
          })(input));
      })(testCase);
    }

    return it('should return null if id is wrong', function() {
      result = provider.parsePredicate("foo is closed");
      return assert((typeof info === 'undefined' || info === null));
    });
  });

  return describe("PresencePredicateHandler", () =>
    describe('#on "change"', function() {  
      let predicateHandler = null;
      before(function() {
        const context = createDummyParseContext();
        const result = provider.parsePredicate("test is closed", context);
        assert(result != null);
        ({ predicateHandler } = result);
        return predicateHandler.setup();
      });

      after(() => predicateHandler.destroy());

      it("should notify when device is opened", function(finish) {
        let changeListener;
        sensorDummy._contact = false;
        predicateHandler.once('change', (changeListener = function(state){
          assert.equal(state, true);
          return finish();
        })
        );
        return sensorDummy._setContact(true);
      });

      return it("should notify when device is closed", function(finish) {
        let changeListener;
        sensorDummy._contact = true;
        predicateHandler.once('change', (changeListener = function(state){
          assert.equal(state, false);
          return finish();
        })
        );
        return sensorDummy._setContact(false);
      });
    })
  );
});

describe("SwitchPredicateProvider", function() {

  const frameworkDummy = { 
    deviceManager: {
      devices: {},
      getDevices() { return _.values(this.devices); }
    }
  };

  let provider = null;
  let switchDummy = null;

  before(function() {
    provider = new env.predicates.SwitchPredicateProvider(frameworkDummy);

    class SwitchDummyDevice extends env.devices.SwitchActuator {
      constructor() {
        super();
        this.id = 'test';
        this.name = 'test device';
        this._state = true;
        super();
      }
    }

    switchDummy = new SwitchDummyDevice();

    return frameworkDummy.deviceManager.devices =
      {test: switchDummy};
  });


  describe('#parsePredicate()', function() {

    const testCases = [
      {
        inputs: [
          "test is on",
          "test device is on",
          "test is turned on",
          "test is switched on"
        ],
        checkOutput(input, result) {
          assert(result != null);
          assert.equal(result.token, input);
          assert.equal(result.nextInput, "");
          assert(result.predicateHandler != null);
          assert.equal(result.predicateHandler.state, true);
          return assert.deepEqual(result.predicateHandler.device, switchDummy);
        }
      },
      {
        inputs: [
          "test is off",
          "test device is off",
          "test is turned off",
          "test is switched off"
        ],
        checkOutput(input, result) {
          assert(result != null);
          assert.equal(result.token, input);
          assert.equal(result.nextInput, "");
          assert(result.predicateHandler != null);
          assert.equal(result.predicateHandler.state, false);
          return assert.deepEqual(result.predicateHandler.device, switchDummy);
        }
      }
    ];

    return Array.from(testCases).map((testCase) =>
      (testCase => {
        return Array.from(testCase.inputs).map((input) =>
          (input => {
            return it(`should parse \"${input}\"`, () => {
              const context = createDummyParseContext();
              const result = provider.parsePredicate(input, context);
              return testCase.checkOutput(input, result);
            });
          })(input));
      })(testCase));
  });

  return describe("SwitchPredicateHandler", () =>

    describe('#on "change"', function() {  
      let predicateHandler = null;
      before(function() {
        const context = createDummyParseContext();
        const result = provider.parsePredicate("test is on", context);
        assert(result != null);
        ({ predicateHandler } = result);
        return predicateHandler.setup();
      });

      after(() => predicateHandler.destroy());

      it("should notify when switch is on", function(finish) {
        let changeListener;
        switchDummy._state = false;
        predicateHandler.once('change', (changeListener = function(state){
          assert.equal(state, true);
          return finish();
        })
        );
        return switchDummy._setState(true);
      });

      return it("should notify when switch is off", function(finish) {
        let changeListener;
        switchDummy._state = true;
        predicateHandler.once('change', (changeListener = function(state){
          assert.equal(state, false);
          return finish();
        })
        );
        return switchDummy._setState(false);
      });
    })
  );
});


describe("DeviceAttributePredicateProvider", function() {

  const frameworkDummy = { 
    deviceManager: {
      devices: {},
      getDevices() { return _.values(this.devices); }
    }
  };

  let provider = null;
  let sensorDummy = null;

  before(function() {
    provider = new env.predicates.DeviceAttributePredicateProvider(frameworkDummy);

    class DummySensor extends env.devices.Sensor {
      static initClass() {
    
        this.prototype.attributes = {
          testvalue: {
            description: "a testvalue",
            type: t.number,
            unit: '°C'
          }
        };
      }

      constructor() {
        super();
        this.id = 'test';
        this.name = 'test sensor';
        super();
      }
    }
    DummySensor.initClass();

    sensorDummy = new DummySensor();

    return frameworkDummy.deviceManager.devices =
      {test: sensorDummy};
  });

  describe('#parsePredicate()', function() {

    const comparators = { 
      'is': '==',
      'is equal': '==',
      'is equal to': '==',
      'equals': '==',
      'is not': '!=',
      'is less': '<',
      'less': '<',
      'less than': '<',
      'is less than': '<',
      'lower as': '<',
      'lower': '<',
      'is lower': '<',
      'below': '<',
      'is below': '<',
      'is above': '>',
      'above': '>',
      'greater': '>',
      'higher': '>',
      'greater than': '>',
      'is greater than': '>',
      'is greater or equal than': '>=',
      'is equal or greater than': '>=',
      'is less or equal than': '<=',
      'is equal or less than': '<='
    };

    for (let comp in comparators) {
      const sign = comparators[comp];
      (function(comp, sign) {
        const testPredicate = `testvalue of test sensor ${comp} 42`;

        return it(`should parse \"${testPredicate}\"`, function() {
          const context = createDummyParseContext();
          const result = provider.parsePredicate(testPredicate, context);
          cassert(result != null);
          cassert(result.predicateHandler != null);
          const predHandler = result.predicateHandler;
          cassert(predHandler.device.id === "test");
          cassert(predHandler.comparator === sign);
          cassert(predHandler.attribute === 'testvalue');
          cassert(predHandler.referenceValue === 42);
          cassert(result.token === testPredicate);
          return cassert(result.nextInput === "");
        });
      })(comp, sign);
    }

    it("should parse predicate with unit: testvalue of test sensor is 42 °C", function() {
      const context = createDummyParseContext();
      const result = provider.parsePredicate("testvalue of test sensor is 42 °C", context);
      cassert(result != null);
      cassert(result.predicateHandler != null);
      const predHandler = result.predicateHandler;
      cassert(predHandler.device.id === "test");
      cassert(predHandler.comparator === "==");
      cassert(predHandler.attribute === 'testvalue');
      cassert(predHandler.referenceValue === 42);
      cassert(result.token === "testvalue of test sensor is 42 °C");
      return cassert(result.nextInput === "");
    });

    return it("should parse predicate with unit: testvalue of test sensor is 42 C", function() {
      const context = createDummyParseContext();
      const result = provider.parsePredicate("testvalue of test sensor is 42 C", context);
      cassert(result != null);
      cassert(result.predicateHandler != null);
      const predHandler = result.predicateHandler;
      cassert(predHandler.device.id === "test");
      cassert(predHandler.comparator === "==");
      cassert(predHandler.attribute === 'testvalue');
      cassert(predHandler.referenceValue === 42);
      cassert(result.token === "testvalue of test sensor is 42 C");
      return cassert(result.nextInput === "");
    });
  });

  return describe("DeviceAttributePredicateHandler", () =>

    describe('#on "change"', function() {  
      let predicateHandler = null;
      before(function() {
        const context = createDummyParseContext();
        const result = provider.parsePredicate("testvalue of test is greater than 20", context);
        assert(result != null);
        ({ predicateHandler } = result);
        return predicateHandler.setup();
      });

      after(() => predicateHandler.destroy());

      it("should notify when value is greater than 20 and value is 21", function(finish) {
        predicateHandler.once('change', function(state) {
          cassert(state === true);
          return finish();
        });
        return sensorDummy.emit('testvalue', 21);
      });

      return it("should notify when value is greater than 20 and value is 19", function(finish) {
        predicateHandler.once('change', function(state){
          cassert(state === false);
          return finish();
        });
        return sensorDummy.emit('testvalue', 19);
      });
    })
  );
});


describe("VariablePredicateProvider", function() {

  const frameworkDummy = new events.EventEmitter();
  frameworkDummy.variableManager = new env.variables.VariableManager(frameworkDummy, [
    {
      name: 'a',
      value: '1'
    },
    {
      name: 'b',
      value: '2'
    },
    {
      name: 'c',
      value: '3'
    }
  ]);
  frameworkDummy.variableManager.init();

  let provider = null;
  let sensorDummy = null;

  before(function() {
    provider = new env.predicates.VariablePredicateProvider(frameworkDummy);

    class DummySensor extends env.devices.Sensor {
      static initClass() {
    
        this.prototype.attributes = {
          testvalue: {
            description: "a testvalue",
            type: t.number,
            unit: '°C'
          }
        };
      }

      constructor() {
        super();
        this.id = 'test';
        this.name = 'test sensor';
        super();
      }

      getTestvalue() { return Promise.resolve(42); }
    }
    DummySensor.initClass();

    sensorDummy = new DummySensor();
    return frameworkDummy.emit('deviceAdded', sensorDummy);
  });

  describe('#parsePredicate()', function() {

    const testCases = [
      {
        input: "1 + 2 < 4",
        result: {
          value: true
        }
      },
      {
        input: "1 + 3 <= 4",
        result: {
          value: true
        }
      },
      {
        input: "1 + 3 > 4",
        result: {
          value: false
        }
      },
      {
        input: "$a + 2 == 3",
        result: {
          value: true
        }
      },
      {
        input: "$a + 2 == 1 + $b",
        result: {
          value: true
        }
      },
      {
        input: "$a == $b - 1",
        result: {
          value: true
        }
      },
      {
        input: "$test.testvalue == 42",
        result: {
          value: true
        }
      },
      {
        input: "$test.testvalue == 21",
        result: {
          value: false
        }
      }
    ];

    return Array.from(testCases).map((tc) =>
      (tc => {
        return it(`should parse \"${tc.input}\"`, finish => {
          const context = createDummyParseContext();
          const varsAndFuns = frameworkDummy.variableManager.getVariablesAndFunctions();
          context.variables = varsAndFuns.variables;
          context.functions = varsAndFuns.functions;
          const result = provider.parsePredicate(tc.input, context);
          assert(result != null);
          result.predicateHandler.getValue().then( val => {
            assert.equal(val, tc.result.value);
            return finish();
          }).catch(finish);
        });
      })(tc));
  });


  return describe("VariablePredicateHandler", function() {

    describe('#on "change"', function() {  
      let predicateHandler = null;
      after(() => predicateHandler.destroy());

      return it("should notify when $a is greater than 20", function(finish) {
        const context = createDummyParseContext();
        const varsAndFuns = frameworkDummy.variableManager.getVariablesAndFunctions();
        context.variables = varsAndFuns.variables;
        context.functions = varsAndFuns.functions;
        const result = provider.parsePredicate("$a > 20", context);
        assert(result != null);
        ({ predicateHandler } = result);
        predicateHandler.setup();
        predicateHandler.once('change', function(state) {
          cassert(state === true);
          return finish();
        });
        return frameworkDummy.variableManager.setVariableToValue('a', '21');
      });
    });

    return describe('#on "change"', function() {  
      let predicateHandler = null;
      after(() => predicateHandler.destroy());

      return it("should notify when $test.testvalue is greater than 42", function(finish) {
        const context = createDummyParseContext();
        const varsAndFuns = frameworkDummy.variableManager.getVariablesAndFunctions();
        context.variables = varsAndFuns.variables;
        context.functions = varsAndFuns.functions;
        const result = provider.parsePredicate("$test.testvalue > 42", context);
        assert(result != null);
        ({ predicateHandler } = result);
        predicateHandler.setup();
        predicateHandler.once('change', function(state) {
          cassert(state === true);
          return finish();
        });
        sensorDummy.getTestvalue = () => Promise.resolve(50);
        return sensorDummy.emit('testvalue', 50);
      });
    });
  });
});


    // describe '#on "change"', ->  
    //   predicateHandler = null
    //   after -> predicateHandler.destroy()

    //   it "should throw an error, when comparing strings", (finish) ->
    //     context = createDummyParseContext()
    //     varsAndFuns = frameworkDummy.variableManager.getVariablesAndFunctions()
    //     context.variables = varsAndFuns.variables
    //     context.functions = varsAndFuns.functions
    //     result = provider.parsePredicate "$test.testvalue > 42", context
    //     assert result?
    //     predicateHandler = result.predicateHandler
    //     predicateHandler.setup()
    //     predicateHandler.once 'change', (state) ->
    //       cassert state is true
    //       finish()
    //     sensorDummy.getTestvalue = => Promise.resolve("a")
    //     sensorDummy.attributes.testvalue.type = "string"
    //     sensorDummy.emit 'testvalue', "a"