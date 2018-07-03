/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS201: Simplify complex destructure assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Predicate Provider
=================
A Predicate Provider provides a predicate for the Rule System. For predicate and rule explanations
take a look at the [rules file](rules.html). A predicate is a string that describes a state. A
predicate is either true or false at a given time. There are special predicates, 
called event-predicates, that represent events. These predicate are just true in the moment a 
special event happen.
*/

const { __ } = require("i18n");
const Promise = require('bluebird');
const S = require('string');
const assert = require('cassert');
const _ = require('lodash');
const M = require('./matcher');
const { types } = require('decl-api');

module.exports = function(env) {

  /*
  The Predicate Provider
  ----------------
  This is the base class for all predicate provider. 
  */
  let exports;
  class PredicateProvider {

    parsePredicate(input, context) { throw new Error("You must implement parsePredicate"); }
  }


  class PredicateHandler extends require('events').EventEmitter {

    getType() { throw new Error("You must implement getType"); }
    getValue() { throw new Error("You must implement getValue"); }

    setup() { 
      // You must overwrite this method and set up your listener here.
      // You should call super() after that.
      if (this._setupCalled) { throw new Error("Setup already called!"); }
      return this._setupCalled = true;
    }
    destroy() { 
      // You must overwrite this method and remove your listener here.
      // You should call super() after that.
      if (!this._setupCalled) { throw new Error("Destroy called, but setup was not called!"); }
      delete this._setupCalled;
      this.emit("destroy");
      return this.removeAllListeners();
    }

    dependOnDevice(device) {
      const recreateEmitter = (() => this.emit("recreate"));
      device.on("changed", recreateEmitter);
      device.on("destroyed", recreateEmitter);
      return this.on('destroy', () => {
        device.removeListener("changed", recreateEmitter);
        return device.removeListener("destroyed", recreateEmitter);
      });
    }

    dependOnVariable(variableManager, varName) {
      const recreateEmitter = ( variable => { 
        if (variable.name !== varName) {
          return;
        }
        return this.emit("recreate");
      }
      );
      variableManager.on("variableRemoved", recreateEmitter);
      return this.on('destroy', () => {
        return variableManager.removeListener("variableRemoved", recreateEmitter);
      });
    }
  }
  /*
  The Switch Predicate Provider
  ----------------
  Provides predicates for the state of switch devices like:

  * _device_ is on|off
  * _device_ is switched on|off
  * _device_ is turned on|off

  *///
  class SwitchPredicateProvider extends PredicateProvider {
    static initClass() {
  
      this.prototype.presets = [
        {
          name: "switch turned on/off",
          input: "{device} is turned on"
        }
      ];
    }

    constructor(framework) {
      super();
      this.framework = framework;
    }

    // ### parsePredicate()
    parsePredicate(input, context) {  

      const switchDevices = _(this.framework.deviceManager.devices).values()
        .filter(device => device.hasAttribute( 'state')).value();

      let device = null;
      let state = null;
      let match = null;

      const stateAcFilter = v => v.trim() !== 'is switched'; 
      M(input, context)
        .matchDevice(switchDevices, (next, d) => {
          return next.match([' is', ' is turned', ' is switched'], {acFilter: stateAcFilter, type: 'static'})
            .match([' on', ' off'], {param: 'state', type: 'select'}, (next, s) => {
              // Already had a match with another device?
              if ((device != null) && (device.id !== d.id)) {
                if (context != null) {
                  context.addError(`"${input.trim()}" is ambiguous.`);
                }
                return;
              }
              assert(d != null);
              assert([' on', ' off'].includes(s));
              device = d;
              state = s.trim() === 'on';
              return match = next.getFullMatch();
          });
        });
 
      // If we have a match
      if (match != null) {
        assert(device != null);
        assert(state != null);
        assert(typeof match === "string");
        // and state as boolean.
        return {
          token: match,
          nextInput: input.substring(match.length),
          predicateHandler: new SwitchPredicateHandler(device, state)
        };
      } else {
        return null;
      }
    }
  }
  SwitchPredicateProvider.initClass();

  class SwitchPredicateHandler extends PredicateHandler {

    constructor(device, state) {
      super();
      this.device = device;
      this.state = state;
      this.dependOnDevice(this.device);
    }
    setup() {
      this.stateListener = s => this.emit('change', (s === this.state));
      this.device.on('state', this.stateListener);
      return super.setup();
    }
    getValue() { return this.device.getUpdatedAttributeValue('state').then( s => (s === this.state) ); }
    destroy() { 
      this.device.removeListener("state", this.stateListener);
      return super.destroy();
    }
    getType() { return 'state'; }
  }


  /*
  The Presence Predicate Provider
  ----------------
  Handles predicates of presence devices like

  * _device_ is present
  * _device_ is not present
  * _device_ is absent
  *///
  class PresencePredicateProvider extends PredicateProvider {
    static initClass() {
  
      this.prototype.presets = [
        {
          name: "device is present/absent",
          input: "{device} is present"
        }
      ];
    }

    constructor(framework) {
      super();
      this.framework = framework;
    }

    parsePredicate(input, context) {

      const presenceDevices = _(this.framework.deviceManager.devices).values()
        .filter(device => device.hasAttribute( 'presence')).value();

      let device = null;
      let negated = null;
      let match = null;

      const stateAcFilter = v => v.trim() !== 'not present';

      M(input, context)
        .matchDevice(presenceDevices, (next, d) => {
          return next.match([' is', ' reports', ' signals'], {type: "static"})
            .match(
              [' present', ' absent', ' not present'], 
              {acFilter: stateAcFilter, type: "select", param: "state"}, 
              (m, s) => {
                // Already had a match with another device?
                if ((device != null) && (device.id !== d.id)) {
                  if (context != null) {
                    context.addError(`"${input.trim()}" is ambiguous.`);
                  }
                  return;
                }
                device = d;
                negated = (s.trim() !== "present"); 
                return match = m.getFullMatch();
            });
      });
      
      if (match != null) {
        assert(device != null);
        assert(negated != null);
        assert(typeof match === "string");
        return {
          token: match,
          nextInput: input.substring(match.length),
          predicateHandler: new PresencePredicateHandler(device, negated)
        };
      } else {
        return null;
      }
    }
  }
  PresencePredicateProvider.initClass();

  class PresencePredicateHandler extends PredicateHandler {

    constructor(device, negated) {
      super();
      this.device = device;
      this.negated = negated;
      this.dependOnDevice(this.device);
    }
    setup() {
      this.presenceListener = p => { 
        return this.emit('change', (this.negated ? !p : p));
      };
      this.device.on('presence', this.presenceListener);
      return super.setup();
    }
    getValue() { 
      return this.device.getUpdatedAttributeValue('presence').then( 
        p => (this.negated ? !p : p)
      );
    }
    destroy() { 
      this.device.removeListener("presence", this.presenceListener);
      return super.destroy();
    }
    getType() { return 'state'; }
  }

  /*
  The Contact Predicate Provider
  ----------------
  Handles predicates of contact devices like

  * _device_ is opened
  * _device_ is closed
  *///
  class ContactPredicateProvider extends PredicateProvider {
    static initClass() {
  
      this.prototype.presets = [
        {
          name: "device is opened/closed",
          input: "{device} is opened"
        }
      ];
    }

    constructor(framework) {
      super();
      this.framework = framework;
    }

    parsePredicate(input, context) {

      let needle;
      const contactDevices = _(this.framework.deviceManager.devices).values()
        .filter(device => device.hasAttribute( 'contact')).value();

      let device = null;
      let negated = null;
      let match = null;

      const contactAcFilter = v => (needle = v.trim(), ['opened', 'closed'].includes(needle));

      M(input, context)
        .matchDevice(contactDevices, (next, d) => {
          return next.match(' is', {type: "static"})
            .match(
              [' open', ' close', ' opened', ' closed'], 
              {acFilter: contactAcFilter, type: "select"}, 
              (m, s) => {
                // Already had a match with another device?
                if ((device != null) && (device.id !== d.id)) {
                  if (context != null) {
                    context.addError(`"${input.trim()}" is ambiguous.`);
                  }
                  return;
                }
                device = d;
                negated = ((needle = s.trim(), ["opened", 'open'].includes(needle))); 
                return match = m.getFullMatch();
            });
      });
      
      if (match != null) {
        assert(device != null);
        assert(negated != null);
        assert(typeof match === "string");
        return {
          token: match,
          nextInput: input.substring(match.length),
          predicateHandler: new ContactPredicateHandler(device, negated)
        };
      } else {
        return null;
      }
    }
  }
  ContactPredicateProvider.initClass();

  class ContactPredicateHandler extends PredicateHandler {

    constructor(device, negated) {
      super();
      this.device = device;
      this.negated = negated;
      this.dependOnDevice(this.device);
    }
    setup() {
      this.contactListener = p => { 
        return this.emit('change', (this.negated ? !p : p));
      };
      this.device.on('contact', this.contactListener);
      return super.setup();
    }
    getValue() { return this.device.getUpdatedAttributeValue('contact').then(
      p => (this.negated ? !p : p)
    ); }
    destroy() { 
      this.device.removeListener("contact", this.contactListener);
      return super.destroy();
    }
    getType() { return 'state'; }
  }


  /*
  The Device-Attribute Predicate Provider
  ----------------
  Handles predicates for comparing device attributes like sensor values or other states:

  * _attribute_ of _device_ is equal to _value_
  * _attribute_ of _device_ equals _value_
  * _attribute_ of _device_ is not _value_
  * _attribute_ of _device_ is less than _value_
  * _attribute_ of _device_ is lower than _value_
  * _attribute_ of _device_ is greater than _value_
  * _attribute_ of _device_ is higher than _value_
  *///
  class DeviceAttributePredicateProvider extends PredicateProvider {
    static initClass() {
      
      this.prototype.presets = [
        {
          name: "attribute of a device",
          input: "{attribute} of {device} is equal to {value}"
        }
      ];
    }

    constructor(framework) {
      super();
      this.framework = framework;
    }

    // ### parsePredicate()
    parsePredicate(input, context) {

      const allAttributes = _(this.framework.deviceManager.getDevices())
        .map(device => _.keys(device.attributes))
        .flatten().uniq().value();

      let result = null;
      const matches = [];

      M(input, context)
      .match(
        allAttributes,
        {param: "attribute", wildcard: "{attribute}"},
        (m, attr) => {
          const info = {
            device: null,
            attributeName: null,
            comparator: null,
            referenceValue: null
          };
          info.attributeName = attr;
          const devices = _(this.framework.deviceManager.devices).values()
            .filter(device => device.hasAttribute(attr)).value();

          return m.match(' of ').matchDevice(devices, (next, device) => {
            info.device = device;
            if (!device.hasAttribute(attr)) { return; }
            const attribute = device.attributes[attr];
            const setComparator =  (m, c) => info.comparator = c;
            const setRefValue = (m, v) => info.referenceValue = v;
            const end =  () => matchCount++;

            if (attribute.type === types.boolean) {
              m = next.matchComparator('boolean', setComparator)
                .match(attribute.labels, {wildcard: '{value}'}, (m, v) => {
                  if (v === attribute.labels[0]) { return setRefValue(m, true);
                  } else if (v === attribute.labels[1]) { return setRefValue(m, false);
                  } else { return assert(false); }
              });
            } else if (attribute.type === types.number) {
              m = next.matchComparator('number', setComparator)
                .matchNumber({wildcard: '{value}'}, (m,v) => setRefValue(m, parseFloat(v)) );
              if ((attribute.unit != null) && (attribute.unit.length > 0)) { 
                const possibleUnits = _.uniq([
                  ` ${attribute.unit}`, 
                  `${attribute.unit}`, 
                  `${attribute.unit.toLowerCase()}`, 
                  ` ${attribute.unit.toLowerCase()}`,
                  `${attribute.unit.replace('°', '')}`, 
                  ` ${attribute.unit.replace('°', '')}`,
                  `${attribute.unit.toLowerCase().replace('°', '')}`, 
                  ` ${attribute.unit.toLowerCase().replace('°', '')}`,
                  ]);
                const autocompleteFilter = v => v === ` ${attribute.unit}`;
                m = m.match(possibleUnits, {optional: true, acFilter: autocompleteFilter});
              }
            } else if (attribute.type === types.string) {
              m = next.matchComparator('string', setComparator)
                .or([
                  ( m => m.matchString({wildcard: '{value}'}, setRefValue) ),
                  ( m => { 
                    if (attribute.enum != null) {
                      return m.match(attribute.enum, {wildcard: '{value}'}, setRefValue); 
                    } else { return M(null); } 
                  }
                  )
                ]);
            }
            if (m.hadMatch()) {
              matches.push(m.getFullMatch());
              if (result != null) {
                if ((result.device.id !== info.device.id) || 
                (result.attributeName !== info.attributeName)) {
                  if (context != null) {
                    context.addError(`"${input.trim()}" is ambiguous.`);
                  }
                }
              }
              return result = info;
            }
          });
      });

      if (result != null) {
        assert(result.device != null);
        assert(result.attributeName != null);
        assert(result.comparator != null);
        assert(result.referenceValue != null);
        // take the longest match
        const match = _(matches).sortBy( s => s.length ).last();
        assert(typeof match === "string"); 

        return {
          token: match,
          nextInput: input.substring(match.length),
          predicateHandler: new DeviceAttributePredicateHandler(
            result.device, result.attributeName, result.comparator, result.referenceValue
          )
        };
      }
        
      return null;
    }
  }
  DeviceAttributePredicateProvider.initClass();


  class DeviceAttributePredicateHandler extends PredicateHandler {

    constructor(device, attribute, comparator, referenceValue) {
      super();
      this.device = device;
      this.attribute = attribute;
      this.comparator = comparator;
      this.referenceValue = referenceValue;
      this.dependOnDevice(this.device);
    }

    setup() {
      let lastState = null;
      this.attributeListener = value => {
        const state = this._compareValues(this.comparator, value, this.referenceValue);
        if (state !== lastState) {
          lastState = state;
          return this.emit('change', state);
        }
      };
      this.device.on(this.attribute, this.attributeListener);
      return super.setup();
    }
    getValue() { 
      return this.device.getUpdatedAttributeValue(this.attribute).then( value => {
        return this._compareValues(this.comparator, value, this.referenceValue);
      });
    }
    destroy() { 
      this.device.removeListener(this.attribute, this.attributeListener);
      return super.destroy();
    }
    getType() { return 'state'; }

    // ### _compareValues()
    /*
    Does the comparison.
    */
    _compareValues(comparator, value, referenceValue) {
      if (typeof referenceValue === "number") {
        value = parseFloat(value);
      }
      const result = (() => { switch (comparator) {
        case '==': return value === referenceValue;
        case '!=': return value !== referenceValue;
        case '<': return value < referenceValue;
        case '>': return value > referenceValue;
        case '<=': return value <= referenceValue;
        case '>=': return value >= referenceValue;
        default: throw new Error(`Unknown comparator: ${comparator}`);
      } })();
      return result;
    }
  }


  /*
  The Device-Attribute Watchdog Provider
  ----------------
  Handles predicates that will become true if a attribute of a device was not updated for a
  certain time.

  * _attribute_ of _device_ was not updated for _time_
  *///
  class DeviceAttributeWatchdogProvider extends PredicateProvider {
    static initClass() {
  
      this.prototype.presets = [
        {
          name: "attribute of a device not updated",
          input: "{attribute} of {device} was not updated for {duration} minutes"
        }
      ];
    }

    constructor(framework) {
      super();
      this.framework = framework;
    }

    // ### parsePredicate()
    parsePredicate(input, context) {

      const allAttributes = _(this.framework.deviceManager.getDevices())
        .map(device => _.keys(device.attributes))
        .flatten().uniq().value();

      let result = null;
      let match = null;

      M(input, context)
      .match(allAttributes, {wildcard: "{attribute}", type: "select"}, (m, attr) => {
        const info = {
          device: null,
          attributeName: null,
          timeMs: null
        };

        info.attributeName = attr;
        const devices = _(this.framework.deviceManager.devices).values()
          .filter( device => device.hasAttribute(attr) ).value();
        return m.match(' of ').matchDevice(devices, (m, device) => {
          info.device = device;
          if (!device.hasAttribute(attr)) { return; }
          const attribute = device.attributes[attr];

          return m.match(' was not updated for ', {type: "static"})
            .matchTimeDuration({wildcard: "{duration}", type: "text"}, (m, {time, unit, timeMs}) => {
              info.timeMs = timeMs;
              result = info;
              return match = m.getFullMatch();
            });
        });
      });

      if (result != null) {
        assert(result.device != null);
        assert(result.attributeName != null);
        assert(result.timeMs != null);

        return {
          token: match,
          nextInput: input.substring(match.length),
          predicateHandler: new DeviceAttributeWatchdogPredicateHandler(
            result.device, result.attributeName, result.timeMs
          )
        };
      }
        
      return null;
    }
  }
  DeviceAttributeWatchdogProvider.initClass();


  class DeviceAttributeWatchdogPredicateHandler extends PredicateHandler {

    constructor(device, attribute, timeMs) {
      super();
      this.device = device;
      this.attribute = attribute;
      this.timeMs = timeMs;
      this.dependOnDevice(this.device);
    }
    setup() {
      this._state = false;
      this._rescheduleTimeout();
      this.attributeListener = ( () => { 
        if (this._state === true) {
          this._state = false;
          this.emit('change', false);
        }
        return this._rescheduleTimeout(); 
      }
      );
      this.device.on(this.attribute, this.attributeListener);
      return super.setup();
    }
    getValue() { return Promise.resolve(this._state); }
    destroy() { 
      this.device.removeListener(this.attribute, this.attributeListener);
      clearTimeout(this._timer);
      return super.destroy();
    }
    getType() { return 'state'; }

    _rescheduleTimeout() {
      clearTimeout(this._timer);
      return this._timer = setTimeout( ( () => {
        this._state = true;
        return this.emit('change', true); 
      }
      ), this.timeMs);
    }
  }

  /*
  The Variable Predicate Provider
  ----------------
  Handles comparison of variables
  *///
  class VariablePredicateProvider extends PredicateProvider {
    static initClass() {
  
      this.prototype.presets = [
          {
            name: "Variable comparison",
            input: "{expr} = {expr}"
          }
        ];
    }

    constructor(framework) {
      super();
      this.framework = framework;
    }

    parsePredicate(input, context) {
      let result = null;

      M(input, context)
        .matchAnyExpression( (next, leftTokens) => {
          return next.matchComparator('number', (next, comparator) => {
            return next.matchAnyExpression( (next, rightTokens) => {
              return result = {
                leftTokens,
                rightTokens,
                comparator,
                match: next.getFullMatch()
              };
            });
          });
        });
      
      if (result != null) {
        assert(Array.isArray(result.leftTokens));
        assert(Array.isArray(result.rightTokens));
        assert(['==', '!=', '<', '>', '<=', '>='].includes(result.comparator));
        assert(typeof result.match === "string");

        const variables = this.framework.variableManager.extractVariables(
          result.leftTokens.concat(result.rightTokens)
        );
        for (let v of Array.from((variables != null))) {
          if (!this.framework.variableManager.isVariableDefined(v)) {
            context.addError(`Variable $${v} is not defined.`);
            return null;
          }
        }

        return {
          token: result.match,
          nextInput: input.substring(result.match.length),
          predicateHandler: new VariablePredicateHandler(
            this.framework, result.leftTokens, result.rightTokens, result.comparator
          )
        };
      } else {
        return null;
      }
    }
  }
  VariablePredicateProvider.initClass();

  class VariablePredicateHandler extends PredicateHandler {

    constructor(framework, leftTokens, rightTokens, comparator) {
      super();
      this.framework = framework;
      this.leftTokens = leftTokens;
      this.rightTokens = rightTokens;
      this.comparator = comparator;
    }

    setup() {
      this.lastState = null;
      this.variables = this.framework.variableManager.extractVariables(
        this.leftTokens.concat(this.rightTokens)
      );
      for (let variable of Array.from(this.variables)) {
        this.dependOnVariable(this.framework.variableManager, variable);
      }
      this.changeListener = (variable, value) => {
        if (!Array.from(this.variables).includes(variable.name)) { return; }
        const evalPromise = this._evaluate();
        return evalPromise.then( state => {
          if (state !== this.lastState) {
            this.lastState = state;
            return this.emit('change', state);
          }
        }).catch( error => {
          env.logger.error("Error in VariablePredicateHandler:", error.message);
          return env.logger.debug(error);
        });
      };
      
      this.framework.variableManager.on("variableValueChanged", this.changeListener);
      return super.setup();
    }
    getValue() { 
      return this._evaluate();
    }
    destroy() { 
      this.framework.variableManager.removeListener("variableValueChanged", this.changeListener);
      return super.destroy();
    }
    getType() { return 'state'; }

    _evaluate() {
      const leftPromise = this.framework.variableManager.evaluateExpression(this.leftTokens);
      const rightPromise = this.framework.variableManager.evaluateExpression(this.rightTokens);
      return Promise.all([leftPromise, rightPromise]).then( (...args) => {
        let state;
        const [leftValue, rightValue] = Array.from(args[0]);
        return state = this._compareValues(leftValue, rightValue);
      });
    }

    // ### _compareValues()
    /*
    Does the comparison.
    */
    _compareValues(left, right) {
      if (["<", ">", "<=", ">="].includes(this.comparator)) {
        if (typeof left === "string") {
          if (isNaN(left)) {
            throw new Error(`Can not compare strings with ${this.comparator}!`);
          }
          left = parseFloat(left);
        }
        if (typeof right === "string") {
          if (isNaN(right)) {
            throw new Error(`Can not compare strings with ${this.comparator}!`);
          }
          right = parseFloat(right);
        }
      }

      switch (this.comparator) {
        case '==': return left === right;
        case '!=': return left !== right;
        case '<': return left < right;
        case '>': return left > right;
        case '<=': return left <= right;
        case '>=': return left >= right;
        default: throw new Error(`Unknown comparator: ${this.comparator}`);
      }
    }
  }


  class VariableUpdatedPredicateProvider extends PredicateProvider {
    static initClass() {
  
      this.prototype.presets = [
          {
            name: "Variable changes",
            input: "{variable} changes"
          },
          {
            name: "Variable increased/decreased",
            input: "{variable} increased"
          }
        ];
    }

    constructor(framework) {
      super();
      this.framework = framework;
    }

    parsePredicate(input, context) {
      let variableName = null;
      let mode = null;

      const setVariableName = (next, name) => variableName = name.substring(1);
      const setMode = (next, match) => mode = match.trim();

      const m = M(input, context)
        .matchVariable(setVariableName)
        .match([
          " changes", " gets updated", 
          " increased", " decreased", 
          " is increasing", " is decreasing"
        ], setMode);

      if (m.hadMatch()) {
        const match = m.getFullMatch();
        assert(typeof variableName === "string");
        assert(mode != null);
        return {
          token: match,
          nextInput: input.substring(match.length),
          predicateHandler: new VariableUpdatedPredicateHandler(
            this.framework, variableName, mode
          )
        };
      } else {
        return null;
      }
    }
  }
  VariableUpdatedPredicateProvider.initClass();

  class VariableUpdatedPredicateHandler extends PredicateHandler {

    constructor(framework, variableName, mode) {
      super();
      this.framework = framework;
      this.variableName = variableName;
      this.mode = mode;
    }

    setup() {
      this.lastValue = null;
      this.state = false;
      this.dependOnVariable(this.framework.variableManager, this.variableName);
      this.changeListener = (variable, value) => {
        if (variable.name !== this.variableName) { return; }
        switch (this.mode) {
          case 'changes':
            if (this.lastValue !== value) {
              this.emit('change', "event");
            }
            break;
          case 'gets updated':
            this.emit('change', "event");
            break;
          case 'increased':
            if (value > this.lastValue) {
              this.emit('change', "event");
            }
            break;
          case 'decreased':
            if (value < this.lastValue) {
              this.emit('change', "event");
            }
            break;
          case 'is increasing':
            if (value > this.lastValue) {
              if (!this.state) {
                this.state = true;
                this.emit('change', true);
              }
            } else {
              if (this.state) {
                this.state = false;
                this.emit('change', false);
              }
            }
            break;
          case 'is decreasing':
            if (value < this.lastValue) {
              if (!this.state) {
                this.state = true;
                this.emit('change', true);
              }
            } else {
              if (this.state) {
                this.state = false;
                this.emit('change', false);
              }
            }
            break;
        }
        return this.lastValue = value;
      };
       
      this.framework.variableManager.on("variableValueChanged", this.changeListener);
      return super.setup();
    }
    getValue() { return Promise.resolve(this.state); }
    destroy() {
      this.framework.variableManager.removeListener("variableValueChanged", this.changeListener);
      return super.destroy();
    }
    getType() { 
      switch (this.mode) {
        case 'is increasing': case 'is decreasing': return 'state';
        default: return 'event';
      }
    }
  }

  class ButtonPredicateProvider extends PredicateProvider {
    static initClass() {
  
      this.prototype.presets = [
          {
            name: "Button pressed",
            input: "{button} is pressed"
          }
        ];
    }

    constructor(framework) {
      super();
      this.framework = framework;
    }

    parsePredicate(input, context) {

      let matchCount = 0;
      let matchingDevice = null;
      let matchingButtonId = null;
      const end = () => matchCount++;
      const onButtonMatch = (m, {device, buttonId}) => {
        matchingDevice = device;
        return matchingButtonId = buttonId;
      };

      const buttonsWithId = []; 

      for (let id in this.framework.deviceManager.devices) {
        const d = this.framework.deviceManager.devices[id];
        if (!(d instanceof env.devices.ButtonsDevice)) { continue; }
        for (let b of Array.from(d.config.buttons)) {
          buttonsWithId.push([{device: d, buttonId: b.id}, b.id]);
          if (b.id !== b.text) { buttonsWithId.push([{device: d, buttonId: b.id}, b.text]); }
        }
      }

      const m = M(input, context)
        .match('the ', {optional: true})
        .match(
          buttonsWithId, 
          {wildcard: "{button}"},
          onButtonMatch
        )
        .match(' button', {optional: true})
        .match(' is', {optional: true})
        .match(' pressed');

      if (m.hadMatch()) {
        const match = m.getFullMatch();
        return {
          token: match,
          nextInput: input.substring(match.length),
          predicateHandler: new ButtonPredicateHandler(this, matchingDevice, matchingButtonId)
        };
      }
      return null;
    }
  }
  ButtonPredicateProvider.initClass();

  class ButtonPredicateHandler extends PredicateHandler {

    constructor(provider, device, buttonId) {
      super();
      this.provider = provider;
      this.device = device;
      this.buttonId = buttonId;
      assert((this.device != null) && this.device instanceof env.devices.ButtonsDevice);
      assert((this.buttonId != null) && (typeof this.buttonId === "string"));
      this.dependOnDevice(this.device);
    }
      
    setup() {
      this.buttonPressedListener = ( id => {
        if (id === this.buttonId) {
          return this.emit('change', 'event');
        }
      }
      );
      this.device.on('button', this.buttonPressedListener);
      return super.setup();
    }

    getValue() { return Promise.resolve(false); }
    destroy() { 
      this.device.removeListener('button', this.buttonPressedListener);
      return super.destroy();
    }
    getType() { return 'event'; }
  }


  class StartupPredicateProvider extends PredicateProvider {
    static initClass() {
  
      this.prototype.presets = [
          {
            name: "pimatic is starting",
            input: "pimatic is starting"
          }
        ];
    }

    constructor(framework) {
      super();
      this.framework = framework;
    }

    parsePredicate(input, context) {
      const m = M(input, context).match(["pimatic is starting"]);

      if (m.hadMatch()) {
        const match = m.getFullMatch();
        return {
          token: match,
          nextInput: input.substring(match.length),
          predicateHandler: new StartupPredicateHandler(this.framework)
        };
      } else {
        return null;
      }
    }
  }
  StartupPredicateProvider.initClass();

  class StartupPredicateHandler extends PredicateHandler {

    constructor(framework) {
      super();
      this.framework = framework;
    }

    setup() {
      this.framework.once("after init", () => {
        return this.emit('change', "event");
      });
      return super.setup();
    }
    getValue() { return Promise.resolve(false); }
    getType() { return 'event'; }
  }

  return exports = {
    PredicateProvider,
    PredicateHandler,
    PresencePredicateProvider,
    SwitchPredicateProvider,
    DeviceAttributePredicateProvider,
    VariablePredicateProvider,
    VariableUpdatedPredicateProvider,
    ContactPredicateProvider,
    ButtonPredicateProvider,
    DeviceAttributeWatchdogProvider,
    StartupPredicateProvider
  };
};
