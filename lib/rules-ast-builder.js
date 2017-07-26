/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Rules AST Builder
===========
Builds a Abstract Syntax Tree (AST) from a rule condition token sequence.
*/

 
const assert = require('cassert');
const util = require('util');
const Promise = require('bluebird');
const _ = require('lodash');
const S = require('string');

class BoolExpression {
  toString() { return `${this.type.replace(' ', '')}(${this.left.toString()}, ${this.right.toString()})`; }
}

class AndExpression extends BoolExpression {
  constructor(type, left, right) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this.type = type;
    this.left = left;
    this.right = right;
  }

  evaluate(cache) { 
    return this.left.evaluate(cache).then( val => { 
      if (val) { return this.right.evaluate(cache); } else { return false; } 
    });
  }
}

class OrExpression extends BoolExpression {
  constructor(type, left, right) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this.type = type;
    this.left = left;
    this.right = right; //nop
  }

  evaluate(cache) { 
    return this.left.evaluate(cache).then( val => { 
      if (val) { return true; } else { return this.right.evaluate(cache); } 
    });
  }
}
  
class PredicateExpression extends BoolExpression {
  constructor(predicate) { //nop
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this.predicate = predicate;
    this.type = "predicate";
  }
  
  evaluate(cache) {
    const { id } = this.predicate;
    const value = cache[id];
    return (
      (value != null) ? Promise.resolve(value)
      // If the trigger keyword was present then the predicate is only true of it got triggered...
      : this.predicate.justTrigger === true ? Promise.resolve(false)
      : this.predicate.handler.getValue().then( value => {
        // Check if the time condition is true
        if ((this.predicate.for != null) && (value === true)) {
          return this.predicate.timeAchived;
        } else {
          cache[id] = value;
          return value;
        }
      })
    );
  }
  toString() { return `predicate('${this.predicate.token}')`; }
}

class BoolExpressionTreeBuilder {
  _nextToken() {
    if (this.pos < this.tokens.length) {
      return this.token = this.tokens[this.pos++];
    } else {
      return this.token = '';
    }
  }
  build(tokens, predicates) {
    this.tokens = tokens;
    this.predicates = predicates;
    this.pos = 0;
    this._nextToken();
    return this._buildExpression();
  }

  _buildOuterExpression(left, inner) {
    if (!inner) {
      return this._buildExpression(left, true, false);
    } else {
      return left;
    }
  }

  _buildExpression(left = null, greedy, inner) {
    if (greedy == null) { greedy = true; }
    if (inner == null) { inner = false; }
    switch (this.token) {
      case 'predicate':
        this._nextToken();
        const predicateExpr = this._buildPredicateExpression();
        return (
          greedy ? this._buildExpression(predicateExpr, greedy, inner)
          : predicateExpr
        );
      case 'or':
        this._nextToken();
        let outer = new OrExpression('or', left, this._buildExpression(null, true, true));
        return this._buildOuterExpression(outer, inner);
      case 'or when':
        if (inner) { return left; }
        this._nextToken();
        outer = new OrExpression('or when', left, this._buildExpression(null, true, true));
        return this._buildOuterExpression(outer, inner);
      case 'and':
        this._nextToken();
        const right = this._buildExpression(null, false);
        return this._buildExpression(new AndExpression('and', left, right), true);
      case 'and if':
        this._nextToken();
        outer = new AndExpression('and if', left, this._buildExpression(null, true, true));
        return this._buildOuterExpression(outer, inner);
      case '[':
        this._nextToken();
        const innerExpr = this._buildExpression(null, true, true);
        assert(this.token === ']');
        this._nextToken();
        return (
          greedy ? this._buildExpression(innerExpr, greedy, false, true)
          : innerExpr
        );
      case ']': case '':
        return left;
      default:
        return assert(false);
    }
  }

  _buildPredicateExpression() {
    assert(this.token === '(');
    this._nextToken();
    const predicateIndex = this.token;
    assert(typeof predicateIndex === "number");
    this._nextToken();
    assert(this.token === ')');
    this._nextToken();
    const predicate = this.predicates[predicateIndex];
    return new PredicateExpression(predicate);
  }
}

module.exports = {
  BoolExpression,
  AndExpression,
  OrExpression,
  BoolExpressionTreeBuilder
};
