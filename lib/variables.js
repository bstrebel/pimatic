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
Variable Manager
===========
*/

const assert = require('cassert');
const util = require('util');
const Promise = require('bluebird');
const _ = require('lodash');
const S = require('string');
const M = require('./matcher');
const humanFormat = require('human-format');
const isNumber = n => `${n}`.match(/^-?[0-9]+\.?[0-9]*$/) != null;
const varsAst = require('./variables-ast-builder');

module.exports = function(env) {

  let exports;
  class Variable {
    static initClass() {
      this.prototype.name = null;
      this.prototype.value = null;
      this.prototype.type = 'value';
      this.prototype.readonly = false;
      this.prototype.unit = null;
    }

    constructor(_vars, name, type, unit, readonly) {
      this._vars = _vars;
      this.name = name;
      this.type = type;
      this.unit = unit;
      this.readonly = readonly;
      assert(this._vars != null);
      assert(this._vars instanceof VariableManager);
      assert(typeof this.name === "string");
      assert(typeof this.type === "string");
      assert(typeof this.readonly === "boolean");
    }

    getCurrentValue() { return this.value; }
    _setValue(value) {
      if (isNumber(value)) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) { value = numValue; }
      }
      this.value = value;
      this._vars._emitVariableValueChanged(this, this.value);
      return true;
    }
    toJson() { return {
      name: this.name,
      readonly: this.readonly,
      type: this.type,
      value: this.value,
      unit: this.unit || ''
    }; }
  }
  Variable.initClass();

  class DeviceAttributeVariable extends Variable {
    constructor(vars, _device, _attrName) {
      super();
      this.destroy = this.destroy.bind(this);
      this._device = _device;
      this._attrName = _attrName;
      super(
        vars, 
        `${this._device.id}.${this._attrName}`, 
        'attribute', 
        this._device.attributes[this._attrName].unit, 
        true
      );
      this._addListener();
    }

    _addListener() {
      this._device.on(this._attrName, (this._attrListener = value => this._setValue(value)) );
      this._device.on('changed', (this._deviceChangedListener = newDevice => {
        if (newDevice.hasAttribute(this._attrName)) {
          this.unit = newDevice.attributes[this._attrName].unit;
          this._removeListener();
          this._device = newDevice;
          return this._addListener();
        } else {
          return this._vars._removeDeviceAttributeVariable(this.name);
        }
      })
      );
      return this._device.on('destroyed', (this._deviceDestroyedListener = () => {
        return this._vars._removeDeviceAttributeVariable(this.name);
      })
      );
    }

    _removeListener() {
      this._device.removeListener(this._attrName, this._attrListener);
      this._device.removeListener("changed", this._deviceChangedListener);
      return this._device.removeListener("destroyed", this._deviceDestroyedListener);
    }
      
    getUpdatedValue(varsInEvaluation) { 
      if (varsInEvaluation == null) { varsInEvaluation = {}; }
      return this._device.getUpdatedAttributeValue(this._attrName, varsInEvaluation);
    }

    destroy() {
      this._removeListener();
    }
  }


  class ExpressionValueVariable extends Variable {
    constructor(vars, name, type, unit, valueOrExpr = null) {
      super(vars, name, type, unit, false);
      assert(['value', 'expression'].includes(type));
      if (valueOrExpr != null) {
        switch (type) {
          case 'value': this.setToValue(valueOrExpr, unit); break;
          case 'expression': this.setToExpression(valueOrExpr, unit); break;
          default: assert(false);
        }
      }
    }

    setToValue(value, unit) {
      this._removeListener();
      this.type = "value";
      this._datatype = null;
      this.exprInputStr = null;
      this.exprTokens = null;
      this.unit = unit;
      return this._setValue(value);
    }

    setToExpression(expression, unit) {
      const {tokens, datatype} = this._vars.parseVariableExpression(expression);
      this.exprInputStr = expression;
      this.exprTokens = tokens;
      this._datatype = datatype;
      this._removeListener();
      this.type = "expression";
      this.unit = unit;
      const variablesInExpr = (Array.from(tokens).filter((t) => this._vars.isAVariable(t)).map((t) => t.substring(1)));
      const doUpdate = ( () => {
        return this.getUpdatedValue().then( value => { 
          return this._setValue(value);
        }).catch( error => {
          env.logger.error("Error updating expression value:", error.message);
          env.logger.debug(error);
          return error;
        });
      }
      );
      this._vars.on('variableValueChanged', (this._changeListener = (changedVar, value) => {
        if (!Array.from(variablesInExpr).includes(changedVar.name)) { return; }
        return doUpdate();
      })
      );
      return doUpdate();
    }

    _removeListener() {
      if (this._changeListener != null) {
        this._vars.removeListener('variableValueChanged', this._changeListener);
        return this.changeListener = null;
      }
    }

    getUpdatedValue(varsInEvaluation){
      if (varsInEvaluation == null) { varsInEvaluation = {}; }
      if (this.type === "value") { return Promise.resolve(this.value);
      } else { 
        assert(this.exprTokens != null);
        return this._vars.evaluateExpression(this.exprTokens, varsInEvaluation);
      }
    }

    toJson() {
      const jsonObject = super.toJson();
      if (this.type === "expression") {
        jsonObject.exprInputStr = this.exprInputStr;
        jsonObject.exprTokens = this.exprTokens;
      }
      return jsonObject;
    }
    
    destroy() {
      return this._removeListener();
    }
  }


  /*
  The Variable Manager
  ----------------
  */
  class VariableManager extends require('events').EventEmitter {
    static initClass() {
  
      this.prototype.variables = {};
      this.prototype.functions = {
        min: {
          args: {
            numbers: {
              type: "number",
              multiple: true
            }
          },
          exec(...args) { return _.reduce(_.map(args, parseFloat), (a, b) => Math.min(a,b)); }
        },
        max: {
          args: {
            numbers: {
              type: "number",
              multiple: true
            }
          },
          exec(...args) { return _.reduce(_.map(args, parseFloat), (a, b) => Math.max(a,b)); }
        },
        avg: {
          args: {
            numbers: {
              type: "number",
              multiple: true
            }
          },
          exec(...args) {  return _.reduce(_.map(args, parseFloat), (a, b) => a+b) / args.length; }
        },    
        random: {
          args: {
            min: {
              type: "number"
            },
            max: {
              type: "number"
            }
          },
          exec(min, max) { 
            const minf = parseFloat(min);
            const maxf = parseFloat(max);
            return Math.floor( Math.random() * ((maxf+1)-minf) ) + minf;
          }
        },
        pow: {
          description: "Returns the base to the exponent power",
          args: {
            base: {
              description: "A numeric expression for base number",
              type: "number"
            },
            exponent: {
              description: "A numeric expression the exponent. If omitted base 2 is applied",
              type: "number",
              optional: true
            }
          },
          exec(base, exponent) {
            if (exponent == null) { exponent = 2; }
            return Math.pow(base, exponent);
          }
        },
        sqrt: {
          description: "Returns the square root of a number",
          args: {
            x: {
              description: "A numeric expression",
              type: "number"
            }
          },
          exec(x) {
            return Math.sqrt(x);
          }
        },
        cos: {
          description: "Returns the cosine of a number",
          args: {
            x: {
              description: "A numeric expression for the radians",
              type: "number"
            }
          },
          exec(x) {
            return Math.cos(x);
          }
        },
        acos: {
          description: `\
Returns the arccosine (in radians) of a number
if it's between -1 and 1; otherwise, NaN\
`,
          args: {
            x: {
              description: "A numeric expression",
              type: "number"
            }
          },
          exec(x) {
            return Math.acos(x);
          }
        },
        round: {
          args: {
            number: {
              type: "number"
            },
            decimals: {
              type: "number",
              optional: true
            }
          },
          exec(value, decimals) { 
            if (decimals == null) {
              decimals = 0;
            }
            const multiplier = Math.pow(10, decimals);
            return Math.round(value * multiplier) / multiplier;
          }
        },
        roundToNearest: {
          args: {
            number: {
              type: "number"
            },
            steps: {
              type: "number"
            }
          },
          exec(number, steps) {
            steps = String(steps);
            const decimals = ((steps % 1) !== 0 ? steps.substr(steps.indexOf(".") + 1).length : 0);
            return Number((Math.round(number / steps) * steps).toFixed(decimals));
          }
        },
        timeFormat: {
          args: {
            number: {
              type: "number"
            }
          },
          exec(number) {
            let hours = parseInt(number);
            const decimalMinutes = (number-hours) * 60;
            let minutes = Math.floor(decimalMinutes);
            let seconds = Math.round((decimalMinutes % 1) * 60);
            if (seconds === 60) {
              minutes += 1;
              seconds = "0";
            }
            if (minutes === 60) {
              hours += 1;
              minutes = "0";
            }
            if (hours < 10) { hours = `0${hours}`; }
            if (minutes < 10) { minutes = `0${minutes}`; }
            if (seconds < 10) { seconds = `0${seconds}`; }
            return `${hours}:${minutes}:${seconds}`;
          }
        },
        timeDecimal: {
          args: {
            time: {
              type: "string"
            }
          },
          exec(time) {
            const hours = time.substr(0, time.indexOf(':'));
            const minutes = time.substr(hours.length + 1, 2);
            const seconds = time.substr(hours.length + minutes.length + 2, 2);
  
            return parseInt(hours) + parseFloat(minutes / 60) + parseFloat(seconds / 3600);
          }
        },
        date: {
          args: {
            format: {
              type: "string",
              optional: true
            }
          },
          exec(format) { return (new Date()).format((format != null) ? format : 'YYYY-MM-DD hh:mm:ss'); }
        },
        formatNumber: {
          args: {
            number: {
              type: "number"
            },
            decimals: {
              type: "number",
              optional: true
            },
            unit: {
              type: "string",
              optional: true
            }
          },
          exec(number, decimals, unit) {
            let formatted;
            if (unit == null) {
              unit = this.units[0];
              const info = humanFormat.raw(number, {unit});
              formatted = ((decimals != null) ? Number(info.value).toFixed(decimals) : info.value);
              return `${formatted}${info.prefix}${unit}`;
            } else {
              if (decimals == null) {
                decimals = 2;
              }
              formatted = Number(number).toFixed(decimals);
              return `${formatted}${unit}`;
            }
          }
        },
        hexString: {
          description: `\
Converts a given number to a hex string\
`,
          args: {
            number: {
              description: `\
The input number. Negative numbers will be treated as 32-bit
signed integers. Thus, numbers smaller than -2147483648 will
be cut off which is due to limitation of using bitwise operators
in JavaScript. Positive integers will be handled up to 53-bit
as JavaScript uses IEEE 754 double-precision floating point
numbers, internally\
`,
              type: "number"
            },
            padding: {
              description: `\
Specifies the (minimum) number of digits the resulting string
shall contain. The string will be padded by prepending leading
"0" digits, accordingly. By default, padding is set to 0 which
means no padding is performed\
`,
              type: "number",
              optional: true
            },
            prefix: {
              description: `\
Specifies a prefix string which will be prepended to the
resulting hex number. By default, no prefix is set\
`,
              type: "string",
              optional: true
            }
          },
          exec(number, padding, prefix) {
            if (padding == null) { padding = 0; }
            if (prefix == null) { prefix = ""; }
            try {
              padding = Math.max(Math.min(padding, 10), 0);
              let hex = Number(number < 0 ? number >>> 0 : 0).toString(16).toUpperCase();
              if (hex.length < padding) {
                hex = Array((padding + 1) - hex.length).join('0') + hex;
              }
              return prefix + hex;
            } catch (error) {
              env.logger.error(`Error in hexString expression: ${error.message}`);
              throw error;
            }
          }
        },
        subString: {
          description: `\
Returns the substring of the given string matching the given regular expression
and flags. If the global flag is used the resulting substring is a concatenation
of all matches. If the expression contains capture groups the group matches will
be concatenated to provide the resulting substring. If there is no match the
empty string is returned\
`,
          args: {
            string: {
              description: `\
The input string which is a string expression which may also contain variable
references and function calls\
`,
              type: "string"
            },
            expression: {
              description: "A string value which may contain a regular expression",
              type: "string"
            },
            flags: {
              description: `\
A string with flags for a regular expression: g: global match,
i: ignore case\
`,
              type: "string",
              optional: true
            }
          },
          exec(string, expression, flags) {
            let matchResult;
            try {
              matchResult = string.match(new RegExp(expression, flags));
            } catch (error) {
              env.logger.error(`Error in subString expression: ${error.message}`);
              throw error;
            }
  
            if (matchResult != null) {
              if ((flags != null) && flags.includes('g')) {
               // concatenate all global matches
                return _.reduce(matchResult, (fullMatch, val) => fullMatch = fullMatch + val);
              } else {
                // concatenate all matched capture groups (if any) or prompt the match result
                if (_.isString(matchResult[1])) {
                  matchResult.shift();
                  return _.reduce(matchResult, function(fullMatch, val) {
                    if (_.isString(val)) { return fullMatch = fullMatch + val; }
                });
                } else {
                  return matchResult[0];
                }
              }
            } else {
              env.logger.debug("subString expression did not match");
              return "";
            }
          }
        }
      };
  
      this.prototype.inited = false;
    }

    constructor(framework, variablesConfig) {
      super();
      this.framework = framework;
      this.variablesConfig = variablesConfig;
      // For each new device add a variable for every attribute
      this.framework.on('deviceAdded', device => {
        return (() => {
          const result = [];
          for (let attrName in device.attributes) {
            const attr = device.attributes[attrName];
            result.push(this._addVariable(
                new DeviceAttributeVariable(this, device, attrName)
            ));
          }
          return result;
        })();
      });
    }


    init() {
      // Import variables
      const setExpressions = [];

      for (let variable of Array.from(this.variablesConfig)) {
        (variable => {
          assert((variable.name != null) && (variable.name.length > 0));
          if (variable.name[0] === '$') { variable.name = variable.name.substring(1); }
          if (variable.expression != null) {
            try {
              const exprVar = new ExpressionValueVariable(
                this, 
                variable.name,
                'expression',
                variable.unit
              );
              // We first add the variable, but parse the expression later, because it could
              // contain other variables, added later
              this._addVariable(exprVar);
              return setExpressions.push( function() { 
                try {
                  return exprVar.setToExpression(variable.expression.trim());
                } catch (error1) {
                  env.logger.error(
                    `Error parsing expression variable ${variable.name}:`, e.message
                  );
                  return env.logger.debug(e);
                }
              });
            } catch (error) {
              var e = error;
              env.logger.error(
                `Error adding expression variable ${variable.name}:`, e.message
              );
              return env.logger.debug(e.stack);
            }
          } else {
            return this._addVariable(
              new ExpressionValueVariable(
                this, 
                variable.name, 
                'value',
                variable.unit,
                variable.value
              )
            );
          }
        })(variable);
      }

      for (let setExpr of Array.from(setExpressions)) { setExpr(); }
      this.inited = true;
      return this.emit('init');
    }

    waitForInit() {
      return new Promise( resolve => {
        if (this.inited) { return resolve(); }
        return this.once('init', resolve);
      });
    }

    _addVariable(variable) {
      assert(variable instanceof Variable);
      assert(((this.variables[variable.name] == null)));
      this.variables[variable.name] = variable;
      Promise.resolve().then( () => variable.getUpdatedValue().then( value => variable._setValue(value))).catch( function(error) {
        env.logger.warn(`Could not update variable ${variable.name}: ${error.message}`);
        return env.logger.debug(error);
      });
      this._emitVariableAdded(variable);
    }

    _emitVariableValueChanged(variable, value) {
      return this.emit('variableValueChanged', variable, value);
    }

    _emitVariableAdded(variable) {
      return this.emit('variableAdded', variable);
    }

    _emitVariableChanged(variable) {
      return this.emit('variableChanged', variable);
    }

    _emitVariableRemoved(variable) {
      return this.emit('variableRemoved', variable);
    }

    getVariablesAndFunctions(ops) { 
      if (ops == null) {
        return {variables: this.variables, functions: this.functions};
      } else {
        const filteredVars = _.filter(this.variables, ops);
        const variables = {};
        for (let v of Array.from(filteredVars)) {
          variables[v.name] = v;
        }
        return {
          variables,
          functions: this.functions
        };
      }
    }
     

    parseVariableExpression(expression) {
      let tokens = null;
      const context = M.createParseContext(this.variables, this.functions);
      const m = M(expression, context).matchAnyExpression( (m, ts) => tokens = ts);
      if (!m.hadMatch() || (m.getFullMatch() !== expression)) {
        throw new Error("Could not parse expression");
      }
      const datatype = (tokens[0][0] === '"' ? "string" : "numeric");
      return {tokens, datatype};
    }


    setVariableToExpr(name, inputStr, unit) {
      let variable;
      assert((name != null) && (typeof name === "string"));
      assert((typeof inputStr === "string") && (inputStr.length > 0));

      if (this.variables[name] == null) {
        this._addVariable(
          variable = new ExpressionValueVariable(this, name, 'expression', unit, inputStr)
        );
      } else {
        variable = this.variables[name];
        if (!["expression", "value"].includes(variable.type)) {
          throw new Error("Can not set a non expression or value var to an expression");
        }
        variable.setToExpression(inputStr, unit);
        this._emitVariableChanged(variable);
      }
      return variable;
    }
    


    _checkVariableName(name) {
      if (!name.match(/^[a-z0-9\-_]+$/i)) {
        throw new Error(
          "Variable name must only contain alpha numerical symbols, \"-\" and  \"_\""
        );
      }
    }

    setVariableToValue(name, value, unit) {
      let variable;
      assert((name != null) && (typeof name === "string"));
      this._checkVariableName(name);

      if (this.variables[name] == null) {
        this._addVariable(
          variable = new ExpressionValueVariable(this, name, 'value', unit, value)
        );
      } else {
        variable = this.variables[name];
        if (!["expression", "value"].includes(variable.type)) {
          throw new Error("Can not set a non expression or value var to an expression");
        }
        if (variable.type === "expression") {
          variable.setToValue(value, unit);
          this._emitVariableChanged(variable);
        } else if (variable.type === "value") {
          variable.setToValue(value, unit);
        }
      }
      return variable;
    }


    updateVariable(name, type, valueOrExpr, unit) {
      assert(["value", "expression"].includes(type));
      if (!this.isVariableDefined(name)) {
        throw new Error(`No variable with the name \"${name}\" found.`);
      }
      return ((() => { 
        switch (type) {
          case "value": return this.setVariableToValue(name, valueOrExpr, unit);
          case "expression": return this.setVariableToExpr(name, valueOrExpr, unit);
      
        } })());
    }

    addVariable(name, type, valueOrExpr, unit) {
      assert(["value", "expression"].includes(type));
      if (this.isVariableDefined(name)) {
        throw new Error(`There is already a variable with the name \"${name}\"`);
      }
      return ((() => { 
        switch (type) {
          case "value": return this.setVariableToValue(name, valueOrExpr, unit);
          case "expression": return this.setVariableToExpr(name, valueOrExpr, unit);
      
        } })());
    }

    isVariableDefined(name) {
      assert((name != null) && (typeof name === "string"));
      return (this.variables[name] != null);
    }

    getVariableValue(name) { return (this.variables[name] != null ? this.variables[name].value : undefined); }

    getVariableUpdatedValue(name, varsInEvaluation) {
      if (varsInEvaluation == null) { varsInEvaluation = {}; }
      assert((name != null) && (typeof name === "string"));
      if (this.variables[name] != null) {
        if (varsInEvaluation[name] != null) {
          if (varsInEvaluation[name].value != null) {
            return Promise.resolve(varsInEvaluation[name].value);
          } else { 
            return Promise.try(() => { throw new Error(`Dependency cycle detected for variable ${name}`); });
          }
        } else {
          varsInEvaluation[name] = {};
          return this.variables[name].getUpdatedValue(varsInEvaluation).then( value => {
            varsInEvaluation[name].value = value;
            return value;
          });
        }
      } else {
        return null;
      }
    }

    removeVariable(name) {
      assert((name != null) && (typeof name === "string"));
      const variable = this.variables[name];
      if (variable != null) {
        if (variable.type === 'attribute') {
          throw new Error("Can not delete a variable for a device attribute.");
        }
        variable.destroy();
        delete this.variables[name];
        return this._emitVariableRemoved(variable);
      }
    }

    _removeDeviceAttributeVariable(name) {
      assert((name != null) && (typeof name === "string"));
      const variable = this.variables[name];
      if (variable != null) {
        if (variable.type !== 'attribute') {
          throw new Error("Not a device attribute.");
        }
        variable.destroy();
        delete this.variables[name];
        return this._emitVariableRemoved(variable);
      }
    }

    getVariables() {
      let name;
      const variables = ((() => {
        const result = [];
        for (name in this.variables) {
          const v = this.variables[name];
          result.push(v);
        }
        return result;
      })());
      // sort in config order
      const variablesInConfig = _.map(this.framework.config.variables, r => r.name );
      return _.sortBy(variables, r => variablesInConfig.indexOf(r.name) );
    }

    getFunctions() { return this.functions; }

    getVariableByName(name) {
      const v = this.variables[name];
      if (v == null) { return null; }
      return v;
    }

    isAVariable(token) { return (token.length > 0) && (token[0] === '$'); }

    extractVariables(tokens) {
      let vars;
      return (vars = (Array.from(tokens).filter((t) => this.isAVariable(t)).map((t) => t.substring(1))));
    }

    notifyOnChange(tokens, listener) {
      let changeListener;
      const variablesInExpr = this.extractVariables(tokens);
      this.on('variableValueChanged', (changeListener = (changedVar, value) => {
        if (!Array.from(variablesInExpr).includes(changedVar.name)) { return; }
        return listener(changedVar);
      })
      );
      return listener.__variableChangeListener = changeListener;
    }

    cancelNotifyOnChange(listener) {
      assert(typeof listener.__variableChangeListener === "function");
      return this.removeListener('variableValueChanged', listener.__variableChangeListener);
    }

    evaluateExpression(tokens, varsInEvaluation) {
      if (varsInEvaluation == null) { varsInEvaluation = {}; }
      const builder = new varsAst.ExpressionTreeBuilder(this.variables, this.functions);
      // do building async
      return Promise.resolve().then( () => {
        const expr = builder.build(tokens);
        return expr.evaluate(varsInEvaluation);
      });
    }

    evaluateExpressionWithUnits(tokens, varsInEvaluation) {
      if (varsInEvaluation == null) { varsInEvaluation = {}; }
      const builder = new varsAst.ExpressionTreeBuilder(this.variables, this.functions);
      // do building async
      return Promise.resolve().then( () => {
        const expr = builder.build(tokens);
        return expr.evaluate(varsInEvaluation).then( value => {
          return { value, unit: expr.getUnit() };
        });
      });
    }

    inferUnitOfExpression(tokens) {
      const builder = new varsAst.ExpressionTreeBuilder(this.variables, this.functions);
      const expr = builder.build(tokens);
      return expr.getUnit();
    }

    evaluateNumericExpression(tokens, varsInEvaluation) {
      if (varsInEvaluation == null) { varsInEvaluation = {}; }
      return this.evaluateExpression(tokens, varsInEvaluation);
    }

    evaluateStringExpression(tokens, varsInEvaluation) {
      if (varsInEvaluation == null) { varsInEvaluation = {}; }
      return this.evaluateExpression(tokens, varsInEvaluation);
    }

    updateVariableOrder(variableOrder) {
      assert((variableOrder != null) && Array.isArray(variableOrder));
      this.framework.config.variables = (this.variablesConfig = _.sortBy(
        this.variablesConfig,  
        variable => { 
          const index = variableOrder.indexOf(variable.name);
          if (index === -1) { return 99999; } else { return index; } // push it to the end if not found
      }));
      this.framework.saveConfig();
      this.framework._emitVariableOrderChanged(variableOrder);
      return variableOrder;
    }
  }
  VariableManager.initClass();



  return exports = { VariableManager };
};
