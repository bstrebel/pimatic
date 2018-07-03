/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Rule System
===========

This file handles the parsing and executing of rules. 

What's a rule
------------
A rule is a string that has the format: "when _this_ then _that_". The _this_ part will be called 
the condition of the rule and the _that_ the actions of the rule.

__Examples:__

  * when its 10pm then turn the tv off
  * when its friday and its 8am then turn the light on
  * when [music is playing or the light is on] and somebody is present then turn the speaker on
  * when temperature of living room is below 15°C for 5 minutes then log "its getting cold"

__The condition and predicates__

The condition of a rule consists of one or more predicates. The predicates can be combined with
"and", "or" and can be grouped by parentheses ('[' and ']'). A predicate is either true or false at 
a given time. There are special predicates, called event-predicates, that represent events. 
These predicate are just true in the moment a special event happen.

Each predicate is handled by a Predicate Provider. Take a look at the 
[predicates file](predicates.html) for more details.

__for-suffix__

A predicate can have a "for" as a suffix like in "music is playing for 5 seconds" or 
"tv is on for 2 hours". If the predicate has a for-suffix then the rule action is only triggered,
when the predicate stays true the given time. Predicates that represent one time events like "10pm"
can't have a for-suffix because the condition can never hold.

__The actions__

The actions of a rule can consists of one or more actions. Each action describes a command that 
should be executed when the condition of the rule is true. Take a look at the 
[actions.coffee](actions.html) for more details.
*/

 
const assert = require('cassert');
const util = require('util');
const Promise = require('bluebird');
const _ = require('lodash');
const S = require('string');
const M = require('./matcher');
require("date-format-lite");
const milliseconds = require('./milliseconds');
const rulesAst = require('./rules-ast-builder');

