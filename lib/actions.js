/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Action Provider
=================
A Action Provider can parse a action of a rule string and returns an Action Handler for that.
The Action Handler offers a `executeAction` method to execute the action. 
For actions and rule explanations take a look at the [rules file](rules.html).
*/

const { __ } = require("i18n");
const Promise = require('bluebird');
const assert = require('cassert');
const _ = require('lodash');
const S = require('string');
const M = require('./matcher');

module.exports = function(env) {

  /*
  The ActionProvider
  ----------------
  The base class for all Action Providers. If you want to provide actions in your plugin then 
  you should create a sub class that implements the `parseAction` function.
  */
  let exports;
  class ActionProvider {

    // ### parseAction()
    /*
    This function should parse the given input string `input` and return an ActionHandler if 
    handled by the input of described action, otherwise it should return `null`.
    */
    constructor() {
      this.parseAction = this.parseAction.bind(this);
    }

    parseAction(input, context) { 
      throw new Error("Your ActionProvider must implement parseAction");
    }
  }

  /*
  The Action Handler
  ----------------
  The base class for all Action Handler. If you want to provide actions in your plugin then 
  you should create a sub class that implements a `executeAction` function.
  */
  class ActionHandler extends require('events').EventEmitter {

    // ### executeAction()
    /*
    Ìt should return a promise that gets fulfilled with describing string, that explains what was 
    done or would be done.

    If `simulate` is `true` the Action Handler should not execute the action. It should just
    return a promise fulfilled with a descriptive string like "would _..._".

    Take a look at the Log Action Handler for a simple example.
    */
    constructor(...args) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.executeAction = this.executeAction.bind(this);
      this.hasRestoreAction = this.hasRestoreAction.bind(this);
      this.executeRestoreAction = this.executeRestoreAction.bind(this);
      super(...args);
    }

    executeAction(simulate) {
      throw new Error("Should be implemented by a subclass");  
    }

    hasRestoreAction() { return false; }

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

    executeRestoreAction(simulate) {
      throw new Error(
        "executeRestoreAction must be implemented when hasRestoreAction returns true"
      );
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
  The Log Action Provider
  -------------
  Provides log action, so that rules can use `log "some string"` in the actions part. It just prints
  the given string to the logger.
  */
  class LogActionProvider extends ActionProvider {

    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.framework = framework;
    }

    parseAction(input, context) {
      let stringToLogTokens = null;
      const fullMatch = false;

      const setLogString = (m, tokens) => stringToLogTokens = tokens;

      const m = M(input, context)
        .match("log ")
        .matchStringWithVars(setLogString);

      if (m.hadMatch()) {
        const match = m.getFullMatch();
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new LogActionHandler(this.framework, stringToLogTokens)
        };
      } else {
        return null;
      }
    }
  }

  class LogActionHandler extends ActionHandler { 

    constructor(framework, stringToLogTokens) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.framework = framework;
      this.stringToLogTokens = stringToLogTokens;
    }

    executeAction(simulate, context) {
      return this.framework.variableManager.evaluateStringExpression(this.stringToLogTokens).then( strToLog => {
        if (simulate) {
          // just return a promise fulfilled with a description about what we would do.
          return __("would log \"%s\"", strToLog);
        } else {
          // else we should log the string.
          // But we don't do this because the framework logs the description anyway. So we would 
          // doubly log it.
          //env.logger.info stringToLog
          return strToLog;
        }
      });
    }
  }


  /*
  The SetVariable ActionProvider
  -------------
  Provides log action, so that rules can use `log "some string"` in the actions part. It just prints
  the given string to the logger.
  */
  class SetVariableActionProvider extends ActionProvider {

    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.framework = framework;
    }

    parseAction(input, context) {
      let match;
      let result = null;

      const varsAndFunsWriteable =  this.framework.variableManager.getVariablesAndFunctions({readonly: false});
      M(input, context)
        .match("set ", {optional: true})
        .matchVariable(varsAndFunsWriteable, (next, variableName) => {
          return next.match([" to ", " := ", " = "], next => {
            return next.or([
              ( next => {
                  return next.matchNumericExpression( (next, rightTokens) => { 
                    match = next.getFullMatch();
                    variableName = variableName.substring(1);
                    return result = { variableName, rightTokens, match };
                  });
                }
              ),
              ( next => {
                  return next.matchStringWithVars( (next, rightTokens) => { 
                    match = next.getFullMatch();
                    variableName = variableName.substring(1);
                    return result = { variableName, rightTokens, match };
                  });
                }
              )
            ]);
          });
        });

      if (result != null) {
        const variables = this.framework.variableManager.extractVariables(result.rightTokens);
        if (!this.framework.variableManager.isVariableDefined(result.variableName)) {
          context.addError(`Variable $${result.variableName} is not defined.`);
          return null;
        }
        for (let v of Array.from((variables != null))) {
          if (!this.framework.variableManager.isVariableDefined(v)) {
            context.addError(`Variable $${v} is not defined.`);
            return null;
          }
        }
        return {
          token: result.match,
          nextInput: input.substring(result.match.length),
          actionHandler: new SetVariableActionHandler(
            this.framework, result.variableName, result.rightTokens
          )
        };
      } else {
        return null;
      }
    }
  }

  class SetVariableActionHandler extends ActionHandler { 

    constructor(framework, variableName, rightTokens) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.framework = framework;
      this.variableName = variableName;
      this.rightTokens = rightTokens;
    }

    setup() {
      this.dependOnVariable(this.framework.variableManager, this.variableName);
      return super.setup();
    }

    executeAction(simulate, context) {
      if (simulate) {
        // just return a promise fulfilled with a description about what we would do.
        return Promise.resolve(__("would set $%s to value of %s", this.variableName, 
          _(this.rightTokens).reduce( (left, right) => `${left} ${right}` )
        )
        );
      } else {
        return this.framework.variableManager.evaluateExpression(this.rightTokens).then( value => {
          this.framework.variableManager.setVariableToValue(this.variableName, value);
          return Promise.resolve(`set $${this.variableName} to ${value}`);
        });
      }
    }
  }

        
  /*
  The SetPresence ActionProvider
  -------------
  Provides set presence action, so that rules can use `set presence of <device> to present|absent` 
  in the actions part.
  */
  class SetPresenceActionProvider extends ActionProvider {

    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.framework = framework;
    }

    parseAction(input, context) {
      const retVar = null;

      const presenceDevices = _(this.framework.deviceManager.devices).values().filter( 
        device => device.hasAction("changePresenceTo")
      ).value();
      
      let device = null;
      let state = null;
      let match = null;
      
      const m = M(input, context).match(['set presence of ']);
      
      m.matchDevice(presenceDevices, (m, d) =>
        m.match([' present', ' absent'], function(m, s) {
          // Already had a match with another device?
          if ((device != null) && (device.id !== d.id)) {
            if (context != null) {
              context.addError(`"${input.trim()}" is ambiguous.`);
            }
            return;
          }
          device = d;
          state = s.trim();
          return match = m.getFullMatch();
        })
      );
      
      if (match != null) {
        assert(device != null);
        assert(['present', 'absent'].includes(state));
        assert(typeof match === "string");
        state = (state === 'present');
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new PresenceActionHandler(device, state)
        };
      } else {
        return null;
      }
    }
  }
        
  class PresenceActionHandler extends ActionHandler { 

    constructor(device, state) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this._doExecuteAction = this._doExecuteAction.bind(this);
      this.executeAction = this.executeAction.bind(this);
      this.executeRestoreAction = this.executeRestoreAction.bind(this);
      this.device = device;
      this.state = state;
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    /*
    Handles the above actions.
    */
    _doExecuteAction(simulate, state) {
      return (
        simulate ?
          state ? Promise.resolve(__("would set presence of %s to present", this.device.name))
          : Promise.resolve(__("would set presence of %s to absent", this.device.name))
        :
          state ? this.device.changePresenceTo(state).then( () => { 
            return __("set presence of %s to present", this.device.name); 
        })
          : this.device.changePresenceTo(state).then( () => { 
            return __("set presence %s to absent", this.device.name); 
        })
      );
    }

    // ### executeAction()
    executeAction(simulate) { return this._doExecuteAction(simulate, this.state); }
    // ### hasRestoreAction()
    hasRestoreAction() { return true; }
    // ### executeRestoreAction()
    executeRestoreAction(simulate) { return this._doExecuteAction(simulate, (!this.state)); }
  }

  /*
  The open/close ActionProvider
  -------------
  Provides open/close action, for the DummyContactSensor.
  */
  class ContactActionProvider extends ActionProvider {

    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.framework = framework;
    }

    parseAction(input, context) {
      const retVar = null;

      const contactDevices = _(this.framework.deviceManager.devices).values().filter( 
        device => device.hasAction("changeContactTo")
      ).value();
      
      let device = null;
      let state = null;
      let match = null;
      
      const m = M(input, context).match(['open ', 'close '], (m, a) => {
        return m.matchDevice(contactDevices, function(m, d) {
          if ((device != null) && (device.id !== d.id)) {
            if (context != null) {
              context.addError(`"${input.trim()}" is ambiguous.`);
            }
            return;
          }
          device = d;
          state = a.trim();
          return match = m.getFullMatch();
        });
      });
      
      if (match != null) {
        assert(device != null);
        assert(['open', 'close'].includes(state));
        assert(typeof match === "string");
        state = (state === 'close');
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new ContactActionHandler(device, state)
        };
      } else {
        return null;
      }
    }
  }


  class ContactActionHandler extends ActionHandler { 

    constructor(device, state) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this._doExecuteAction = this._doExecuteAction.bind(this);
      this.executeAction = this.executeAction.bind(this);
      this.executeRestoreAction = this.executeRestoreAction.bind(this);
      this.device = device;
      this.state = state;
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    /*
    Handles the above actions.
    */
    _doExecuteAction(simulate, state) {
      return (
        simulate ?
          state ? Promise.resolve(__("would set contact %s to closed", this.device.name))
          : Promise.resolve(__("would set contact %s to opened", this.device.name))
        :
          state ? this.device.changeContactTo(state).then( () => {
            return __("set contact %s to closed", this.device.name); 
        })
          : this.device.changeContactTo(state).then( () => {
            return __("set contact %s to opened", this.device.name); 
        })
      );
    }

    // ### executeAction()
    executeAction(simulate) { return this._doExecuteAction(simulate, this.state); }
    // ### hasRestoreAction()
    hasRestoreAction() { return true; }
    // ### executeRestoreAction()
    executeRestoreAction(simulate) { return this._doExecuteAction(simulate, (!this.state)); }
  }

        
  /*
  The Switch Action Provider
  -------------
  Provides the ability to switch devices on or off. Currently it handles the following actions:

  * switch [the] _device_ on|off
  * turn [the] _device_ on|off
  * switch on|off [the] _device_ 
  * turn on|off [the] _device_ 

  where _device_ is the name or id of a device and "the" is optional.
  */
  class SwitchActionProvider extends ActionProvider {

    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework;
    }

    // ### parseAction()
    /*
    Parses the above actions.
    */
    parseAction(input, context) {
      // The result the function will return:
      const retVar = null;

      const switchDevices = _(this.framework.deviceManager.devices).values().filter( 
        device => device.hasAction("turnOn") && device.hasAction("turnOff") 
      ).value();

      let device = null;
      let state = null;
      let match = null;

      // Try to match the input string with: turn|switch ->
      const m = M(input, context).match(['turn ', 'switch ']);

      // device name -> on|off
      m.matchDevice(switchDevices, (m, d) =>
        m.match([' on', ' off'], function(m, s) {
          // Already had a match with another device?
          if ((device != null) && (device.id !== d.id)) {
            if (context != null) {
              context.addError(`"${input.trim()}" is ambiguous.`);
            }
            return;
          }
          device = d;
          state = s.trim();
          return match = m.getFullMatch();
        })
      );

      // on|off -> deviceName
      m.match(['on ', 'off '], (m, s) =>
        m.matchDevice(switchDevices, function(m, d) {
          // Already had a match with another device?
          if ((device != null) && (device.id !== d.id)) {
            if (context != null) {
              context.addError(`"${input.trim()}" is ambiguous.`);
            }
            return;
          }
          device = d;
          state = s.trim();
          return match = m.getFullMatch();
        })
      );

      if (match != null) {
        assert(device != null);
        assert(['on', 'off'].includes(state));
        assert(typeof match === "string");
        state = (state === 'on');
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new SwitchActionHandler(device, state)
        };
      } else {
        return null;
      }
    }
  }

  class SwitchActionHandler extends ActionHandler {

    constructor(device, state) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this._doExecuteAction = this._doExecuteAction.bind(this);
      this.executeAction = this.executeAction.bind(this);
      this.executeRestoreAction = this.executeRestoreAction.bind(this);
      this.device = device;
      this.state = state;
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    /*
    Handles the above actions.
    */
    _doExecuteAction(simulate, state) {
      return (
        simulate ?
          state ? Promise.resolve(__("would turn %s on", this.device.name))
          : Promise.resolve(__("would turn %s off", this.device.name))
        :
          state ? this.device.turnOn().then( () => __("turned %s on", this.device.name) )
          : this.device.turnOff().then( () => __("turned %s off", this.device.name) )
      );
    }

    // ### executeAction()
    executeAction(simulate) { return this._doExecuteAction(simulate, this.state); }
    // ### hasRestoreAction()
    hasRestoreAction() { return true; }
    // ### executeRestoreAction()
    executeRestoreAction(simulate) { return this._doExecuteAction(simulate, (!this.state)); }
  }

  /*
  The Toggle Action Provider
  -------------
  Provides the ability to toggle switch devices on or off. 
  Currently it handles the following actions:

  * toggle the state of _device_
  * toggle the state of [the] _device_
  * toggle _device_ state 
  * toggle  [the] _device_ state

  where _device_ is the name or id of a device and "the" is optional.
  */
  class ToggleActionProvider extends ActionProvider {

    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework;
    }

    // ### parseAction()
    /*
    Parses the above actions.
    */
    parseAction(input, context) {
      // The result the function will return:
      const retVar = null;

      const switchDevices = _(this.framework.deviceManager.devices).values().filter( 
        device => device.hasAction("toggle")
      ).value();

      if (switchDevices.length === 0) { return; }

      let device = null;
      let match = null;

      const onDeviceMatch = ( function(m, d) { device = d; return match = m.getFullMatch();  });

      const m = M(input, context)
        .match('toggle ')
        .or([
          ( m => { 
            return m.match('the state of ', {optional: true})
              .matchDevice(switchDevices, onDeviceMatch);
          }
          ),
          ( m => { 
            return m.matchDevice(switchDevices, (m, d) => m.match(' state', {optional: true}, m=> onDeviceMatch(m, d)));
          }
          )
        ]);
        
      if (match != null) {
        assert(device != null);
        assert(typeof match === "string");
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new ToggleActionHandler(device)
        };
      } else {
        return null;
      }
    }
  }

  class ToggleActionHandler extends ActionHandler {

    constructor(device) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.executeAction = this.executeAction.bind(this);
      this.device = device; //nop
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    // ### executeAction()
    executeAction(simulate) { 
      return (
        simulate ?
          Promise.resolve(__("would toggle state of %s", this.device.name))
        :
          this.device.toggle().then( () => __("toggled state of %s", this.device.name) )
      );
    }
  }

  /*
  The Button Action Provider
  -------------
  Provides the ability to press the button of a buttonsdevices.
  Currently it handles the following actions:

  * press [the] _device_

  where _device_ is the name or id of a the button not the buttons device and "the" is optional.
  */
  class ButtonActionProvider extends ActionProvider {

    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework;
    }

    // ### parseAction()
    /*
    Parses the above actions.
    */
    parseAction(input, context) {
      // The result the function will return:
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
        .match('press ')
        .match('the ', {optional: true})
        .match('button ', {optional: true})
        .match(
          buttonsWithId, 
          {wildcard: "{button}"},
          onButtonMatch
        );

      const match = m.getFullMatch();
      if (match != null) {
        assert(matchingDevice != null);
        assert(matchingButtonId != null);
        assert(typeof match === "string");
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new ButtonActionHandler(matchingDevice, matchingButtonId)
        };
      } else {
        return null;
      }
    }
  }

  class ButtonActionHandler extends ActionHandler {

    constructor(device, buttonId) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this._doExecuteAction = this._doExecuteAction.bind(this);
      this.executeAction = this.executeAction.bind(this);
      this.device = device;
      this.buttonId = buttonId;
      assert((this.device != null) && this.device instanceof env.devices.ButtonsDevice);
      assert((this.buttonId != null) && (typeof this.buttonId === "string"));
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    /*
    Handles the above actions.
    */
    _doExecuteAction(simulate) {
      return (
        simulate ?
          Promise.resolve(__("would press button %s of device %s", this.buttonId, this.device.id))
        :
          this.device.buttonPressed(this.buttonId)
            .then( () => __("press button %s of device %s", this.buttonId, this.device.id) )
      );
    }

    // ### executeAction()
    executeAction(simulate) { return this._doExecuteAction(simulate); }
    // ### hasRestoreAction()
    hasRestoreAction() { return false; }
  }

  /*
  The Shutter Action Provider
  -------------
  Provides the ability to raise or lower a shutter

  * lower [the] _device_ [down]
  * raise [the] _device_ [up]
  * move [the] _device_ up|down

  where _device_ is the name or id of a device and "the" is optional.
  */
  class ShutterActionProvider extends ActionProvider {

    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework;
    }

    // ### parseAction()
    /*
    Parses the above actions.
    */
    parseAction(input, context) {

      const shutterDevices = _(this.framework.deviceManager.devices).values().filter( 
        device => device.hasAction("moveUp") && device.hasAction("moveDown") 
      ).value();

      let device = null;
      let position = null;
      let match = null;

      // Try to match the input string with: raise|up ->
      const m = M(input, context).match(['raise ', 'lower ', 'move '], (m, a) => {
        // device name -> up|down
        return m.matchDevice(shutterDevices, function(m, d) {
          let [p, nt] = Array.from(((() => { 
            switch (a.trim()) { 
              case 'raise': return ['up', ' up'];
              case 'lower': return ['down', ' down'];
              default: return [null, [" up", " down"] ];
          
            } })()));
          const last = m.match(nt, {optional: a.trim() !== 'move'}, (m, po) => p = po.trim());
          if (last.hadMatch()) {
             // Already had a match with another device?
            if ((device != null) && (device.id !== d.id)) {
              if (context != null) {
                context.addError(`"${input.trim()}" is ambiguous.`);
              }
              return;
            }
            device = d;
            position = p;
            return match = last.getFullMatch();
          }
        });
      });

      if (match != null) {
        assert(device != null);
        assert(['down', 'up'].includes(position));
        assert(typeof match === "string");
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new ShutterActionHandler(device, position)
        };
      } else {
        return null;
      }
    }
  }

  class ShutterActionHandler extends ActionHandler {

    constructor(device, position) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.executeAction = this.executeAction.bind(this);
      this.executeRestoreAction = this.executeRestoreAction.bind(this);
      this.device = device;
      this.position = position;
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    // ### executeAction()
    executeAction(simulate) { 
      return (
        simulate ?
          this.position === 'up' ? Promise.resolve(__("would raise %s", this.device.name))
          : Promise.resolve(__("would lower %s", this.device.name))
        :
          this.position === 'up' ? this.device.moveUp().then( () => __("raised %s", this.device.name) )
          : this.device.moveDown().then( () => __("lowered %s", this.device.name) )
      );
    }
    // ### hasRestoreAction()
    hasRestoreAction() { return this.device.hasAction('stop'); }
    // ### executeRestoreAction()
    executeRestoreAction(simulate) { 
      if (simulate) { return Promise.resolve(__("would stop %s", this.device.name));
      } else { return this.device.stop().then( () =>  __("stopped %s", this.device.name) ); }
    }
  }

  /*
  The Shutter Stop Action Provider
  -------------
  Provides the ability to stop a shutter

  * stop [the] _device_

  where _device_ is the name or id of a device and "the" is optional.
  */
  class StopShutterActionProvider extends ActionProvider {

    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework;
    }

    // ### parseAction()
    /*
    Parses the above actions.
    */
    parseAction(input, context) {

      const shutterDevices = _(this.framework.deviceManager.devices).values().filter( 
        // only match Shutter devices and not media players
        device => device.hasAction("stop") && device.hasAction("moveUp")
      ).value();

      let device = null;
      let match = null;

      // Try to match the input string with: stop ->
      const m = M(input, context).match("stop ", (m, a) => {
        // device name -> up|down
        return m.matchDevice(shutterDevices, function(m, d) {
          // Already had a match with another device?
          if ((device != null) && (device.id !== d.id)) {
            if (context != null) {
              context.addError(`"${input.trim()}" is ambiguous.`);
            }
            return;
          }
          device = d;
          return match = m.getFullMatch();
        });
      });

      if (match != null) {
        assert(device != null);
        assert(typeof match === "string");
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new StopShutterActionHandler(device)
        };
      } else {
        return null;
      }
    }
  }

  class StopShutterActionHandler extends ActionHandler {

    constructor(device) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.executeAction = this.executeAction.bind(this);
      this.device = device;
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    // ### executeAction()
    executeAction(simulate) { 
      return (
        simulate ?
          Promise.resolve(__("would stop %s", this.device.name))
        :
          this.device.stop().then( () => __("stopped %s", this.device.name) )
      );
    }
    // ### hasRestoreAction()
    hasRestoreAction() { return false; }
  }

  /*
  The Dimmer Action Provider
  -------------
  Provides the ability to change the dim level of dimmer devices. Currently it handles the 
  following actions:

  * dim [the] _device_ to _value_%

  where _device_ is the name or id of a device and "the" is optional.
  */
  class DimmerActionProvider extends ActionProvider {

    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework;
    }

    // ### parseAction()
    /*
    Parses the above actions.
    */
    parseAction(input, context) {
      // The result the function will return:
      const retVar = null;

      const dimmers = _(this.framework.deviceManager.devices).values().filter( 
        device => device.hasAction("changeDimlevelTo") 
      ).value();

      if (dimmers.length === 0) { return; }

      let device = null;
      let valueTokens = null;
      let match = null;

      // Try to match the input string with:
      M(input, context)
        .match('dim ')
        .matchDevice(dimmers, (next, d) => {
          return next.match(' to ')
            .matchNumericExpression( (next, ts) => {
              const m = next.match('%', {optional: true});
              if ((device != null) && (device.id !== d.id)) {
                if (context != null) {
                  context.addError(`"${input.trim()}" is ambiguous.`);
                }
                return;
              }
              device = d;
              valueTokens = ts;
              return match = m.getFullMatch();
            });
        });

      if (match != null) {
        if ((valueTokens.length === 1) && !isNaN(valueTokens[0])) {
          let value = valueTokens[0]; 
          assert(!isNaN(value));
          value = parseFloat(value);
          if (value < 0.0) {
            if (context != null) {
              context.addError("Can't dim to a negative dimlevel.");
            }
            return;
          }
          if (value > 100.0) {
            if (context != null) {
              context.addError("Can't dim to greater than 100%.");
            }
            return;
          }
        }
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new DimmerActionHandler(this.framework, device, valueTokens)
        };
      } else { 
        return null;
      }
    }
  }

  class DimmerActionHandler extends ActionHandler {

    constructor(framework, device, valueTokens) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this._doExecuteAction = this._doExecuteAction.bind(this);
      this.executeAction = this.executeAction.bind(this);
      this.executeRestoreAction = this.executeRestoreAction.bind(this);
      this.framework = framework;
      this.device = device;
      this.valueTokens = valueTokens;
      assert(this.device != null);
      assert(this.valueTokens != null);
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    _clampVal(value) {
      assert(!isNaN(value));
      return ((() => { switch (false) {
        case !(value > 100): return 100;
        case !(value < 0): return 0;
        default: return value;
      
      } })());
    }

    /*
    Handles the above actions.
    */
    _doExecuteAction(simulate, value) {
      return (
        simulate ?
          __("would dim %s to %s%%", this.device.name, value)
        :
          this.device.changeDimlevelTo(value).then( () => __("dimmed %s to %s%%", this.device.name, value) )
      );
    }

    // ### executeAction()
    executeAction(simulate) { 
      return this.device.getDimlevel().then( lastValue => {
        this.lastValue = lastValue || 0;
        return this.framework.variableManager.evaluateNumericExpression(this.valueTokens).then( value => {
          value = this._clampVal(value);
          return this._doExecuteAction(simulate, value);
        });
      });
    }

    // ### hasRestoreAction()
    hasRestoreAction() { return true; }
    // ### executeRestoreAction()
    executeRestoreAction(simulate) { return Promise.resolve(this._doExecuteAction(simulate, this.lastValue)); }
  }


  class HeatingThermostatModeActionProvider extends ActionProvider {

    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework;
    }

    // ### parseAction()
    /*
    Parses the above actions.
    */
    parseAction(input, context) {
      // The result the function will return:
      const retVar = null;

      const thermostats = _(this.framework.deviceManager.devices).values().filter( 
        device => device.hasAction("changeModeTo") 
      ).value();

      if (thermostats.length === 0) { return; }

      let device = null;
      let valueTokens = null;
      let match = null;

      // Try to match the input string with:
      M(input, context)
        .match('set mode of ')
        .matchDevice(thermostats, (next, d) => {
          return next.match(' to ')
            .matchStringWithVars( (next, ts) => {
              const m = next.match(' mode', {optional: true});
              if ((device != null) && (device.id !== d.id)) {
                if (context != null) {
                  context.addError(`"${input.trim()}" is ambiguous.`);
                }
                return;
              }
              device = d;
              valueTokens = ts;
              return match = m.getFullMatch();
            });
        });

      if (match != null) {
        if ((valueTokens.length === 1) && !isNaN(valueTokens[0])) {
          const value = valueTokens[0]; 
          assert(!isNaN(value));
          const modes = ["eco", "boost", "auto", "manu", "comfy"]; 
          // TODO: Implement eco & comfy in changeModeTo method!
          if (modes.indexOf(value) < -1) {
            if (context != null) {
              context.addError("Allowed modes: eco,boost,auto,manu,comfy");
            }
            return;
          }
        }
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new HeatingThermostatModeActionHandler(this.framework, device, valueTokens)
        };
      } else { 
        return null;
      }
    }
  }


  class HeatingThermostatModeActionHandler extends ActionHandler {

    constructor(framework, device, valueTokens) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this._doExecuteAction = this._doExecuteAction.bind(this);
      this.executeAction = this.executeAction.bind(this);
      this.executeRestoreAction = this.executeRestoreAction.bind(this);
      this.framework = framework;
      this.device = device;
      this.valueTokens = valueTokens;
      assert(this.device != null);
      assert(this.valueTokens != null);
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    /*
    Handles the above actions.
    */
    _doExecuteAction(simulate, value) {
      return (
        simulate ?
          __("would set mode %s to %s", this.device.name, value)
        :
          this.device.changeModeTo(value).then( () => __("set mode %s to %s", this.device.name, value) )
      );
    }

    // ### executeAction()
    executeAction(simulate) { 
      return this.framework.variableManager.evaluateStringExpression(this.valueTokens).then( value => {
        this.lastValue = value;
        return this._doExecuteAction(simulate, value);
      });
    }

    // ### hasRestoreAction()
    hasRestoreAction() { return true; }
    // ### executeRestoreAction()
    executeRestoreAction(simulate) { return Promise.resolve(this._doExecuteAction(simulate, this.lastValue)); }
  }



  class HeatingThermostatSetpointActionProvider extends ActionProvider {

    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework;
    }

    // ### parseAction()
    /*
    Parses the above actions.
    */
    parseAction(input, context) {
      // The result the function will return:
      const retVar = null;

      const thermostats = _(this.framework.deviceManager.devices).values().filter( 
        device => device.hasAction("changeTemperatureTo") 
      ).value();

      if (thermostats.length === 0) { return; }

      let device = null;
      let valueTokens = null;
      let match = null;

      // Try to match the input string with:
      M(input, context)
        .match('set temp of ')
        .matchDevice(thermostats, (next, d) => {
          return next.match(' to ')
            .matchNumericExpression( (next, ts) => {
              const m = next.match('°C', {optional: true});
              if ((device != null) && (device.id !== d.id)) {
                if (context != null) {
                  context.addError(`"${input.trim()}" is ambiguous.`);
                }
                return;
              }
              device = d;
              valueTokens = ts;
              return match = m.getFullMatch();
            });
        });

      if (match != null) {
        if ((valueTokens.length === 1) && !isNaN(valueTokens[0])) {
          let value = valueTokens[0]; 
          assert(!isNaN(value));
          value = parseFloat(value);
          if (value < 0.0) {
            if (context != null) {
              context.addError("Can't set temp to a negative value.");
            }
            return;
          }
          if (value > 32.0) {
            if (context != null) {
              context.addError("Can't set temp higher than 32°C.");
            }
            return;
          }
        }
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new HeatingThermostatSetpointActionHandler(this.framework, device, valueTokens)
        };
      } else { 
        return null;
      }
    }
  }

  class HeatingThermostatSetpointActionHandler extends ActionHandler {

    constructor(framework, device, valueTokens) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this._doExecuteAction = this._doExecuteAction.bind(this);
      this.executeAction = this.executeAction.bind(this);
      this.executeRestoreAction = this.executeRestoreAction.bind(this);
      this.framework = framework;
      this.device = device;
      this.valueTokens = valueTokens;
      assert(this.device != null);
      assert(this.valueTokens != null);
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    /*
    Handles the above actions.
    */
    _doExecuteAction(simulate, value) {
      return (
        simulate ?
          __("would set temp of %s to %s°C", this.device.name, value)
        :
          this.device.changeTemperatureTo(value).then( () => { 
            return __("set temp of %s to %s°C", this.device.name, value); 
          })
      );
    }

    // ### executeAction()
    executeAction(simulate) { 
      return this.framework.variableManager.evaluateNumericExpression(this.valueTokens).then( value => {
        // value = @_clampVal value
        this.lastValue = value;
        return this._doExecuteAction(simulate, value);
      });
    }

    // ### hasRestoreAction()
    hasRestoreAction() { return true; }
    // ### executeRestoreAction()
    executeRestoreAction(simulate) { return Promise.resolve(this._doExecuteAction(simulate, this.lastValue)); }
  }


  /*
  The Timer Action Provider
  -------------
  Start, stop or reset Timer

  * start|stop|reset the _device_ [timer] 

  where _device_ is the name or id of a timer device and "the" is optional.
  */
  class TimerActionProvider extends ActionProvider {

    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework;
    }

    // ### parseAction()
    /*
    Parses the above actions.
    */
    parseAction(input, context) {

      const timerDevices = _(this.framework.deviceManager.devices).values().filter( 
        device => (
          device.hasAction("startTimer") && 
          device.hasAction("stopTimer") && 
          device.hasAction("resetTimer") 
        )
      ).value();

      let device = null;
      let action = null;
      let match = null;

      // Try to match the input string with: start|stop|reset ->
      const m = M(input, context).match(['start ', 'stop ', 'reset '], (m, a) => {
        // device name -> up|down
        return m.matchDevice(timerDevices, function(m, d) {
          const last = m.match(' timer', {optional: true});
          if (last.hadMatch()) {
             // Already had a match with another device?
            if ((device != null) && (device.id !== d.id)) {
              if (context != null) {
                context.addError(`"${input.trim()}" is ambiguous.`);
              }
              return;
            }
            device = d;
            action = a.trim();
            return match = last.getFullMatch();
          }
        });
      });

      if (match != null) {
        assert(device != null);
        assert(['start', 'stop', 'reset'].includes(action));
        assert(typeof match === "string");
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new TimerActionHandler(device, action)
        };
      
        return null;
      }
    }
  }

  class TimerActionHandler extends ActionHandler {

    constructor(device, action) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.executeAction = this.executeAction.bind(this);
      this.device = device;
      this.action = action;
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    // ### executeAction()
    executeAction(simulate) { 
      return (
        simulate ?
          Promise.resolve(__(`would ${this.action} %s`, this.device.name))
        :
          this.device[`${this.action}Timer`]().then( () => __(`${this.action}ed %s`, this.device.name) )
      );
    }
    // ### hasRestoreAction()
    hasRestoreAction() { return false; }
  }

  // Pause play volume actions
  class AVPlayerPauseActionProvider extends ActionProvider { 
  
    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework; 
    }
    // ### executeAction()
    /*
    This function handles action in the form of `play device`
    */
    parseAction(input, context) {

      const retVar = null;

      const avPlayers = _(this.framework.deviceManager.devices).values().filter( 
        device => device.hasAction("pause") 
      ).value();

      if (avPlayers.length === 0) { return; }

      let device = null;
      let match = null;

      const onDeviceMatch = ( function(m, d) { device = d; return match = m.getFullMatch();  });

      const m = M(input, context)
        .match('pause ')
        .matchDevice(avPlayers, onDeviceMatch);
        
      if (match != null) {
        assert(device != null);
        assert(typeof match === "string");
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new AVPlayerPauseActionHandler(device)
        };
      } else {
        return null;
      }
    }
  }

  class AVPlayerPauseActionHandler extends ActionHandler {

    constructor(device) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.executeAction = this.executeAction.bind(this);
      this.device = device; //nop
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    executeAction(simulate) { 
      return (
        simulate ?
          Promise.resolve(__("would pause %s", this.device.name))
        :
          this.device.pause().then( () => __("paused %s", this.device.name) )
      );
    }
  }
      
  // stop play volume actions
  class AVPlayerStopActionProvider extends ActionProvider { 
  
    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework; 
    }
    // ### executeAction()
    /*
    This function handles action in the form of `execute "some string"`
    */
    parseAction(input, context) {

      const retVar = null;

      const avPlayers = _(this.framework.deviceManager.devices).values().filter( 
        // only match media players and not shutters
        device => device.hasAction("stop") && device.hasAction("play")
      ).value();

      if (avPlayers.length === 0) { return; }

      let device = null;
      let match = null;

      const onDeviceMatch = ( function(m, d) { device = d; return match = m.getFullMatch();  });

      const m = M(input, context)
        .match('stop ')
        .matchDevice(avPlayers, onDeviceMatch);
        
      if (match != null) {
        assert(device != null);
        assert(typeof match === "string");
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new AVPlayerStopActionHandler(device)
        };
      } else {
        return null;
      }
    }
  }

  class AVPlayerStopActionHandler extends ActionHandler {

    constructor(device) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.executeAction = this.executeAction.bind(this);
      this.device = device; //nop
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    executeAction(simulate) { 
      return (
        simulate ?
          Promise.resolve(__("would stop %s", this.device.name))
        :
          this.device.stop().then( () => __("stop %s", this.device.name) )
      );
    }
  }

  class AVPlayerPlayActionProvider extends ActionProvider { 
  
    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework; 
    }
    // ### executeAction()
    /*
    This function handles action in the form of `execute "some string"`
    */
    parseAction(input, context) {

      const retVar = null;

      const avPlayers = _(this.framework.deviceManager.devices).values().filter( 
        device => device.hasAction("play") 
      ).value();

      if (avPlayers.length === 0) { return; }

      let device = null;
      let match = null;

      const onDeviceMatch = ( function(m, d) { device = d; return match = m.getFullMatch();  });

      const m = M(input, context)
        .match('play ')
        .matchDevice(avPlayers, onDeviceMatch);
        
      if (match != null) {
        assert(device != null);
        assert(typeof match === "string");
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new AVPlayerPlayActionHandler(device)
        };
      } else {
        return null;
      }
    }
  }
        
  class AVPlayerPlayActionHandler extends ActionHandler {

    constructor(device) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.executeAction = this.executeAction.bind(this);
      this.device = device; //nop
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    executeAction(simulate) { 
      return (
        simulate ?
          Promise.resolve(__("would play %s", this.device.name))
        :
          this.device.play().then( () => __("playing %s", this.device.name) )
      );
    }
  }

  class AVPlayerVolumeActionProvider extends ActionProvider { 
  
    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework; 
    }
    // ### executeAction()
    /*
    This function handles action in the form of `execute "some string"`
    */
    parseAction(input, context) {

      const retVar = null;
      const volume = null;

      const avPlayers = _(this.framework.deviceManager.devices).values().filter( 
        device => device.hasAction("setVolume") 
      ).value();

      if (avPlayers.length === 0) { return; }

      let device = null;
      let valueTokens = null;
      let match = null;

      const onDeviceMatch = ( function(m, d) { device = d; return match = m.getFullMatch();  });

      M(input, context)
        .match('change volume of ')
        .matchDevice(avPlayers, (next,d) => {
          return next.match(' to ', next => {
            return next.matchNumericExpression( (next, ts) => {
              const m = next.match('%', {optional: true});
              if ((device != null) && (device.id !== d.id)) {
                if (context != null) {
                  context.addError(`"${input.trim()}" is ambiguous.`);
                }
                return;
              }
              device = d;
              valueTokens = ts;
              return match = m.getFullMatch();
            });
          });
        });

        
      if (match != null) {
        let value = valueTokens[0]; 
        assert(device != null);
        assert(typeof match === "string");
        value = parseFloat(value);
        if (value < 0.0) {
          if (context != null) {
            context.addError("Can't change volume to a negative value.");
          }
          return;
        }
        if (value > 100.0) {
          if (context != null) {
            context.addError("Can't change volume to greater than 100%.");
          }
          return;
        }
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new AVPlayerVolumeActionHandler(this.framework,device,valueTokens)
        };
      } else {
        return null;
      }
    }
  }
        
  class AVPlayerVolumeActionHandler extends ActionHandler {

    constructor(framework, device, valueTokens) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.executeAction = this.executeAction.bind(this);
      this.framework = framework;
      this.device = device;
      this.valueTokens = valueTokens; //nop
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    executeAction(simulate, value) { 
      let val;
      return (
        isNaN(this.valueTokens[0]) ?
          (val = this.framework.variableManager.getVariableValue(this.valueTokens[0].substring(1)))
        :
          (val = this.valueTokens[0]),     
        simulate ?
          Promise.resolve(__("would set volume of %s to %s", this.device.name, val))
        :   
          this.device.setVolume(val).then( () => __("set volume of %s to %s", this.device.name, val) )
      );   
    }
  }

  class AVPlayerNextActionProvider extends ActionProvider { 
  
    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework; 
    }
    // ### executeAction()
    /*
    This function handles action in the form of `execute "some string"`
    */
    parseAction(input, context) {

      const retVar = null;
      const volume = null;

      const avPlayers = _(this.framework.deviceManager.devices).values().filter( 
        device => device.hasAction("next") 
      ).value();

      if (avPlayers.length === 0) { return; }

      let device = null;
      const valueTokens = null;
      let match = null;

      const onDeviceMatch = ( function(m, d) { device = d; return match = m.getFullMatch();  });

      const m = M(input, context)
        .match(['play next', 'next '])
        .match(" song ", {optional: true})
        .match("on ", {optional: true})
        .matchDevice(avPlayers, onDeviceMatch);

      if (match != null) {
        assert(device != null);
        assert(typeof match === "string");
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new AVPlayerNextActionHandler(device)
        };
      } else {
        return null;
      }
    }
  }
        
  class AVPlayerNextActionHandler extends ActionHandler {
    constructor(device) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.executeAction = this.executeAction.bind(this);
      this.device = device; //nop
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    executeAction(simulate) { 
      return (
        simulate ?
          Promise.resolve(__("would play next track of %s", this.device.name))
        :
          this.device.next().then( () => __("play next track of %s", this.device.name) )
      );      
    }
  }

  class AVPlayerPrevActionProvider extends ActionProvider { 
  
    constructor(framework) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.parseAction = this.parseAction.bind(this);
      this.framework = framework; 
    }
    // ### executeAction()
    /*
    This function handles action in the form of `execute "some string"`
    */
    parseAction(input, context) {

      const retVar = null;
      const volume = null;

      const avPlayers = _(this.framework.deviceManager.devices).values().filter( 
        device => device.hasAction("previous") 
      ).value();

      if (avPlayers.length === 0) { return; }

      let device = null;
      const valueTokens = null;
      let match = null;

      const onDeviceMatch = ( function(m, d) { device = d; return match = m.getFullMatch();  });

      const m = M(input, context)
        .match(['play previous', 'previous '])
        .match(" song ", {optional: true})
        .match("on ", {optional: true})
        .matchDevice(avPlayers, onDeviceMatch);

      if (match != null) {
        assert(device != null);
        assert(typeof match === "string");
        return {
          token: match,
          nextInput: input.substring(match.length),
          actionHandler: new AVPlayerNextActionHandler(device)
        };
      } else {
        return null;
      }
    }
  }
        
  class AVPlayerPrevActionHandler extends ActionHandler {
    constructor(device) {
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.executeAction = this.executeAction.bind(this);
      this.device = device; //nop
    }

    setup() {
      this.dependOnDevice(this.device);
      return super.setup();
    }

    executeAction(simulate) { 
      return (
        simulate ?
          Promise.resolve(__("would play previous track of %s", this.device.name))
        :
          this.device.previous().then( () => __("play previous track of %s", this.device.name) )
      ); 
    }
  }
         



  // Export the classes so that they can be accessed by the framework
  return exports = {
    ActionHandler,
    ActionProvider,
    SetVariableActionProvider,
    SetPresenceActionProvider,
    ContactActionProvider,
    SwitchActionProvider,
    DimmerActionProvider,
    LogActionProvider,
    ShutterActionProvider,
    StopShutterActionProvider,
    ToggleActionProvider,
    ButtonActionProvider,
    HeatingThermostatModeActionProvider,
    HeatingThermostatSetpointActionProvider,
    TimerActionProvider,
    AVPlayerPauseActionProvider,
    AVPlayerStopActionProvider,
    AVPlayerPlayActionProvider,
    AVPlayerVolumeActionProvider,
    AVPlayerNextActionProvider,
    AVPlayerPrevActionProvider
  };
};
