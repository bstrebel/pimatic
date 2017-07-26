/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const assert = require("assert");
const Promise = require('bluebird');
const events = require('events');
const { env } = require('../startup');

describe("VariableManager", function() {
  const { VariableManager } = require('../lib/variables')(env);
  const frameworkDummy = new events.EventEmitter();
  const varManager = new VariableManager(frameworkDummy, []);
  varManager.init();

  describe('#setVariableToValue()', () =>
    it("should set the variable", function(finish) {
      varManager.setVariableToValue('a', 1);
      varManager.variables['a'].getUpdatedValue().then( value => {
        assert.equal(value, 1);
        return finish();
      }).catch(finish);
    })
  );

  describe('#setVariableToExpr()', function() {
    it("should set the variable to a numeric expression", function(finish) {
      varManager.setVariableToExpr('b', '2');
      varManager.variables['b'].getUpdatedValue().then( value => {
        assert.equal(value, 2);
        return finish();
      }).catch(finish);
    });

    it("should set the variable to a numeric expression with vars", function(finish) {
      varManager.setVariableToExpr('c', '1*$a+10*$b');
      varManager.variables['c'].getUpdatedValue().then( value => {
        assert.equal(value, 21);
        return finish();
      }).catch(finish);
    });

    it("should set the variable to a string expression", function(finish) {
      varManager.setVariableToExpr('d', '"foo"');
      varManager.variables['d'].getUpdatedValue().then( value => {
        assert.equal(value, "foo");
        return finish();
      }).catch(finish);
    });

    it("should set the variable to a string expression with vars", function(finish) {
      varManager.setVariableToExpr('e', '"$a bars"');
      varManager.variables['e'].getUpdatedValue().then( value => {
        assert.equal(value, "1 bars");
        return finish();
      }).catch(finish);
    });

    it("should set the variable to a numeric expression with vars", function(finish) {
      varManager.setVariableToExpr('f', '$c');
      varManager.variables['f'].getUpdatedValue().then( value => {
        assert.equal(value, 21);
        return finish();
      }).catch(finish);
    });

    it("should detect cycles", function(finish) {
      varManager.setVariableToExpr('c', "$f");
      varManager.variables['c'].getUpdatedValue().then( value => {
        return assert(false);
      }).catch( error => {
        assert(error.message === "Dependency cycle detected for variable f");
        return finish();
      }).done();
    });

    return it("should set the variable to a function expression", function(finish) {
      varManager.setVariableToExpr('g', 'min(1, 2)' );
      varManager.variables['g'].getUpdatedValue().then( value => {
        assert.equal(value, 1);
        return finish();
      }).catch(finish);
    });
  });

  describe('#isVariableDefined()', () =>
    it("should return true", function() {
      const isDefined = varManager.isVariableDefined('a');
      return assert(isDefined);
    })
  );

  describe('#getVariableValue()', () =>
    it("get the var value", function(finish) {
      varManager.getVariableUpdatedValue('a').then( value => {
        assert.equal(value, 1);
        return finish();
      }).catch(finish);
    })
  );

  describe('#evaluateNumericExpression()', function() {
    it('should calculate 1 + 2 * 3', function(finish) {
      varManager.evaluateNumericExpression([1, '+', 2, '*', 3]).then( result => {
        assert(result, 7);
        return finish();
      }).catch(finish);
    });

    it('should calculate 3 + $a * 2', function(finish) {
      varManager.evaluateNumericExpression([3, '+', '$a', '*', 2]).then( result => {
        assert(result, 5);
        return finish();
      }).catch(finish);
    });

    return it('should calculate $a + $a', function(finish) {
      varManager.evaluateNumericExpression(['$a', '+', '$a']).then( result => {
        assert(result, 2);
        return finish();
      }).catch(finish);
    });
  });


  describe('#evaluateStringExpression()', function() {
    it('should interpolate "abc"', function(finish) {
      varManager.evaluateStringExpression(['"abc"']).then( result => {
        assert(result, "abc");
        return finish();
      }).catch(finish);
    });

    it('should interpolate "abc $a"', function(finish) {
      varManager.evaluateStringExpression(['"abc "', '$a']).then( result => {
        assert(result, "abc 1");
        return finish();
      }).catch(finish);
    });

    return it('should interpolate "abc $a de"', function(finish) {
      varManager.evaluateStringExpression(['"abc "', '$a', '" de"']).then( result => {
        assert(result, "abc 1 de");
        return finish();
      }).catch(finish);
    });
  });


  return describe('#units()', function() {

    before(function() {
      varManager.setVariableToValue('a', 1, 'V');
      return varManager.setVariableToValue('b', 2, '');
    });

    it('should use the right unit for 1V + 2', function(finish) {
      varManager.evaluateExpressionWithUnits(["$a", "+", "$b"]).then( result => {
        assert(result.unit === 'V');
        return finish();
      }).catch(finish);
    });

    it('should use the right unit for 1V - 2', function(finish) {
      varManager.evaluateExpressionWithUnits(["$a", "-", "$b"]).then( result => {
        assert(result.unit === 'V');
        return finish();
      }).catch(finish);
    });

    it('should use the right unit for 1V * 2', function(finish) {
      varManager.evaluateExpressionWithUnits(["$a", "*", "$b"]).then( result => {
        assert(result.unit === 'V');
        return finish();
      }).catch(finish);
    });

    it('should use the right unit for 1V * 1V', function(finish) {
      varManager.evaluateExpressionWithUnits(["$a", "*", "$a"]).then( result => {
        assert(result.unit === 'V*V');
        return finish();
      }).catch(finish);
    });

    it('should use the right unit for 1V / 2', function(finish) {
      varManager.evaluateExpressionWithUnits(["$a", "/", "$b"]).then( result => {
        assert(result.unit === 'V');
        return finish();
      }).catch(finish);
    });

    it('should use the right unit for 2 / 1V', function(finish) {
      varManager.evaluateExpressionWithUnits(["$b", "/", "$a"]).then( result => {
        assert(result.unit === '1/V');
        return finish();
      }).catch(finish);
    });

    it('should format the value', function(finish) {
      varManager.evaluateExpressionWithUnits(["formatNumber", "(", "$a", ")"]).then( result => {
        assert(result.value === '1V');
        assert(result.unit === '');
        return finish();
      }).catch(finish);
    });

    return it('should format the value with prefix', function(finish) {
      varManager.setVariableToValue('a', 1000, 'V');
      varManager.evaluateExpressionWithUnits(["formatNumber", "(", "$a", ")"]).then( result => {
        assert(result.value === '1kV');
        assert(result.unit === '');
        return finish();
      }).catch(finish);
    });
  });
});