module.exports = function(env) {


  let exports;
  class Rule {
    static initClass() {
      this.prototype.id = null;
      this.prototype.name = null;
      this.prototype.string = null;
  
      this.prototype.active = null;
      this.prototype.valid = null;
      this.prototype.logging = null;
  
      // Condition as string
      this.prototype.conditionToken = null;
      // Actions as string
      this.prototype.actionsToken = null;
  
      // PredicateHandler
      this.prototype.predicates = null;
      // Rule as tokens
      this.prototype.tokens = null;
      // ActionHandler
      this.prototype.actions = null;
  
      // Error message if not valid
      this.prototype.error = null;
      // Time the rule was last executed
      this.prototype.lastExecuteTime = null;
  
      this.prototype.conditionExprTree = null;
    }
      
    constructor(id, name, string) {
      this.id = id;
      this.name = name;
      this.string = string;
      assert(typeof this.id === "string");
      assert(typeof this.name === "string");
      assert(typeof this.string === "string");
    }

    update(fromRule) {
      assert(this.id === fromRule.id);
      this.name = fromRule.name;
      this.string = fromRule.string;
      this.active = fromRule.active;
      this.valid = fromRule.valid;
      this.logging = fromRule.logging;
      this.conditionToken = fromRule.conditionToken;
      this.actionsToken = fromRule.actionsToken;
      this.predicates = fromRule.predicates;
      this.tokens = fromRule.tokens;
      this.actions = fromRule.actions;
      this.error = fromRule.error;
      this.lastExecuteTime = fromRule.lastExecuteTime;
      return this.conditionExprTree = fromRule.conditionExprTree;
    }

    toJson() { return {
      id: this.id,
      name: this.name,
      string: this.string,
      active: this.active,
      valid: this.valid,
      logging: this.logging,
      conditionToken: this.conditionToken,
      actionsToken: this.actionsToken,
      error: this.error
    }; }
  }
  Rule.initClass();

  /*
  The Rule Manager
  ----------------
  The Rule Manager holds a collection of rules. Rules can be added to this collection. When a rule
  is added, the rule is parsed by the Rule Manager and for each predicate a Predicate Provider will
  be searched. Predicate Provider that should be considered can be added to the Rule Manager.

  If all predicates of the added rule can be handled by a Predicate Provider, for each action of a
  rule's action an Action Handler is searched. Action Handler can be added to the
  Rule Manager, too.

  */
  class RuleManager extends require('events').EventEmitter {
    static initClass() {
      // Array of the added rules
      // If a rule was successfully added, the rule has the form:
      //  
      //     id: 'some-id'
      //     name: 'some name'
      //     string: 'if its 10pm and light is on then turn the light off'
      //     conditionToken: 'its 10pm and light is on'
      //     predicates: [
      //       { id: 'some-id0'
      //         provider: the corresponding provider },
      //       { id: 'some-id1'
      //         provider: the corresponding provider }
      //     ]
      //     tokens: ['predicate', '(', 0, ')', 'and', 
      //              'predicate', '(', 1, ')' ] 
      //     action: 'turn the light off'
      //     active: false or true
      //  
      // If the rule had an error:
      //  
      //     id: id
      //     string: 'if bla then blub'
      //     error: 'Could not find a provider that decides bla'
      //     active: false 
      //  
      this.prototype.rules = {};
      // Array of ActionHandlers: see [actions.coffee](actions.html)
      this.prototype.actionProviders = [];
      // Array of predicateProviders: see [actions.coffee](actions.html)
      this.prototype.predicateProviders = [];
    }

    constructor(framework) {
      super();
      this._parsePredicate = this._parsePredicate.bind(this);
      this._parseAction = this._parseAction.bind(this);
      this.whenPredicateIsTrue = this.whenPredicateIsTrue.bind(this);
      this._evaluateTimeExpr = this._evaluateTimeExpr.bind(this);
      this._executeAction = this._executeAction.bind(this);
      this._executeRestoreAction = this._executeRestoreAction.bind(this);
      this._scheduleAction = this._scheduleAction.bind(this);
      this.executeAction = this.executeAction.bind(this);
      this.framework = framework;
    }

    addActionProvider(ah) { return this.actionProviders.push(ah); }
    addPredicateProvider(pv) { return this.predicateProviders.push(pv); }

    // ###_parseRuleString()
    // This function parses a rule given by a string and returns a rule object.
    // A rule string is for example 'if its 10pm and light is on then turn the light off'
    // it get parsed to the follwoing rule object:
    //  
    //     id: 'some-id'
    //     string: 'when its 10pm and light is on then turn the light off'
    //     conditionToken: 'its 10pm and light is on'
    //     predicates: [
    //       { id: 'some-id0'
    //         provider: the corresponding provider },
    //       { id: 'some-id1'
    //         provider: the corresponding provider }
    //     ]
    //     tokens: ['predicate', '(', 0, ')', 'and', 
    //              'predicate', '(', 1, ')' ] 
    //     action: 'turn the light off'
    //     active: false or true
    //  
    // The function returns a promise!
    _parseRuleString(id, name, ruleString, context) {
      assert((id != null) && (typeof id === "string") && (id.length !== 0));
      assert((name != null) && (typeof name === "string"));
      assert((ruleString != null) && (typeof ruleString === "string"));

      const rule = new Rule(id, name, ruleString);
      // Always return a promise
      return Promise.try( () => {
        
        /*
        First take the string apart, so that
         
            parts = ["", "its 10pm and light is on", "turn the light off"].
        
        */
        const parts = ruleString.split(/^when\s|\sthen\s/);
        // Check for the right parts count. Note the empty string at the beginning.
        switch (false) {
          case !(parts.length < 3):
            throw new Error('The rule must start with "when" and contain a "then" part!');
            break;
          case !(parts.length > 3): 
            throw new Error('The rule must exactly contain one "when" and one "then" part!');
            break;
        }
        /*
        Then extract the condition and actions from the rule 
         
            rule.conditionToken = "its 10pm and light is on"
            rule.actions = "turn the light off"
         
        */
        rule.conditionToken = parts[1].trim();
        rule.actionsToken = parts[2].trim();

        if (rule.conditionToken.length === 0) {
          throw new Error(`Condition part of rule ${id} is empty.`);
        }
        if (rule.actionsToken.length === 0) {
          throw new Error(`Actions part of rule ${id} is empty.`);
        }

        let result = this._parseRuleCondition(id, rule.conditionToken, context);
        rule.predicates = result.predicates;
        rule.tokens = result.tokens;

        if (!context.hasErrors()) {
          result = this._parseRuleActions(id, rule.actionsToken, context);
          rule.actions = result.actions;
          rule.actionToken = result.tokens;
          rule.conditionExprTree = (new rulesAst.BoolExpressionTreeBuilder())
            .build(rule.tokens, rule.predicates);
        }
        return rule;
      });
    }

    _parseRuleCondition(id, conditionString, context) {
      assert((typeof id === "string") && (id.length !== 0));
      assert(typeof conditionString === "string");
      assert(context != null);
      /*
      Split the condition in a token stream.
      For example: 
        
          "12:30 and temperature > 10"
       
      becomes 
       
          ['12:30', 'and', 'temperature > 30 C']
       
      Then we replace all predicates with tokens of the following form
       
          tokens = ['predicate', '(', 0, ')', 'and', 'predicate', '(', 1, ')']
       
      and remember the predicates:
       
          predicates = [ {token: '12:30'}, {token: 'temperature > 10'}]
       
      */ 
      const predicates = [];
      let tokens = [];
      // For each token

      let nextInput = conditionString;

      const success = true;
      let openedParentheseCount = 0;
      let justCondition = false;

      while ((!context.hasErrors()) && (nextInput.length !== 0)) {
        var predicate, token;
        M(nextInput, context).matchOpenParenthese('[', (next, ptokens) => {
          tokens = tokens.concat(ptokens);
          openedParentheseCount += ptokens.length;
          return nextInput = next.getRemainingInput();
        });

        const i = predicates.length;
        const predId = `prd-${id}-${i}`;

        ({ predicate, token, nextInput } = this._parsePredicate(
          predId, nextInput, context, null, justCondition
        ));
        if (!context.hasErrors()) {
          predicates.push(predicate);
          tokens = tokens.concat(["predicate", "(", i, ")"]);

          M(nextInput, context).matchCloseParenthese(']', openedParentheseCount, (next, ptokens) => {
            tokens = tokens.concat(ptokens);
            openedParentheseCount -= ptokens.length;
            return nextInput = next.getRemainingInput();
          });

          // Try to match " and ", " or ", ...
          const possibleTokens = [' and if ', ' and ', ' or when ', ' or '];
          const onMatch = (m, s) => { 
            token = s.trim();
            if (token === 'and if') { justCondition = true;
            } else if (token === 'or when') { justCondition = false; }
            return tokens.push(token);
          };
          const m = M(nextInput, context).match(possibleTokens, onMatch);
          if (nextInput.length !== 0) {
            if (m.hadNoMatch()) {
              context.addError("Expected one of: \"and\", \"or\", \"]\".");
            } else {
              token = m.getFullMatch();
              assert(S(nextInput.toLowerCase()).startsWith(token.toLowerCase()));
              nextInput = nextInput.substring(token.length);
            }
          }
        }
      }
      if (tokens.length > 0) {
        const lastToken = tokens[tokens.length-1];
        if (["and", "or", "and if", "or when"].includes(lastToken)) {
          context.addError(`Expected a new predicate after last "${lastToken}".`);
        }
      }
      if (openedParentheseCount > 0) {
        context.addError("Expected closing parenthese (\"]\") at end.");
      }
      return {
        predicates,
        tokens
      };
    }

    _parsePredicate(predId, nextInput, context, predicateProviderClass, justCondition) {
      let parseResult, timeParseResult;
      assert((typeof predId === "string") && (predId.length !== 0));
      assert(typeof nextInput === "string");
      assert(context != null);

      const predicate = {
        id: predId,
        token: null,
        handler: null,
        for: null,
        justTrigger: false,
        justCondition
      };

      let token = '';

      // trigger keyword?
      const m = M(nextInput, context).match(["trigger: "]);
      if (m.hadMatch()) {
        const match = m.getFullMatch();
        token += match;
        nextInput = nextInput.substring(match.length);
        predicate.justTrigger = match === "trigger: ";
      }

      // find a predicate provider for that can parse and decide the predicate:
      const parseResults = [];
      for (let predProvider of Array.from(this.predicateProviders)) {
        if (predicateProviderClass != null) {
          if (predProvider.constructor.name !== predicateProviderClass) { continue; }
        }
        context.elements = {};
        parseResult = predProvider.parsePredicate(nextInput, context);
        if (parseResult != null) {
          assert((parseResult.token != null) && (parseResult.token.length > 0));
          assert((parseResult.nextInput != null) && (typeof parseResult.nextInput === "string"));
          assert(parseResult.predicateHandler != null);
          assert(parseResult.predicateHandler instanceof env.predicates.PredicateHandler);
          parseResult.elements = context.elements[parseResult.token];
          parseResults.push(parseResult);
        }
      }

      switch (parseResults.length) {
        case 0:
          context.addError(
            `Could not find an provider that decides next predicate of "${nextInput}".`
          );
          break;
        case 1:
          // get part of nextInput that is related to the found provider
          parseResult = parseResults[0];
          token += parseResult.token;
          assert(parseResult.token != null);
          //assert S(nextInput.toLowerCase()).startsWith(parseResult.token.toLowerCase())
          predicate.token = parseResult.token;
          ({ nextInput } = parseResult);
          predicate.handler = parseResult.predicateHandler;
          context.elements = {};
          timeParseResult = this._parseTimePart(nextInput, " for ", context);
          if (timeParseResult != null) {
            token += timeParseResult.token;
            ({ nextInput } = timeParseResult);
            predicate.for = {
              token: timeParseResult.timeToken,
              exprTokens: timeParseResult.timeExprTokens,
              unit: timeParseResult.unit
            };
          }

          if (predicate.justTrigger && (predicate.for != null)) {
            context.addError(
              `\"${token}\" is marked as trigger, it can't be true for \"${predicate.token}\".`
            );
          }

          if ((predicate.handler.getType() === 'event') && (predicate.for != null)) {
            context.addError(
              `\"${token}\" is an event it can't be true for \"${predicate.for.token}\".`
            );
          }

          if ((predicate.handler.getType() === 'event') && predicate.justCondition) {
            context.addError(
              `\"${token}\" is an event it can't be used with \"... and if ...\".`
            );
          }
          break;

        default:
          context.addError(
            `Next predicate of "${nextInput}" is ambiguous.`
          );
      }
      return { 
        predicate, token, nextInput, 
        elements: (parseResult != null ? parseResult.elements : undefined), 
        forElements: (timeParseResult != null ? timeParseResult.elements : undefined)
      };
    }

    _parseTimePart(nextInput, prefixToken, context, options = null) {
      // Parse the for-Suffix:
      let timeExprTokens = null;
      let unit = null;
      const onTimeduration = (m, tp) => { 
        timeExprTokens = tp.tokens;
        return unit = tp.unit;
      };

      const varsAndFuns = this.framework.variableManager.getVariablesAndFunctions();
      const m = M(nextInput, context)
        .match(prefixToken, options)
        .matchTimeDurationExpression(varsAndFuns, onTimeduration);

      if (!m.hadNoMatch()) {
        const token = m.getFullMatch();
        assert(S(nextInput).startsWith(token));
        const timeToken = S(token).chompLeft(prefixToken).s;
        nextInput = nextInput.substring(token.length);
        const { elements } = m;
        return {token, nextInput, timeToken, timeExprTokens, unit, elements};
      } else {
        return null;
      }
    }

    _parseRuleActions(id, nextInput, context) {
      assert((typeof id === "string") && (id.length !== 0));
      assert(typeof nextInput === "string");
      assert(context != null);

      const actions = [];
      let tokens = [];
      // For each token

      const success = true;
      const openedParentheseCount = 0;

      while ((!context.hasErrors()) && (nextInput.length !== 0)) {
        var action, token;
        const i = actions.length;
        const actionId = `act-${id}-${i}`;
        ({ action, token, nextInput } = this._parseAction(actionId, nextInput, context));
        if (!context.hasErrors()) {
          actions.push(action);
          tokens = tokens.concat(['action', '(', i, ')']);
          // actions.push {
          //   token: token
          //   handler: 
          // }
          const onMatch = (m, s) => tokens.push(s.trim());
          const m = M(nextInput, context).match([' and '], onMatch);
          if (nextInput.length !== 0) {
            if (m.hadNoMatch()) {
              context.addError(`Expected: \"and\", got \"${nextInput}\"`);
            } else {
              token = m.getFullMatch();
              assert(S(nextInput.toLowerCase()).startsWith(token.toLowerCase()));
              nextInput = nextInput.substring(token.length);
            }
          }
        }
      }
      return {
        actions,
        tokens
      };
    }

    _parseAction(actionId, nextInput, context) {
      let parseResult, timeParseResult;
      assert(typeof nextInput === "string");
      assert(context != null);

      let token = null;

      const action = {
        id: actionId,
        token: null,
        handler: null,
        after: null,
        for: null
      };

      const parseAfter = type => {
        const prefixToken =  (type === "prefix" ? "after " : " after ");
        timeParseResult = this._parseTimePart(nextInput, prefixToken, context);
        if (timeParseResult != null) {
          ({ nextInput } = timeParseResult);
          if (type === 'prefix') {
            if ((nextInput.length > 0) && (nextInput[0] === ' ')) {
              nextInput = nextInput.substring(1);
            }
          }
          return action.after = {
            token: timeParseResult.timeToken,
            exprTokens: timeParseResult.timeExprTokens,
            unit: timeParseResult.unit
          };
        }
      };
      // Try to match after as prefix: after 10 seconds log "42" 
      parseAfter('prefix');

      // find a predicate provider for that can parse and decide the predicate:
      const parseResults = [];
      for (let actProvider of Array.from(this.actionProviders)) {
        parseResult = actProvider.parseAction(nextInput, context);
        if (parseResult != null) {
          assert((parseResult.token != null) && (parseResult.token.length > 0));
          assert((parseResult.nextInput != null) && (typeof parseResult.nextInput === "string"));
          assert(parseResult.actionHandler != null);
          assert(parseResult.actionHandler instanceof env.actions.ActionHandler);
          parseResults.push(parseResult);
        }
      }

      switch (parseResults.length) {
        case 0:
          context.addError(
            `Could not find an provider that provides the next action of "${nextInput}".`
          );
          break;
        case 1:
          // Get part of nextInput that is related to the found provider
          parseResult = parseResults[0];
          ({ token } = parseResult);
          assert(token != null);
          assert(S(nextInput.toLowerCase()).startsWith(parseResult.token.toLowerCase()));
          action.token = token;
          ({ nextInput } = parseResult);
          action.handler = parseResult.actionHandler;

          // Try to match after as suffix: log "42" after 10 seconds
          if (action.after == null) {
            parseAfter('suffix');
          }

          // Try to parse "for 10 seconds"
          const forSuffixAllowed = action.handler.hasRestoreAction();
          timeParseResult = this._parseTimePart(nextInput, " for ", context, {
            acFilter: () => forSuffixAllowed
          });
          if (timeParseResult != null) {
            ({ nextInput } = timeParseResult);
            action.for = {
              token: timeParseResult.timeToken,
              exprTokens: timeParseResult.timeExprTokens,
              unit: timeParseResult.unit
            };
          }

          if ((action.for != null) && (forSuffixAllowed === false)) {
            context.addError(
              `Action "${action.token}" can't have a "for"-Suffix.`
            );
          }
          break;
          
        default:
          context.addError(
            `Next action of "${nextInput}" is ambiguous.`
          );
      }

      return { action, token, nextInput };
    }

    // This function should be called by a provider if a predicate becomes true.
    whenPredicateIsTrue(rule, predicateId, state) {
      assert(rule != null);
      assert((predicateId != null) && (typeof predicateId === "string") && (predicateId.length !== 0));
      assert((state === 'event') || (state === true));

      // If not active, then nothing to do
      if (!rule.active) { return; }

      // Then mark the given predicate as true
      const knownPredicates = {};
      knownPredicates[predicateId] = true;

      // And check if the rule is now true.
      this._evaluateConditionOfRule(rule, knownPredicates).then( isTrue => {
        // If the rule is now true, then execute its action
        if (isTrue) { 
          return this._executeRuleActionsAndLogResult(rule);
        }
      }).catch( error => { 
        env.logger.error(`\
Error on evaluation of rule condition of rule ${rule.id}: ${error.message}\
`
        ); 
        return env.logger.debug(error);
      });
    }

    // ###_addPredicateChangeListener()
    // Register for every predicate the callback function that should be called
    // when the predicate becomes true.
    _addPredicateChangeListener(rule) {
      assert(rule != null);
      assert(rule.predicates != null);

      const setupTime = (new Date()).getTime();
      // For all predicate providers
      return Array.from(rule.predicates).map((p) =>
        (p => {
          let changeListener, recreateListener;
          assert((p.changeListener == null));
          p.lastChange = setupTime;
          p.handler.setup();
          if (p.for) {
            p.timeAchived = false;
          }
          // Let us be notified when the predicate state changes.
          p.handler.on('change', (changeListener = state => {
            assert((state === 'event') || (state === true) || (state === false));
            p.lastChange = (new Date()).getTime();
            // If the state is true then call the `whenPredicateIsTrue` function.
            if (!p.justCondition) {
              if (p.for != null) {
                if (state === false) {
                  clearTimeout(p.forTimeout);
                  p.forTimeout = undefined;
                  p.timeAchived = false;
                }
                if (state === true) {
                  // If timeout already set, -> return
                  if (p.forTimeout != null) { return; }
                  return this._evaluateTimeExpr(
                    p.for.exprTokens,
                    p.for.unit
                  ).then( ms => {
                    // If timeout already set, -> return
                    if (p.forTimeout != null) { return; }
                    return p.forTimeout = setTimeout( ( () => {
                      p.timeAchived = true;
                      return this.whenPredicateIsTrue(rule, p.id, state);
                    }
                    ), ms);
                  }).catch( err => {
                    env.logger.error(`Error evaluating time expr for predicate: ${err.message}`);
                    return env.logger.debug(error);
                  });
                }
              } else {
                if ((state === true) || (state === 'event')) {
                  return this.whenPredicateIsTrue(rule, p.id, state);
                }
              }
            }
          })
          );
          p.changeListener = changeListener;
          if (p.for != null) {
            // bootstrap timeout
            p.handler.getValue().then( val => {
              if (val === true) {
                if (p.forTimeout != null) { return; }
                return this._evaluateTimeExpr(
                  p.for.exprTokens,
                  p.for.unit
                ).then( ms => {
                  // If timeout already set, -> return
                  if (p.forTimeout != null) { return; }
                  return p.forTimeout = setTimeout( ( () => {
                    return p.timeAchived = true;
                  }
                  ), ms);
                });
              }
            });
          }

          p.handler.on('recreate', (recreateListener = () => {
            return this.recreateRule(rule);
          })
          );
          return p.ready = true;
        })(p));
    }

    _removePredicateChangeListener(rule) {
      assert(rule != null);
      // Then cancel the notifier for all predicates
      if (rule.valid) {
        return Array.from(rule.predicates).map((p) =>
          (p => {
            if (p.ready) {
              assert(typeof p.changeListener === "function");
              p.handler.removeListener('change', p.changeListener);
              delete p.changeListener;
              p.handler.removeAllListeners('recreate');
              p.handler.destroy();
              clearTimeout(p.forTimeout);
              return p.ready = false;
            }
          })(p));
      }
    }

    _setupActions(rule) {
      return (() => {
        const result = [];
        for (let action of Array.from(rule.actions)) {
          var recreateListener;
          action.handler.setup();
          action.handler.on('recreate', (recreateListener = () => {
            return this.recreateRule(rule);
          })
          );
          result.push(action.ready = true);
        }
        return result;
      })();
    }


    _destroyActionsAndCancelSheduledActions(rule) {
      assert(rule != null);
      // Then cancel the notifier for all predicates
      if (rule.valid) {
        return Array.from(rule.actions).map((action) =>
          (action => {
            if (action.ready) {
              action.handler.destroy();
              action.handler.removeAllListeners('recreate');
              action.ready = false;
              if (action.scheduled != null) {
                return action.scheduled.cancel(
                  `canceling schedule of action ${action.token}`
                );
              }
            }
          })(action));
      }
    }

    // ###addRuleByString()
    addRuleByString(id, {name, ruleString, active, logging}, force) {
      if (force == null) { force = false; }
      assert((id != null) && (typeof id === "string") && (id.length !== 0));
      assert((name != null) && (typeof name === "string"));
      assert((ruleString != null) && (typeof ruleString === "string"));
      assert(((active != null) ? typeof active === "boolean" : true));
      assert(((logging != null) ? typeof logging === "boolean" : true));
      assert(((force != null) ? typeof force === "boolean" : true));
      if (active == null) { active = true; }
      if (logging == null) { logging = true; }


      if (!id.match(/^[a-z0-9\-_]+$/i)) { throw new Error("Rule ID must only contain " +
        "alpha numerical symbols, \"-\" and  \"_\""
      ); }
      if (this.rules[id] != null) { throw new Error(`There is already a rule with the ID \"${id}\"`); }

      const context = this._createParseContext();
      // First parse the rule.
      return this._parseRuleString(id, name, ruleString, context).then( rule => {
        rule.logging = logging;
        // If we have a parse error we don't need to continue here
        if (context.hasErrors()) {
          const error = new Error(context.getErrorsAsString());
          error.rule = rule;
          error.context = context;
          throw error;
        }

        this._addPredicateChangeListener(rule);
        this._setupActions(rule);
        // If the rules was successful parsed add it to the rule array.
        rule.active = active;
        rule.valid = true;
        this.rules[id] = rule;
        this.emit("ruleAdded", rule);
      }).catch( error => {
        // If there was an error parsing the rule, but the rule is forced to be added, then add
        // the rule with an error.
        if (force) {
          if (error.rule != null) {
            const { rule } = error;
            rule.error = error.message;
            rule.active = false;
            rule.valid = false;
            this.rules[id] = rule;
            this.emit('ruleAdded', rule);
          } else {
            env.logger.error('Could not force add rule, because error has no rule attribute.');
            env.logger.debug(error.stack);
          }
        }
        throw error;
      });
    }

    // ###removeRule()
    // Removes a rule from the Rule Manager.
    removeRule(id) {
      assert((id != null) && (typeof id === "string") && (id.length !== 0));
      if (this.rules[id] == null) { throw new Error(`Invalid ruleId: \"${id}\"`); }

      // First get the rule from the rule array.
      const rule = this.rules[id];
      // Then cancel all notifications
      this._removePredicateChangeListener(rule);
      this._destroyActionsAndCancelSheduledActions(rule);
      // and delete the rule from the array
      delete this.rules[id];
      // and emit the event.
      this.emit("ruleRemoved", rule);
    }

    // ###updateRuleByString()
    updateRuleByString(id, {name, ruleString, active, logging}) {
      assert((id != null) && (typeof id === "string") && (id.length !== 0));
      assert(((name != null) ? typeof name === "string" : true));
      assert(((ruleString != null) ? typeof ruleString === "string" : true));
      assert(((active != null) ? typeof active === "boolean" : true));
      assert(((logging != null) ? typeof logging === "boolean" : true));
      if (this.rules[id] == null) { throw new Error(`Invalid ruleId: \"${id}\"`); }
      const rule = this.rules[id];
      if (name == null) { ({ name } = rule); }
      if (ruleString == null) { ruleString = rule.string; }
      const context = this._createParseContext();
      // First try to parse the updated ruleString.
      return this._parseRuleString(id, name, ruleString, context).then( newRule => {
        if (context.hasErrors()) {
          const error = new Error(context.getErrorsAsString());
          error.rule = newRule;
          error.context = context;
          throw error;
        }

        // Set the properties for the new rule
        newRule.valid = true;
        newRule.active = (active != null) ? active : rule.active;
        newRule.logging = (logging != null) ? logging : rule.logging;

        // If the rule was successfully parsed then update the rule
        if (rule !== this.rules[id]) {
          throw new Error(`Rule ${rule.id} was removed while updating`);
        }

        // and cancel the notifier for the old predicates.
        this._removePredicateChangeListener(rule);
        this._destroyActionsAndCancelSheduledActions(rule);

        // We do that to keep the old rule object and don't use the new one
        rule.update(newRule);

        // and register the new ones,
        this._addPredicateChangeListener(rule);
        this._setupActions(rule);
        // and emit the event.
        return this.emit("ruleChanged", rule);
      });
    }

    recreateRule(rule) {
      if (rule.recreating) {
        return;
      }
      rule.recreating = true;
      return this.updateRuleByString(rule.id, {})
        .then( () => rule.recreating = false )
        .catch( error => {
          this._removePredicateChangeListener(rule);
          this._destroyActionsAndCancelSheduledActions(rule);
          rule.active = false;
          rule.valid = false;
          rule.recreating = false; 
          env.logger.error(`Error in rule ${rule.id}: ${error.message}`);
          env.logger.debug(error.stack);
          // and emit the event.
          return this.emit("ruleChanged", rule);
        }).done();
    }


    // ###_evaluateConditionOfRule()
    // This function returns a promise that will be fulfilled with true if the condition of the 
    // rule is true. This function ignores all the "for"-suffixes of predicates. 
    // The `knownPredicates` is an object containing a value for
    // each predicate for that the state is already known.
    _evaluateConditionOfRule(rule, knownPredicates) {
      if (knownPredicates == null) { knownPredicates = {}; }
      assert((rule != null) && rule instanceof Object);
      assert((knownPredicates != null) && knownPredicates instanceof Object);
      return rule.conditionExprTree.evaluate(knownPredicates);
    }

    // ###_executeRuleActionsAndLogResult()
    // Executes the actions of the string using `executeAction` and logs the result to 
    // the env.logger.    
    _executeRuleActionsAndLogResult(rule) {
      const currentTime = (new Date).getTime();
      if (rule.lastExecuteTime != null) {
        const delta = currentTime - rule.lastExecuteTime;
        if (delta <= 500) {
          env.logger.debug(`Suppressing rule ${rule.id} execute because it was executed recently.`);
          return Promise.resolve();
        }
      }
      rule.lastExecuteTime = currentTime;

      const actionResults = this._executeRuleActions(rule, false);

      var logMessageForResult = actionResult => {
        let message;
        return actionResult.then( result => {
          let next;
          [message, next] = Array.from(((() => {
            
            if (typeof result === "string") { return [result, null];
            } else { 
              assert(Array.isArray(result));
              assert(result.length === 2);
              return result;
            }
          
          })()));
          if (rule.logging) {
            env.logger.info(`rule ${rule.id}: ${message}`);
          }
          if (next != null) {
            assert(next.then != null);
            next = logMessageForResult(next);
          }
          return [message, next];
        }).catch( error => {
          env.logger.error(`rule ${rule.id} error executing an action: ${error.message != null ? error.message : error}`);
          if (error.stack != null) { return env.logger.debug(error.stack); }
        });
      };

      for (let actionResult of Array.from(actionResults)) {
        actionResult = logMessageForResult(actionResult);
      }
      return Promise.all(actionResults);
    }

    // ###executeAction()
    // Executes the actions in the given actionString
    _executeRuleActions(rule, simulate) {
      assert(rule != null);
      assert(rule.actions != null);
      assert((simulate != null) && (typeof simulate === "boolean"));

      const actionResults = [];
      for (let action of Array.from(rule.actions)) {
        (action => {
          let promise = null;
          if (action.after != null) {
            if (!simulate) { 
              // Cancel schedule for pending executes
              if (action.scheduled != null) {
                action.scheduled.cancel(
                  `reschedule action ${action.token} in ${action.after.token}`
                ); 
              }
              // Schedule new action
              promise = this._evaluateTimeExpr(
                action.after.exprTokens, 
                action.after.unit
              ).then( ms => this._scheduleAction(action, ms) );
            } else {
              promise = this._executeAction(action, simulate).then( message => { 
                return `${message} after ${action.after.token}`;
              });
            }
          } else {
            promise = this._executeAction(action);
          }
          assert(promise.then != null);
          return actionResults.push(promise);
        })(action);
      }
      return actionResults;
    }

    _evaluateTimeExpr(exprTokens, unit) {
      return this.framework.variableManager.evaluateNumericExpression(exprTokens).then( time => {
        return milliseconds.parse(`${time} ${unit}`);
      });
    }

    _executeAction(action, simulate) {
      // wrap into an fcall to convert thrown erros to a rejected promise
      return Promise.try( () => { 
        let promise = action.handler.executeAction(simulate);
        if (action.for != null) {
          promise = promise.then( message => {
            const restoreActionPromise = this._evaluateTimeExpr(
              action.for.exprTokens, 
              action.for.unit
            ).then( ms => this._scheduleAction(action, ms, true) );
            return [message, restoreActionPromise];
          });
        }
        return promise;
      });
    }

    _executeRestoreAction(action, simulate) {
      // Wrap into an fcall to convert thrown erros to a rejected promise
      return Promise.try( () => action.handler.executeRestoreAction(simulate) );
    }

    _scheduleAction(action, ms, isRestore) {
      if (isRestore == null) { isRestore = false; }
      assert(action != null);
      if (action.scheduled != null) {
        action.scheduled.cancel("clearing scheduled action");
      }

      return new Promise( (resolve, reject) => {
        const timeoutHandle = setTimeout((() => { 
          const promise = (
            !isRestore ? this._executeAction(action, false)
            : this._executeRestoreAction(action, false)
          );
          resolve(promise);
          return delete action.scheduled;
        }
        ), ms);
        return action.scheduled = {
          startDate: new Date(),
          cancel: reason => {
            clearTimeout(timeoutHandle);
            delete action.scheduled;
            return resolve(reason);
          }
        };
      });
    }

    _createParseContext() {
      const {variables, functions} = this.framework.variableManager.getVariablesAndFunctions();
      return M.createParseContext(variables, functions);
    }

  
    // ###getRules()
    getRules() { 
      let id, r;
      const rules = ((() => {
        const result = [];
        for (id in this.rules) {
          r = this.rules[id];
          result.push(r);
        }
        return result;
      })());
      // sort in config order
      const rulesInConfig = _.map(this.framework.config.rules, r => r.id );
      return _.sortBy(rules, r => rulesInConfig.indexOf(r.id) );
    }

    getRuleById(ruleId) { return this.rules[ruleId]; }

    getRuleActionsHints(actionsInput) {
      let context =  null;
      let result = null;

      context = this._createParseContext();
      result = this._parseRuleActions("id", actionsInput, context);
      context.finalize();

      for (let a of Array.from(result.actions)) {
        delete a.handler;
      }

      return {
        tokens: result.tokens,
        actions: result.actions,
        autocomplete: context.autocomplete,
        errors: context.errors,
        format: context.format,
        warnings: context.warnings
      };
    }

    getRuleConditionHints(conditionInput) {
      let context =  null;
      let result = null;

      context = this._createParseContext();
      result = this._parseRuleCondition("id", conditionInput, context);
      context.finalize();

      for (let p of Array.from(result.predicates)) {
        delete p.handler;
      }

      let tree = null;
      if (context.errors.length === 0) {
        tree = (new rulesAst.BoolExpressionTreeBuilder())
          .build(result.tokens, result.predicates);
      }

      return {
        tokens: result.tokens,
        predicates: result.predicates,
        tree,
        autocomplete: context.autocomplete,
        errors: context.errors,
        format: context.format,
        warnings: context.warnings
      };
    }

    getPredicatePresets() {
      const presets = [];
      for (let p of Array.from(this.predicateProviders)) {
        if (p.presets != null) {
          for (let d of Array.from(p.presets)) {
            d.predicateProviderClass = p.constructor.name;
            presets.push(d);
          }
        }
      }
      return presets;
    }


    getPredicateInfo(input, predicateProviderClass) {
      const context = this._createParseContext();
      const result = this._parsePredicate("id", input, context, predicateProviderClass, false);
      if ((result != null ? result.predicate : undefined) != null) {
        if (!result.predicate.justTrigger && ((result.predicate.handler != null ? result.predicate.handler.getType() : undefined) !== "event")) {
          if (result.forElements == null) {
            const timeParseResult = this._parseTimePart(" for 5 minutes", " for ", context);
            result.forElements = timeParseResult.elements;
          }
        }
        delete result.predicate.handler;
      }
      context.finalize();
      result.errors = context.errors;
      return result;
    }

    executeAction(actionString, simulate, logging) {
      if (simulate == null) { simulate = false; }
      if (logging == null) { logging = true; }
      const context = this._createParseContext();
      const parseResult = this._parseAction('custom-action', actionString, context);
      context.finalize();
      if (context.hasErrors()) {
        return Promise.reject(new Error(context.errors));
      }
      return this._executeAction(parseResult.action, simulate).then( message => {
        if (logging) { env.logger.info(`execute action: ${message}`); }
        return message;
      });
    }

    updateRuleOrder(ruleOrder) {
      assert((ruleOrder != null) && Array.isArray(ruleOrder));
      this.framework.config.rules = _.sortBy(this.framework.config.rules,  rule => { 
        const index = ruleOrder.indexOf(rule.id); 
        if (index === -1) { return 99999; } else { return index; } // push it to the end if not found
      });
      this.framework.saveConfig();
      this.framework._emitRuleOrderChanged(ruleOrder);
      return ruleOrder;
    }
  }
  RuleManager.initClass();

  return exports = { RuleManager };
};
