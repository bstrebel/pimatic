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
const Promise = require('bluebird');
const S = require('string');
const util = require('util');
const events = require('events');

const { env } = require('../startup');

describe("RuleManager", function() {

  const rulesAst = require('../lib/rules-ast-builder');

  before(() => env.logger.winston.transports.taggedConsoleLogger.level = 'error');

  let ruleManager = null;

  const getTime = () => new Date().getTime();

  class DummyPredicateHandler extends env.predicates.PredicateHandler {

    constructor() {
      super();
    } 
    getValue() { return Promise.resolve(false); }
    destroy() {} 
    getType() { return 'state'; }
  }

  class DummyPredicateProvider extends env.predicates.PredicateProvider {
    static initClass() {
      this.prototype.type = 'unknown';
      this.prototype.name = 'test';
    }

    parsePredicate(input, context) { 
      cassert(S(input).startsWith("predicate 1"));
      return {
        token: "predicate 1",
        nextInput: S(input).chompLeft("predicate 1").s,
        predicateHandler: new DummyPredicateHandler()
      };
    }
  }
  DummyPredicateProvider.initClass();

  class DummyActionHandler extends env.actions.ActionHandler {

    constructor(...args) {
      super();
      this.executeAction = this.executeAction.bind(this);
      this.hasRestoreAction = this.hasRestoreAction.bind(this);
      this.executeRestoreAction = this.executeRestoreAction.bind(this);
      super(...args);
    }

    executeAction(simulate) {
      return Promise.resolve("action 1 executed");
    }

    hasRestoreAction() { return true; }

    executeRestoreAction(simulate) {
      return Promise.resolve("restore action 1 executed");
    }
  }

  class DummyActionProvider {

    parseAction(input, context) { 
      cassert(S(input).startsWith("action 1"));
      return {
        token: "action 1",
        nextInput: S(input).chompLeft("action 1").s,
        actionHandler: new DummyActionHandler()
      };
    }
  }

  const predProvider = new DummyPredicateProvider();
  const frameworkDummy = new events.EventEmitter();
  frameworkDummy.variableManager = new env.variables.VariableManager(frameworkDummy, []);
  frameworkDummy.variableManager.init();
  ruleManager = new env.rules.RuleManager(frameworkDummy, []);
  ruleManager.addPredicateProvider(predProvider);
  const actionProvider = new DummyActionProvider();
  ruleManager.actionProviders = [actionProvider];

  describe('#parseRuleCondition', function() {
    let context = null;

    beforeEach(() => context = ruleManager._createParseContext());

    const testCases = [
      {
        input: "predicate 1",
        result: { 
          predicates: [ 
            { 
              id: 'prd-test1-0',
              token: 'predicate 1',
              handler: {},
              for: null,
              justTrigger: false,
              justCondition: false
            }
          ],
          tokens: [ 'predicate', '(', 0, ')' ] 
        }
      },
      {
        input: "predicate 1 for 10 seconds",
        result: { 
          predicates: [ 
            { 
              id: 'prd-test1-0',
              token: 'predicate 1',
              handler: {},
              for: {
                token: '10 seconds',
                exprTokens: ['10'],
                unit: 'seconds'
              },
              justTrigger: false,
              justCondition: false
            }
          ],
          tokens: [ 'predicate', '(', 0, ')' ] 
        }
      },
      {
        input: "predicate 1 for 2 hours",
        result: { 
          predicates: [ 
            { 
              id: 'prd-test1-0',
              token: 'predicate 1',
              handler: {},
              for: {
                token: '2 hours',
                exprTokens: ['2'],
                unit: 'hours'
              },
              justTrigger: false,
              justCondition: false
            }
          ],
          tokens: [ 'predicate', '(', 0, ')' ] 
        }
      },
      {
        input: "predicate 1 and predicate 1",
        result: { 
          predicates: [ 
            { 
              id: 'prd-test1-0',
              token: 'predicate 1',
              handler: {},
              for: null, 
              justTrigger: false,
              justCondition: false
            },
            { 
              id: 'prd-test1-1',
              token: 'predicate 1',
              handler: {},
              for: null, 
              justTrigger: false,
              justCondition: false
            }
          ],
          tokens: [ 'predicate', '(', 0, ')', 'and', 'predicate', '(', 1, ')' ] 
        }
      },
      {
        input: "[predicate 1 and predicate 1]",
        result: { 
          predicates: [ 
            { 
              id: 'prd-test1-0',
              token: 'predicate 1',
              handler: {},
              for: null, 
              justTrigger: false,
              justCondition: false
            },
            { 
              id: 'prd-test1-1',
              token: 'predicate 1',
              handler: {},
              for: null, 
              justTrigger: false,
              justCondition: false
            }
          ],
          tokens: [ '[', 'predicate', '(', 0, ')', 'and', 'predicate', '(', 1, ')', ']' ] 
        }
      },
      {
        input: "predicate 1 and [predicate 1]",
        result: { 
          predicates: [ 
            { 
              id: 'prd-test1-0',
              token: 'predicate 1',
              handler: {},
              for: null, 
              justTrigger: false,
              justCondition: false
            },
            { 
              id: 'prd-test1-1',
              token: 'predicate 1',
              handler: {},
              for: null, 
              justTrigger: false,
              justCondition: false
            }
          ],
          tokens: [ 'predicate', '(', 0, ')', 'and', '[', 'predicate', '(', 1, ')', ']' ] 
        }
      },
      {
        input: "predicate 1 or predicate 1",
        result: { 
          predicates: [ 
            { 
              id: 'prd-test1-0',
              token: 'predicate 1',
              handler: {},
              for: null, 
              justTrigger: false,
              justCondition: false
            },
            { 
              id: 'prd-test1-1',
              token: 'predicate 1',
              handler: {},
              for: null, 
              justTrigger: false,
              justCondition: false
            }
          ],
          tokens: [ 'predicate', '(', 0, ')', 'or', 'predicate', '(', 1, ')' ] 
        }
      },
      {
        input: "predicate 1 for 2 hours or predicate 1",
        result: { 
          predicates: [ 
            { 
              id: 'prd-test1-0',
              token: 'predicate 1',
              handler: {},
              for: { 
                token: '2 hours',
                exprTokens: [ '2'],
                unit: 'hours'
              },
              justTrigger: false,
              justCondition: false
            },
            { 
              id: 'prd-test1-1',
              token: 'predicate 1',
              handler: {},
              for: null, 
              justTrigger: false,
              justCondition: false
            }
          ],
          tokens: [ 'predicate', '(', 0, ')', 'or', 'predicate', '(', 1, ')' ] 
        }
      },
      {
        input: "predicate 1 and [predicate 1 or predicate 1]",
        result: { 
          predicates: [ 
            { 
              id: 'prd-test1-0',
              token: 'predicate 1',
              handler: {},
              for: null, 
              justTrigger: false,
              justCondition: false
            },
            { 
              id: 'prd-test1-1',
              token: 'predicate 1',
              handler: {},
              for: null, 
              justTrigger: false,
              justCondition: false
            },
            { 
              id: 'prd-test1-2',
              token: 'predicate 1',
              handler: {},
              for: null, 
              justTrigger: false,
              justCondition: false
            }
          ],
          tokens: [ 'predicate', '(', 0, ')', 'and', '[', 'predicate', '(', 1, ')', 
            'or', 'predicate', '(', 2, ')', ']' ] 
        }
      }
    ];

    return Array.from(testCases).map((tc) =>
      (tc =>
        it(`it should parse \"${tc.input}\"`, function() {
          const result = ruleManager._parseRuleCondition("test1", tc.input, context, null, false);
          return assert.deepEqual(result, tc.result);
        })
      )(tc));
  });

  describe('#parseRuleActions', function() {
    let context = null;

    beforeEach(() => context = ruleManager._createParseContext());

    const testCases = [
      {
        input: "action 1",
        result: { 
          actions: [ 
            { 
              id: 'act-test1-0', 
              token: 'action 1', 
              handler: {}, // should be the dummyHandler
              after: null,
              for: null
            } 
          ],
          tokens: [ 'action', '(', 0, ')' ] 
        }
      },
      {
        input: "action 1 and action 1",
        result: { 
          actions: [ 
            { 
              id: 'act-test1-0', 
              token: 'action 1', 
              handler: {}, // should be the dummyHandler
              after: null,
              for: null
            },
            { 
              id: 'act-test1-1', 
              token: 'action 1', 
              handler: {}, // should be the dummyHandler
              after: null,
              for: null
            } 
          ],
          tokens: [ 'action', '(', 0, ')', 'and', 'action', '(', 1, ')' ] 
        }
      },
      {
        input: "after 1 minute action 1",
        result: { 
          actions: [ 
            { 
              id: 'act-test1-0', 
              token: 'action 1', 
              handler: {}, // should be the dummyHandler
              after: {
                token: '1 minute',
                exprTokens: [ 1 ],
                unit: 'minute'
              },
              for: null
            } 
          ],
          tokens: [ 'action', '(', 0, ')' ] 
        }
      },
      {
        input: "action 1 after 1 minute",
        result: { 
          actions: [ 
            { 
              id: 'act-test1-0', 
              token: 'action 1', 
              handler: {}, // should be the dummyHandler
              after: {
                token: '1 minute',
                exprTokens: [ 1 ],
                unit: 'minute'
              },
              for: null
            } 
          ],
          tokens: [ 'action', '(', 0, ')' ] 
        }
      },
      {
        input: "after 2 minutes action 1 and after 1 hour action 1",
        result: { 
          actions: [ 
            { 
              id: 'act-test1-0', 
              token: 'action 1', 
              handler: {}, // should be the dummyHandler
              after: {
                token: '2 minutes',
                exprTokens: [ 2],
                unit: 'minutes'
              },
              for: null
            },
            { 
              id: 'act-test1-1', 
              token: 'action 1', 
              handler: {}, // should be the dummyHandler
              after: {
                token: '1 hour',
                exprTokens: [ 1 ],
                unit: 'hour'
              },
              for: null
            } 
          ],
          tokens: [ 'action', '(', 0, ')', 'and', 'action', '(', 1, ')' ] 
        }
      },
      {
        input: "action 1 after 2 minutes and action 1 after 1 hour",
        result: { 
          actions: [ 
            { 
              id: 'act-test1-0', 
              token: 'action 1', 
              handler: {}, // should be the dummyHandler
              after: {
                token: '2 minutes',
                exprTokens: [ 2 ],
                unit: 'minutes'
              },
              for: null
            },
            { 
              id: 'act-test1-1', 
              token: 'action 1', 
              handler: {}, // should be the dummyHandler
              after: {
                token: '1 hour',
                exprTokens: [ 1 ],
                unit: 'hour'
              },
              for: null
            } 
          ],
          tokens: [ 'action', '(', 0, ')', 'and', 'action', '(', 1, ')' ] 
        }
      },
      {
        input: "action 1 for 1 minute",
        result: { 
          actions: [ 
            { 
              id: 'act-test1-0', 
              token: 'action 1', 
              handler: {}, // should be the dummyHandler
              after: null,
              for: {
                token: '1 minute',
                exprTokens: [ 1 ],
                unit: 'minute'
              }
            } 
          ],
          tokens: [ 'action', '(', 0, ')' ] 
        }
      }
    ];

    return Array.from(testCases).map((tc) =>
      (tc =>
        it(`it should parse \"${tc.input}\"`, function() {
          const result = ruleManager._parseRuleActions("test1", tc.input, context); 
          assert(result != null);
          for (let action of Array.from(result.actions)) {
            assert(action.handler instanceof env.actions.ActionHandler);
            action.handler = {};
          }
          assert(!context.hasErrors());
          return assert.deepEqual(result, tc.result);
        })
      )(tc));
  });

  describe('#parseRuleString()', function() {
    let context = null;

    beforeEach(() => context = ruleManager._createParseContext());


    it('should parse: "when predicate 1 then action 1"', finish =>
      ruleManager._parseRuleString("test1", "test1", "when predicate 1 then action 1", context)
      .then( function(rule) { 
        cassert(rule.id === 'test1');
        cassert(rule.conditionToken === 'predicate 1');
        cassert(rule.tokens.length > 0);
        cassert(rule.predicates.length === 1);
        cassert(rule.actionsToken === 'action 1');
        cassert(rule.string === 'when predicate 1 then action 1');
        return finish(); 
      }).catch(finish).done()
    );

    const ruleWithForSuffix = 'when predicate 1 for 10 seconds then action 1';
    it(`should parse rule with for "10 seconds" suffix: ${ruleWithForSuffix}'`, finish =>

      ruleManager._parseRuleString("test1", "test1", ruleWithForSuffix, context)
      .then( function(rule) { 
        cassert(rule.id === 'test1');
        cassert(rule.conditionToken === 'predicate 1 for 10 seconds');
        cassert(rule.tokens.length > 0);
        cassert(rule.predicates.length === 1);
        cassert(rule.predicates[0].for.token === '10 seconds');
        assert.deepEqual(rule.predicates[0].for.exprTokens, ['10']);
        cassert(rule.actionsToken === 'action 1');
        cassert(rule.string === 'when predicate 1 for 10 seconds then action 1');
        return finish(); 
      }).catch(finish).done()
    );


    const ruleWithHoursSuffix = "when predicate 1 for 2 hours then action 1";
    it(`should parse rule with for "2 hours" suffix: ${ruleWithHoursSuffix}`, finish =>

      ruleManager._parseRuleString("test1", "test1", ruleWithHoursSuffix, context)
      .then( function(rule) { 
        cassert(rule.id === 'test1');
        cassert(rule.conditionToken === 'predicate 1 for 2 hours');
        cassert(rule.tokens.length > 0);
        cassert(rule.predicates.length === 1);
        cassert(rule.predicates[0].for.token === '2 hours');
        assert.deepEqual(rule.predicates[0].for.exprTokens, ['2']);
        cassert(rule.actionsToken === 'action 1');
        cassert(rule.string === 'when predicate 1 for 2 hours then action 1');
        return finish(); 
      }).catch(finish).done()
    );

    it('should not detect for "42 foo" as for suffix', finish =>

      ruleManager._parseRuleString(
        "test1", "test1", "when predicate 1 for 42 foo then action 1", context
      ).then( function(rule) { 
        cassert(rule.id === 'test1');
        cassert(rule.conditionToken === 'predicate 1 for 42 foo');
        cassert(rule.tokens.length > 0);
        cassert(rule.predicates.length === 1);
        cassert(rule.predicates[0].for === null);
        cassert(rule.actionsToken === 'action 1');
        cassert(rule.string === 'when predicate 1 for 42 foo then action 1');
        return finish(); 
      }).catch(finish).done()
    );


    it('should reject wrong rule format', finish =>
      // Missing `then`:
      ruleManager._parseRuleString("test2", "test1", "when predicate 1 and action 1", context)
      .then( () => finish(new Error('Accepted invalid rule'))).catch( function(error) { 
        cassert(error != null);
        cassert(error.message === 'The rule must start with "when" and contain a "then" part!');
        return finish();
      }).done()
    );

    it('should reject unknown predicate', function(finish) {
      let canDecideCalled = false;
      predProvider.parsePredicate = function(input, context) { 
        cassert(input === "predicate 2");
        canDecideCalled = true;
        return null;
      };

      ruleManager._parseRuleString('test3', "test1", 'when predicate 2 then action 1', context)
        .then( function() { 
          cassert(context.hasErrors());
          cassert(context.errors.length === 1);
          const errorMsg = context.errors[0];
          cassert(
            errorMsg === 'Could not find an provider that decides next predicate of "predicate 2".'
          );
          cassert(canDecideCalled);
          return finish();
        }).catch(finish);
    });

    return it('should reject unknown action', function(finish) {
      let canDecideCalled = false;
      predProvider.parsePredicate = function(input, context) { 
        cassert(input === "predicate 1");
        canDecideCalled = true;
        return {
          token: "predicate 1",
          nextInput: S(input).chompLeft("predicate 1").s,
          predicateHandler: new DummyPredicateHandler()
        };
      };

      let parseActionCalled = false;
      actionProvider.parseAction = input => {
        cassert(input === "action 2");
        parseActionCalled = true;
        return null;
      };

      ruleManager._parseRuleString('test4', "test1", 'when predicate 1 then action 2', context)
        .then( function() { 
          cassert(context.hasErrors());
          cassert(context.errors.length === 1);
          const errorMsg = context.errors[0];
          cassert(
            errorMsg === 'Could not find an provider that provides the next action of "action 2".'
          );
          cassert(parseActionCalled);
          return finish();
        }).catch(finish);
    });
  });

  const notifyId = null;

  // ###Tests for `addRuleByString()`
  describe('#addRuleByString()', function() {

    let changeHandler = null;

    before(() =>
      predProvider.parsePredicate = function(input, context) { 
        cassert(S(input).startsWith("predicate 1"));
        const predHandler = new DummyPredicateHandler();
        predHandler.on = function(event, handler) { 
          if (event === 'change') {
            cassert(event === 'change');
            return changeHandler = handler;
          }
        };
        return {
          token: "predicate 1",
          nextInput: S(input).chompLeft("predicate 1").s,
          predicateHandler: predHandler
        };
      });

    it('should add the rule', function(finish) {

      let parseActionCallCount = 0;
      actionProvider.parseAction = input => {
        cassert(input === "action 1");
        parseActionCallCount++;
        return {
          token: "action 1",
          nextInput: S(input).chompLeft("action 1").s,
          actionHandler: new DummyActionHandler()
        };
      };

      return ruleManager.addRuleByString('test5', {
        name: "test5", 
        ruleString: 'when predicate 1 then action 1'
      }).then( function() {
        cassert(changeHandler != null);
        cassert(parseActionCallCount === 1);
        cassert(ruleManager.rules['test5'] != null);
        return finish();
      }).catch(finish).done();
    });

    return it('should react to notifies', function(finish) {
      this.timeout(3000);

      ruleManager.rules['test5'].actions[0].handler.executeAction = simulate => {
        cassert(!simulate);
        finish();
        return Promise.resolve("execute action");
      };

      return setTimeout((() => changeHandler('event')), 2001);
    });
  });


  // ###Tests for `updateRuleByString()`
  describe('#doesRuleCondtionHold', function() {

    let predHandler1 = null;
    let predHandler2 = null;

    beforeEach(function() {
      predHandler1 = new DummyPredicateHandler();
      predHandler1.on = (event, listener) => cassert(event === 'change');
      predHandler1.getValue = () => Promise.resolve(true);
      predHandler1.getType = () => "state";

      predHandler2 = new DummyPredicateHandler();
      predHandler2.on = (event, listener) => cassert(event === 'change');
      predHandler2.getValue = () => Promise.resolve(true);
      return predHandler2.getType = () => "state";
    });


    it('should decide predicate 1', function(finish){

      const rule = {
        id: "test1",
        orgCondition: "predicate 1",
        predicates: [{
          id: "test1,",
          token: "predicate 1",
          type: "state",
          handler: predHandler1,
          for: null
        }
        ],
        tokens: [
          "predicate",
          "(",
          0,
          ")"
        ],
        action: "action 1",
        string: "when predicate 1 then action 1"
      };

      rule.conditionExprTree = (new rulesAst.BoolExpressionTreeBuilder())
        .build(rule.tokens, rule.predicates);
      return ruleManager._evaluateConditionOfRule(rule).then( isTrue => cassert(isTrue === true)).then( () => predHandler1.getValue = () => Promise.resolve(false)).then( () => ruleManager._evaluateConditionOfRule(rule)).then( function(isTrue) {
        cassert(isTrue === false);
        return finish();
      }).catch(finish).done();
    });

    it('should decide trigger: predicate 1', function(finish){

      const rule = {
        id: "test1",
        orgCondition: "predicate 1",
        predicates: [{
          id: "test1,",
          token: "trigger: predicate 1",
          type: "state",
          handler: predHandler1,
          for: null,
          justTrigger: true
        }
        ],
        tokens: [
          "predicate",
          "(",
          0,
          ")"
        ],
        action: "action 1",
        string: "when trigger: predicate 1 then action 1"
      };

      predHandler1.getValue = () => Promise.resolve(true); 
      
      rule.conditionExprTree = (new rulesAst.BoolExpressionTreeBuilder())
        .build(rule.tokens, rule.predicates);
      return ruleManager._evaluateConditionOfRule(rule).then( isTrue => cassert(isTrue === false)).then( function() {
        const knownPredicates = {
          test1: true
        };
        return ruleManager._evaluateConditionOfRule(rule, knownPredicates).then( function(isTrue) {
          cassert(isTrue === false);
          return finish();
        });
      }).done();
    });

    it('should decide predicate 1 and predicate 2', function(finish){

      const rule = {
        id: "test1",
        orgCondition: "predicate 1 and predicate 2",
        predicates: [
          {
            id: "test1,",
            token: "predicate 1",
            type: "state",
            handler: predHandler1,
            for: null
          },
          {
            id: "test2,",
            token: "predicate 2",
            type: "state",
            handler: predHandler2,
            for: null
          }
        ],
        tokens: [
          "predicate",
          "(",
          0,
          ")",
          "and",
          "predicate",
          "(",
          1,
          ")"
        ],
        action: "action 1",
        string: "when predicate 1 and predicate 2 then action 1"
      };

      rule.conditionExprTree = (new rulesAst.BoolExpressionTreeBuilder())
        .build(rule.tokens, rule.predicates);
      return ruleManager._evaluateConditionOfRule(rule).then( isTrue => cassert(isTrue === true)).then( function() { 
        predHandler1.getValue = () => Promise.resolve(true);
        return predHandler2.getValue = () => Promise.resolve(false);
      }).then( () => ruleManager._evaluateConditionOfRule(rule)).then( function(isTrue) {
        cassert(isTrue === false);
        return finish();
      }).catch(finish).done();
    });

    it('should decide predicate 1 or predicate 2', function(finish){

      const rule = {
        id: "test1",
        orgCondition: "predicate 1 or predicate 2",
        predicates: [
          {
            id: "test1,",
            token: "predicate 1",
            type: "state",
            handler: predHandler1,
            for: null
          },
          {
            id: "test2,",
            token: "predicate 2",
            type: "state",
            handler: predHandler2,
            for: null
          }
        ],
        tokens: [
          "predicate",
          "(",
          0,
          ")",
          "or",
          "predicate",
          "(",
          1,
          ")"
        ],
        action: "action 1",
        string: "when predicate 1 or predicate 2 then action 1"
      };

      rule.conditionExprTree = (new rulesAst.BoolExpressionTreeBuilder())
        .build(rule.tokens, rule.predicates);
      return ruleManager._evaluateConditionOfRule(rule).then( isTrue => cassert(isTrue === true)).then( function() {       
        predHandler1.getValue = () => Promise.resolve(true);
        return predHandler2.getValue = () => Promise.resolve(false);
      }).then( () => ruleManager._evaluateConditionOfRule(rule)).then( function(isTrue) {
        cassert(isTrue === true);
        return finish();
      }).catch(finish).done();
    });


    it('should decide predicate 1 for 1 second (holds)', function(finish){
      this.timeout(2000);
      const start = getTime();

      const rule = {
        id: "test1",
        orgCondition: "predicate 1 for 1 second",
        predicates: [{
          id: "test1,",
          token: "predicate 1",
          type: "state",
          handler: predHandler1,
          for: {
            token: '1 second',
            exprTokens: [ 1 ],
            unit: 'second'
          },
          lastChange: start,
          timeAchived: false
        }
        ],
        tokens: [
          "predicate",
          "(",
          0,
          ")"
        ],
        action: "action 1",
        string: "when predicate 1 for 1 second then action 1"
      };

      rule.conditionExprTree = (new rulesAst.BoolExpressionTreeBuilder())
        .build(rule.tokens, rule.predicates);
      return ruleManager._evaluateConditionOfRule(rule).then( function(isTrue) {
        cassert(isTrue === false);
        rule.predicates[0].timeAchived = true;
        return ruleManager._evaluateConditionOfRule(rule).then( function(isTrue) {
          cassert(isTrue === true);
          return finish();
        });
      }).done();
    });

    it('should decide predicate 1 for 1 second (does not hold)', function(finish) {
      this.timeout(2000);
      const start = getTime();

      predHandler1.on = function(event, listener) { 
        cassert(event === 'change');
        return setTimeout(() => listener(false)
        , 500);
      };

      const rule = {
        id: "test1",
        orgCondition: "predicate 1 for 1 second",
        predicates: [{
          id: "test1,",
          token: "predicate 1",
          type: "state",
          handler: predHandler1,
          for: {
            token: '1 second',
            exprTokens: [ 1 ],
            unit: 'second'
          },
          lastChange: start,
          timeAchived: false
        }
        ],
        tokens: [
          "predicate",
          "(",
          0,
          ")"
        ],
        action: "action 1",
        string: "when predicate 1 for 1 second then action 1"
      };

      rule.conditionExprTree = (new rulesAst.BoolExpressionTreeBuilder())
        .build(rule.tokens, rule.predicates);
      return ruleManager._evaluateConditionOfRule(rule).then( function(isTrue) {
        cassert(isTrue === false);
        return finish();
      }).done();
    });

    it('should decide predicate 1 for 1 second and predicate 2 for 2 seconds (holds)', function(finish){
      this.timeout(3000);
      const start = getTime();

      const rule = {
        id: "test1",
        orgCondition: "predicate 1 for 1 second and predicate 2 for 2 seconds",
        predicates: [
          {
            id: "test1",
            token: "predicate 1",
            type: "state",
            handler: predHandler1,
            for: {
              token: '1 second',
              exprTokens: [ 1 ],
              unit: 'second'
            },
            lastChange: start,
            timeAchived: true
          },
          {
            id: "test2",
            token: "predicate 2",
            type: "state",
            handler: predHandler2,
            for: {
              token: '2 seconds',
              exprTokens: [ 2 ],
              unit: 'seconds'
            },
            lastChange: start,
            timeAchived: true
          }
        ],
        tokens: [
          "predicate",
          "(",
          0,
          ")",
          "and",
          "predicate",
          "(",
          1,
          ")"
        ],
        action: "action 1",
        string: "when predicate 1 for 1 second and predicate 2 for 2 seconds then action 1"
      };

      rule.conditionExprTree = (new rulesAst.BoolExpressionTreeBuilder())
        .build(rule.tokens, rule.predicates);
      return ruleManager._evaluateConditionOfRule(rule).then( function(isTrue) {
        cassert(isTrue === true);
        return finish();
      }).done();
    });

    it('should decide predicate 1 for 1 second and predicate 2 for 2 seconds (does not holds)', 
    function(finish){
      this.timeout(3000);
      const start = getTime();

      predHandler2.on = function(event, listener) { 
        cassert(event === 'change');
        return setTimeout(() => listener(false)
        , 500);
      };

      const rule = {
        id: "test1",
        orgCondition: "predicate 1 for 1 second and predicate 2 for 2 seconds",
        predicates: [
          {
            id: "test1",
            token: "predicate 1",
            type: "state",
            handler: predHandler1,
            for: {
              token: '1 second',
              exprTokens: [ 1 ],
              unit: 'second'
            },
            lastChange: start,
            timeAchived: true
          },
          {
            id: "test2",
            token: "predicate 2",
            type: "state",
            handler: predHandler2,
            for: {
              token: '2 seconds',
              exprTokens: [ 2 ],
              unit: 'seconds'
            },
            lastChange: start,
            timeAchived: false
          }
        ],
        tokens: [
          "predicate",
          "(",
          0,
          ")",
          "and",
          "predicate",
          "(",
          1,
          ")"
        ],
        action: "action 1",
        string: "when predicate 1 for 1 second and predicate 2 for 2 seconds then action 1"
      };

      rule.conditionExprTree = (new rulesAst.BoolExpressionTreeBuilder())
        .build(rule.tokens, rule.predicates);
      return ruleManager._evaluateConditionOfRule(rule).then( function(isTrue) {
        cassert(isTrue === false);
        return finish();
      }).done();
    });

    it('should decide predicate 1 for 1 second or predicate 2 for 2 seconds (holds)', function(finish){
      this.timeout(3000);
      const start = getTime();

      predHandler1.getValue = () => Promise.resolve(true);
      predHandler2.getValue = () => Promise.resolve(true);

      predHandler2.on = function(event, listener) { 
        cassert(event === 'change');
        return setTimeout(() => listener(false)
        , 500);
      };

      const rule = {
        id: "test1",
        orgCondition: "predicate 1 for 1 second or predicate 2 for 2 seconds",
        predicates: [
          {
            id: "test1",
            token: "predicate 1",
            type: "state",
            handler: predHandler1,
            for: {
              token: '1 second',
              exprTokens: [ 1 ],
              unit: 'second'
            },
            lastChange: start,
            timeAchived: true
          },
          {
            id: "test2",
            token: "predicate 2",
            type: "state",
            handler: predHandler2,
            for: {
              token: '2 seconds',
              exprTokens: [ 2 ],
              unit: 'seconds'
            },
            lastChange: start,
            timeAchived: true
          }
        ],
        tokens: [
          "predicate",
          "(",
          0,
          ")",
          "or",
          "predicate",
          "(",
          1,
          ")"
        ],
        action: "action 1",
        string: "when predicate 1 for 1 second or predicate 2 for 2 seconds then action 1"
      };

      rule.conditionExprTree = (new rulesAst.BoolExpressionTreeBuilder())
        .build(rule.tokens, rule.predicates);
      return ruleManager._evaluateConditionOfRule(rule).then( function(isTrue) {
        cassert(isTrue === true);
        return finish();
      }).done();
    });

    return it('should decide predicate 1 for 1 second or predicate 2 for 2 seconds (does not holds)', 
    function(finish){
      this.timeout(3000);
      const start = getTime();

      predHandler1.getValue = () => Promise.resolve(true);
      predHandler2.getValue = () => Promise.resolve(true);

      predHandler1.on = function(event, listener) { 
        cassert(event === 'change');
        return setTimeout(function() {
          console.log("emit1");
          return listener(false);
        }
        , 500);
      };

      predHandler2.on = function(event, listener) { 
        cassert(event === 'change');
        return setTimeout(function() {
          console.log("emit2");
          return listener(false);
        }
        , 500);
      };


      const rule = {
        id: "test1",
        orgCondition: "predicate 1 for 1 second or predicate 2 for 2 seconds",
        predicates: [
          {
            id: "test1",
            token: "predicate 1",
            type: "state",
            handler: predHandler1,
            for: {
              token: '1 second',
              exprTokens: [ 1 ],
              unit: 'second'
            },
            lastChange: start,
            timeAchived: false
          },
          {
            id: "test2",
            token: "predicate 2",
            type: "state",
            handler: predHandler2,
            for: {
              token: '2 seconds',
              exprTokens: [ 2 ],
              unit: 'seconds'
            },
            lastChange: start,
            timeAchived: false
          }
        ],
        tokens: [
          "predicate",
          "(",
          0,
          ")",
          "or",
          "predicate",
          "(",
          1,
          ")"
        ],
        action: "action 1",
        string: "when predicate 1 for 1 second or predicate 2 for 2 seconds then action 1"
      };

      rule.conditionExprTree = (new rulesAst.BoolExpressionTreeBuilder())
        .build(rule.tokens, rule.predicates);
      return ruleManager._evaluateConditionOfRule(rule).then( function(isTrue) {
        cassert(isTrue === false);
        return finish();
      }).done();
    });
  });


  let predHandler = null;
  let actHandler = null;
  // ###Tests for `updateRuleByString()`
  describe('#updateRuleByString()', function() {  

    let changeListener = null;
    let i = 1;

    it('should update the rule', function(finish) {

      let parsePredicateCalled = false;
      let onCalled = false;
      predProvider.parsePredicate = function(input, context) { 
        cassert(S(input).startsWith("predicate 2"));
        parsePredicateCalled = i;
        i++;
        predHandler = new DummyPredicateHandler();
        predHandler.on = function(event, listener) { 
          if (event === 'change') {
            changeListener = listener;
            onCalled = i;
            return i++;
          }
        };

        predHandler.getVale = () => Promise.resolve(true);
        predHandler.getType(() => 'event');
        return {
          token: "predicate 2",
          nextInput: S(input).chompLeft("predicate 2").s,
          predicateHandler: predHandler
        };
      };

      actionProvider.parseAction = function(input, context) { 
        cassert(S(input).startsWith("action 1"));
        actHandler = new DummyActionHandler();
        actHandler.executeAction = simulate => Promise.resolve("execute action");
        return {
          token: "action 1",
          nextInput: S(input).chompLeft("action 1").s,
          actionHandler: actHandler
        };
      };

      return ruleManager.updateRuleByString('test5', {
        name: 'test5',
        ruleString: 'when predicate 2 then action 1'
      }).then( function() {
        cassert(parsePredicateCalled === 1);
        cassert(onCalled === 2);

        cassert(ruleManager.rules['test5'] != null);
        cassert(ruleManager.rules['test5'].string === 'when predicate 2 then action 1');
        return finish();
      }).catch(finish).done();
    });


    return it('should react to notifies', function(finish) {
      this.timeout(3000);

      actHandler.executeAction = simulate => {
        cassert(!simulate);
        finish();
        return Promise.resolve("execute action");
      };

      return setTimeout( () => changeListener('event')
      , 2001
      );
    });
  });


  // ###Tests for `removeRule()`
  return describe('#removeRule()', () =>

    it('should remove the rule', function() {
      let removeListenerCalled = false;
      predHandler.removeListener = function(event, listener) {
        cassert(event === "change");
        removeListenerCalled = true;
        return true;
      };

      ruleManager.removeRule('test5');
      cassert((ruleManager.rules['test5'] == null));
      return cassert(removeListenerCalled);
    })
  );
});
