/*
 * decaffeinate suggestions:
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
Matcher/Parser helper for predicate and action strings
=================
*/

const { __ } = require("i18n");
const Promise = require('bluebird');
const S = require('string');
const assert = require('cassert');
const _ = require('lodash');
const milliseconds = require('./milliseconds');


var Matcher = (function() {
  let comparators = undefined;
  let normalizeComparator = undefined;
  Matcher = class Matcher {
    static initClass() {
  
      // Some static helper
      comparators = {
        '==': ['equals', 'is equal to', 'is equal', 'is'],
        '!=': [ 'is not', 'isnt' ],
        '<': ['less', 'lower', 'below'],
        '>': ['greater', 'higher', 'above'],
        '>=': ['greater or equal', 'higher or equal', 'above or equal',
               'equal or greater', 'equal or higher', 'equal or above'],
        '<=': ['less or equal', 'lower or equal', 'below or equal',
               'equal or less', 'equal or lower', 'equal or below']
      };
  
      for (var sign of ['<', '>', '<=', '>=']) {
        comparators[sign] = _(comparators[sign]).map( 
          c => [c, `is ${c}`, `is ${c} than`, `is ${c} as`, `${c} than`, `${c} as`]
        ).flatten().value();
      }
  
      for (sign in comparators) {
        comparators[sign].push(sign);
      }
      comparators['=='].push('=');
  
      normalizeComparator = function(comparator) {
        let found = false;
        for (sign in comparators) {
          const c = comparators[sign];
          if (Array.from(c).includes(comparator)) {
            comparator = sign;
            found = true;
            break;
          }
        }
        assert(found);
        return comparator;
      };
    }


    // ###constructor()
    // Create a matcher for the input string, with the given parse context.
    constructor(input, context = null, prevInput, elements) {
      this.input = input;
      this.context = context;
      if (prevInput == null) { prevInput = ""; }
      this.prevInput = prevInput;
      if (elements == null) { elements = []; }
      this.elements = elements;
    }

  
    // ###match()
    /*
    Matches the current inputs against the given pattern.
    Pattern can be a string, a regexp or an array of strings or regexps.
    If a callback is given it is called with a new Matcher for the remaining part of the string
    and the matching part of the input.
    In addition a matcher is returned that has the remaining parts as input.
    */
    match(patterns, options, callback = null) {
      let match, matchId, nextToken, p, wildcardMatch;
      if (options == null) { options = {}; }
      if (this.input == null) { return this; }
      if (!Array.isArray(patterns)) { patterns = [patterns]; }
      if (typeof options === "function") {
        callback = options;
        options = {};
      }

      const matches = [];
      for (let j = 0; j < patterns.length; j++) {
        // If pattern is an array then assume that first element is an ID that should be returned
        // on match.
        p = patterns[j];
        matchId = null;
        if (Array.isArray(p)) {
          assert(p.length === 2);
          [matchId, p] = Array.from(p);
        }

        // Handle ignore case for string.
        const [pT, inputT] = Array.from((
          options.ignoreCase && (typeof p === "string") ?
            [p.toLowerCase(), this.input.toLowerCase()]
          :
            [p, this.input]
        ));

        // If pattern is a string, then we can add an autocomplete for it.
        if ((typeof p === "string") && this.context) {
          const showAc = ((options.acFilter != null) ? options.acFilter(p) : true); 
          if (showAc) {
            if (S(pT).startsWith(inputT) && (this.input.length < p.length)) {
              if (this.context != null) {
                this.context.addHint({autocomplete: p});
              }
            }
          }
        }

        // Now try to match the pattern against the input string.
        wildcardMatch = false;
        let doesMatch = false;
        match = null;
        nextToken = null;

        if (options.wildcard != null) {
          wildcardMatch = S(inputT).startsWith(options.wildcard);
        }
        switch (false) { 
          // Do a normal string match
          case typeof p !== "string":
            doesMatch =  S(inputT).startsWith(pT);
            if (doesMatch) { 
              match = p;
              nextToken = this.input.substring(p.length);
            }
            break;
          // Do a regex match
          case !(p instanceof RegExp):
            if (options.ignoreCase != null) {
              throw new Error("ignoreCase option can't be used with regexp");
            }
            if (options.wildcard != null) {
              throw new Error("wildcard option can't be used with regexp");     
            }
            const regexpMatch = this.input.match(p);
            if (regexpMatch != null) {
              doesMatch = true;
              match = regexpMatch[1];
              nextToken = regexpMatch[2];
            }
            break;
          default: throw new Error("Illegal object in patterns");
        }

        if (wildcardMatch || doesMatch) {
          if (wildcardMatch) {
            match = p;
            nextToken = this.input.substring(options.wildcard.length);
          }
          assert(match != null);
          assert(nextToken != null);
          // If no matchID was provided then use the matching string itself.
          if (matchId == null) { matchId = match; }
          matches.push({
            matchId,
            match,
            nextToken
          });
          if (wildcardMatch) { break; }
        }
      }
      
      let nextInput = null;
      match = null;
      let prevInputAndMatch = "";
      let elements = [];
      if (matches.length > 0) {
        const longestMatch = _(matches).sortBy( m => m.match.length ).last();
        nextInput = longestMatch.nextToken;
        ({ match } = longestMatch);
        prevInputAndMatch = this.prevInput + match;
        const element = {
          match,
          param: options.param,
          options: _.filter(
            _.map(patterns, p => Array.isArray(p) ? p[1] : p),
            p => (p === match) || (((options != null ? options.acFilter : undefined) != null) ? options.acFilter(p) : true)
          ),
          type: options.type,
          wildcard: options.wildcard,
          wildcardMatch
        };
        if (p instanceof RegExp) {
          element.options = null;
          if (element.type == null) {
            element.type = "text";
          }
        } else {
          if (element.type == null) {
            if (element.options.length === 1) {
              element.type = "static";
            } else {
              element.type = "select"; 
            }
          }
        }
        elements = this.elements.concat(element);
        if (wildcardMatch && (element.options != null)) {
          element.options.unshift(options.wildcard);
        }
        if (callback != null) {
          callback(
            M(nextInput, this.context, prevInputAndMatch, elements), 
            longestMatch.matchId
          );
        }

        if (this.context != null) {
          this.context.addElements(prevInputAndMatch, elements);
        }
      } else if (options.optional) {
        nextInput = this.input;
        prevInputAndMatch = this.prevInput;
        elements = _.clone(this.elements);
      }



      return M(nextInput, this.context, prevInputAndMatch, elements);
    }

    // ###matchNumber()
    /*
    Matches any number.
    */
    matchNumber(options, callback) { 
      if (this.input == null) { return this; }
      if (typeof options === "function") {
        callback = options;
        options = {};
      }

      if (options.type == null) { options.type = "number"; }

      if ((options.wildcard != null) && S(this.input).startsWith(options.wildcard)) {
        return this.match("0", options, callback);
      }

      const next = this.match(/^(-?[0-9]+\.?[0-9]*)(.*?)$/, callback);


      const showFormatHint = ((this.input === "") || (next.input === ""));

      if (showFormatHint) {
        if (this.context != null) {
          this.context.addHint({format: 'Number'});
        }
      }
      return next;
    }

    matchVariable(varsAndFuns, callback) { 
      if (this.input == null) { return this; }

      if (typeof varsAndFuns === "function") {
        callback = varsAndFuns;
        varsAndFuns = this.context;
      }

      const {variables} = varsAndFuns;

      assert((variables != null) && (typeof variables === "object"));
      assert(typeof callback === "function");

      const options = {
        wildcard: "{variable}",
        type: "select"
      };

      const varsWithDollar = _(variables).keys().map( v => `$${v}` ).valueOf();
      const matches = [];
      let next = this.match(varsWithDollar, options, (m, match) => matches.push([m, match]) );
      if (matches.length > 0) {
        let match;
        [next, match] = Array.from(_(matches).sortBy( (...args) => { const [m, s] = Array.from(args[0]); return s.length;  }).last());
        callback(next, match);
      }
      return next;
    }

    matchString(options, callback) { 
      if (this.input == null) { return this; }

      if (typeof options === "function") {
        callback = options;
        options = {};
      }

      if (!options.type) { options.type = "text"; } 

      if ((options.wildcard != null) && S(this.input).startsWith(options.wildcard)) {  
        return this.match("\"\"", options, callback);
      }

      let ret = M(null, this.context);
      this.match('"').match(/^([^"]*)(.*?)$/, (m, str) => {
        return ret = m.match('"', m => { 
          return callback(m, str);
        });
      });
      return ret;
    }

    matchOpenParenthese(token, callback) {
      if (this.input == null) { return this; }
      const tokens = [];
      let openedParentheseMatch = true;
      let next = this;
      while (openedParentheseMatch) {
        const m = next.match(token, m => { 
          tokens.push(token);
          return next = m.match(' ', {optional: true});
        });
        if (m.hadNoMatch()) { openedParentheseMatch = false; }
      }
      if (tokens.length > 0) {
        callback(next, tokens);
      }
      return next;
    }

    matchCloseParenthese(token, openedParentheseCount, callback) {
      if (this.input == null) { return this; }
      assert(typeof openedParentheseCount === "number");
      const tokens = [];
      let closeParentheseMatch = true;
      let next = this;
      while (closeParentheseMatch && (openedParentheseCount > 0)) {
        const m = next.match(' ', {optional: true}).match(token, m => { 
          tokens.push(token);
          openedParentheseCount--;
          return next = m;
        });
        if (m.hadNoMatch()) { closeParentheseMatch = false; }
      }
      if (tokens.length > 0) {
        callback(next, tokens);
      }
      return next;
    }

    matchFunctionCallArgs(varsAndFuns, {funcName, argn}, callback) {
      if (this.input == null) { return this; }

      if (typeof varsAndFuns === "function") {
        callback = varsAndFuns;
        varsAndFuns = this.context;
      }

      const {variables, functions} = varsAndFuns;
      assert((variables != null) && (typeof variables === "object"));
      assert((functions != null) && (typeof functions === "object"));
      assert(typeof callback === "function");

      let tokens = [];
      let last = this;

      let hint = true;

      this.matchAnyExpression(varsAndFuns, (next, ts) => {
        tokens = tokens.concat(ts);
        last = next;
        return next
          .match([',', ' , ', ' ,', ', '], {acFilter: op => op === ', '}, () => hint = false)
          .matchFunctionCallArgs(varsAndFuns, {funcName, argn: argn+1}, (m, ts) => {
            tokens.push(',');
            tokens = tokens.concat(ts);
            return last = m;
          });
      });

      if (hint && (last.input === "")) {
        const func = functions[funcName];
        if (func.args != null) {
          let i = 0;
          for (let argName in func.args) {
            const arg = func.args[argName];
            if (arg.multiple != null) {
              if (argn > i) {
                if (this.context != null) {
                  this.context.addHint({format: argName});
                }
              }
              break;
            }
            if (argn === i) {
              if (arg.optional) {
                if (this.context != null) {
                  this.context.addHint({format: `[${argName}]`});
                }
              } else {
                if (this.context != null) {
                  this.context.addHint({format: argName});
                }
              }
            }
            i++;
          }
        }
      }

      callback(last, tokens);
      return last;
    }

    matchFunctionCall(varsAndFuns, callback) {
      if (this.input == null) { return this; }

      if (typeof varsAndFuns === "function") {
        callback = varsAndFuns;
        varsAndFuns = this.context;
      }

      const {variables, functions} = varsAndFuns;
      assert((variables != null) && (typeof variables === "object"));
      assert((functions != null) && (typeof functions === "object"));
      assert(typeof callback === "function");

      let tokens = [];
      let last = null;
      this.match(_.keys(functions), (next, funcName) => {
        tokens.push(funcName);
        return next.match(['(', ' (', ' ( ', '( '], {acFilter: op => op === '('}, next => { 
          tokens.push('(');
          return next.matchFunctionCallArgs(varsAndFuns, {funcName, argn: 0}, (next, ts) => {
            tokens = tokens.concat(ts);
            return next.match([')', ' )'], {acFilter: op => op === ')'},  next => { 
              tokens.push(')');
              return last = next;
            });
          });
        });
      });
      if (last != null) {
        callback(last, tokens);
        return last;
      } else { return M(null, this.context); }
    }

    matchNumericExpression(varsAndFuns, openParanteses, callback) {
      if (openParanteses == null) { openParanteses = 0; }
      if (this.input == null) { return this; }

      if (typeof varsAndFuns === "function") {
        callback = varsAndFuns;
        varsAndFuns = this.context;
        openParanteses = 0;
      }
    
      const {variables, functions} = varsAndFuns;

      if (typeof openParanteses === "function") {
        callback = openParanteses;
        openParanteses = 0;
      }

      assert((callback != null) && (typeof callback === "function"));
      assert((openParanteses != null) && (typeof openParanteses === "number"));
      assert((variables != null) && (typeof variables === "object"));
      assert((functions != null) && (typeof functions === "object"));

      const options = {
        wildcard: "{expr}",
        type: "text"
      };

      if ((options.wildcard != null) && S(this.input).startsWith(options.wildcard)) {
        return this.match([[[0], "0"]], options, callback);
      }

      const binarOps = ['+','-','*', '/'];
      const binarOpsFull = _(binarOps).map( op=> [op, ` ${op} `, ` ${op}`, `${op} `] ).flatten().valueOf();

      let last = null;
      let tokens = [];

      this.matchOpenParenthese('(', (m, ptokens) => {
        tokens = tokens.concat(ptokens);
        return openParanteses += ptokens.length;
      }).or([
        ( m => m.matchNumber( (m, match) => { tokens.push(parseFloat(match)); return last = m;  }) ),
        ( m => m.matchVariable(varsAndFuns, (m, match) => { tokens.push(match); return last = m;  }) ),
        ( m => m.matchFunctionCall(varsAndFuns, (m, match) => { 
            tokens = tokens.concat(match);
            return last = m;
          })
        )
      ]).matchCloseParenthese(')', openParanteses, (m, ptokens) => {
        tokens = tokens.concat(ptokens);
        openParanteses -= ptokens.length;
        return last = m;
      }).match(binarOpsFull, {acFilter: op => (op[0] === ' ') && (op[op.length-1] === ' ')}, (m, op) => { 
        return m.matchNumericExpression(varsAndFuns, openParanteses, (m, nextTokens) => { 
          tokens.push(op.trim());
          tokens = tokens.concat(nextTokens);
          return last = m;
        });
      });

      if (last != null) {
        last.reduceElementsFrom(this, options);
        callback(last, tokens);
        return last;
      } else { return M(null, this.context); }
    }

    matchStringWithVars(varsAndFuns, callback) {
      if (this.input == null) { return this; }

      if (typeof varsAndFuns === "function") {
        callback = varsAndFuns;
        varsAndFuns = this.context;
      }

      const {variables, functions} = varsAndFuns;
      assert((variables != null) && (typeof variables === "object"));
      assert((functions != null) && (typeof functions === "object"));
      assert(typeof callback === "function");

      const options = {
        wildcard: "{expr}",
        type: "text"
      };

      if ((options.wildcard != null) && S(this.input).startsWith(options.wildcard)) {
        return this.match([[["\"\""], "\"\""]], options, callback);
      }

      let last = null;
      let tokens = [];

      let next = this.match('"');
      while (next.hadMatch() && ((last == null))) {
        // match unescaped ", $ or {
        next.match(/((?:(?:\\\\)*(?:\\.|[^"\$\{]))*)(.*?)$/, (m, strPart) => {
          // strPart is string till first var or ending quote
          strPart = strPart.replace(/(^|[^\\]|(\\\\)+)(\\n)/g, '$1$2\n'); // make \n to new line
          strPart = strPart.replace(/(^|[^\\]|(\\\\)+)(\\r)/g, '$1$2\r'); // make \r to carriage return
          strPart = strPart.replace(/\\(["\$\\\\{\\}])/g, '$1'); // unescape ",/,$, { or }
          tokens.push(`"${strPart}"`);

          const end = m.match('"');
          if (end.hadMatch()) {  
            return last = end;
          // else test if it is a var
          } else {
            return next = m.or([
              ( m => { next = m.matchVariable(varsAndFuns, (m, match) => tokens.push(match) ); return next; } ),
              ( m => { 
                let retMatcher = M(null, this.context);
                m.match(['{', '{ '], {acFilter(t){ return t === '{'; }}, (m, match) => {
                  return m.matchAnyExpression(varsAndFuns, (m, ts) => {
                    return m.match(['}', ' }'], {acFilter(t){ return t === '}'; }}, m => {
                      tokens.push('(');
                      tokens = tokens.concat(ts);
                      tokens.push(')');
                      return retMatcher = m;
                    });
                  });
                });
                return retMatcher;
              }
              )
            ]);
          }

        });
      }
      
      if (last != null) {
        last.reduceElementsFrom(this, options);
        callback(last, tokens);
        return last;
      } else { return M(null, this.context); }
    }

    reduceElementsFrom(matcher, options) {
      const fullMatch = this.getFullMatch();
      this.elements = matcher.elements.concat({
        type: "text",
        match: fullMatch.substring(matcher.getFullMatch().length),
        wildcard: options.wildcard
      });
      return (this.context != null ? this.context.addElements(fullMatch, this.elements) : undefined);
    }


    matchAnyExpression(varsAndFuns, callback) {
      if (this.input == null) { return this; }

      if (typeof varsAndFuns === "function") {
        callback = varsAndFuns;
        varsAndFuns = this.context;
      }

      const {variables, functions} = varsAndFuns;
      assert((variables != null) && (typeof variables === "object"));
      assert((functions != null) && (typeof functions === "object"));
      assert(typeof callback === "function");

      let tokens = null;
      const next = this.or([
        ( m => m.matchStringWithVars(varsAndFuns, (m, ts) => { tokens = ts; return m; }) ),
        ( m => m.matchNumericExpression(varsAndFuns, (m, ts) => { tokens = ts; return m; }) )
      ]);
      if (tokens != null) {
        callback(next, tokens);
      }
      return next;
    }

    matchComparator(type, callback) {
      if (this.input == null) { return this; }
      assert(['number', 'string', 'boolean'].includes(type));
      assert(typeof callback === "function");

      const possibleComparators = ((() => { 
        switch (type) {
          case 'number': return _(comparators).values().flatten();
          case 'string': case 'boolean': return _(comparators['=='].concat(comparators['!=']));
      
        } })()).map(c=> ` ${c} `).value();

      const autocompleteFilter = v => { 
        let needle;
        return (needle = v.trim(), ['is', 'is not', 'equals', 'is greater than', 'is less than', 
          'is greater or equal than', 'is less or equal than', '<', '=', '>', '<=', '>=' 
        ].includes(needle));
      };
      return this.match(possibleComparators, {acFilter: autocompleteFilter}, ( (m, token) => { 
        const comparator = normalizeComparator(token.trim());
        return callback(m, comparator);
      }));
    }


    // ###matchDevice()
    /*
    Matches any of the given devices.
    */
    matchDevice(devices, callback = null) {
      if (this.input == null) { return this; }
      const devicesWithId = _(devices).map( d => [d, d.id] ).value();
      const devicesWithNames = _(devices).map( d => [d, d.name] ).value(); 

      const matchingDevices = {};


      const onIdMatch = (m, d) => { 
        if (matchingDevices[d.id] == null) {
          return matchingDevices[d.id] = {m, d};
        } else {
          // keep longest match
          if (d.id.length > d.name.length) {
            return matchingDevices[d.id].m = m;
          }
        }
      };

      const onNameMatch = (m, d) => {
        if (matchingDevices[d.id] == null) {
          return matchingDevices[d.id] = {m, d};
        } else {
          // keep longest match
          if (d.name.length > d.id.length) {
            return matchingDevices[d.id].m = m;
          }
        }
      };

      const next = this.match('the ', {optional: true, type: "static"}).or([
         // first try to match by id
        m => m.match(devicesWithId, {wildcard: "{device}", type: "select"}, onIdMatch),
        // then to try match names
        m => m.match(
          devicesWithNames, 
          {wildcard: "{device}", type: "select", ignoreCase: true}, 
          onNameMatch)
      ]);
      for (let id in matchingDevices) {
        const {m, d} = matchingDevices[id];
        callback(m, d);
      }
      return next;
    }
    
    matchTimeDurationExpression(varsAndFuns, callback) {
      if (this.input == null) { return this; }

      if (typeof varsAndFuns === "function") {
        callback = varsAndFuns;
        varsAndFuns = this.context;
      }

      const {variables, functions} = varsAndFuns;
      assert((variables != null) && (typeof variables === "object"));
      assert((functions != null) && (typeof functions === "object"));
      assert(typeof callback === "function");

      // Parse the for-Suffix:
      const timeUnits = [
        "ms", 
        "second", "seconds", "s", 
        "minute", "minutes", "m", 
        "hour", "hours", "h", 
        "day", "days","d", 
        "year", "years", "y"
      ];
      let tokens = 0;
      let unit = "";
      const onTimeExpressionMatch = (m, ts) => tokens = ts;  
      const onMatchUnit = (m, u) => unit = u.trim();

      const m = this.matchNumericExpression(varsAndFuns, onTimeExpressionMatch).match(
        _(timeUnits).map(u => [` ${u}`, u]).flatten().valueOf()
      , {acFilter: u => u[0] === ' '}, onMatchUnit
      );

      if (m.hadMatch()) {
        callback(m, {tokens, unit});
      }
      return m;
    }


    matchTimeDuration(options = null, callback) {
      if (this.input == null) { return this; }
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }

      // Parse the for-Suffix:
      const timeUnits = [
        "ms", 
        "second", "seconds", "s", 
        "minute", "minutes", "m", 
        "hour", "hours", "h", 
        "day", "days","d", 
        "year", "years", "y"
      ];
      let time = 0;
      let unit = "";
      const onTimeMatch = (m, n) => time = parseFloat(n);
      const onMatchUnit = (m, u) => unit = u;

      const m = this.matchNumber(options, onTimeMatch).match(
        _(timeUnits).map(u => [` ${u}`, u]).flatten().valueOf()
      , {acFilter: u => u[0] === ' '}, onMatchUnit
      );

      if (m.hadMatch()) {
        const timeMs = milliseconds.parse(`${time} ${unit}`);
        callback(m, {time, unit, timeMs});
      }
      return m;
    }

    optional(callback) {
      if (this.input == null) { return this; }
      const next = callback(this);
      if (next.hadMatch()) {
        return next;
      } else {
        return this;
      }
    }


    // ###onEnd()
    /*
    The given callback will be called for every empty string in the inputs of the current matcher.
    */
    onEnd(callback) {
      if ((this.input != null ? this.input.length : undefined) === 0) { return callback(); }
    }

    // ###onHadMatches()
    /*
    The given callback will be called for every string in the inputs of the current matcher.
    */
    ifhadMatches(callback) {
      if (this.input != null) { return callback(this.input); }
    }

    /*
      m.inAnyOrder([
        (m) => m.match(' title:').matchString(setTitle)
        (m) => m.match(' message:').matchString(setMessage)  
      ]).onEnd(...)
    */

    inAnyOrder(callbacks) {
      assert(Array.isArray(callbacks));
      let hadMatch = true;
      let current = this;
      while (hadMatch) {
        hadMatch = false;
        for (let next of Array.from(callbacks)) {
          assert(typeof next === "function");
          // try to match with this matcher
          const m = next(current);
          assert(m instanceof Matcher);
          if (!m.hadNoMatch()) {
            hadMatch = true;
            current = m;
          }
        }
      }
      return current;
    }

    or(callbacks) {
      assert(Array.isArray(callbacks));
      const matches = [];
      for (let cb of Array.from(callbacks)) {
        const m = cb(this);
        assert(m instanceof Matcher);
        matches.push(m);
      }
      // Get the longest match.
      const next = _.max(matches, m => { 
        if (m.input != null) { return m.prevInput.length; } else { return 0; }
      });
      return next;
    }

    hadNoMatch() { return (this.input == null); }
    hadMatch() { return (this.input != null); }
    getFullMatch() { if (this.input == null) { return null; } else { return this.prevInput; } }
    getRemainingInput() { return this.input; }

    dump(info) {
      if (info != null) { console.log(info + ":"); } 
      console.log(`prevInput: \"${this.prevInput}\" `);
      console.log(`input: \"${this.input}\"`);
      return this;
    }
  };
  Matcher.initClass();
  return Matcher;
})();

var M = (...args) => new Matcher(...Array.from(args || []));
M.createParseContext = function(variables, functions){
  let context;
  return context = {
    autocomplete: [],
    format: [],
    errors: [],
    warnings: [],
    elements: {},
    variables,
    functions,
    addHint({autocomplete: a, format: f}) {
      if (a != null) {
        if (Array.isArray(a)) { 
          this.autocomplete = this.autocomplete.concat(a);
        } else { this.autocomplete.push(a); }
      }
      if (f != null) {
        if (Array.isArray(f)) {
          return this.format = this.format.concat(f);
        } else { return this.format.push(f); }
      }
    },
    addError(message) { return this.errors.push(message); },
    addWarning(message) { return this.warnings.push(message); },
    hasErrors() { return (this.errors.length > 0); },
    getErrorsAsString() { return _(this.errors).reduce((ms, m) => `${ms}, ${m}`); },
    addElements(input, elements) { return this.elements[input] = elements; },
    finalize() { 
      this.autocomplete = _(this.autocomplete).uniq().sortBy(s=> s.toLowerCase()).value();
      return this.format = _(this.format).uniq().sortBy(s=> s.toLowerCase()).value();
    }
  };
};

module.exports = M;
module.exports.Matcher = Matcher;
