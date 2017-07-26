/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const cassert = require("cassert");
const assert = require("assert");
const Promise = require('bluebird');
const S = require('string');
const util = require('util');
const _ = require('lodash');

const { env } = require('../startup');

describe("ExpressionTreeBuilder", function() {

  const varsAst = require('../lib/variables-ast-builder');

  return describe('#build', function() {

    const tests = [
      {
        tokens: [1],
        result: "num(1)"
      },
      {
        tokens: [1, '+', 2],
        result: "add(num(1), num(2))"
      },
      {
        tokens: [1, '+', 2, '-', 3],
        result: "sub(add(num(1), num(2)), num(3))"
      },
      {
        tokens: [1, '*', 2, '+', 3],
        result: "add(mul(num(1), num(2)), num(3))"
      },
      {
        tokens: [1, '+', 2, '*', 3],
        result: "add(num(1), mul(num(2), num(3)))"
      },
      {
        tokens: ['(', 1, '+', 2, ')', '*', 3],
        result: "mul(add(num(1), num(2)), num(3))"
      },
      {
        tokens: ['(', '(', 1, '+', 2, ')', '*', 3, ')'],
        result: "mul(add(num(1), num(2)), num(3))"
      },
      {
        tokens: ['(', '(', '(', 1, '+', 2, ')', ')', '*', 3, ')'],
        result: "mul(add(num(1), num(2)), num(3))"
      },
      {
        tokens: [1, '+', '$abc', '*', 3],
        result: "add(num(1), mul(var(abc), num(3)))"
      },
      {
        tokens: ['random', '(', ')'],
        result: "fun(random, [])"
      },
      {
        tokens: ['random', '(', 1, ',', 2, ')'],
        result: "fun(random, [num(1), num(2)])"
      },
      {
        tokens: [2, '*', 'random', '(', 1, ',', 2, ')'],
        result: "mul(num(2), fun(random, [num(1), num(2)]))"
      },
      {
        tokens: ['random', '(', 1, ',', 2, ')', '*', 3 ],
        result: "mul(fun(random, [num(1), num(2)]), num(3))"
      },
      {
        tokens: ['random', '(', '(', 1, ')', ',', 2, ')', '*', 3 ],
        result: "mul(fun(random, [num(1), num(2)]), num(3))"
      },
      {
        tokens: ['random', '(', '(', 1, '*', 2, ')', ',', 2, ')', '*', 3 ],
        result: "mul(fun(random, [mul(num(1), num(2)), num(2)]), num(3))"
      },
      {
        tokens: ['random', '(', '(', 1, '-', 2, ')', ',', 2, ')', '*', 3 ],
        result: "mul(fun(random, [sub(num(1), num(2)), num(2)]), num(3))"
      },
      {
        tokens: ['"foo"'],
        result: "str('foo')"
      },
      {
        tokens: ['"foo"', '"bar"'],
        result: "con(str('foo'), str('bar'))"
      },
      {
        tokens: ['"foo"', '"bar"', '"42"'],
        result: "con(con(str('foo'), str('bar')), str('42'))"
      },
      {
        tokens: ['"foo"', 1],
        result: "con(str('foo'), num(1))"
      },
      {
        tokens: ['"foo"', '(', 1, ')'],
        result: "con(str('foo'), num(1))"
      },
      {
        tokens: ['"foo"', '(', 1, '*', 2, ')', '"bar"'],
        result: "con(con(str('foo'), mul(num(1), num(2))), str('bar'))"
      }
    ];

    return Array.from(tests).map((test) =>
      (test => {
        const tokensString = _.reduce(test.tokens, (l,r) => `${l} ${r}`);
        return it(`should build from tokens ${tokensString}`, function() {
          const variables = {abc: {name: 'abc'}};
          const functions = {random: {}};
          const builder = new varsAst.ExpressionTreeBuilder(variables, functions);
          const expr = builder.build(test.tokens);
          return assert.equal(expr.toString(), test.result);
        });
      })(test));
  });
});