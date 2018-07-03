/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
variables AST Builder
===========
Builds a Abstract Syntax Tree (AST) from a variable expression token sequence.
*/

 
const cassert = require('cassert');
const assert = require('assert');
const util = require('util');
const Promise = require('bluebird');
const _ = require('lodash');
const S = require('string');

class Expression {}

class AddExpression extends Expression {
  constructor(left, right) {
    super();
    this.left = left;
    this.right = right; //nop
  }
  evaluate(cache) { 
    return this.left.evaluate(cache, true).then( val1 => { 
      return this.right.evaluate(cache, true).then( val2 => parseFloat(val1) + parseFloat(val2) );
    });
  }
  toString() { return `add(${this.left.toString()}, ${this.right.toString()})`; }
  getUnit() {
    const leftUnit = this.left.getUnit();
    const rightUnit = this.right.getUnit();
    if (leftUnit != null) {
      return leftUnit;
    } else {
      return rightUnit;
    }
  }
}

class SubExpression extends Expression {
  constructor(left, right) {
    super();
    this.left = left;
    this.right = right; //nop
  }
  evaluate(cache) { 
    return this.left.evaluate(cache, true).then( val1 => { 
      return this.right.evaluate(cache, true).then( val2 => parseFloat(val1) - parseFloat(val2) );
    });
  }
  toString() { return `sub(${this.left.toString()}, ${this.right.toString()})`; }
  getUnit() {
    const leftUnit = this.left.getUnit();
    const rightUnit = this.right.getUnit();
    if ((leftUnit != null) && (leftUnit.length > 0)) {
      return leftUnit;
    } else {
      return rightUnit;
    }
  }
}

class MulExpression extends Expression {
  constructor(left, right) {
    super();
    this.left = left;
    this.right = right; //nop
  }
  evaluate(cache) { 
    return this.left.evaluate(cache, true).then( val1 => { 
      return this.right.evaluate(cache, true).then( val2 => parseFloat(val1) * parseFloat(val2) );
    });
  }
  toString() { return `mul(${this.left.toString()}, ${this.right.toString()})`; }
  getUnit() {
    const leftUnit = this.left.getUnit();
    const rightUnit = this.right.getUnit();
    if ((leftUnit != null) && (leftUnit.length > 0)) {
      if ((rightUnit != null) && (rightUnit.length > 0)) {
        return `${leftUnit}*${rightUnit}`;
      } else {
        return leftUnit;
      }
    } else {
      return rightUnit;
    }
  }
}

class DivExpression extends Expression {
  constructor(left, right) {
    super();
    this.left = left;
    this.right = right; //nop
  }
  evaluate(cache) { 
    return this.left.evaluate(cache, true).then( val1 => { 
      return this.right.evaluate(cache, true).then( val2 => parseFloat(val1) / parseFloat(val2) );
    });
  }
  toString() { return `div(${this.left.toString()}, ${this.right.toString()})`; }
  getUnit() {
    const leftUnit = this.left.getUnit();
    const rightUnit = this.right.getUnit();
    if ((leftUnit != null) && (leftUnit.length > 0)) {
      if ((rightUnit != null) && (rightUnit.length > 0)) {
        return `${leftUnit}/${rightUnit}`;
      } else {
        return leftUnit;
      }
    } else {
      if ((rightUnit != null) && (rightUnit.length > 0)) {
        return `1/${rightUnit}`;
      } else {
        return null;
      }
    }
  }
}

class NumberExpression extends Expression {
  constructor(value) {
    super();
    this.value = value; //nop
  }
  evaluate(cache) { return Promise.resolve(this.value); }
  toString() { return `num(${this.value})`; }
  getUnit() { return null; }
}

class VariableExpression extends Expression {
  constructor(variable) {
    super();
    this.variable = variable; //nop
  }
  evaluate(cache, expectNumeric) {
    const { name } = this.variable;
    const val = cache[name];
    return Promise.resolve().then( () => {
      if (cache[name] != null) {
        if (cache[name].value != null) { return cache[name].value;
        } else { throw new Error(`Dependency cycle detected for variable ${name}`); }
      } else {
        cache[name] = {};
        return this.variable.getUpdatedValue(cache).then( value => {
          cache[name].value = value;
          return value;
        });
      }
    }).then( val => {
      if (expectNumeric) {
        const numVal = parseFloat(val);
        if (isNaN(numVal)) { 
          throw new Error(`Expected variable ${this.variable.name} to have a numeric value.`);
        }
        return numVal;
      } else { return val; }
    });
  }
  getUnit() { return this.variable.unit; }

  toString() { return `var(${this.variable.name})`; }
}

