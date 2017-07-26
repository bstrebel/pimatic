/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const assert = require("assert");
const Promise = require('bluebird');
const M = require('../lib/matcher');

const { env } = require('../startup');

describe("Matcher", function() {

  describe('#match()', function() {

    const testCases = [
      {
        input: { 
          token: "some test string",
          pattern: 'some'
        },
        result: { 
          match: "some",
          nextInput: ' test string'
        }
      },
      {
        input: { 
          token: "some test string",
          pattern: ["foo", "some"]
        },
        result: { 
          match: "some",
          nextInput: ' test string'
        }
      }

    ];

    return Array.from(testCases).map((tc) =>
      (tc => {
        return it(`should have matches in ${tc.input.token}`, function() {
          const m = M(tc.input.token).match(tc.input.pattern);
          assert.deepEqual(m.getFullMatch(), tc.result.match);
          return assert.deepEqual(m.input, tc.result.nextInput);
        });
      })(tc));
  });

  describe('#matchNumericExpression()', function() {
    const varsAndFuns = {
      variables: {
        'abc': {}
      },
      functions: {
        'min': {
          argc: 2
        }
      }
    };
    it("should match 1", finish =>
      M("1").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['1']);
        return finish();
      })
    );

    it("should match 1 + 2", finish =>
      M("1 + 2").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['1','+','2']);
        return finish();
      })
    );

    it("should match 1 + 2 * 3", finish =>
      M("1 + 2 * 3").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['1','+','2', '*', '3']);
        return finish();
      })
    );

    it("should match $abc", finish =>
      M("$abc").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['$abc']);
        return finish();
      })
    );

    it("should match $abc + 2 * 3", finish =>
      M("$abc + 2 * 3").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['$abc','+','2', '*', '3']);
        return finish();
      })
    );

    it("should match 1 + $abc * 3", finish =>
      M("1 + $abc * 3").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['1','+','$abc', '*', '3']);
        return finish();
      })
    );

    it("should match 1+2", finish =>
      M("1+2").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['1','+','2']);
        return finish();
      })
    );

    it("should match 1+2*3", finish =>
      M("1+2*3").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['1','+','2', '*', '3']);
        return finish();
      })
    );

    it("should match $abc with given var list", finish =>
      M("$abc").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['$abc']);
        return finish();
      })
    );

    it("should match $abc+2*3", finish =>
      M("$abc+2*3").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['$abc','+','2', '*', '3']);
        return finish();
      })
    );

    it("should match 1+$abc*3", finish =>
      M("1+$abc*3").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['1','+','$abc', '*', '3']);
        return finish();
      })
    );

    it("should match (1+2*3)", finish =>
      M("(1+2*3)").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['(', '1','+','2', '*', '3', ')']);
        return finish();
      })
    );

    it("should match ( 1 + 2 * 3 )", finish =>
      M("( 1 + 2 * 3 )").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['(', '1','+','2', '*', '3', ')']);
        return finish();
      })
    );

    it("should match (1 + 2) * 3", finish =>
      M("(1 + 2) * 3").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['(', '1','+','2', ')', '*', '3']);
        return finish();
      })
    );

    it("should match (1+2)*3", finish =>
      M("(1+2)*3").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['(', '1','+','2', ')', '*', '3']);
        return finish();
      })
    );

    it("should match 1+(2*3)", finish =>
      M("1+(2*3)").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['1','+','(', '2', '*', '3', ')']);
        return finish();
      })
    );

    it("should match (1)", finish =>
      M("(1)").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['(', '1', ')']);
        return finish();
      })
    );

    return it("should match min(1, 2)", function(finish) {
      const functions = {
        min: {}
      };
      return M("min(1, 2)").matchNumericExpression(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['min', '(', '1', ',', '2', ')']);
        return finish();
      });
    });
  });


  describe('#matchStringWithVars()', function() {
    const varsAndFuns = {
      variables: {
        'bar': {}
      },
      functions: {
        'min': {
          argc: 2
        }
      }
    };
    it("should match \"foo\"", finish =>
      M('"foo"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['"foo"']);
        return finish();
      })
    );

    it("should match the empty string", finish =>
      M('""').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['""']);
        return finish();
      })
    );

    it("should match \"foo $bar\"", finish =>
      M('"foo $bar"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['"foo "', '$bar', '""']);
        return finish();
      })
    );

    it("should match \"foo $bar test\"", finish =>
      M('"foo $bar test"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['"foo "', '$bar', '" test"']);
        return finish();
      })
    );

    it("should match \"$bar foo test\"", finish =>
      M('"$bar foo test"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['""', '$bar', '" foo test"']);
        return finish();
      })
    );

    it("should match \"foo {$bar}\"", finish =>
      M('"foo {$bar}"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['"foo "', '(', '$bar', ')', '""']);
        return finish();
      })
    );

    it("should match \"{$bar} foo\"", finish =>
      M('"{$bar} foo"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['""', '(', '$bar', ')', '" foo"']);
        return finish();
      })
    );

    it("should match \"{min(1, 2)} foo\"", finish =>
      M('"{min(1, 2)} foo"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['""', '(', 'min', '(', 1, ',' , 2, ')', ')', '" foo"']);
        return finish();
      })
    );

    it("should match \"{ min(1, 2) + 1 }\"", finish =>
      M('"{ min(1, 2) + 1 } foo"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['""', '(', 'min',  '(', 1, ',' , 2, ')', '+', 1, ')', '" foo"']);
        return finish();
      })
    );

    it("should handle escaped quotes \"some \\\" quote\"", finish =>
      M('"some \\" quote"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['"some " quote"']);
        return finish();
      })
    );

    it("should handle escaped sollar sign \"some \\$abc dollar\"", finish =>
      M('"some \\$abc dollar"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['"some $abc dollar"']);
        return finish();
      })
    );

    it("should handle escaped backslash \"some \\\\ back\"", finish =>
      M('"some \\\\ back"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['"some \\ back"']);
        return finish();
      })
    );

    it("should handle escaped brackets and other chars: \"\\{ \\} \\$\"", finish =>
      M('"\\{ \\} \\$"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['"{ } $"']);
        return finish();
      })
    );

    it("should handle escaped backslash at end \"some \\\\\"", finish =>
      M('"some \\\\"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['"some \\"']);
        return finish();
      })
    );


    it("should handle escaped backslash at end \"some \\\\\"", finish =>
      M('"echo \\"abc\\" | mailx -s \\"def\\""').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['"echo "abc" | mailx -s "def""']);
        return finish();
      })
    );

    it("should handle new line \"some \\n text", finish =>
      M('"some \\n text"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['"some \n text"']);
        return finish();
      })
    );

    return it("should not handle as new line \"some \\\\n text", finish =>
      M('"some \\\\n text"').matchStringWithVars(varsAndFuns, (m, tokens) => {
        assert(m != null);
        assert.deepEqual(tokens, ['"some \\n text"']);
        return finish();
      })
    );
  });



  return describe('#matchString()', function() {

    it("should match \"foo\"", finish =>
      M('"foo"').matchString( (m, str) => {
        assert(m != null);
        assert.deepEqual(str, 'foo');
        return finish();
      })
    );

    return it("should match the empty string", finish =>
      M('""').matchString( (m, str) => {
        assert(m != null);
        assert.deepEqual(str, '');
        return finish();
      })
    );
  });
});