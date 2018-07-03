/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Devices
=======


*/

const cassert = require('cassert');
const assert = require('assert');
const Promise = require('bluebird');
const _ = require('lodash');
const t = require('decl-api').types;
const declapi = require('decl-api');
const events = require('events');

module.exports = function(env) {

  /*
  Device
  -----
  The Device class is the common superclass for all devices like actuators or sensors.
  */
  let exports;
  class Device extends require('events').EventEmitter {
    static initClass() {
      // A unique id defined by the config or by the plugin that provides the device.
      this.prototype.id = null;
      // The name of the actuator to display at the frontend.
      this.prototype.name = null;
  
      // Defines the actions an device has.
      this.prototype.actions = {};
      // attributes the device has. For examples see devices below.
      this.prototype.attributes = {};
  
      this.prototype.template = "device";
  
      this.prototype.config = {};
    }

    _checkAttributes() {
      return (() => {
        const result = [];
        for (let attr in this.attributes) {
          result.push(this._checkAttribute(attr));
        }
        return result;
      })();
    }

    _checkAttribute(attrName) {
      let needle;
      const attr = this.attributes[attrName];
      assert((attr.description != null), `No description for ${attrName} of ${this.name} given`);
      assert((attr.type != null), `No type for ${attrName} of ${this.name} given`);

      const isValidType = type => (needle = type, Array.from(_.values(t)).includes(needle));
      assert(isValidType(attr.type), `${attrName} of ${this.name} has no valid type.`);

      // If it is a Number it must have a unit
      if ((attr.type === t.number) && (attr.unit == null)) { attr.unit = ''; }
      // If it is a Boolean it must have labels
      if ((attr.type === t.boolean) && !attr.labels) { attr.labels = ["true", "false"]; }
      if (!attr.label) { attr.label = upperCaseFirst(attrName); }
      if (attr.discrete == null) {
        return attr.discrete = (attr.type === "number" ? false : true);
      }
    }

    constructor() {
      super();
      assert((this.id != null), "The device has no ID");
      assert((this.name != null), "The device has no name");
      assert(this.id.length !== 0, "The ID of the device is empty");
      assert(this.name.length !== 0, "The name of the device is empty");
      this._checkAttributes();
      this._constructorCalled = true;
      this._attributesMeta = {};
      for (let attrName in this.attributes) { const attr = this.attributes[attrName]; this._initAttributeMeta(attrName, attr); }
    }


    _initAttributeMeta(attrName, attr) {
      const device = this;
      this._attributesMeta[attrName] = {
        value: null,
        error: null,
        history: [],
        update(value) {
          if (["number", "integer"].includes(attr.type) && (typeof value === "string")) {
            env.logger.error(
              `Got string value for attribute ${attrName} of ${device.constructor.name} but ` +
              `attribute type is ${attr.type}.`
            );
          }
          const timestamp = (new Date()).getTime();
          this.value = value;
          this.lastUpdate = timestamp;
          if (this.history.length === 30) {
            this.history.shift();
          }
          return this.history.push({t:timestamp, v:value});
        }
      };
      const attrListener = value => this._attributesMeta[attrName].update(value);
      this._attributesMeta[attrName].attrListener = attrListener;
      return this.on(attrName, attrListener);
    }

    destroy() {
      this.emit('destroy', this);
      this.removeAllListeners('destroy');
      for (let attrName in this.attributes) { this.removeAllListeners(attrName); }
      this._destroyed = true;
    }

    afterRegister() {
      return (() => {
        const result = [];
        for (let attrName in this.attributes) {
          result.push((attrName => {
            // force update of the device value
            const meta = this._attributesMeta[attrName];
            if (meta.value == null) {
              return this.getUpdatedAttributeValue(attrName).then( value => {
                if (((meta.lastUpdate == null)) || (new Date().getTime() - meta.lastUpdate)) {
                  return this.emit(attrName, value);
                }
              }).catch( err => {
                return this.logAttributeError(attrName, err);
              }).done();
            }
          })(attrName));
        }
        return result;
      })();
    }

    // Checks if the actuator has a given action.
    hasAction(name) { return (this.actions[name] != null); }

    // Checks if the actuator has the attribute event.
    hasAttribute(name) { return (this.attributes[name] != null); }

    getLastAttributeValue(attrName) {
      return this._attributesMeta[attrName].value;
    }

    addAttribute(name, attribute) {
      assert((!this._constructorCalled), "Attributes can only be added in the constructor");
      if (this.attributes === this.constructor.prototype.attributes) {
        this.attributes = _.clone(this.attributes);
      }
      return this.attributes[name] = attribute;
    }

    addAction(name, action) {
      assert((!this._constructorCalled), "Actions can only be added in the constructor");
      if (this.actions === this.constructor.prototype.actions) {
        this.actions = _.clone(this.actions);
      }
      return this.actions[name] = action;
    }

    updateName(name) {
      if (name === this.name) { return; }
      this.name = name;
      return this.emit("nameChanged", this);
    }

    getUpdatedAttributeValue(attrName, arg) {
      const getter = `get${upperCaseFirst(attrName)}`;
      // call the getter
      assert((this[getter] != null), `Method ${getter} of ${this.name} does not exist!`);
      const result = Promise.resolve().then( () => { return this[getter](arg);  });
      return result;
    }

    getUpdatedAttributeValueCached(attrName, arg) {
      if (!this._promiseCache) { this._promiseCache = {}; }
      if (this._promiseCache[attrName] != null) { return this._promiseCache[attrName]; }
      this._promiseCache[attrName] = this.getUpdatedAttributeValue(attrName, arg).then( value => {
        delete this._promiseCache[attrName];
        return value;
      }
      , error => {
        delete this._promiseCache[attrName];
        throw error;
      });
      return this._promiseCache[attrName];
    }

    _createGetter(attributeName, fn) {
      const getterName = `get${attributeName[0].toUpperCase()}${attributeName.slice(1)}`;
      this[getterName] = fn;
    }

    toJson() {
      const json = {
        id: this.id,
        name: this.name,
        template: this.template,
        attributes: [],
        actions: [],
        config: this.config,
        configDefaults: this.config.__proto__
      };

      for (var name in this.attributes) {
        const attr = this.attributes[name];
        const meta = this._attributesMeta[name];
        const attrJson = _.cloneDeep(attr);
        attrJson.name = name;
        attrJson.value = meta.value;
        attrJson.history = meta.history;
        attrJson.lastUpdate = meta.lastUpdate;
        json.attributes.push(attrJson);
      }

      for (name in this.actions) {
        const action = this.actions[name];
        const actionJson = _.cloneDeep(action);
        actionJson.name = name;
        json.actions.push(actionJson);
      }
      return json;
    }

    _setupPolling(attrName, interval) {
      if (typeof interval !== 'number') {
        throw new Error(`Illegal polling interval ${interval}!`);
      }
      if (!(interval > 0)) {
        throw new Error(`Polling interval must be greater then 0, was ${interval}`);
      }
      var doPolling = () => {
        if (this._destroyed) { return; }
        return Promise.resolve()
          .then( () => this.getUpdatedAttributeValue(attrName) )
          .then( value => {
            // may emit value, if it was not already emitted by getter
            const { lastUpdate } = this._attributesMeta[attrName];
            if ((lastUpdate != null) && ((new Date().getTime() - lastUpdate) < 500)) {
              return;
            }
            return this.emit(attrName, value);
          })
          .catch( err => this.logAttributeError(attrName, err) )
          .finally( () => {
            if (this._destroyed) { return; }
            return setTimeout(doPolling, interval);
          }).done();
      };
      return setTimeout(doPolling, interval);
    }

    logAttributeError(attrName, err) {
      const lastError = this._attributesMeta[attrName].error;
      if ((lastError != null) && (err.message === lastError.message)) {
        this.logger.debug(`Suppressing repeated error for ${this.id}.${attrName} ${err.message}`);
        this.logger.debug(err.stack);
        return;
      }
      // save attribute error
      this._attributesMeta[attrName].error = err;
      // clear error on next success
      this.once(attrName, () => this._attributesMeta[attrName].error = null );
      this.logger.error(`Error getting attribute value ${this.id}.${attrName}: ${err.message}`);
      return this.logger.debug(err.stack);
    }
  }
  Device.initClass();

  /*
  ErrorDevice
  -----
  Devices of this type are created if the create operation
  for the real type cant be created
  */
  class ErrorDevice extends Device {

    constructor(config, error) {
      super();
      this.config = config;
      this.error = error;
      this.name = this.config.name;
      this.id = this.config.id;
      super();
    }

    destroy() {
      return super.destroy();
    }
  }

  /*
  Actuator
  -----
  An Actuator is an physical or logical element you can control by triggering an action on it.
  For example a power outlet, a light or door opener.
  */
  class Actuator extends Device {}

  /*
  SwitchActuator
  -----
  A class for all devices you can switch on and off.
  */
  class SwitchActuator extends Actuator {
    static initClass() {
      this.prototype._state = null;
  
      this.prototype.actions = {
        turnOn: {
          description: "Turns the switch on"
        },
        turnOff: {
          description: "Turns the switch off"
        },
        changeStateTo: {
          description: "Changes the switch to on or off",
          params: {
            state: {
              type: t.boolean
            }
          }
        },
        toggle: {
          description: "Toggle the state of the switch"
        },
        getState: {
          description: "Returns the current state of the switch",
          returns: {
            state: {
              type: t.boolean
            }
          }
        }
      };
  
      this.prototype.attributes = {
        state: {
          description: "The current state of the switch",
          type: t.boolean,
          labels: ['on', 'off']
        }
      };
  
      this.prototype.template = "switch";
    }

    // Returns a promise
    turnOn() { return this.changeStateTo(true); }

    // Returns a promise
    turnOff() { return this.changeStateTo(false); }

    toggle() {
      return this.getState().then( state => this.changeStateTo(!state) );
    }

    // Returns a promise that is fulfilled when done.
    changeStateTo(state) {
      throw new Error("Function \"changeStateTo\" is not implemented!");
    }

    // Returns a promise that will be fulfilled with the state
    getState() { return Promise.resolve(this._state); }

    _setState(state) {
      if (this._state === state) { return; }
      this._state = state;
      return this.emit("state", state);
    }
  }
  SwitchActuator.initClass();

  /*
  PowerSwitch
  ----------
  Just an alias for a SwitchActuator at the moment
  */
  class PowerSwitch extends SwitchActuator {}

  /*
  DimmerActuator
  -------------
  Switch with additional dim functionality.
  */
  class DimmerActuator extends SwitchActuator {
    constructor(...args) {
      super();
      this._setDimlevel = this._setDimlevel.bind(this);
      super(...args);
    }

    static initClass() {
      this.prototype._dimlevel = null;
  
      this.prototype.actions = {
        changeDimlevelTo: {
          description: "Sets the level of the dimmer",
          params: {
            dimlevel: {
              type: t.number
            }
          }
        },
        changeStateTo: {
          description: "Changes the switch to on or off",
          params: {
            state: {
              type: t.boolean
            }
          }
        },
        turnOn: {
          description: "Turns the dim level to 100%"
        },
        turnOff: {
          description: "Turns the dim level to 0%"
        },
        toggle: {
          description: "Toggle the state of the dimmer"
        }
      };
  
      this.prototype.attributes = {
        dimlevel: {
          description: "The current dim level",
          type: t.number,
          unit: "%"
        },
        state: {
          description: "The current state of the switch",
          type: t.boolean,
          labels: ['on', 'off']
        }
      };
  
      this.prototype.template = "dimmer";
    }

    // Returns a promise
    turnOn() { return this.changeDimlevelTo(100); }

    // Returns a promise
    turnOff() { return this.changeDimlevelTo(0); }

    // Returns a promise that is fulfilled when done.
    changeDimlevelTo(state) {
      throw new Error("Function \"changeDimlevelTo\" is not implemented!");
    }

    // Returns a promise that is fulfilled when done.
    changeStateTo(state) {
      if (state) { return this.turnOn(); } else { return this.turnOff(); }
    }

    _setDimlevel(level) {
      level = parseFloat(level);
      assert(!isNaN(level));
      cassert(level >= 0);
      cassert(level <= 100);
      if (this._dimlevel === level) { return; }
      this._dimlevel = level;
      this.emit("dimlevel", level);
      return this._setState(level > 0);
    }

    // Returns a promise that will be fulfilled with the dim level
    getDimlevel() { return Promise.resolve(this._dimlevel); }
  }
  DimmerActuator.initClass();


  /*
  ShutterController
  -----
  A class for all devices you can move up and down.
  */
  var ShutterController = (function() {
    let rollingTime = undefined;
    ShutterController = class ShutterController extends Actuator {
      static initClass() {
        this.prototype._position = null;
  
        // Approx. amount of time (in seconds) for shutter to close or open completely.
        rollingTime = null;
  
        this.prototype.attributes = {
          position: {
            label: "Position",
            description: "State of the shutter",
            type: t.string,
            enum: ['up', 'down', 'stopped']
          }
        };
  
        this.prototype.actions = {
          moveUp: {
            description: "Raise the shutter"
          },
          moveDown: {
            description: "Lower the shutter"
          },
          stop: {
            description: "Stops the shutter move"
          },
          moveToPosition: {
            description: "Changes the shutter state",
            params: {
              state: {
                type: t.string
              }
            }
          },
          moveByPercentage: {
            description: "Move shutter by percentage relative to current position",
            params: {
              percentage: {
                type: t.number
              }
            }
          }
        };
  
        this.prototype.template = "shutter";
      }

      // Returns a promise
      moveUp() { return this.moveToPosition('up'); }
      // Returns a promise
      moveDown() { return this.moveToPosition('down'); }

      stop() {
        throw new Error("Function \"stop\" is not implemented!");
      }

      // Returns a promise that is fulfilled when done.
      moveToPosition(position) {
        throw new Error("Function \"moveToPosition\" is not implemented!");
      }

      moveByPercentage(percentage) {
        const duration = this._calculateRollingTime(Math.abs(percentage));
        if (duration === 0) {
          return Promise.resolve();
        }

        let promise = percentage > 0 ? this.moveUp() : this.moveDown();
        promise = promise.delay(duration + 10).then( () => {
          return this.stop();
        });
        return promise;
      }

      // Returns a promise that will be fulfilled with the position
      getPosition() { return Promise.resolve(this._position); }

      _setPosition(position) {
        assert(['up', 'down', 'stopped'].includes(position));
        if (this._position === position) { return; }
        this._position = position;
        return this.emit("position", position);
      }

      // calculates rolling time in ms for given percentage
      _calculateRollingTime(percentage) {
        assert(0 <= percentage && percentage <= 100, "percentage must be between 0 and 100");
        if (this.rollingTime != null) { return (this.rollingTime * 1000 * percentage) / 100; }
        throw new Error("No rolling time configured.");
      }
    };
    ShutterController.initClass();
    return ShutterController;
  })();

  /*
  Sensor
  ------
  */
  class Sensor extends Device {}

  /*
  TemperatureSensor
  ------
  */
  class TemperatureSensor extends Sensor {
    static initClass() {
      this.prototype._temperature = undefined;
  
      this.prototype.actions = {
        getTemperature: {
          description: "Returns the current temperature",
          returns: {
            temperature: {
              type: t.number
            }
          }
        }
      };
  
      this.prototype.attributes = {
        temperature: {
          description: "The measured temperature",
          type: t.number,
          unit: '°C',
          acronym: 'T'
        }
      };
  
      this.prototype.template = "temperature";
    }

    _setTemperature(value) {
      this._temperature = value;
      return this.emit('temperature', value);
    }

    getTemperature() { return Promise.resolve(this._temperature); }
  }
  TemperatureSensor.initClass();

  /*
  PresenceSensor
  ------
  */
  class PresenceSensor extends Sensor {
    static initClass() {
      this.prototype._presence = undefined;
  
      this.prototype.actions = {
        getPresence: {
          description: "Returns the current presence state",
          returns: {
            presence: {
              type: t.boolean
            }
          }
        }
      };
  
      this.prototype.attributes = {
        presence: {
          description: "Presence of the human/device",
          type: t.boolean,
          labels: ['present', 'absent']
        }
      };
  
      this.prototype.template = "presence";
    }

    _setPresence(value) {
      if (this._presence === value) { return; }
      this._presence = value;
      return this.emit('presence', value);
    }

    getPresence() { return Promise.resolve(this._presence); }
  }
  PresenceSensor.initClass();

  /*
  ContactSensor
  ------
  */
  class ContactSensor extends Sensor {
    static initClass() {
      this.prototype._contact = undefined;
  
      this.prototype.actions = {
        getContact: {
          description: "Returns the current state of the contact",
          returns: {
            contact: {
              type: t.boolean
            }
          }
        }
      };
  
      this.prototype.attributes = {
        contact: {
          description: "State of the contact",
          type: t.boolean,
          labels: ['closed', 'opened']
        }
      };
  
      this.prototype.template = "contact";
    }

    _setContact(value) {
      if (this._contact === value) { return; }
      this._contact = value;
      return this.emit('contact', value);
    }

    getContact() { return Promise.resolve(this._contact); }
  }
  ContactSensor.initClass();

  var upperCaseFirst = function(string) {
    if (string.length !== 0) {
      return string[0].toUpperCase() + string.slice(1);
    } else { return ""; }
  };

  class HeatingThermostat extends Device {
    static initClass() {
  
      this.prototype.attributes = {
        temperatureSetpoint: {
          label: "Temperature Setpoint",
          description: "The temp that should be set",
          type: "number",
          discrete: true,
          unit: "°C"
        },
        valve: {
          description: "Position of the valve",
          type: "number",
          discrete: true,
          unit: "%"
        },
        mode: {
          description: "The current mode",
          type: "string",
          enum: ["auto", "manu", "boost"]
        },
        battery: {
          description: "Battery status",
          type: "string",
          enum: ["ok", "low"]
        },
        synced: {
          description: "Pimatic and thermostat in sync",
          type: "boolean"
        }
      };
  
      this.prototype.actions = {
        changeModeTo: {
          params: {
            mode: {
              type: "string"
            }
          }
        },
        changeTemperatureTo: {
          params: {
            temperatureSetpoint: {
              type: "number"
            }
          }
        }
      };
  
      this.prototype.template = "thermostat";
  
      this.prototype._mode = null;
      this.prototype._temperatureSetpoint = null;
      this.prototype._valve = null;
      this.prototype._battery = null;
      this.prototype._synced = false;
    }

    getMode() { return Promise.resolve(this._mode); }
    getTemperatureSetpoint() { return Promise.resolve(this._temperatureSetpoint); }
    getValve() { return Promise.resolve(this._valve); }
    getBattery() { return Promise.resolve(this._battery); }
    getSynced() { return Promise.resolve(this._synced); }

    _setMode(mode) {
      if (mode === this._mode) { return; }
      this._mode = mode;
      return this.emit("mode", this._mode);
    }

    _setSynced(synced) {
      if (synced === this._synced) { return; }
      this._synced = synced;
      return this.emit("synced", this._synced);
    }

    _setSetpoint(temperatureSetpoint) {
      if (temperatureSetpoint === this._temperatureSetpoint) { return; }
      this._temperatureSetpoint = temperatureSetpoint;
      return this.emit("temperatureSetpoint", this._temperatureSetpoint);
    }

    _setValve(valve) {
      if (valve === this._valve) { return; }
      this._valve= valve;
      return this.emit("valve", this._valve);
    }

    _setBattery(battery) {
      if (battery === this._battery) { return; }
      this._battery = battery;
      return this.emit("battery", this._battery);
    }

    changeModeTo(mode) {
      throw new Error("changeModeTo must be implemented by a subclass");
    }

    changeTemperatureTo(temperatureSetpoint) {
      throw new Error("changeTemperatureTo must be implemented by a subclass");
    }
  }
  HeatingThermostat.initClass();

  class AVPlayer extends Device {
    static initClass() {
  
      this.prototype.actions = {
        play: {
          description: "starts playing"
        },
        pause: {
          description: "pauses playing"
        },
        stop: {
          description: "stops playing"
        },
        next: {
          description: "play next song"
        },
        previous: {
          description: "play previous song"
        },
        volume: {
          description: "Change volume of player"
        }
      };
  
      this.prototype.attributes = {
        currentArtist: {
          description: "the current playing track artist",
          type: "string"
        },
        currentTitle: {
          description: "the current playing track title",
          type: "string"
        },
        state: {
          description: "the current state of the player",
          type: "string"
        },
        volume: {
          description: "the volume of the player",
          type: "string"
        }
      };
  
      this.prototype._state = null;
      this.prototype._currentTitle = null;
      this.prototype._currentArtist = null;
      this.prototype._volume = null;
  
      this.prototype.template = "musicplayer";
    }

    _setState(state) {
      if (this._state !== state) {
        this._state = state;
        return this.emit('state', state);
      }
    }

    _setCurrentTitle(title) {
      if (this._currentTitle !== title) {
        this._currentTitle = title;
        return this.emit('currentTitle', title);
      }
    }

    _setCurrentArtist(artist) {
      if (this._currentArtist !== artist) {
        this._currentArtist = artist;
        return this.emit('currentArtist', artist);
      }
    }

    _setVolume(volume) {
      if (this._volume !== volume) {
        this._volume = volume;
        return this.emit('volume', volume);
      }
    }

    getState() { return Promise.resolve(this._state); }
    getCurrentTitle() { return Promise.resolve(this._currentTitle); }
    getCurrentArtist() { return Promise.resolve(this._currentTitle); }
    getVolume()  { return Promise.resolve(this._volume); }
  }
  AVPlayer.initClass();

  class ButtonsDevice extends Device {
    static initClass() {
  
      this.prototype.attributes = {
        button: {
          description: "The last pressed button",
          type: t.string
        }
      };
  
      this.prototype.actions = {
        buttonPressed: {
          params: {
            buttonId: {
              type: t.string
            }
          },
          description: "Press a button"
        }
      };
  
      this.prototype.template = "buttons";
  
      this.prototype._lastPressedButton = null;
    }

    constructor(config){
      super();
      this.config = config;
      this.id = this.config.id;
      this.name = this.config.name;
      super();
    }

    getButton() { return Promise.resolve(this._lastPressedButton); }

    buttonPressed(buttonId) {
      for (let b of Array.from(this.config.buttons)) {
        if (b.id === buttonId) {
          this._lastPressedButton = b.id;
          this.emit('button', b.id);
          return Promise.resolve();
        }
      }
      throw new Error(`No button with the id ${buttonId} found`);
    }

    destroy() {
      return super.destroy();
    }
  }
  ButtonsDevice.initClass();

  class VariablesDevice extends Device {

    constructor(config, lastState, framework) {
      super();
      this.config = config;
      this.framework = framework;
      this.id = this.config.id;
      this.name = this.config.name;
      this._vars = this.framework.variableManager;
      this._exprChangeListeners = [];
      this.attributes = {};
      for (let variable of Array.from(this.config.variables)) {
        (variable => {
          const { name } = variable;
          let info = null;

          if (this.attributes[name] != null) {
            throw new Error(
              `Two variables with the same name in VariablesDevice config \"${name}\"`
            );
          }

          this.attributes[name] = {
            description: name,
            label: ((variable.label != null) ? variable.label : `$${name}`),
            type: variable.type || "string"
          };

          if ((variable.unit != null) && (variable.unit.length > 0)) {
            this.attributes[name].unit = variable.unit;
          }

          if (variable.discrete != null) {
            this.attributes[name].discrete = variable.discrete;
          }

          if (variable.acronym != null) {
            this.attributes[name].acronym = variable.acronym;
          }


          const parseExprAndAddListener = ( () => {
            info = this._vars.parseVariableExpression(variable.expression);
            this._vars.notifyOnChange(info.tokens, onChangedVar);
            return this._exprChangeListeners.push(onChangedVar);
          }
          );

          const evaluateExpr = ( varsInEvaluation => {
            if (this.attributes[name].type === "number") {
              if ((this.attributes[name].unit == null) || !(this.attributes[name].unit.length > 0)) {
                this.attributes[name].unit = this._vars.inferUnitOfExpression(info.tokens);
              }
            }
            switch (info.datatype) {
              case "numeric": return this._vars.evaluateNumericExpression(info.tokens, varsInEvaluation);
              case "string": return this._vars.evaluateStringExpression(info.tokens, varsInEvaluation);
              default: return assert(false);
            }
          }
          );

          var onChangedVar = ( changedVar => {
            return evaluateExpr().then( val => {
              return this.emit(name, val);
            });
          }
          );

          const getValue = ( varsInEvaluation => {
            // wait till variableManager is ready
            return this._vars.waitForInit().then( () => {
              if (info == null) {
                parseExprAndAddListener();
              }
              return evaluateExpr(varsInEvaluation);
            }).then( val => {
              if (val !== this._attributesMeta[name].value) {
                this.emit(name, val);
              }
              return val;
            });
          }
          );
          return this._createGetter(name, getValue);
        })(variable);
      }
      super();
    }

    destroy() {
      for (let cl of Array.from(this._exprChangeListeners)) { this._vars.cancelNotifyOnChange(cl); }
      return super.destroy();
    }
  }

  class VariableInputDevice extends Device {
    static initClass() {
  
      this.prototype._input = "";
  
      this.prototype.template = "input";
  
      this.prototype.actions = {
        changeInputTo: {
          params: {
            value: {
              type: t.string
            }
          },
          description: "Sets the variable to the value"
        }
      };
    }

    constructor(config, lastState, framework) {
      super();
      this.config = config;
      this.framework = framework;
      this.name = this.config.name;
      this.id = this.config.id;

      this.attributes = {
        input: {
          description: "The value of the input field",
          type: this.config.type
        }
      };

      this.framework.variableManager.on('variableValueChanged', (this.changeListener = (changedVar, value) => {
        if (this.config.variable !== changedVar.name) { return; }
        return this._setInput(value);
      })
      );

      this._input = __guard__(lastState != null ? lastState.input : undefined, x => x.value) || null;
      super();
    }

    getInput() { return Promise.resolve(this._input); }

    _setInput(value) {
      if (this._input === value) { return; }
      this._input = value;
      return this.emit('input', value);
    }

    changeInputTo(value) {
      const name = this.config.variable;
      const variable = this.framework.variableManager.getVariableByName(name);
      if (variable == null) {
        throw new Error(`Could not find variable with name ${name}`);
      }
      this.framework.variableManager.setVariableToValue(name, value, variable.unit);
      if (this.config.type === "number") {
        if (isNaN(value)) {
          throw new Error("Input value is not a number");
          this._setInput(parseFloat(value));
        }
      } else {
        this._setInput(value);
      }
      return Promise.resolve();
    }

    destroy() {
      this.framework.variableManager.removeListener('variableValueChanged', this.changeListener);
      return super.destroy();
    }
  }
  VariableInputDevice.initClass();


  class VariableTimeInputDevice extends Device {
    static initClass() {
  
      this.prototype._input = "";
  
      this.prototype.template = "inputTime";
  
      this.prototype.actions = {
        changeInputTo: {
          params: {
            value: {
              type: t.string
            }
          },
          description: "Sets the variable to the value"
        }
      };
    }

    constructor(config, lastState, framework) {
      super();
      this.config = config;
      this.framework = framework;
      this.name = this.config.name;
      this.id = this.config.id;

      this.attributes = {
        input: {
          description: "The value of the input field",
          type: this.config.type
        }
      };

      this.framework.variableManager.on('variableValueChanged', (this.changeListener = (changedVar, value) => {
        if (this.config.variable !== changedVar.name) { return; }
        return this._setInput(value);
      })
      );

      this._input = __guard__(lastState != null ? lastState.input : undefined, x => x.value) || null;
      super();
    }

    getInput() { return Promise.resolve(this._input); }

    _setInput(value) {
      if (this._input === value) { return; }
      this._input = value;
      return this.emit('input', value);
    }

    changeInputTo(value) {
      const name = this.config.variable;
      const variable = this.framework.variableManager.getVariableByName(name);
      if (variable == null) {
        throw new Error(`Could not find variable with name ${name}`);
      }
      this.framework.variableManager.setVariableToValue(name, value, variable.unit);
      const timePattern = new RegExp(`^([01]?[0-9]|2[0-3]):[0-5][0-9]`);
      const hourPattern = new RegExp(`\
^[01]?[0-9]|2[0-3]\
`);

      if (value.match(timePattern)) {
        this._setInput(value);
      } else {
        if (value.match(hourPattern)) {
          this._setInput(value(`${textValue}:00`));
        } else {
          throw new Error("Input value is not a valid time");
        }
      }
      return Promise.resolve();
    }

    destroy() {
      this.framework.variableManager.removeListener('variableValueChanged', this.changeListener);
      return super.destroy();
    }
  }
  VariableTimeInputDevice.initClass();


  class DummySwitch extends SwitchActuator {

    constructor(config, lastState) {
      super();
      this.config = config;
      this.name = this.config.name;
      this.id = this.config.id;
      this._state = __guard__(lastState != null ? lastState.state : undefined, x => x.value) || false;
      super();
    }

    changeStateTo(state) {
      this._setState(state);
      return Promise.resolve();
    }

    destroy() {
      return super.destroy();
    }
  }


  class DummyDimmer extends DimmerActuator {

    constructor(config, lastState) {
      super();
      this.config = config;
      this.name = this.config.name;
      this.id = this.config.id;
      this._dimlevel = __guard__(lastState != null ? lastState.dimlevel : undefined, x => x.value) || 0;
      this._state = __guard__(lastState != null ? lastState.state : undefined, x1 => x1.value) || false;
      super();
    }

    // Returns a promise that is fulfilled when done.
    changeDimlevelTo(level) {
      this._setDimlevel(level);
      return Promise.resolve();
    }

    destroy() {
      return super.destroy();
    }
  }

  class DummyShutter extends ShutterController {

    constructor(config, lastState) {
      super();
      this.config = config;
      this.name = this.config.name;
      this.id = this.config.id;
      this.rollingTime = this.config.rollingTime;
      this._position = __guard__(lastState != null ? lastState.position : undefined, x => x.value) || 'stopped';
      super();
    }

    stop() {
      this._setPosition('stopped');
      return Promise.resolve();
    }

    // Returns a promise that is fulfilled when done.
    moveToPosition(position) {
      this._setPosition(position);
      return Promise.resolve();
    }

    destroy() {
      return super.destroy();
    }
  }

  class DummyHeatingThermostat extends HeatingThermostat {
    static initClass() {
  
      this.prototype.actions = {
        changeModeTo: {
          params: {
            mode: {
              type: "string"
            }
          }
        },
        changeTemperatureTo: {
          params: {
            temperatureSetpoint: {
              type: "number"
            }
          }
        },
        changeValveTo: {
          params: {
            valve: {
              type: "number"
            }
          }
        }
      };
    }

    constructor(config, lastState) {
      super();
      this.config = config;
      this.id = this.config.id;
      this.name = this.config.name;
      this._temperatureSetpoint = __guard__(lastState != null ? lastState.temperatureSetpoint : undefined, x => x.value) || 20;
      this._mode = __guard__(lastState != null ? lastState.mode : undefined, x1 => x1.value) || "auto";
      this._battery = __guard__(lastState != null ? lastState.battery : undefined, x2 => x2.value) || "ok";
      this._synced = true;
      super();
    }

    changeModeTo(mode) {
      this._setMode(mode);
      return Promise.resolve();
    }

    changeValveTo(valve) {
      this._setValve(valve);
      return Promise.resolve();
    }

    changeTemperatureTo(temperatureSetpoint) {
      this._setSetpoint(temperatureSetpoint);
      return Promise.resolve();
    }

    destroy() {
      return super.destroy();
    }
  }
  DummyHeatingThermostat.initClass();

  class DummyPresenceSensor extends PresenceSensor {
    static initClass() {
  
      this.prototype.actions = {
        changePresenceTo: {
          params: {
            presence: {
              type: "boolean"
            }
          }
        }
      };
    }

    constructor(config, lastState) {
      super();
      this._resetPresence = this._resetPresence.bind(this);
      this.config = config;
      this.name = this.config.name;
      this.id = this.config.id;
      this._presence = __guard__(lastState != null ? lastState.presence : undefined, x => x.value) || false;
      this._triggerAutoReset();
      super();
    }

    changePresenceTo(presence) {
      this._setPresence(presence);
      this._triggerAutoReset();
      return Promise.resolve();
    }

    _triggerAutoReset() {
      if (this.config.autoReset && this._presence) {
        clearTimeout(this._resetPresenceTimeout);
        return this._resetPresenceTimeout = setTimeout(this._resetPresence, this.config.resetTime);
      }
    }

    _resetPresence() {
      return this._setPresence(false);
    }

    destroy() {
      clearTimeout(this._resetPresenceTimeout);
      return super.destroy();
    }
  }
  DummyPresenceSensor.initClass();


  class DummyContactSensor extends ContactSensor {
    static initClass() {
  
      this.prototype.actions = {
        changeContactTo: {
          params: {
            contact: {
              type: "boolean"
            }
          }
        }
      };
    }

    constructor(config, lastState) {
      super();
      this.config = config;
      this.name = this.config.name;
      this.id = this.config.id;
      this._contact = __guard__(lastState != null ? lastState.contact : undefined, x => x.value) || false;
      super();
    }

    changeContactTo(contact) {
      this._setContact(contact);
      return Promise.resolve();
    }

    destroy() {
      return super.destroy();
    }
  }
  DummyContactSensor.initClass();

  class DummyTemperatureSensor extends TemperatureSensor {
    static initClass() {
  
      this.prototype._humidity = null;
  
      this.prototype.attributes = {
        temperature: {
          description: "The measured temperature",
          type: t.number,
          unit: '°C',
          acronym: 'T'
        },
        humidity: {
          description: "The actual degree of Humidity",
          type: t.number,
          unit: '%'
        }
      };
  
      this.prototype.actions = {
        changeTemperatureTo: {
          params: {
            temperature: {
              type: "number"
            }
          }
        },
        changeHumidityTo: {
          params: {
            humidity: {
              type: "number"
            }
          }
        }
      };
    }

    constructor(config, lastState) {
      super();
      this.config = config;
      this.id = this.config.id;
      this.name = this.config.name;
      this._temperature = __guard__(lastState != null ? lastState.temperature : undefined, x => x.value);
      this._humidity = __guard__(lastState != null ? lastState.humidity : undefined, x1 => x1.value);
      super();
    }

    _setHumidity(value) {
      this._humidity = value;
      return this.emit('humidity', value);
    }

    getHumidity() { return Promise.resolve(this._humidity); }

    changeTemperatureTo(temperature) {
      this._setTemperature(temperature);
      return Promise.resolve();
    }

    changeHumidityTo(humidity) {
      this._setHumidity(humidity);
      return Promise.resolve();
    }

    destroy() {
      return super.destroy();
    }
  }
  DummyTemperatureSensor.initClass();

  class Timer extends Device {
    static initClass() {
  
      this.prototype.attributes = {
        time: {
          description: "The elapsed time",
          type: "number",
          unit: "s",
          displaySparkline: false
        },
        running: {
          description: "Is the timer running?",
          type: "boolean"
        }
      };
  
      this.prototype.actions = {
        startTimer: {
          description: "Starts the timer"
        },
        stopTimer: {
          description: "stops the timer"
        },
        resetTimer: {
          description: "reset the timer"
        }
      };
  
      this.prototype.template = "timer";
    }

    constructor(config, lastState) {
      super();
      this.config = config;
      this.id = this.config.id;
      this.name = this.config.name;
      this._time = __guard__(lastState != null ? lastState.time : undefined, x => x.value) || 0;
      this._running = __guard__(lastState != null ? lastState.running : undefined, x1 => x1.value) || false;
      if (typeof _running !== 'undefined' && _running !== null) { this._setupInterval(); }
      super();
    }

    resetTimer() {
      if (this._time === 0) {
        return Promise.resolve();
      }
      this._time = 0;
      this.emit('time', 0);
      return Promise.resolve();
    }

    startTimer() {
      if (this._running) {
        return Promise.resolve();
      }
      this._running = true;
      this.emit('running', true);
      this._setupInterval();
      return Promise.resolve();
    }

    stopTimer() {
      if (!this._running) {
        return Promise.resolve();
      }
      this._destroyInterval();
      this._running = false;
      this.emit('running', false);
      return Promise.resolve();
    }

    getTime() {
      return Promise.resolve(this._time);
    }

    getRunning() {
      return Promise.resolve(this._running);
    }

    _setupInterval() {
      if (this._interval != null) { return; }
      const res = this.config.resolution;
      const onTick = () => {
        this._time += res;
        return this.emit('time', this._time);
      };
      return this._interval = setInterval(onTick, res * 1000);
    }

    _destroyInterval() {
      clearInterval(this._interval);
      return this._interval = null;
    }

    destroy() {
      this._destroyInterval();
      return super.destroy();
    }
  }
  Timer.initClass();

  class DeviceConfigExtension {
    extendConfigShema(schema) {
      if (schema.extensions == null) { return; }
      return (() => {
        const result = [];
        for (let name in this.configSchema) {
          const def = this.configSchema[name];
          if (Array.from(schema.extensions).includes(name)) {
            result.push(schema.properties[name] = _.clone(def));
          } else {
            result.push(undefined);
          }
        }
        return result;
      })();
    }

    applicable(schema) {
      if (schema.extensions == null) { return; }
      for (let name in this.configSchema) {
        const def = this.configSchema[name];
        if (Array.from(schema.extensions).includes(name)) {
          return true;
        }
      }
      return false;
    }
  }

  class ConfirmDeviceConfigExtention extends DeviceConfigExtension {
    static initClass() {
      this.prototype.configSchema = {
        xConfirm: {
          description: "Triggering a device action needs a confirmation",
          type: "boolean",
          required: false
        }
      };
    }

    apply(config, device) {}
  }
  ConfirmDeviceConfigExtention.initClass(); //should be handled by the frontend

  class LinkDeviceConfigExtention extends DeviceConfigExtension {
    static initClass() {
      this.prototype.configSchema = {
        xLink: {
          description: "Open this link if the device label is clicked on the frontend",
          type: "string",
          required: false
        }
      };
    }

    apply(config, device) {}
  }
  LinkDeviceConfigExtention.initClass(); //should be handled by the frontend

  class XButtonDeviceConfigExtension extends DeviceConfigExtension {
    static initClass() {
      this.prototype.configSchema = {
        xButton: {
          description: "Label for xButton device extension",
          type: "string",
          required: false
        }
      };
    }

    apply(config, device) {}
  }
  XButtonDeviceConfigExtension.initClass(); //should be handled by the frontend

  class PresentLabelConfigExtension extends DeviceConfigExtension {
    static initClass() {
      this.prototype.configSchema = {
        xPresentLabel: {
          description: "The label for the present state",
          type: "string",
          required: false
        },
        xAbsentLabel: {
          description: "The label for the absent state",
          type: "string",
          required: false
        }
      };
    }

    apply(config, device) {
      if ((config.xPresentLabel != null) || (config.xAbsentLabel != null)) {
        device.attributes = _.cloneDeep(device.attributes);
        if (config.xPresentLabel != null) { device.attributes.presence.labels[0] = config.xPresentLabel; }
        if (config.xAbsentLabel != null) { return device.attributes.presence.labels[1] = config.xAbsentLabel; }
      }
    }
  }
  PresentLabelConfigExtension.initClass();


  class SwitchLabelConfigExtension extends DeviceConfigExtension {
    static initClass() {
      this.prototype.configSchema = {
        xOnLabel: {
          description: "The label for the on state",
          type: "string",
          required: false
        },
        xOffLabel: {
          description: "The label for the off state",
          type: "string",
          required: false
        }
      };
    }

    apply(config, device) {
      if ((config.xOnLabel != null) || (config.xOffLabel != null)) {
        device.attributes = _.cloneDeep(device.attributes);
        if (config.xOnLabel != null) { device.attributes.state.labels[0] = config.xOnLabel; }
        if (config.xOffLabel != null) { return device.attributes.state.labels[1] = config.xOffLabel; }
      }
    }
  }
  SwitchLabelConfigExtension.initClass();

  class ContactLabelConfigExtension extends DeviceConfigExtension {
    static initClass() {
      this.prototype.configSchema = {
        xClosedLabel: {
          description: "The label for the closed state",
          type: "string",
          required: false
        },
        xOpenedLabel: {
          description: "The label for the opened state",
          type: "string",
          required: false
        }
      };
    }

    apply(config, device) {
      if ((config.xOpenedLabel != null) || (config.xClosedLabel != null)) {
        device.attributes = _.cloneDeep(device.attributes);
        if (config.xClosedLabel != null) { device.attributes.contact.labels[0] = config.xClosedLabel; }
        if (config.xOpenedLabel != null) { return device.attributes.contact.labels[1] = config.xOpenedLabel; }
      }
    }
  }
  ContactLabelConfigExtension.initClass();

  class AttributeOptionsConfigExtension extends DeviceConfigExtension {
    static initClass() {
      this.prototype.configSchema = {
        xAttributeOptions: {
          description: "Extra attribute options for one or more attributes",
          type: "array",
          required: false,
          items: {
            type: "object",
            required: ["name"],
            properties: {
              name: {
                description: "Name for the corresponding attribute.",
                type: "string"
              },
              displaySparkline: {
                description: "Show a sparkline behind the numeric attribute",
                type: "boolean",
                required: false
              },
              hidden: {
                description: "Hide the attribute in the gui",
                type: "boolean",
                required: false
              }
            }
          }
        }
      };
    }

    apply(config, device) {
      if (config.xAttributeOptions != null) {
        device.attributes = _.cloneDeep(device.attributes);
        return (() => {
          const result = [];
          for (let attrOpts of Array.from(config.xAttributeOptions)) {
            const { name } = attrOpts;
            const attr = device.attributes[name];
            if (attr == null) {
              env.logger.warn(
                `Can't apply xAttributeOptions for \"${name}\". Device ${device.name} \
has no attribute with this name`
              );
              continue;
            }
            if (attrOpts.displaySparkline != null) { attr.displaySparkline = attrOpts.displaySparkline; }
            if (attrOpts.hidden != null) { result.push(attr.hidden = attrOpts.hidden); } else {
              result.push(undefined);
            }
          }
          return result;
        })();
      }
    }
  }
  AttributeOptionsConfigExtension.initClass();

  class DeviceManager extends events.EventEmitter {
    static initClass() {
      this.prototype.devices = {};
      this.prototype.deviceClasses = {};
      this.prototype.deviceConfigExtensions = [];
    }

    constructor(framework, devicesConfig) {
      super();
      this.callDeviceActionReq = this.callDeviceActionReq.bind(this);
      this.callDeviceActionSocket = this.callDeviceActionSocket.bind(this);
      this.framework = framework;
      this.devicesConfig = devicesConfig;
      this.deviceConfigExtensions.push(new ConfirmDeviceConfigExtention());
      this.deviceConfigExtensions.push(new LinkDeviceConfigExtention());
      this.deviceConfigExtensions.push(new XButtonDeviceConfigExtension());
      this.deviceConfigExtensions.push(new PresentLabelConfigExtension());
      this.deviceConfigExtensions.push(new SwitchLabelConfigExtension());
      this.deviceConfigExtensions.push(new ContactLabelConfigExtension());
      this.deviceConfigExtensions.push(new AttributeOptionsConfigExtension());
    }

    registerDeviceClass(className, {configDef, createCallback, prepareConfig}) {
      assert(typeof className === "string", "className must be a string");
      assert(typeof configDef === "object", "configDef must be an object");
      assert(typeof createCallback === "function", "createCallback must be a function");
      assert((prepareConfig != null) ? typeof prepareConfig === "function" : true);
      assert(typeof configDef.properties === "object", `\
configDef must have a property "properties"\
`
      );
      configDef.properties.id = {
        description: "The ID for the device",
        type: "string"
      };
      configDef.properties.name = {
        description: "The name for the device",
        type: "string"
      };
      configDef.properties.class = {
        description: "The class to use for the device",
        type: "string"
      };
      const pluginName = this.framework.pluginManager.getCallingPlugin();

      for (let extension of Array.from(this.deviceConfigExtensions)) {
        extension.extendConfigShema(configDef);
      }

      this.framework._normalizeScheme(configDef);
      return this.deviceClasses[className] = {
        prepareConfig,
        configDef,
        createCallback,
        pluginName
      };
    }

    updateDeviceOrder(deviceOrder) {
      assert((deviceOrder != null) && Array.isArray(deviceOrder));
      this.framework.config.devices = (this.devicesConfig = _.sortBy(this.devicesConfig,  device => {
        const index = deviceOrder.indexOf(device.id);
        if (index === -1) { return 99999; } else { return index; } // push it to the end if not found
      }));
      this.framework.saveConfig();
      this.framework._emitDeviceOrderChanged(deviceOrder);
      return deviceOrder;
    }

    registerDevice(device, isNew) {
      if (isNew == null) { isNew = true; }
      assert(device != null);
      assert(device instanceof env.devices.Device);
      assert(device._constructorCalled);

      if (device.logger == null) {
        let pluginName;
        const classInfo = this.deviceClasses[device.config.class];
        if (classInfo != null) {
          ({ pluginName } = classInfo);
        } else {
          pluginName = this.framework.pluginManager.getCallingPlugin();
        }
        const deviceLogger = env.logger.base.createSublogger([pluginName, device.config.class]);
        device.logger = deviceLogger;
      }

      if (isNew && (this.devices[device.id] != null)) {
        throw new Error(`Duplicate device id \"${device.id}\"`);
      }
      if (!device.id.match(/^[a-z0-9\-_]+$/i)) {
        env.logger.warn(`\
The id of ${device.id} contains a non alphanumeric letter or symbol.
This could lead to errors.\
`
        );
      }
      for (let reservedWord of [" and ", " or "]) {
        if (device.name.indexOf(reservedWord) !== -1) {
          env.logger.warn(`\
Name of device "${device.id}" contains an "${reservedWord}".
This could lead to errors in rules.\
`
          );
        }
      }

      if (!(device instanceof ErrorDevice)) {
        if (isNew) {
          env.logger.info(`New device \"${device.name}\"...`);
        } else {
          env.logger.info(`Recreating \"${device.name}\"...`);
        }
      }

      this.devices[device.id]=device;

      for (let attrName in device.attributes) {
        const attr = device.attributes[attrName];
        ((attrName, attr) => {
          let onChange;
          return device.on(attrName, (onChange = value => {
            return this.framework._emitDeviceAttributeEvent(device, attrName, attr,  new Date(), value);
          })
          );
        })(attrName, attr);
      }

      this._checkDestroyFunction(device);
      device.afterRegister();
      if (isNew) { this.framework._emitDeviceAdded(device); }
      return device;
    }

    _loadDevice(deviceConfig, lastDeviceState, oldDevice = null) {
      const isNew = (oldDevice == null);
      const classInfo = this.deviceClasses[deviceConfig.class];
      if (classInfo == null) {
        throw new Error(`Unknown device class \"${deviceConfig.class}\"`);
      }
      const warnings = [];
      if (classInfo.prepareConfig != null) { classInfo.prepareConfig(deviceConfig); }
      this.framework._normalizeScheme(classInfo.configDef);
      this.framework._validateConfig(
        deviceConfig,
        classInfo.configDef,
          `config of device \"${deviceConfig.id}\"`
      );
      deviceConfig = declapi.enhanceJsonSchemaWithDefaults(classInfo.configDef, deviceConfig);

      const deviceLogger = env.logger.base.createSublogger([classInfo.pluginName, deviceConfig.class]);

      if ((oldDevice != null) && !oldDevice._destroyed) {
        oldDevice.destroy();
        assert(
          oldDevice._destroyed,
          `The device subclass ${oldDevice.config.class} did not call super() in destroy()`
        );
      }

      const device = classInfo.createCallback(deviceConfig, lastDeviceState, deviceLogger);
      device.logger = deviceLogger;
      assert(deviceConfig === device.config, `\
You must assign the config to your device in the the constructor function of your device:
"@config = config"\
`
      );
      for (let name in lastDeviceState) {
        const valueAndTime = lastDeviceState[name];
        if (device.attributes[name] != null) {
          const meta = device._attributesMeta[name];
          if (meta == null) { continue; }
          // Do not set `meta.value` here, because internal state and meta could be divergent
          // Should be better handled in a new pimatic "major" version
          meta.history = [{t:valueAndTime.time, v: valueAndTime.value}];
        }
      }

      for (let extension of Array.from(this.deviceConfigExtensions)) {
        if (extension.applicable(classInfo.configDef)) {
          extension.apply(device.config, device);
        }
      }

      return this.registerDevice(device, isNew);
    }

    _loadErrorDevice(deviceConfig, error) {
      return this.registerDevice(new ErrorDevice(deviceConfig, error));
    }

    loadDevices() {
      return Promise.each(this.devicesConfig, deviceConfig => {
        return this.framework.database.getLastDeviceState(deviceConfig.id).then( lastDeviceState => {
          const classInfo = this.deviceClasses[deviceConfig.class];
          if (classInfo != null) {
            try {
              return this._loadDevice(deviceConfig, lastDeviceState);
            } catch (e) {
              env.logger.error(`Error loading device \"${deviceConfig.id}\": ${e.message}`);
              env.logger.debug(e.stack);
              return this._loadErrorDevice(deviceConfig, e.message);
            }
          } else {
            env.logger.warn(`\
No plugin found for device "${deviceConfig.id}" of class "${deviceConfig.class}"!\
`);
            return this._loadErrorDevice(deviceConfig, "Plugin not loaded");
          }
        });
      });
    }


    getDeviceById(id) { return this.devices[id]; }

    getDevices() { return ((() => {
      const result = [];
      for (let id in this.devices) {
        const device = this.devices[id];
        result.push(device);
      }
      return result;
    })()); }

    getDeviceClasses() { return ((() => {
      const result = [];
      for (let className in this.deviceClasses) {
        result.push(className);
      }
      return result;
    })()); }

    getDeviceConfigSchema(className){ return (this.deviceClasses[className] != null ? this.deviceClasses[className].configDef : undefined); }

    addDeviceByConfig(deviceConfig) {
      assert(deviceConfig.id != null);
      assert(deviceConfig.class != null);
      if (this.isDeviceInConfig(deviceConfig.id)) {
        throw new Error(
          `A device with the ID \"${deviceConfig.id}\" is already in the config.`
        );
      }
      const device = this._loadDevice(deviceConfig, {});
      this.addDeviceToConfig(deviceConfig);
      return device;
    }

    _checkDestroyFunction(device) {
      if (device.destroy === Device.prototype.destroy) {
        const deviceClass = device.config.class;
        if (this._alreadyWarnedFor == null) {
          this._alreadyWarnedFor = {};
        }
        if (this._alreadyWarnedFor[deviceClass] != null) {
          return;
        }
        this._alreadyWarnedFor[deviceClass] = true;
        return env.logger.warn(`The device type ${deviceClass} does not implement a destroy function`);
      }
    }

    recreateDevice(oldDevice, newDeviceConfig) {
      return this.framework.database.getLastDeviceState(oldDevice.id).then( lastDeviceState => {
        let newDevice;
        let loadDeviceError = null;
        try {
          newDevice = this._loadDevice(newDeviceConfig, lastDeviceState, oldDevice);
        } catch (err) {
          loadDeviceError = err;
          if (oldDevice._destroyed) {
            // the old device was destroyed but there was an error creating the new device,
            // we have to recreate the original (old) device
            try {
              newDevice = this._loadDevice(oldDevice.config, lastDeviceState, oldDevice);
            } catch (error) {
              // we failed to restore the old destroyed device, we log this error and
              // rethrow the first error
              err = error;
              const logger = oldDevice.logger || env.logger;
              logger.error(`Error restoring changed device ${oldDevice.id}: ${err.message}`);
              logger.debug(err.stack);
              throw loadDeviceError;
            }
          } else {
            // the old device was not destroyed, so just throw the load device error
            throw loadDeviceError;
          }
        }
        this.framework._emitDeviceChanged(newDevice);
        oldDevice.emit('changed', newDevice);
        this.emit('deviceChanged', newDevice);

        // rethrow the error if the creation of the device with the new config failed
        if (loadDeviceError != null) {
          throw loadDeviceError;
        }
        return newDevice;
      });
    }

    discoverDevices(time) {
      if (time == null) { time = 20000; }
      env.logger.info(`Starting device discovery for ${time}ms.`);
      return this.emit('discover', {time});
    }

    discoverMessage(pluginName, message) {
      env.logger.info(`${pluginName}: ${message}`);
      return this.emit('discoverMessage', {pluginName, message});
    }

    discoveredDevice(pluginName, deviceName, config) {
      env.logger.info(`Device discovered: ${pluginName}: ${deviceName}`);
      return this.emit('deviceDiscovered', {pluginName, deviceName, config});
    }

    updateDeviceByConfig(deviceConfig) {
      if (deviceConfig.id == null) {
        throw new Error("No id given");
      }
      const device = this.getDeviceById(deviceConfig.id);
      if (device == null) {
        throw new Error('device not found');
      }
      return this.recreateDevice(device, deviceConfig);
    }

    removeDevice(deviceId) {
      const device = this.getDeviceById(deviceId);
      if (device == null) { return; }
      delete this.devices[deviceId];
      this.emit('deviceRemoved', device);
      device.emit('remove');
      device.destroy();
      assert(
        device._destroyed,
        `The device subclass ${device.config.class} did not call super() in destroy()`
      );
      device.emit('destroyed');
      return device;
    }

    addDeviceToConfig(deviceConfig) {
      assert(deviceConfig.id != null);
      assert(deviceConfig.class != null);

      // Check if device is already in the deviceConfig:
      const present = this.isDeviceInConfig(deviceConfig.id);
      if (present) {
        throw new Error(
          `An device with the ID ${deviceConfig.id} is already in the config`
        );
      }
      this.devicesConfig.push(deviceConfig);
      return this.framework.saveConfig();
    }


    callDeviceActionReq(params, req) {
      const { deviceId } = req.params;
      const { actionName } = req.params;
      const device = this.getDeviceById(deviceId);
      if (device == null) {
        throw new Error('device not found');
      }
      if (!device.hasAction(actionName)) {
        throw new Error('device hasn\'t that action');
      }
      const action = device.actions[actionName];
      return declapi.callActionFromReq(actionName, action, device, req);
    }

    callDeviceActionSocket(params, call) {
      const { deviceId } = call.params;
      const { actionName } = call.params;
      const device = this.getDeviceById(deviceId);
      if (device == null) {
        throw new Error('device not found');
      }
      if (!device.hasAction(actionName)) {
        throw new Error('device hasn\'t that action');
      }
      const action = device.actions[actionName];
      call = _.clone(call);
      call.action = actionName;
      return declapi.callActionFromSocket(device, action, call);
    }

    isDeviceInConfig(id) {
      assert(id != null);
      for (let d of Array.from(this.devicesConfig)) {
        if (d.id === id) { return true; }
      }
      return false;
    }

    initDevices() {
      const deviceConfigDef = require("../device-config-schema");
      const defaultDevices = [
        env.devices.ButtonsDevice,
        env.devices.VariablesDevice,
        env.devices.VariableInputDevice,
        env.devices.VariableTimeInputDevice,
        env.devices.DummySwitch,
        env.devices.DummyDimmer,
        env.devices.DummyShutter,
        env.devices.DummyHeatingThermostat,
        env.devices.DummyContactSensor,
        env.devices.DummyPresenceSensor,
        env.devices.DummyTemperatureSensor,
        env.devices.Timer
      ];
      return Array.from(defaultDevices).map((deviceClass) =>
        (deviceClass => {
          return this.registerDeviceClass(deviceClass.name, {
            configDef: deviceConfigDef[deviceClass.name],
            createCallback: (config, lastState) => {
              return new deviceClass(config, lastState, this.framework);
            }
          });
        })(deviceClass));
    }
  }
  DeviceManager.initClass();

  return exports = {
    DeviceManager,
    Device,
    ErrorDevice,
    Actuator,
    SwitchActuator,
    PowerSwitch,
    DimmerActuator,
    ShutterController,
    Sensor,
    TemperatureSensor,
    PresenceSensor,
    ContactSensor,
    HeatingThermostat,
    ButtonsDevice,
    VariablesDevice,
    VariableInputDevice,
    VariableTimeInputDevice,
    AVPlayer,
    DummySwitch,
    DummyDimmer,
    DummyShutter,
    DummyHeatingThermostat,
    DummyContactSensor,
    DummyPresenceSensor,
    DummyTemperatureSensor,
    Timer,
    DeviceConfigExtension
  };
};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}