class FunctionCallExpression extends Expression {
  constructor(name, func, args) {
    super();
    this.name = name;
    this.func = func;
    this.args = args; //nop
  }
  evaluate(cache) {
    const context = {
      units: _.map(this.args, a => a.getUnit())
    };
    return Promise
      .map(this.args, ( a => a.evaluate(cache)), {concurrency: 1})
      .then( args => this.func.exec.apply(context, args) );
  }
  toString() { 
    const argsStr = (
      this.args.length > 0 ? _.reduce(this.args, (l,r) => `${l.toString()}, ${r.toString()}`)
      : ""
    );
    return `fun(${this.name}, [${argsStr}])`;
  }
  getUnit() {
    if (this.func.unit != null) { 
      return this.func.unit();
    }
    return '';
  }
}

class StringExpression extends Expression {
  constructor(value) {
    super();
    this.value = value; //nop
  }
  evaluate() { return Promise.resolve(this.value); }
  toString() { return `str('${this.value}')`; }
  getUnit() { return null; }
}

class StringConcatExpression extends Expression {
  constructor(left, right) {
    super();
    this.left = left;
    this.right = right; //nop
  }
  evaluate(cache) { 
    return this.left.evaluate(cache).then( val1 => { 
      return this.right.evaluate(cache).then( val2 => `${val1}${val2}` );
    });
  }
  toString() { return `con(${this.left.toString()}, ${this.right.toString()})`; }
  getUnit() { return null; }
}

class ExpressionTreeBuilder {
  constructor(variables, functions) { 
    this.variables = variables;
    this.functions = functions;
    assert((this.variables != null) && (typeof this.variables === "object"));
    assert((this.functions != null) && (typeof this.functions === "object"));
  }

  _nextToken() {
    if (this.pos < this.tokens.length) {
      return this.token = this.tokens[this.pos++];
    } else {
      return this.token = '';
    }
  }
  build(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this._nextToken();
    return this._buildExpression();
  }

  _buildExpression() {
    const left = this._buildTerm();
    return this._buildExpressionPrime(left);
  }

  _buildExpressionPrime(left) {
    switch (this.token) {
      case '+':
        this._nextToken();
        let right = this._buildTerm();
        return this._buildExpressionPrime(new AddExpression(left, right));
      case '-':
        this._nextToken();
        right = this._buildTerm();
        return this._buildExpressionPrime(new SubExpression(left, right));
      case ')': case '': case ',':
        return left;
      default: return assert(false, `unexpected token: '${this.token}'`);
    }
  }

  _buildTerm() {
    const left = this._buildFactor();
    return this._buildTermPrime(left);
  }

  _buildTermPrime(left) {
    switch (this.token) {
      case '*':
        this._nextToken();
        let right = this._buildFactor();
        return this._buildTermPrime(new MulExpression(left, right));
      case '/':
        this._nextToken();
        right = this._buildFactor();
        return this._buildTermPrime(new DivExpression(left, right));
      case '+': case '-': case ')': case '': case ',':
        return left;
      default: 
        right = this._buildFactor();
        return this._buildTermPrime(new StringConcatExpression(left, right));
    }
  }

  _buildFactor() {
    switch (false) { 
      case this.token !== '(':
        this._nextToken();
        const expr = this._buildExpression();
        cassert(this.token === ')');
        this._nextToken();
        return expr;
      case !this._isNumberToken():
        const numberExpr = new NumberExpression(this.token);
        this._nextToken();
        return numberExpr;
      case !this._isVariableToken():
        const varName = this.token.substr(1);
        const variable = this.variables[varName];
        if (variable == null) { throw new Error(`Could not find variable ${this.token}`); }
        const varExpr = new VariableExpression(variable);
        this._nextToken();
        return varExpr;
      case !this._isStringToken():
        const str = this.token.slice(1, this.token.length-1);
        const strExpr = new StringExpression(str);
        this._nextToken();
        return strExpr;
      case (this.token.match(/[_a-zA-Z][_a-zA-Z0-9]*/) == null):
        const funcName = this.token;
        const func = this.functions[funcName];
        if (func == null) { throw new Error(`Could not find function ${funcName}`); }
        this._nextToken();
        cassert(this.token === '(');
        this._nextToken();
        const args = [];
        while (this.token !== ')') {
          args.push(this._buildExpression());
          cassert([')', ','].includes(this.token));
          if (this.token === ',') { this._nextToken(); }
        }
        cassert(this.token === ')');
        this._nextToken();
        const funcCallExpr = new FunctionCallExpression(funcName, func, args);
        return funcCallExpr;
      default: return assert(false, `unexpected token: '${this.token}'`);
    }
  }

  _isStringToken() { return ((this.token.length > 0) && (this.token[0] === '"')); }
  _isVariableToken() { return ((this.token.length > 0) && (this.token[0] === '$')); }
  _isNumberToken() { return (typeof this.token === "number"); }
}


module.exports = {
  AddExpression,
  SubExpression,
  MulExpression,
  DivExpression,
  NumberExpression,
  VariableExpression,
  ExpressionTreeBuilder
};